/**
 * Indicator Type Enum
 *
 * Why enum instead of strings?
 * ✅ Type-safe (no typos possible)
 * ✅ Intellisense support
 * ✅ Single source of truth
 * ✅ Easy to refactor
 * ✅ No magic strings
 *
 * Used in:
 * - IndicatorRegistry.register(IndicatorType.EMA, ...)
 * - IndicatorLoader: switch(type) cases
 * - Analyzers: indicators.get(IndicatorType.RSI)
 */

export enum IndicatorType {
  EMA = 'EMA',
  RSI = 'RSI',
  ATR = 'ATR',
  VOLUME = 'VOLUME',
  STOCHASTIC = 'STOCHASTIC',
  BOLLINGER_BANDS = 'BOLLINGER_BANDS',
}

/**
 * Helper to get all indicator types
 */
export function getAllIndicatorTypes(): IndicatorType[] {
  return Object.values(IndicatorType);
}

/**
 * Helper to check if string is valid indicator type
 */
export function isValidIndicatorType(value: string): value is IndicatorType {
  return Object.values(IndicatorType).includes(value as IndicatorType);
}
