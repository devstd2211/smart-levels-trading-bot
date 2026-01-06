import { DECIMAL_PLACES, PERCENT_MULTIPLIER, RATIO_MULTIPLIERS, INTEGER_MULTIPLIERS, THRESHOLD_VALUES, MULTIPLIER_VALUES } from '../constants';
/**
 * Entry Scanner
 *
 * Analyzes ENTRY timeframe (1m) for precise entry signals.
 * Uses TradingContext from ContextAnalyzer as a filter.
 *
 * Logic:
 * 1. Check if context is valid
 * 2. Look for entry patterns on 1m (RSI, EMA, ZigZag, etc.)
 * 3. Generate entry signal with TP/SL levels
 */

import {
  EntrySignal,
  TradingContext,
  SignalDirection,
  TimeframeRole,
  LoggerService,
  TakeProfit,
  SwingPoint,
  CHoCHBoSDetection,
  StructureDirection,
  RSIIndicator,
  EMAIndicator,
  ZigZagNRIndicator,
} from '../types';
import { CandleProvider } from '../providers/candle.provider';

import { LiquidityDetector, LiquidityAnalysis } from './liquidity.detector';
import { DivergenceDetector, Divergence, DivergenceType } from './divergence.detector';
import { MarketStructureAnalyzer } from './market-structure.analyzer';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Strategic configuration values for entry scanning (from config.json)
 * All values are STRATEGIC and must come from config, NOT hardcoded
 */
interface EntryScannerConfig {
  // Indicator technical parameters
  rsiPeriod: number;
  fastEmaPeriod: number;
  slowEmaPeriod: number;
  zigzagDepth: number;
  // Strategic RSI thresholds
  rsiOversold: number; // RSI < this = oversold (potential LONG)
  rsiOverbought: number; // RSI > this = overbought (potential SHORT)
  // Strategic risk management
  stopLossPercent: number;
  takeProfits: Array<{ level: number; percent: number; sizePercent: number }>;
  // Strategic entry confidence thresholds
  minEntryCandles: number; // MIN_ENTRY_CANDLES - must have this many candles before scanning
  classicReversalBaseConfidence: number; // 0.75 from testing
  liquiditySweepBaseConfidence: number; // 0.80 from testing
  divergenceBoost: number; // +0.10 confidence
  divergencePenalty: number; // -0.50 confidence penalty
  chochBoost: number; // +0.10 confidence
  liquiditySweepBoost: number; // +0.15 confidence
  minConfidenceThreshold: number; // 0.3 minimum to report
  confidenceClampMin: number; // Minimum confidence bound
  confidenceClampMax: number; // Maximum confidence bound
  // Price Action options (STRATEGIC boosts)
  priceAction?: {
    enabled: boolean;
    requireLiquiditySweep?: boolean; // Require sweep for PA entries
    divergenceBoost?: number; // Override for divergence boost
    chochBoost?: number; // Override for CHoCH boost
    liquiditySweepBoost?: number; // Override for sweep boost
  };
  // Divergence detection config (passed to DivergenceDetector)
  divergenceDetector?: {
    minStrength: number;
    priceDiffPercent: number;
  };
}

// ============================================================================
// ENTRY SCANNER
// ============================================================================

export class EntryScanner {
  private rsi: RSIIndicator;
  private emaFast: EMAIndicator;
  private emaSlow: EMAIndicator;
  private zigzag: ZigZagNRIndicator;

  private liquidityDetector: LiquidityDetector;
  private divergenceDetector: DivergenceDetector;
  private structureAnalyzer: MarketStructureAnalyzer;

  // RSI history for divergence detection (timestamp -> RSI value)
  private rsiHistory: Map<number, number> = new Map();

