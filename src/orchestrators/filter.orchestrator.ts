/**
 * FILTER ORCHESTRATOR
 * Central orchestrator for all signal-blocking filters
 *
 * Applies configured filters in sequence:
 * 1. Blind Zone Filter (minimum signal count)
 * 2. Flat Market Filter (market structure)
 * 3. Funding Rate Filter (perpetual funding)
 * 4. BTC Correlation Filter (alt market sentiment)
 * 5. Trend Alignment Filter (directional bias)
 * 6. Post-TP Filter (FOMO prevention)
 * 7. Time-Based Filter (session restrictions)
 * 8. Volatility Regime Filter (ATR constraints)
 * 9. Neutral Trend Strength Filter (confidence boost on weak trends)
 *
 * All filters are JSON-configurable via strategy.filters section
 */

import { LoggerService } from '../services/logger.service';
import { FilterOverrides } from '../types/strategy-config.types';
import { correlateCandles, determineBtcTrend, isBtcAligned } from '../utils/correlation';
import { Candle } from '../types';

export interface FilterResult {
  allowed: boolean;
  reason?: string;
  appliedFilters: string[];
  blockedBy?: string;
}

export class FilterOrchestrator {
  constructor(
    private logger: LoggerService,
    private filterConfig: FilterOverrides = {},
  ) {}

  /**
   * Evaluate signal against all configured filters
   * Returns immediately on first blocking filter
   */
  evaluateFilters(context: {
    signal: any; // Trade signal (direction, confidence)
    accountBalance: number;
    openPositions: any[];
    marketData: any; // flat market analysis, BTC correlation, etc
    fundingRate?: number;
    lastTPTimestamp?: number; // timestamp of last TP
    trend?: any; // current trend analysis (bias, strength)
    btcCandles?: Candle[]; // BTC candles for correlation analysis
    altCandles?: Candle[]; // Target asset candles (XRP, etc)
  }): FilterResult {
    const appliedFilters: string[] = [];

    // FILTER 1: Blind Zone
    if (this.filterConfig.blindZone?.minSignalsForLong) {
      const blindZoneResult = this.evaluateBlindZone(context);
      appliedFilters.push('BlindZone');
      if (!blindZoneResult.allowed) {
        return { ...blindZoneResult, appliedFilters, blockedBy: 'BlindZone' };
      }
    }

    // FILTER 2: Flat Market
    if (this.filterConfig.flatMarket?.enabled !== false) {
      const flatMarketResult = this.evaluateFlatMarket(context);
      appliedFilters.push('FlatMarket');
      if (!flatMarketResult.allowed) {
        return { ...flatMarketResult, appliedFilters, blockedBy: 'FlatMarket' };
      }
    }

    // FILTER 3: Funding Rate
    if (this.filterConfig.fundingRate?.enabled !== false && context.fundingRate !== undefined) {
      const fundingRateResult = this.evaluateFundingRate(context);
      appliedFilters.push('FundingRate');
      if (!fundingRateResult.allowed) {
        return { ...fundingRateResult, appliedFilters, blockedBy: 'FundingRate' };
      }
    }

    // FILTER 4: BTC Correlation
    if (this.filterConfig.btcCorrelation?.enabled !== false) {
      const btcResult = this.evaluateBtcCorrelation(context);
      appliedFilters.push('BtcCorrelation');
      if (!btcResult.allowed) {
        return { ...btcResult, appliedFilters, blockedBy: 'BtcCorrelation' };
      }
    }

    // FILTER 5: Trend Alignment
    if (this.filterConfig.trendAlignment?.enabled !== false) {
      const trendResult = this.evaluateTrendAlignment(context);
      appliedFilters.push('TrendAlignment');
      if (!trendResult.allowed) {
        return { ...trendResult, appliedFilters, blockedBy: 'TrendAlignment' };
      }
    }

    // FILTER 6: Post-TP Filter
    if (this.filterConfig.postTpFilter?.enabled !== false && context.lastTPTimestamp) {
      const postTpResult = this.evaluatePostTpFilter(context);
      appliedFilters.push('PostTp');
      if (!postTpResult.allowed) {
        return { ...postTpResult, appliedFilters, blockedBy: 'PostTp' };
      }
    }

    // FILTER 7: Time-Based Filter
    if (this.filterConfig.timeBasedFilter?.enabled !== false) {
      const timeResult = this.evaluateTimeBasedFilter(context);
      appliedFilters.push('TimeBased');
      if (!timeResult.allowed) {
        return { ...timeResult, appliedFilters, blockedBy: 'TimeBased' };
      }
    }

    // FILTER 8: Volatility Regime
    if (this.filterConfig.volatilityRegime?.enabled !== false) {
      const volResult = this.evaluateVolatilityRegime(context);
      appliedFilters.push('VolatilityRegime');
      if (!volResult.allowed) {
        return { ...volResult, appliedFilters, blockedBy: 'VolatilityRegime' };
      }
    }

    // FILTER 9: Neutral Trend Strength
    if (this.filterConfig.neutralTrendStrength?.enabled !== false) {
      const neutralResult = this.evaluateNeutralTrendStrength(context);
      appliedFilters.push('NeutralTrendStrength');
      if (!neutralResult.allowed) {
        return { ...neutralResult, appliedFilters, blockedBy: 'NeutralTrendStrength' };
      }
    }

    // All filters passed
    return {
      allowed: true,
      appliedFilters,
    };
  }

