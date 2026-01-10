/**
 * Correlation Utilities
 *
 * Provides statistical correlation functions for analyzing
 * price relationships between different assets (e.g., BTC vs altcoin)
 */

import { Candle } from '../types';

// ============================================================================
// TYPES
// ============================================================================

export interface CorrelationResult {
  correlation: number;        // -1 to 1
  pValue?: number;           // Statistical significance
  strength: 'strong' | 'moderate' | 'weak' | 'very-weak'; // Interpretation
}

// ============================================================================
// CORRELATION CALCULATION
// ============================================================================

/**
 * Calculate Pearson correlation coefficient between two arrays
 *
 * Formula: r = Σ((x - mean_x)(y - mean_y)) / sqrt(Σ(x - mean_x)² * Σ(y - mean_y)²)
 *
 * @param x - First data series
 * @param y - Second data series
 * @returns Correlation coefficient (-1 to 1)
 */
export function pearsonCorrelation(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length < 2) {
    return 0;
  }

  const n = x.length;

  // Calculate means
  const meanX = x.reduce((a, b) => a + b, 0) / n;
  const meanY = y.reduce((a, b) => a + b, 0) / n;

  // Calculate covariance and standard deviations
  let covariance = 0;
  let varX = 0;
  let varY = 0;

  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;

    covariance += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }

  // Handle edge case
  if (varX === 0 || varY === 0) {
    return 0;
  }

  // Calculate correlation
  return covariance / Math.sqrt(varX * varY);
}

/**
 * Calculate percentage returns from price series
 *
 * @param prices - Array of prices
 * @returns Array of returns (price change %)
 */
export function calculateReturns(prices: number[]): number[] {
  const returns: number[] = [];

  for (let i = 1; i < prices.length; i++) {
    const ret = (prices[i] - prices[i - 1]) / prices[i - 1];
    returns.push(ret);
  }

  return returns;
}

/**
 * Extract price series from candles
 *
 * @param candles - Array of candles
 * @param priceType - Which price to use ('close', 'high', 'low', 'open')
 * @returns Array of prices
 */
export function extractPrices(candles: Candle[], priceType: 'close' | 'high' | 'low' | 'open' = 'close'): number[] {
  return candles.map(c => c[priceType]);
}

/**
 * Calculate correlation between two candle series
 *
 * @param btcCandles - BTC candles
 * @param altCandles - Alternative asset candles (e.g., XRP)
 * @param lookbackPeriod - Number of candles to use for correlation
 * @param priceType - Which price to use
 * @returns Correlation result with interpretation
 */
export function correlateCandles(
  btcCandles: Candle[],
  altCandles: Candle[],
  lookbackPeriod: number = 20,
  priceType: 'close' | 'high' | 'low' | 'open' = 'close'
): CorrelationResult {
  // Get recent candles
  const btcRecent = btcCandles.slice(-lookbackPeriod);
  const altRecent = altCandles.slice(-lookbackPeriod);

  if (btcRecent.length < 2 || altRecent.length < 2) {
    return {
      correlation: 0,
      strength: 'very-weak',
    };
  }

  // Extract prices
  const btcPrices = extractPrices(btcRecent, priceType);
  const altPrices = extractPrices(altRecent, priceType);

  // Calculate returns
  const btcReturns = calculateReturns(btcPrices);
  const altReturns = calculateReturns(altPrices);

  // Calculate correlation
  const correlation = pearsonCorrelation(btcReturns, altReturns);

  // Classify strength
  const absCorr = Math.abs(correlation);
  let strength: 'strong' | 'moderate' | 'weak' | 'very-weak';

  if (absCorr >= 0.7) {
    strength = 'strong';
  } else if (absCorr >= 0.4) {
    strength = 'moderate';
  } else if (absCorr >= 0.2) {
    strength = 'weak';
  } else {
    strength = 'very-weak';
  }

  return {
    correlation,
    strength,
  };
}

/**
 * Determine BTC trend based on candles
 *
 * @param candles - BTC candles
 * @param lookbackPeriod - Number of candles to analyze
 * @returns 'UP' if trending up, 'DOWN' if trending down
 */
export function determineBtcTrend(candles: Candle[], lookbackPeriod: number = 20): 'UP' | 'DOWN' {
  if (candles.length < lookbackPeriod) {
    return candles[candles.length - 1].close > candles[0].close ? 'UP' : 'DOWN';
  }

  const recent = candles.slice(-lookbackPeriod);
  const startPrice = recent[0].close;
  const endPrice = recent[recent.length - 1].close;

  return endPrice > startPrice ? 'UP' : 'DOWN';
}

/**
 * Check if BTC trend is aligned with signal direction
 *
 * Returns true if BTC trend supports the signal direction
 * - For LONG signals: requires BTC UP trend (positive correlation)
 * - For SHORT signals: requires BTC DOWN trend (negative correlation)
 *
 * @param btcTrend - Current BTC trend ('UP' or 'DOWN')
 * @param signalDirection - Signal direction ('LONG' or 'SHORT')
 * @param correlation - Correlation coefficient
 * @param threshold - Correlation threshold to check
 * @returns true if trend is aligned and correlation strong enough
 */
export function isBtcAligned(
  btcTrend: 'UP' | 'DOWN',
  signalDirection: 'LONG' | 'SHORT',
  correlation: number,
  threshold: number = 0.4
): boolean {
  const absCorr = Math.abs(correlation);

  // If correlation is weak, any trend is fine
  if (absCorr < threshold) {
    return true;
  }

  // Strong positive correlation: BTC and alt move together
  if (correlation > threshold) {
    // LONG ok if BTC up, SHORT ok if BTC down
    return (signalDirection === 'LONG' && btcTrend === 'UP') ||
           (signalDirection === 'SHORT' && btcTrend === 'DOWN');
  }

  // Strong negative correlation: BTC and alt move opposite
  if (correlation < -threshold) {
    // LONG ok if BTC down, SHORT ok if BTC up
    return (signalDirection === 'LONG' && btcTrend === 'DOWN') ||
           (signalDirection === 'SHORT' && btcTrend === 'UP');
  }

  return true;
}

// ============================================================================
// STATISTICAL HELPERS
// ============================================================================

/**
 * Calculate standard deviation of values
 */
export function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;

  return Math.sqrt(variance);
}

/**
 * Calculate z-score (how many standard deviations from mean)
 */
export function zScore(value: number, values: number[]): number {
  if (values.length < 2) return 0;

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const stdDev = standardDeviation(values);

  if (stdDev === 0) return 0;

  return (value - mean) / stdDev;
}