  constructor(
    private config: EntryScannerConfig,
    private candleProvider: CandleProvider,
    private logger: LoggerService,
    divergenceDetectorParam?: DivergenceDetector,
  ) {
    this.rsi = new RSIIndicator(config.rsiPeriod);
    this.emaFast = new EMAIndicator(config.fastEmaPeriod);
    this.emaSlow = new EMAIndicator(config.slowEmaPeriod);

    // OPTIMIZED ZigZag: Asymmetric lookback for faster entry signals
    // leftBars = 12 (historical context)
    // rightBars = 4 (stable confirmation - default for entry)
    // quickRightBars = auto (1/3 of rightBars = faster detection)

    // DEFAULT: If zigzagDepth not in config, use 12
    const zigzagDepth = config.zigzagDepth || 12;
    const leftBars = zigzagDepth;
    const rightBars = Math.max(3, Math.floor(zigzagDepth / 3)); // 1/3 of depth for quick entries
    const quickRightBars = Math.max(2, Math.floor(rightBars / 3));

    this.zigzag = new ZigZagNRIndicator(leftBars, rightBars, quickRightBars);

    this.logger.info('📊 ZigZag Indicator initialized (OPTIMIZED)', {
      zigzagDepth,
      leftBars,
      rightBars,
      quickRightBars,
      purpose: 'ENTRY timeframe - optimized for speed + stability',
    });

    // Get liquidityDetector config from analysisConfig (injected from parent)
    const liquidityConfig = (config as any).liquidityDetectorConfig || {
      fakeoutReversalPercent: THRESHOLD_VALUES.THIRTY_PERCENT,
      recentTouchesWeight: THRESHOLD_VALUES.FIFTY_PERCENT,
      oldTouchesWeight: THRESHOLD_VALUES.THIRTY_PERCENT,
    };
    this.liquidityDetector = new LiquidityDetector(liquidityConfig, logger);
    // Use injected DivergenceDetector (created in IndicatorInitializationService to avoid duplication)
    // Fallback to creating one if not provided (for backward compatibility with tests)
    this.divergenceDetector = divergenceDetectorParam || new DivergenceDetector(
      logger,
      this.config.divergenceDetector!,
    );
    const marketStructureConfig = (config as any).marketStructureConfig || {
      chochAlignedBoost: MULTIPLIER_VALUES.ONE_POINT_THREE,
      chochAgainstPenalty: RATIO_MULTIPLIERS.HALF,
      bosAlignedBoost: MULTIPLIER_VALUES.ONE_POINT_ONE,
      noModification: RATIO_MULTIPLIERS.FULL,
    };
    this.structureAnalyzer = new MarketStructureAnalyzer(marketStructureConfig, logger);
  }