  /**
   * FILTER 1: Blind Zone - require minimum signal consensus
   */
  private evaluateBlindZone(context: any): FilterResult {
    // This filter is handled by StrategyCoordinator, included for completeness
    return { allowed: true, appliedFilters: [] };
  }

  /**
   * FILTER 2: Flat Market - block entries when market is ranging
   */
  private evaluateFlatMarket(context: any): FilterResult {
    const config = this.filterConfig.flatMarket;
    if (!config?.enabled && config?.enabled !== undefined) {
      return { allowed: true, appliedFilters: [] };
    }

    const flatMarketAnalysis = context.marketData?.flatMarketAnalysis;
    if (!flatMarketAnalysis) {
      return { allowed: true, appliedFilters: [] }; // No flat market data available
    }

    const threshold = config?.flatThreshold ?? 70;
    if (flatMarketAnalysis.confidence >= threshold) {
      this.logger.info('🚫 Entry blocked: Flat market detected', {
        flatConfidence: flatMarketAnalysis.confidence.toFixed(1),
        threshold,
      });
      return {
        allowed: false,
        reason: `Flat market (${flatMarketAnalysis.confidence.toFixed(1)}% confidence)`,
        appliedFilters: [],
      };
    }

    return { allowed: true, appliedFilters: [] };
  }

  /**
   * FILTER 3: Funding Rate - prevent overheated positions
   */
  private evaluateFundingRate(context: any): FilterResult {
    const config = this.filterConfig.fundingRate;
    if (!config?.enabled && config?.enabled !== undefined) {
      return { allowed: true, appliedFilters: [] };
    }

    const fundingRate = context.fundingRate;
    if (fundingRate === undefined) {
      return { allowed: true, appliedFilters: [] };
    }

    const blockLongAbove = config?.blockLongAbove ?? 0.0005;
    const blockShortBelow = config?.blockShortBelow ?? -0.0005;

    if (context.signal.direction === 'LONG' && fundingRate > blockLongAbove) {
      this.logger.info('🚫 Entry blocked: Funding rate too high for LONG', {
        fundingRate: fundingRate.toFixed(6),
        threshold: blockLongAbove.toFixed(6),
      });
      return {
        allowed: false,
        reason: `Funding rate too high (${fundingRate.toFixed(6)})`,
        appliedFilters: [],
      };
    }

    if (context.signal.direction === 'SHORT' && fundingRate < blockShortBelow) {
      this.logger.info('🚫 Entry blocked: Funding rate too low for SHORT', {
        fundingRate: fundingRate.toFixed(6),
        threshold: blockShortBelow.toFixed(6),
      });
      return {
        allowed: false,
        reason: `Funding rate too low (${fundingRate.toFixed(6)})`,
        appliedFilters: [],
      };
    }

    return { allowed: true, appliedFilters: [] };
  }

