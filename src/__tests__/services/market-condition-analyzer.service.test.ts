/**
 * Market Condition Analyzer Service Tests
 * Tests for adjusting take profits based on market conditions
 */

import { MarketConditionAnalyzerService } from '../../services/market-condition-analyzer.service';
import {
  LoggerService,
  LogLevel,
  TakeProfit,
} from '../../types';
import { DECIMAL_PLACES, FIXED_EXIT_PERCENTAGES } from '../../constants';

// ============================================================================
// MOCKS
// ============================================================================

const createMockLogger = (): LoggerService => {
  return new LoggerService(LogLevel.ERROR, './logs', false);
};

const createMockTakeProfit = (overrides?: Partial<TakeProfit>): TakeProfit => ({
  level: 1,
  price: 101,
  sizePercent: 33.33,
  percent: 1,
  hit: false,
  ...overrides,
});

const createMultipleTakeProfits = (): TakeProfit[] => [
  createMockTakeProfit({
    level: 1,
    price: 101,
    sizePercent: 33.33,
    percent: 1,
  }),
  createMockTakeProfit({
    level: 2,
    price: 102,
    sizePercent: 33.33,
    percent: 2,
  }),
  createMockTakeProfit({
    level: 3,
    price: 103,
    sizePercent: 33.34,
    percent: 3,
  }),
];

// ============================================================================
// TESTS
// ============================================================================