  /**
   * Scan ENTRY timeframe for entry signal
   * Returns entry signal if conditions met
   */
  async scan(context: TradingContext): Promise<EntrySignal> {
    const timestamp = Date.now();

    // Check for invalid context (works for both HARD_BLOCK and WEIGHT_BASED modes)
    // In HARD_BLOCK: isValidContext = false means hard blocked
    // In WEIGHT_BASED: overallModifier = 0 means effectively blocked
    if (!context.isValidContext || context.overallModifier === 0) {
      this.logger.info('⚠️ Context is invalid or blocked', {
        isValidContext: context.isValidContext,
        overallModifier: context.overallModifier.toFixed(DECIMAL_PLACES.PERCENT),
        blockedBy: context.blockedBy,
        warnings: context.warnings,
      });
      return this.noEntry(
        timestamp,
        context,
        context.blockedBy.length > 0
          ? `Blocked by: ${context.blockedBy.join(', ')}`
          : 'Insufficient context data',
        context.blockedBy,
      );
    }

    // Get ENTRY candles (1m)
    const entryCandles = await this.candleProvider.getCandles(TimeframeRole.ENTRY);
    if (!entryCandles || entryCandles.length < this.config.minEntryCandles) {
      this.logger.warn('Not enough ENTRY candles for scanning', {
        count: entryCandles?.length ?? 0,
      });
      return this.noEntry(timestamp, context, 'Insufficient ENTRY data', ['INSUFFICIENT_DATA']);
    }

    // Calculate indicators on ENTRY timeframe
    const rsiValue = this.rsi.calculate(entryCandles);
    const emaFastValue = this.emaFast.calculate(entryCandles);
    const emaSlowValue = this.emaSlow.calculate(entryCandles);
    const currentPrice = entryCandles[entryCandles.length - 1].close;
    const currentTimestamp = entryCandles[entryCandles.length - 1].timestamp;

    // Store RSI in history for divergence detection
    this.rsiHistory.set(currentTimestamp, rsiValue);

    // Price Action analysis using ZigZagNRIndicator
    let liquidityAnalysis: LiquidityAnalysis | null = null;
    let divergence: Divergence | null = null;
    let chochBos: CHoCHBoSDetection | null = null;
    let swingHighs: SwingPoint[] = [];
    let swingLows: SwingPoint[] = [];
    let pendingHighs: SwingPoint[] = [];
    let pendingLows: SwingPoint[] = [];

    if (this.config.priceAction?.enabled) {
      // Find swing points using optimized ZigZag (with pending detection)
      const zigzagResult = (this.zigzag as any).findAllSwingPoints(entryCandles);
      swingHighs = zigzagResult.swingHighs;
      swingLows = zigzagResult.swingLows;
      pendingHighs = zigzagResult.pendingHighs;
      pendingLows = zigzagResult.pendingLows;
      const swingPoints: SwingPoint[] = [...swingHighs, ...swingLows].sort((a, b) => a.timestamp - b.timestamp);

      // Log swing points information
      this.logger.debug('🔍 ZigZag Analysis', {
        candles: entryCandles.length,
        confirmedHighs: swingHighs.length,
        confirmedLows: swingLows.length,
        pendingHighs: pendingHighs.length,
        pendingLows: pendingLows.length,
        lastHigh: swingHighs.length > 0 ? `${swingHighs[swingHighs.length - 1].price.toFixed(2)}` : 'none',
        lastLow: swingLows.length > 0 ? `${swingLows[swingLows.length - 1].price.toFixed(2)}` : 'none',
        nextPendingHigh: pendingHighs.length > 0 ? `${pendingHighs[pendingHighs.length - 1].price.toFixed(2)}` : 'none',
        nextPendingLow: pendingLows.length > 0 ? `${pendingLows[pendingLows.length - 1].price.toFixed(2)}` : 'none',
      });

      if (swingPoints.length > 0) {
        // Liquidity analysis
        liquidityAnalysis = this.liquidityDetector.analyze(swingPoints, entryCandles, currentTimestamp);

        // Divergence detection
        divergence = this.divergenceDetector.detect(swingPoints, this.rsiHistory);

        // CHoCH/BoS detection (returns CHoCHBoSDetection with hasEvent, event properties)
        const detection = this.structureAnalyzer.detectCHoCHBoS(
          swingHighs,
          swingLows,
          currentPrice,
        );
        chochBos = detection.hasEvent ? detection : null;

        // Log structure analysis results
        if (liquidityAnalysis) {
          this.logger.debug('💧 Liquidity Zones detected', {
            zones: liquidityAnalysis.zones?.length || 0,
          });
        }
        if (divergence && divergence.type !== 'NONE') {
          this.logger.debug('📉 Divergence detected', {
            type: divergence.type,
            strength: divergence.strength,
          });
        }
        if (chochBos && chochBos.hasEvent) {
          this.logger.debug('🔄 Structure Breakpoint detected', {
            type: chochBos.event?.type,
            direction: chochBos.event?.direction,
            price: chochBos.event?.price,
          });
        }
      }
    }

    const logData: any = {
      rsi: rsiValue.toFixed(DECIMAL_PLACES.PERCENT),
      emaFast: emaFastValue.toFixed(DECIMAL_PLACES.PRICE),
      emaSlow: emaSlowValue.toFixed(DECIMAL_PLACES.PRICE),
      price: currentPrice.toFixed(DECIMAL_PLACES.PRICE),
    };

    if (liquidityAnalysis) {
      logData.liquidityZones = liquidityAnalysis.zones.length;
      logData.recentSweep = liquidityAnalysis.recentSweep?.detected;
    }

    if (divergence && divergence.type !== DivergenceType.NONE) {
      logData.divergence = divergence.type;
      logData.divergenceStrength = divergence.strength.toFixed(DECIMAL_PLACES.PERCENT);
    }

    this.logger.info('🔍 Entry Scan', logData);

    // Entry logic: Two patterns
    // Pattern 1: Classic Reversal (RSI oversold/overbought)
    // Pattern 2: Liquidity Sweep Reversal (Price Action)

    let direction = SignalDirection.HOLD;
    let confidence = 0;
    let reason = '';
    let patternType = '';

    // ========================================================================
    // PATTERN 1: Classic Reversal (existing logic)
    // ========================================================================

    // Check LONG conditions
    const longConditions = {
      trendBullish: context.trend === 'BULLISH',
      rsiOversold: rsiValue < this.config.rsiOversold,
      emaFastAboveSlow: emaFastValue > emaSlowValue,
    };

    this.logger.info('📊 Pattern 1 - LONG Check', {
      trend: context.trend,
      rsi: rsiValue.toFixed(DECIMAL_PLACES.PERCENT),
      rsiThreshold: this.config.rsiOversold,
      emaFast: emaFastValue.toFixed(DECIMAL_PLACES.PRICE),
      emaSlow: emaSlowValue.toFixed(DECIMAL_PLACES.PRICE),
      conditions: longConditions,
    });

    // LONG: RSI oversold + Fast EMA > Slow EMA + Context trend is BULLISH
    if (
      longConditions.trendBullish &&
      longConditions.rsiOversold &&
      longConditions.emaFastAboveSlow
    ) {
      direction = SignalDirection.LONG;
      confidence = this.config.classicReversalBaseConfidence;
      patternType = 'CLASSIC_REVERSAL';
      reason = `LONG: RSI oversold (${rsiValue.toFixed(DECIMAL_PLACES.PERCENT)}), EMA bullish crossover`;
      this.logger.info('✅ LONG Pattern 1 matched!', { confidence, reason });
    } else {
      const blockedBy = [];
      if (!longConditions.trendBullish) {
        blockedBy.push('TREND_NOT_BULLISH');
      }
      if (!longConditions.rsiOversold) {
        blockedBy.push(`RSI_NOT_OVERSOLD(${rsiValue.toFixed(DECIMAL_PLACES.PERCENT)}>${this.config.rsiOversold})`);
      }
      if (!longConditions.emaFastAboveSlow) {
        blockedBy.push('EMA_NOT_BULLISH');
      }

      if (blockedBy.length > 0) {
        this.logger.info('❌ LONG Pattern 1 blocked', { blockedBy });
      }
    }

    // Check SHORT conditions
    const shortConditions = {
      trendBearish: context.trend === 'BEARISH',
      rsiOverbought: rsiValue > this.config.rsiOverbought,
      emaFastBelowSlow: emaFastValue < emaSlowValue,
    };

    this.logger.info('📊 Pattern 1 - SHORT Check', {
      trend: context.trend,
      rsi: rsiValue.toFixed(DECIMAL_PLACES.PERCENT),
      rsiThreshold: this.config.rsiOverbought,
      emaFast: emaFastValue.toFixed(DECIMAL_PLACES.PRICE),
      emaSlow: emaSlowValue.toFixed(DECIMAL_PLACES.PRICE),
      conditions: shortConditions,
    });

    // SHORT: RSI overbought + Fast EMA < Slow EMA + Context trend is BEARISH
    if (
      direction === SignalDirection.HOLD && // Only if LONG didn't match
      shortConditions.trendBearish &&
      shortConditions.rsiOverbought &&
      shortConditions.emaFastBelowSlow
    ) {
      direction = SignalDirection.SHORT;
      confidence = this.config.classicReversalBaseConfidence;
      patternType = 'CLASSIC_REVERSAL';
      reason = `SHORT: RSI overbought (${rsiValue.toFixed(DECIMAL_PLACES.PERCENT)}), EMA bearish crossover`;
      this.logger.info('✅ SHORT Pattern 1 matched!', { confidence, reason });
    } else if (direction === SignalDirection.HOLD) {
      const blockedBy = [];
      if (!shortConditions.trendBearish) {
        blockedBy.push('TREND_NOT_BEARISH');
      }
      if (!shortConditions.rsiOverbought) {
        blockedBy.push(`RSI_NOT_OVERBOUGHT(${rsiValue.toFixed(DECIMAL_PLACES.PERCENT)}<${this.config.rsiOverbought})`);
      }
      if (!shortConditions.emaFastBelowSlow) {
        blockedBy.push('EMA_NOT_BEARISH');
      }

      if (blockedBy.length > 0) {
        this.logger.info('❌ SHORT Pattern 1 blocked', { blockedBy });
      }
    }

    // ========================================================================
    // PATTERN 2: Liquidity Sweep Reversal (Price Action - NEW!)
    // ========================================================================
    if (direction === SignalDirection.HOLD) {
      const pattern2Enabled = this.config.priceAction?.enabled ?? false;
      const hasSweep = liquidityAnalysis?.recentSweep?.detected ?? false;
      const isFakeout = liquidityAnalysis?.recentSweep?.isFakeout ?? false;

      this.logger.info('📊 Pattern 2 - Liquidity Sweep Check', {
        enabled: pattern2Enabled,
        hasSweep,
        isFakeout,
        sweepDirection: liquidityAnalysis?.recentSweep?.direction,
        sweepPrice: liquidityAnalysis?.recentSweep?.sweepPrice?.toFixed(DECIMAL_PLACES.PRICE),
        sweepStrength: liquidityAnalysis?.recentSweep?.strength?.toFixed(DECIMAL_PLACES.PERCENT),
      });

      if (pattern2Enabled && hasSweep && isFakeout && liquidityAnalysis?.recentSweep) {
        const sweep = liquidityAnalysis.recentSweep;

        // LONG: Downward sweep (support fakeout) + BULLISH trend + RSI not overbought
        const longSweepConditions = {
          sweepDown: sweep.direction === 'DOWN',
          trendBullish: context.trend === 'BULLISH',
          rsiNotOverbought: rsiValue < this.config.rsiOverbought,
        };

        this.logger.info('📊 Pattern 2 - LONG Sweep Check', longSweepConditions);

        if (longSweepConditions.sweepDown &&
            longSweepConditions.trendBullish &&
            longSweepConditions.rsiNotOverbought) {
          direction = SignalDirection.LONG;
          confidence = this.config.liquiditySweepBaseConfidence;
          patternType = 'LIQUIDITY_SWEEP';
          reason = `LONG: Liquidity sweep fakeout at ${sweep.sweepPrice.toFixed(DECIMAL_PLACES.PRICE)}, RSI ${rsiValue.toFixed(DECIMAL_PLACES.PERCENT)}`;
          this.logger.info('✅ LONG Pattern 2 matched!', { confidence, reason });
        }

        // SHORT: Upward sweep (resistance fakeout) + BEARISH trend + RSI not oversold
        const shortSweepConditions = {
          sweepUp: sweep.direction === 'UP',
          trendBearish: context.trend === 'BEARISH',
          rsiNotOversold: rsiValue > this.config.rsiOversold,
        };

        this.logger.info('📊 Pattern 2 - SHORT Sweep Check', shortSweepConditions);

        if (direction === SignalDirection.HOLD && // Only if LONG sweep didn't match
            shortSweepConditions.sweepUp &&
            shortSweepConditions.trendBearish &&
            shortSweepConditions.rsiNotOversold) {
          direction = SignalDirection.SHORT;
          confidence = this.config.liquiditySweepBaseConfidence;
          patternType = 'LIQUIDITY_SWEEP';
          reason = `SHORT: Liquidity sweep fakeout at ${sweep.sweepPrice.toFixed(DECIMAL_PLACES.PRICE)}, RSI ${rsiValue.toFixed(DECIMAL_PLACES.PERCENT)}`;
          this.logger.info('✅ SHORT Pattern 2 matched!', { confidence, reason });
        }
      } else {
        const blockedBy = [];
        if (!pattern2Enabled) {
          blockedBy.push('PATTERN_2_DISABLED');
        }
        if (!hasSweep) {
          blockedBy.push('NO_LIQUIDITY_SWEEP');
        }
        if (hasSweep && !isFakeout) {
          blockedBy.push('SWEEP_NOT_FAKEOUT');
        }

        if (blockedBy.length > 0) {
          this.logger.info('❌ Pattern 2 blocked', { blockedBy });
        }
      }
    }

    // No pattern found
    if (direction === SignalDirection.HOLD) {
      return this.noEntry(timestamp, context, 'No entry pattern found', ['NO_ENTRY_PATTERN']);
    }

    // ========================================================================
    // Apply Price Action boosts to confidence
    // ========================================================================

    let priceActionBoosts = 0;
    const boostDetails: string[] = [];

    if (this.config.priceAction?.enabled) {
      // Divergence boost
      if (divergence && divergence.type !== DivergenceType.NONE) {
        // Use priceAction override if set, otherwise fall back to config default
        const divergenceBoost = this.config.priceAction.divergenceBoost !== undefined
          ? this.config.priceAction.divergenceBoost
          : this.config.divergenceBoost;

        // Check if divergence aligns with signal direction
        if (
          (direction === SignalDirection.LONG && divergence.type === DivergenceType.BULLISH) ||
          (direction === SignalDirection.SHORT && divergence.type === DivergenceType.BEARISH)
        ) {
          const boost = divergenceBoost * divergence.strength;
          priceActionBoosts += boost;
          boostDetails.push(`Divergence: +${(boost * PERCENT_MULTIPLIER).toFixed(1)}%`);
        }
        // Penalty if divergence opposes signal
        else {
          const penalty = divergenceBoost * divergence.strength * this.config.divergencePenalty;
          priceActionBoosts -= penalty;
          boostDetails.push(`Divergence conflict: -${(penalty * PERCENT_MULTIPLIER).toFixed(1)}%`);
        }
      }

      // CHoCH/BoS boost
      if (chochBos?.event) {
        // Use priceAction override if set, otherwise fall back to config default
        const chochBoost = this.config.priceAction.chochBoost !== undefined
          ? this.config.priceAction.chochBoost
          : this.config.chochBoost;
        const isAligned =
          (direction === SignalDirection.LONG && chochBos.event.direction === StructureDirection.BULLISH) ||
          (direction === SignalDirection.SHORT && chochBos.event.direction === StructureDirection.BEARISH);

        // Check if CHoCH aligns with signal direction
        if (isAligned) {
          priceActionBoosts += chochBoost;
          boostDetails.push(`${chochBos.event.type}: +${(chochBoost * PERCENT_MULTIPLIER).toFixed(1)}%`);
          this.logger.debug(`🎯 ${chochBos.event.type} ALIGNED with ${direction} signal`, {
            eventType: chochBos.event.type,
            eventDirection: chochBos.event.direction,
            signalDirection: direction,
            boostApplied: (chochBoost * PERCENT_MULTIPLIER).toFixed(1) + '%',
            breakPrice: chochBos.event.price,
            strength: (chochBos.event.strength * INTEGER_MULTIPLIERS.ONE_HUNDRED).toFixed(1) + '%',
          });
        } else {
          this.logger.debug(`⚠️ ${chochBos.event.type} MISALIGNED with ${direction} signal`, {
            eventType: chochBos.event.type,
            eventDirection: chochBos.event.direction,
            signalDirection: direction,
            boostApplied: '0%',
            reason: `Event is ${chochBos.event.direction} but signal is ${direction}`,
            breakPrice: chochBos.event.price,
            strength: (chochBos.event.strength * INTEGER_MULTIPLIERS.ONE_HUNDRED).toFixed(1) + '%',
          });
        }
      }

      // Liquidity sweep boost (already in base confidence, but log it)
      if (patternType === 'LIQUIDITY_SWEEP') {
        // Use priceAction override if set, otherwise fall back to config default
        const sweepBoost = this.config.priceAction.liquiditySweepBoost !== undefined
          ? this.config.priceAction.liquiditySweepBoost
          : this.config.liquiditySweepBoost;
        boostDetails.push(`Liquidity Sweep: +${(sweepBoost * PERCENT_MULTIPLIER).toFixed(1)}% (in base)`);
      }
    }

    // Apply boosts to confidence
    confidence += priceActionBoosts;
    confidence = Math.max(this.config.confidenceClampMin, Math.min(this.config.confidenceClampMax, confidence));

    // Apply context modifiers to confidence (weight-based system)
    const finalConfidence = confidence * context.overallModifier;

    this.logger.info('📈 Confidence calculation', {
      patternType,
      baseConfidence: (confidence - priceActionBoosts).toFixed(DECIMAL_PLACES.PERCENT),
      priceActionBoosts: priceActionBoosts > 0 ? `+${priceActionBoosts.toFixed(DECIMAL_PLACES.PERCENT)}` : priceActionBoosts.toFixed(DECIMAL_PLACES.PERCENT),
      boostDetails: boostDetails.length > 0 ? boostDetails : undefined,
      adjustedConfidence: confidence.toFixed(DECIMAL_PLACES.PERCENT),
      contextModifier: context.overallModifier.toFixed(DECIMAL_PLACES.PERCENT),
      finalConfidence: finalConfidence.toFixed(DECIMAL_PLACES.PERCENT),
      warnings: context.warnings,
    });

    // Check minimum confidence threshold
    if (finalConfidence < this.config.minConfidenceThreshold) {
      this.logger.info('❌ Entry blocked by low confidence', {
        finalConfidence: finalConfidence.toFixed(DECIMAL_PLACES.PERCENT),
        minRequired: this.config.minConfidenceThreshold,
        warnings: context.warnings,
      });
      return this.noEntry(
        timestamp,
        context,
        `Low confidence: ${finalConfidence.toFixed(DECIMAL_PLACES.PERCENT)} < ${this.config.minConfidenceThreshold}`,
        ['LOW_CONFIDENCE'],
      );
    }

    // Calculate TP/SL
    const isLong = direction === SignalDirection.LONG;
    const stopLoss = isLong
      ? currentPrice * (1 - this.config.stopLossPercent / PERCENT_MULTIPLIER)
      : currentPrice * (1 + this.config.stopLossPercent / PERCENT_MULTIPLIER);

    const takeProfits: TakeProfit[] = this.config.takeProfits.map(tp => ({
      level: tp.level,
      price: isLong
        ? currentPrice * (1 + tp.percent / PERCENT_MULTIPLIER)
        : currentPrice * (1 - tp.percent / PERCENT_MULTIPLIER),
      sizePercent: tp.sizePercent,
      percent: tp.percent,
      hit: false,
    }));

    this.logger.info('✅ Entry signal found!', {
      direction,
      patternType,
      baseConfidence: (confidence - priceActionBoosts).toFixed(DECIMAL_PLACES.PERCENT),
      priceActionBoosts: priceActionBoosts !== 0 ? `${priceActionBoosts > 0 ? '+' : ''}${priceActionBoosts.toFixed(DECIMAL_PLACES.PERCENT)}` : undefined,
      adjustedConfidence: confidence.toFixed(DECIMAL_PLACES.PERCENT),
      finalConfidence: finalConfidence.toFixed(DECIMAL_PLACES.PERCENT),
      modifier: context.overallModifier.toFixed(DECIMAL_PLACES.PERCENT),
      reason,
      entryPrice: currentPrice,
      stopLoss,
      warnings: context.warnings,
    });

    return {
      timestamp,
      shouldEnter: true,
      direction,
      confidence: finalConfidence, // Use modified confidence
      reason,
      entryPrice: currentPrice,
      stopLoss,
      takeProfits,
      context,
    };
  }

  /**
   * Helper: return no entry signal
   */
  private noEntry(
    timestamp: number,
    context: TradingContext,
    reason: string,
    blockedBy: string[],
  ): EntrySignal {
    return {
      timestamp,
      shouldEnter: false,
      direction: SignalDirection.HOLD,
      confidence: 0,
      reason,
      entryPrice: 0,
      stopLoss: 0,
      takeProfits: [],
      context,
    };
  }
}