  /**
   * FILTER 4: BTC Correlation - block alt when BTC moves against us
   *
   * Prevents counter-trend entries by checking BTC correlation and trend.
   * With strict blocking: blocks entries that go against BTC trend if correlation is high.
   */
  private evaluateBtcCorrelation(context: any): FilterResult {
    const config = this.filterConfig.btcCorrelation;
    if (!config?.enabled && config?.enabled !== undefined) {
      return { allowed: true, appliedFilters: [] };
    }

    // Need BTC and alt candles for correlation analysis
    if (!context.btcCandles || !context.altCandles || !Array.isArray(context.btcCandles) || !Array.isArray(context.altCandles)) {
      return { allowed: true, appliedFilters: [] };
    }

    if (context.btcCandles.length < 2 || context.altCandles.length < 2) {
      return { allowed: true, appliedFilters: [] };
    }

    try {
      // Calculate correlation
      const lookbackPeriod = 20; // Last 20 candles
      const correlationResult = correlateCandles(context.btcCandles, context.altCandles, lookbackPeriod, 'close');
      const correlation = correlationResult.correlation;

      // Determine BTC trend
      const btcTrend = determineBtcTrend(context.btcCandles, lookbackPeriod);
      const signalDirection = context.signal.direction === 'LONG' ? 'LONG' : 'SHORT';

      // Get threshold from config (default: moderate = 0.4)
      const threshold = config?.thresholds?.moderate ?? 0.4;

      // Check if aligned
      const aligned = isBtcAligned(btcTrend, signalDirection, correlation, threshold);

      if (!aligned) {
        this.logger.warn('🚫 Entry blocked: BTC Correlation filter', {
          signal: `${signalDirection}`,
          correlation: correlation.toFixed(3),
          btcTrend,
          threshold: threshold.toFixed(2),
          correlationStrength: correlationResult.strength,
          reason: `${signalDirection} signal conflicts with BTC trend`,
        });

        return {
          allowed: false,
          reason: `BTC correlation mismatch: ${signalDirection} vs BTC ${btcTrend} (corr=${correlation.toFixed(2)})`,
          appliedFilters: [],
        };
      }

      // If we're here, BTC correlation is not blocking
      if (Math.abs(correlation) >= threshold) {
        this.logger.debug('✅ Signal passed BTC Correlation check', {
          signal: `${signalDirection}`,
          correlation: correlation.toFixed(3),
          btcTrend,
          note: 'Aligned with BTC trend',
        });
      }

      return { allowed: true, appliedFilters: [] };
    } catch (error: any) {
      this.logger.error('Error in BTC Correlation filter', {
        error: error instanceof Error ? error.message : String(error),
      });

      // On error, allow the trade (fail open)
      return { allowed: true, appliedFilters: [] };
    }
  }

  /**
   * FILTER 5: Trend Alignment - block against trend (handled in EntryOrchestrator)
   */
  private evaluateTrendAlignment(context: any): FilterResult {
    // EntryOrchestrator handles this filter
    return { allowed: true, appliedFilters: [] };
  }

  /**
   * FILTER 6: Post-TP Filter - prevent FOMO after TP
   */
  private evaluatePostTpFilter(context: any): FilterResult {
    const config = this.filterConfig.postTpFilter;
    if (!config?.enabled && config?.enabled !== undefined) {
      return { allowed: true, appliedFilters: [] };
    }

    if (!context.lastTPTimestamp) {
      return { allowed: true, appliedFilters: [] };
    }

    const blockDurationSec = config?.blockDurationSeconds ?? 300;
    const timeSinceTP = (Date.now() - context.lastTPTimestamp) / 1000;

    if (timeSinceTP < blockDurationSec) {
      this.logger.info('🚫 Entry blocked: Post-TP cooldown period', {
        timeSinceTPSeconds: timeSinceTP.toFixed(0),
        blockDurationSeconds: blockDurationSec,
      });
      return {
        allowed: false,
        reason: `Post-TP cooldown (${timeSinceTP.toFixed(0)}s of ${blockDurationSec}s)`,
        appliedFilters: [],
      };
    }

    return { allowed: true, appliedFilters: [] };
  }

