/**
 * Market Condition Analyzer Service (Week 13 Phase 4b Extract)
 *
 * Extracted from SignalProcessingService.ts
 * Responsible for adjusting trading parameters based on market conditions.
 *
 * Single Responsibility: Adapt take profit levels to market conditions (FLAT vs TRENDING)
 */

import {
  LoggerService,
  TakeProfit,
} from '../types';
import {
  DECIMAL_PLACES,
  FIXED_EXIT_PERCENTAGES,
} from '../constants';

/**
 * Market Condition Analyzer Service
 *
 * Adjusts trading parameters based on market conditions:
 * - FLAT market: Use single TP at 100% size (reduce risk in sideways movement)
 * - TRENDING market: Keep multi-TP strategy (maximize profit in trending markets)
 */
export class MarketConditionAnalyzerService {
  constructor(
    private logger: LoggerService,
  ) {}

  /**
   * Adjust take profits based on market condition
   * - FLAT MARKET: Convert to single TP at 100% close on TP1 price
   * - TRENDING MARKET: Keep multi-TP strategy for better profit scaling
   * @param takeProfits - Original take profit levels
   * @param flatResult - Flat market detection result with confidence
   * @returns Adjusted take profit levels
   */
  public adjustTakeProfitsForMarketCondition(
    takeProfits: TakeProfit[],
    flatResult: { isFlat: boolean; confidence: number } | null,
  ): TakeProfit[] {
    if (!flatResult) {
      return takeProfits;
    }

    if (flatResult.isFlat) {
      // FLAT MARKET: Adjust to single TP (100% close at TP1 price)
      const firstTP = takeProfits[0];
      const adjustedTP: TakeProfit[] = [{
        level: 1,
        price: firstTP.price,
        sizePercent: FIXED_EXIT_PERCENTAGES.FULL, // Close 100% on TP1
        percent: firstTP.percent,
        hit: false,
      }];

      this.logger.info('⚡ FLAT market - adjusted to single TP', {
        confidence: flatResult.confidence.toFixed(1) + '%',
        tpPrice: firstTP.price.toFixed(DECIMAL_PLACES.PRICE),
        tpPercent: firstTP.percent.toFixed(DECIMAL_PLACES.PERCENT) + '%',
      });

      return adjustedTP;
    }

    // TRENDING MARKET: Keep multi-TP strategy
    this.logger.info('📈 TRENDING market - keeping multi-TP strategy', {
      confidence: flatResult.confidence.toFixed(1) + '%',
      tpCount: takeProfits.length,
    });

    return takeProfits;
  }
}
