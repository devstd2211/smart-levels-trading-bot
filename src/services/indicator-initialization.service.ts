/**
 * Indicator Initialization Service (Week 13 Phase 5b Extract)
 *
 * Extracted from trading-orchestrator.service.ts constructor
 * Responsible for initializing all technical indicators and analyzers
 *
 * Responsibilities:
 * - Initialize multi-timeframe analyzers (RSI, EMA)
 * - Initialize single-timeframe indicators (ATR, ZigZag)
 * - Initialize detectors (Liquidity, Divergence, Breakout)
 * - Initialize optional indicators (Stochastic, Bollinger Bands)
 * - Initialize entry scanner
 */

import {
  LoggerService,
  OrchestratorConfig,
  ATRIndicator,
  ZigZagNRIndicator,
  StochasticIndicator,
  BollingerBandsIndicator,
  LiquidityDetector,
  DivergenceDetector,
  BreakoutPredictor,
} from '../types';
import { EntryScanner } from '../analyzers/entry.scanner';
import { CandleProvider } from '../providers/candle.provider';
import { TimeframeProvider } from '../providers/timeframe.provider';
import { MultiTimeframeRSIAnalyzer } from '../analyzers/multi-timeframe-rsi.analyzer';
import { MultiTimeframeEMAAnalyzer } from '../analyzers/multi-timeframe-ema.analyzer';

/**
 * Result of indicator initialization
 */
export interface InitializedIndicators {
  entryScanner: EntryScanner;
  rsiAnalyzer: MultiTimeframeRSIAnalyzer;
  emaAnalyzer: MultiTimeframeEMAAnalyzer;
  atrIndicator: ATRIndicator;
  zigzagNRIndicator: ZigZagNRIndicator;
  liquidityDetector: LiquidityDetector;
  divergenceDetector: DivergenceDetector;
  breakoutPredictor: BreakoutPredictor;
  stochasticIndicator?: StochasticIndicator;
  bollingerIndicator?: BollingerBandsIndicator;
}

/**
 * Indicator Initialization Service
 * Encapsulates all indicator and analyzer initialization logic
 */
export class IndicatorInitializationService {
  constructor(
    private config: OrchestratorConfig,
    private candleProvider: CandleProvider,
    private timeframeProvider: TimeframeProvider,
    private logger: LoggerService,
  ) {}

  /**
   * Initialize all indicators and analyzers
   */
  initializeAllIndicators(): InitializedIndicators {
    // Initialize detectors FIRST (before EntryScanner)
    // Initialize DivergenceDetector with strategic config from OrchestratorConfig.entryConfig
    const divergenceDetectorConfig = this.config.entryConfig.divergenceDetector;
    if (!divergenceDetectorConfig) {
      throw new Error(
        'CRITICAL: Missing divergenceDetector config in entryConfig. ' +
        'Expected: entryConfig.divergenceDetector with minStrength and priceDiffPercent properties'
      );
    }
    const divergenceDetector = new DivergenceDetector(
      this.logger,
      divergenceDetectorConfig,
    );

    // Initialize EntryScanner (pass DivergenceDetector to avoid duplication)
    const entryScanner = new EntryScanner(
      this.config.entryConfig as any,
      this.candleProvider,
      this.logger,
      divergenceDetector,  // Pass initialized divergenceDetector
    );

    // Initialize multi-timeframe analyzers
    const rsiAnalyzer = new MultiTimeframeRSIAnalyzer(
      this.timeframeProvider,
      this.candleProvider,
      this.logger,
      this.config.entryConfig.rsiPeriod, // Use same period for all timeframes
      true, // Enable caching
    );
    const emaAnalyzer = new MultiTimeframeEMAAnalyzer(
      this.timeframeProvider,
      this.candleProvider,
      this.logger,
      this.config.entryConfig.fastEmaPeriod, // Fast EMA period
      this.config.entryConfig.slowEmaPeriod, // Slow EMA period
      true, // Enable caching
    );

    // Initialize single-timeframe indicators
    const atrIndicator = new ATRIndicator(this.config.contextConfig.atrPeriod);
    const zigzagNRIndicator = new ZigZagNRIndicator(this.config.entryConfig.zigzagDepth);

    // Initialize detectors
    const liquidityDetector = new LiquidityDetector(
      (this.config.analysisConfig as any).liquidityDetector!,
      this.logger,
    );

    // NOTE: DivergenceDetector already initialized above (before EntryScanner) to avoid duplication
    const breakoutPredictor = new BreakoutPredictor(this.logger, {
      rsiLongThreshold: this.config.entryConfig.rsiOverbought,
      rsiShortThreshold: this.config.entryConfig.rsiOversold,
    });

    // Initialize Stochastic indicator if enabled
    let stochasticIndicator: StochasticIndicator | undefined;
    if (this.config.indicators?.stochastic?.enabled) {
      const stochConfig = this.config.indicators.stochastic;
      stochasticIndicator = new StochasticIndicator({
        kPeriod: stochConfig.kPeriod,
        dPeriod: stochConfig.dPeriod,
        smooth: stochConfig.smooth,
      });
      this.logger.info('✅ Stochastic indicator initialized', {
        k: stochConfig.kPeriod,
        d: stochConfig.dPeriod,
        smooth: stochConfig.smooth,
      });
    }

    // Initialize Bollinger Bands indicator if enabled
    let bollingerIndicator: BollingerBandsIndicator | undefined;
    if (this.config.indicators?.bollingerBands?.enabled) {
      const bbConfig = this.config.indicators.bollingerBands;
      bollingerIndicator = new BollingerBandsIndicator(
        bbConfig.period,
        bbConfig.stdDev,
      );
      this.logger.info('✅ Bollinger Bands indicator initialized', {
        period: bbConfig.period,
        stdDev: bbConfig.stdDev,
        adaptiveParams: bbConfig.adaptiveParams,
      });
    }

    return {
      entryScanner,
      rsiAnalyzer,
      emaAnalyzer,
      atrIndicator,
      zigzagNRIndicator,
      liquidityDetector,
      divergenceDetector,
      breakoutPredictor,
      stochasticIndicator,
      bollingerIndicator,
    };
  }
}