  /**
   * FILTER 7: Time-Based Filter - block entries during specific hours
   */
  private evaluateTimeBasedFilter(context: any): FilterResult {
    const config = this.filterConfig.timeBasedFilter;
    if (!config?.enabled && config?.enabled !== undefined) {
      return { allowed: true, appliedFilters: [] };
    }

    // To be implemented in Phase 3
    // Requires time-based restrictions
    return { allowed: true, appliedFilters: [] };
  }

  /**
   * FILTER 8: Volatility Regime - block during extreme volatility
   */
  private evaluateVolatilityRegime(context: any): FilterResult {
    const config = this.filterConfig.volatilityRegime;
    if (!config?.enabled && config?.enabled !== undefined) {
      return { allowed: true, appliedFilters: [] };
    }

    // To be implemented in Phase 3
    // Requires ATR analysis
    return { allowed: true, appliedFilters: [] };
  }

  /**
   * FILTER 9: Neutral Trend Strength - require higher confidence on weak NEUTRAL trends
   *
   * Problem: SHORT entries with 65-70% confidence on weak NEUTRAL trends (< 40% strength)
   * have 50% win rate and are losing money.
   * Root cause: Weak NEUTRAL trends lack directional bias, creating high risk of chop.
   *
   * Solution: On weak NEUTRAL trends, require higher confidence (70%+) to ensure
   * entries are made only when signal quality is very high.
   */
  private evaluateNeutralTrendStrength(context: any): FilterResult {
    const config = this.filterConfig.neutralTrendStrength;
    if (!config?.enabled && config?.enabled !== undefined) {
      return { allowed: true, appliedFilters: [] };
    }

    const trend = context.trend;
    if (!trend || trend.bias !== 'NEUTRAL') {
      // Filter doesn't apply if not on NEUTRAL trend
      return { allowed: true, appliedFilters: [] };
    }

    const minConfidence = config?.minConfidenceForWeakNeutral ?? 0.70; // 70%
    const weakThreshold = config?.weakTrendThreshold ?? 40; // 40% strength

    // NEUTRAL trend with good strength (>= 40%) = allow all signals
    if (trend.strength >= weakThreshold) {
      return { allowed: true, appliedFilters: [] };
    }

    // Weak NEUTRAL trend (< 40%) = require high confidence
    const signalConfidence = context.signal.confidence / 100; // Convert 0-100 to 0-1
    if (signalConfidence < minConfidence) {
      this.logger.warn('🚫 Entry blocked: Weak NEUTRAL trend requires higher confidence', {
        trendStrength: trend.strength.toFixed(1) + '%',
        signalConfidence: (signalConfidence * 100).toFixed(0) + '%',
        requiredConfidence: (minConfidence * 100).toFixed(0) + '%',
        reason: 'Weak NEUTRAL trends lack directional bias - high risk of chop',
      });
      return {
        allowed: false,
        reason: `Weak NEUTRAL trend (${trend.strength.toFixed(0)}% strength) requires ${(minConfidence * 100).toFixed(0)}% confidence, signal has only ${(signalConfidence * 100).toFixed(0)}%`,
        appliedFilters: [],
      };
    }

    return { allowed: true, appliedFilters: [] };
  }

  /**
   * Update filter configuration at runtime
   */
  updateFilterConfig(filterConfig: FilterOverrides): void {
    this.filterConfig = { ...this.filterConfig, ...filterConfig };
    this.logger.info('Filter configuration updated', {
      filters: Object.keys(filterConfig),
    });
  }
}

export default FilterOrchestrator;