describe('MarketConditionAnalyzerService', () => {
  let service: MarketConditionAnalyzerService;
  let logger: LoggerService;

  beforeEach(() => {
    logger = createMockLogger();
    service = new MarketConditionAnalyzerService(logger);
  });

  // ==========================================================================
  // TEST GROUP 1: Flat Market Detection
  // ==========================================================================

  describe('adjustTakeProfitsForMarketCondition - FLAT market', () => {
    it('should convert multi-TP to single TP in flat market', () => {
      const takeProfits = createMultipleTakeProfits();
      const flatResult = { isFlat: true, confidence: 75 };

      const adjusted = service.adjustTakeProfitsForMarketCondition(takeProfits, flatResult);

      expect(adjusted).toHaveLength(1);
      expect(adjusted[0].level).toBe(1);
      expect(adjusted[0].sizePercent).toBe(FIXED_EXIT_PERCENTAGES.FULL);
    });

    it('should use first TP price in flat market', () => {
      const takeProfits = createMultipleTakeProfits();
      const flatResult = { isFlat: true, confidence: 75 };

      const adjusted = service.adjustTakeProfitsForMarketCondition(takeProfits, flatResult);

      expect(adjusted[0].price).toBe(takeProfits[0].price);
    });

    it('should close 100% at first TP in flat market', () => {
      const takeProfits = createMultipleTakeProfits();
      const flatResult = { isFlat: true, confidence: 75 };

      const adjusted = service.adjustTakeProfitsForMarketCondition(takeProfits, flatResult);

      expect(adjusted[0].sizePercent).toBe(100);
    });

    it('should preserve percent from first TP in flat market', () => {
      const takeProfits = createMultipleTakeProfits();
      const flatResult = { isFlat: true, confidence: 75 };

      const adjusted = service.adjustTakeProfitsForMarketCondition(takeProfits, flatResult);

      expect(adjusted[0].percent).toBe(takeProfits[0].percent);
    });

    it('should handle single TP in flat market', () => {
      const takeProfits = [createMockTakeProfit({ level: 1, price: 101 })];
      const flatResult = { isFlat: true, confidence: 75 };

      const adjusted = service.adjustTakeProfitsForMarketCondition(takeProfits, flatResult);

      expect(adjusted).toHaveLength(1);
      expect(adjusted[0].price).toBe(101);
      expect(adjusted[0].sizePercent).toBe(100);
    });

    it('should set hit to false on adjusted TP', () => {
      const takeProfits = createMultipleTakeProfits();
      const flatResult = { isFlat: true, confidence: 75 };

      const adjusted = service.adjustTakeProfitsForMarketCondition(takeProfits, flatResult);

      expect(adjusted[0].hit).toBe(false);
    });

    it('should handle low flat confidence', () => {
      const takeProfits = createMultipleTakeProfits();
      const flatResult = { isFlat: true, confidence: 55.5 };

      const adjusted = service.adjustTakeProfitsForMarketCondition(takeProfits, flatResult);

      expect(adjusted).toHaveLength(1);
      expect(adjusted[0].sizePercent).toBe(100);
    });

    it('should handle high flat confidence', () => {
      const takeProfits = createMultipleTakeProfits();
      const flatResult = { isFlat: true, confidence: 95 };

      const adjusted = service.adjustTakeProfitsForMarketCondition(takeProfits, flatResult);

      expect(adjusted).toHaveLength(1);
      expect(adjusted[0].sizePercent).toBe(100);
    });
  });

  // ==========================================================================
  // TEST GROUP 2: Trending Market Detection
  // ==========================================================================

  describe('adjustTakeProfitsForMarketCondition - TRENDING market', () => {
    it('should keep multi-TP strategy in trending market', () => {
      const takeProfits = createMultipleTakeProfits();
      const flatResult = { isFlat: false, confidence: 75 };

      const adjusted = service.adjustTakeProfitsForMarketCondition(takeProfits, flatResult);

      expect(adjusted).toHaveLength(3);
      expect(adjusted).toEqual(takeProfits);
    });

    it('should preserve all TP levels in trending market', () => {
      const takeProfits = createMultipleTakeProfits();
      const flatResult = { isFlat: false, confidence: 75 };

      const adjusted = service.adjustTakeProfitsForMarketCondition(takeProfits, flatResult);

      for (let i = 0; i < takeProfits.length; i++) {
        expect(adjusted[i].level).toBe(takeProfits[i].level);
        expect(adjusted[i].price).toBe(takeProfits[i].price);
      }
    });

    it('should preserve size distribution in trending market', () => {
      const takeProfits = createMultipleTakeProfits();
      const flatResult = { isFlat: false, confidence: 75 };

      const adjusted = service.adjustTakeProfitsForMarketCondition(takeProfits, flatResult);

      expect(adjusted[0].sizePercent).toBe(33.33);
      expect(adjusted[1].sizePercent).toBe(33.33);
      expect(adjusted[2].sizePercent).toBe(33.34);
    });

    it('should handle single TP in trending market', () => {
      const takeProfits = [createMockTakeProfit({ level: 1, price: 101 })];
      const flatResult = { isFlat: false, confidence: 75 };

      const adjusted = service.adjustTakeProfitsForMarketCondition(takeProfits, flatResult);

      expect(adjusted).toHaveLength(1);
      expect(adjusted[0]).toEqual(takeProfits[0]);
    });

    it('should handle low trending confidence', () => {
      const takeProfits = createMultipleTakeProfits();
      const flatResult = { isFlat: false, confidence: 55.5 };

      const adjusted = service.adjustTakeProfitsForMarketCondition(takeProfits, flatResult);

      expect(adjusted).toEqual(takeProfits);
    });

    it('should handle high trending confidence', () => {
      const takeProfits = createMultipleTakeProfits();
      const flatResult = { isFlat: false, confidence: 95 };

      const adjusted = service.adjustTakeProfitsForMarketCondition(takeProfits, flatResult);

      expect(adjusted).toEqual(takeProfits);
    });
  });

  // ==========================================================================
  // TEST GROUP 3: No Market Condition Data
  // ==========================================================================

  describe('adjustTakeProfitsForMarketCondition - No flat result', () => {
    it('should return original TPs when flatResult is null', () => {
      const takeProfits = createMultipleTakeProfits();

      const adjusted = service.adjustTakeProfitsForMarketCondition(takeProfits, null);

      expect(adjusted).toEqual(takeProfits);
    });

    it('should return original TPs when flatResult is undefined', () => {
      const takeProfits = createMultipleTakeProfits();

      const adjusted = service.adjustTakeProfitsForMarketCondition(takeProfits, undefined as any);

      expect(adjusted).toEqual(takeProfits);
    });

    it('should preserve all TP details when no flat result', () => {
      const takeProfits = createMultipleTakeProfits();

      const adjusted = service.adjustTakeProfitsForMarketCondition(takeProfits, null);

      for (let i = 0; i < takeProfits.length; i++) {
        expect(adjusted[i]).toEqual(takeProfits[i]);
      }
    });
  });

  // ==========================================================================
  // TEST GROUP 4: Different TP Configurations
  // ==========================================================================

  describe('adjustTakeProfitsForMarketCondition - Different TP configs', () => {
    it('should handle two TP levels', () => {
      const takeProfits: TakeProfit[] = [
        createMockTakeProfit({ level: 1, price: 101, sizePercent: 50 }),
        createMockTakeProfit({ level: 2, price: 102, sizePercent: 50 }),
      ];
      const flatResult = { isFlat: true, confidence: 75 };

      const adjusted = service.adjustTakeProfitsForMarketCondition(takeProfits, flatResult);

      expect(adjusted).toHaveLength(1);
      expect(adjusted[0].price).toBe(101);
      expect(adjusted[0].sizePercent).toBe(100);
    });

    it('should handle four TP levels', () => {
      const takeProfits: TakeProfit[] = [
        createMockTakeProfit({ level: 1, price: 101, sizePercent: 25 }),
        createMockTakeProfit({ level: 2, price: 102, sizePercent: 25 }),
        createMockTakeProfit({ level: 3, price: 103, sizePercent: 25 }),
        createMockTakeProfit({ level: 4, price: 104, sizePercent: 25 }),
      ];
      const flatResult = { isFlat: true, confidence: 75 };

      const adjusted = service.adjustTakeProfitsForMarketCondition(takeProfits, flatResult);

      expect(adjusted).toHaveLength(1);
      expect(adjusted[0].price).toBe(101);
    });

    it('should handle unequal TP distribution', () => {
      const takeProfits: TakeProfit[] = [
        createMockTakeProfit({ level: 1, price: 101, sizePercent: 50 }),
        createMockTakeProfit({ level: 2, price: 102, sizePercent: 30 }),
        createMockTakeProfit({ level: 3, price: 103, sizePercent: 20 }),
      ];
      const flatResult = { isFlat: true, confidence: 75 };

      const adjusted = service.adjustTakeProfitsForMarketCondition(takeProfits, flatResult);

      expect(adjusted).toHaveLength(1);
      expect(adjusted[0].sizePercent).toBe(100);
    });

    it('should handle different TP prices', () => {
      const takeProfits: TakeProfit[] = [
        createMockTakeProfit({ level: 1, price: 1001, sizePercent: 33.33 }),
        createMockTakeProfit({ level: 2, price: 2002, sizePercent: 33.33 }),
        createMockTakeProfit({ level: 3, price: 5005, sizePercent: 33.34 }),
      ];
      const flatResult = { isFlat: true, confidence: 75 };

      const adjusted = service.adjustTakeProfitsForMarketCondition(takeProfits, flatResult);

      expect(adjusted).toHaveLength(1);
      expect(adjusted[0].price).toBe(1001);
    });
  });

  // ==========================================================================
  // TEST GROUP 5: TP Price Precision
  // ==========================================================================

  describe('adjustTakeProfitsForMarketCondition - Price precision', () => {
    it('should preserve fractional prices in flat market', () => {
      const takeProfits = [
        createMockTakeProfit({ level: 1, price: 100.123456, sizePercent: 100 }),
      ];
      const flatResult = { isFlat: true, confidence: 75 };

      const adjusted = service.adjustTakeProfitsForMarketCondition(takeProfits, flatResult);

      expect(adjusted[0].price).toBe(100.123456);
    });

    it('should handle very large TP prices', () => {
      const takeProfits = [
        createMockTakeProfit({ level: 1, price: 50000, sizePercent: 100 }),
        createMockTakeProfit({ level: 2, price: 60000, sizePercent: 100 }),
      ];
      const flatResult = { isFlat: true, confidence: 75 };

      const adjusted = service.adjustTakeProfitsForMarketCondition(takeProfits, flatResult);

      expect(adjusted).toHaveLength(1);
      expect(adjusted[0].price).toBe(50000);
    });

    it('should handle very small TP prices', () => {
      const takeProfits = [
        createMockTakeProfit({ level: 1, price: 0.001, sizePercent: 100 }),
        createMockTakeProfit({ level: 2, price: 0.002, sizePercent: 100 }),
      ];
      const flatResult = { isFlat: true, confidence: 75 };

      const adjusted = service.adjustTakeProfitsForMarketCondition(takeProfits, flatResult);

      expect(adjusted).toHaveLength(1);
      expect(adjusted[0].price).toBe(0.001);
    });
  });

  // ==========================================================================
  // TEST GROUP 6: Integration Scenarios
  // ==========================================================================

  describe('integration scenarios', () => {
    it('should handle complete flat market flow', () => {
      const takeProfits = createMultipleTakeProfits();
      const flatResult = { isFlat: true, confidence: 80 };

      const adjusted = service.adjustTakeProfitsForMarketCondition(takeProfits, flatResult);

      // Verify transformation
      expect(adjusted).toHaveLength(1);
      expect(adjusted[0].level).toBe(1);
      expect(adjusted[0].price).toBe(takeProfits[0].price);
      expect(adjusted[0].sizePercent).toBe(FIXED_EXIT_PERCENTAGES.FULL);
      expect(adjusted[0].hit).toBe(false);
    });

    it('should handle complete trending market flow', () => {
      const takeProfits = createMultipleTakeProfits();
      const flatResult = { isFlat: false, confidence: 80 };

      const adjusted = service.adjustTakeProfitsForMarketCondition(takeProfits, flatResult);

      // Verify no changes
      expect(adjusted).toEqual(takeProfits);
    });

    it('should switch between flat and trending detection', () => {
      const takeProfits = createMultipleTakeProfits();

      // First, flat market
      const flatAdjusted = service.adjustTakeProfitsForMarketCondition(
        takeProfits,
        { isFlat: true, confidence: 75 },
      );
      expect(flatAdjusted).toHaveLength(1);

      // Then, trending market
      const trendingAdjusted = service.adjustTakeProfitsForMarketCondition(
        takeProfits,
        { isFlat: false, confidence: 75 },
      );
      expect(trendingAdjusted).toHaveLength(3);
    });

    it('should handle edge case: transition from flat to trending', () => {
      const takeProfits = createMultipleTakeProfits();

      // Start with flat market
      let adjusted = service.adjustTakeProfitsForMarketCondition(
        takeProfits,
        { isFlat: true, confidence: 75 },
      );
      expect(adjusted).toHaveLength(1);

      // Switch to trending (use original TPs, not adjusted ones)
      adjusted = service.adjustTakeProfitsForMarketCondition(
        takeProfits, // Always use original
        { isFlat: false, confidence: 75 },
      );
      expect(adjusted).toHaveLength(3);
    });
  });

  // ==========================================================================
  // TEST GROUP 7: Edge Cases & Robustness
  // ==========================================================================

  describe('edge cases and robustness', () => {
    it('should handle empty TP array in flat market', () => {
      const takeProfits: TakeProfit[] = [];
      const flatResult = { isFlat: true, confidence: 75 };

      expect(() => {
        service.adjustTakeProfitsForMarketCondition(takeProfits, flatResult);
      }).toThrow(); // Should throw because takeProfits[0] doesn't exist
    });

    it('should handle empty TP array in trending market', () => {
      const takeProfits: TakeProfit[] = [];
      const flatResult = { isFlat: false, confidence: 75 };

      const adjusted = service.adjustTakeProfitsForMarketCondition(takeProfits, flatResult);

      expect(adjusted).toEqual(takeProfits);
    });

    it('should handle flat confidence at 0', () => {
      const takeProfits = createMultipleTakeProfits();
      const flatResult = { isFlat: true, confidence: 0 };

      const adjusted = service.adjustTakeProfitsForMarketCondition(takeProfits, flatResult);

      expect(adjusted).toHaveLength(1);
      expect(adjusted[0].sizePercent).toBe(100);
    });

    it('should handle flat confidence at 100', () => {
      const takeProfits = createMultipleTakeProfits();
      const flatResult = { isFlat: true, confidence: 100 };

      const adjusted = service.adjustTakeProfitsForMarketCondition(takeProfits, flatResult);

      expect(adjusted).toHaveLength(1);
      expect(adjusted[0].sizePercent).toBe(100);
    });

    it('should not mutate original TP array', () => {
      const takeProfits = createMultipleTakeProfits();
      const originalLength = takeProfits.length;
      const flatResult = { isFlat: true, confidence: 75 };

      service.adjustTakeProfitsForMarketCondition(takeProfits, flatResult);

      expect(takeProfits).toHaveLength(originalLength);
      expect(takeProfits[0].sizePercent).toBe(33.33); // Original unchanged
    });

    it('should handle TP with hit = true', () => {
      const takeProfits = [
        createMockTakeProfit({ level: 1, price: 101, hit: true }),
        createMockTakeProfit({ level: 2, price: 102, hit: false }),
      ];
      const flatResult = { isFlat: true, confidence: 75 };

      const adjusted = service.adjustTakeProfitsForMarketCondition(takeProfits, flatResult);

      expect(adjusted[0].hit).toBe(false); // Reset to false
    });

    it('should handle TP with negative percent', () => {
      const takeProfits = [
        createMockTakeProfit({ level: 1, price: 101, percent: -1 }),
      ];
      const flatResult = { isFlat: true, confidence: 75 };

      const adjusted = service.adjustTakeProfitsForMarketCondition(takeProfits, flatResult);

      expect(adjusted[0].percent).toBe(-1); // Preserve as-is
    });

    it('should handle TP with zero price', () => {
      const takeProfits = [
        createMockTakeProfit({ level: 1, price: 0 }),
        createMockTakeProfit({ level: 2, price: 102 }),
      ];
      const flatResult = { isFlat: true, confidence: 75 };

      const adjusted = service.adjustTakeProfitsForMarketCondition(takeProfits, flatResult);

      expect(adjusted[0].price).toBe(0);
    });
  });
});
