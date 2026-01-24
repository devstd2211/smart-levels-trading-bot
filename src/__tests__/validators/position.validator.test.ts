/**
 * Phase 9.P0.2: Position Validator Unit Tests
 *
 * Tests for runtime validation to prevent NaN crashes
 * Covers: type mismatches, empty strings, undefined fields, backward compatibility
 *
 * Total: 8 tests
 */

import { PositionValidator } from '../../validators/position.validator';
import { PositionSide, Position } from '../../types';

const mockLogger: any = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  log: jest.fn(),
};

const createValidPosition = (): Position => ({
  id: 'BTCUSDT_Buy',
  symbol: 'BTCUSDT',
  side: PositionSide.LONG,
  quantity: 1.0,
  entryPrice: 45000,
  leverage: 10,
  marginUsed: 4500,
  unrealizedPnL: 500,
  status: 'OPEN',
  openedAt: Date.now(),
  orderId: 'order-123',
  reason: 'Test entry',
  takeProfits: [
    { level: 1, percent: 0.5, sizePercent: 50, price: 45225, hit: false },
  ],
  stopLoss: {
    price: 44000,
    initialPrice: 44000,
    isBreakeven: false,
    isTrailing: false,
    updatedAt: Date.now(),
  },
});

describe('PositionValidator - P0.2 Tests', () => {
  let validator: PositionValidator;

  beforeEach(() => {
    jest.clearAllMocks();
    validator = new PositionValidator(mockLogger);
  });

  // =========================================================================
  // VALID POSITION TESTS
  // =========================================================================

  describe('Valid Positions', () => {
    test('V1: Valid position passes validation', () => {
      const position = createValidPosition();

      expect(() => validator.validateForPhase9Monitoring(position)).not.toThrow();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Position validated successfully')
      );
    });

    test('V2: Minimal valid position passes validation', () => {
      const position: Position = {
        id: 'TEST_123',
        symbol: 'XRPUSDT',
        side: PositionSide.SHORT,
        quantity: 100,
        entryPrice: 2.5,
        leverage: 5,
        marginUsed: 50,
        unrealizedPnL: -10,
        status: 'OPEN',
        openedAt: Date.now(),
        orderId: 'order-456',
        reason: 'Test',
        takeProfits: [],
        stopLoss: {
          price: 2.6,
          initialPrice: 2.6,
          isBreakeven: false,
          isTrailing: false,
          updatedAt: Date.now(),
        },
      };

      expect(() => validator.validateForPhase9Monitoring(position)).not.toThrow();
    });
  });

  // =========================================================================
  // NULL/UNDEFINED TESTS
  // =========================================================================

  describe('Null/Undefined Handling', () => {
    test('N1: Null position throws error', () => {
      expect(() => validator.validateForPhase9Monitoring(null)).toThrow();
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('[P0.2]')
      );
    });

    test('N2: Undefined position throws error', () => {
      expect(() => validator.validateForPhase9Monitoring(undefined)).toThrow();
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('[P0.2]')
      );
    });
  });

  // =========================================================================
  // ID & SYMBOL TESTS
  // =========================================================================

  describe('ID and Symbol Validation', () => {
    test('S1: Missing id throws error', () => {
      const position = createValidPosition();
      position.id = '';

      expect(() => validator.validateForPhase9Monitoring(position)).toThrow();
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('[P0.2]')
      );
    });

    test('S2: Missing symbol throws error', () => {
      const position = createValidPosition();
      position.symbol = '';

      expect(() => validator.validateForPhase9Monitoring(position)).toThrow();
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('[P0.2]')
      );
    });
  });

  // =========================================================================
  // ENTRY PRICE TESTS (Critical - empty string issue from Session 27)
  // =========================================================================

  describe('Entry Price Validation (Critical)', () => {
    test('E1: Empty string entryPrice throws error', () => {
      const position = createValidPosition();
      (position as any).entryPrice = '';

      expect(() => validator.validateForPhase9Monitoring(position)).toThrow();
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('[P0.2]')
      );
    });

    test('E2: NaN entryPrice throws error', () => {
      const position = createValidPosition();
      (position as any).entryPrice = NaN;

      expect(() => validator.validateForPhase9Monitoring(position)).toThrow();
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('[P0.2]')
      );
    });

    test('E3: String entryPrice throws error', () => {
      const position = createValidPosition();
      (position as any).entryPrice = '45000';

      expect(() => validator.validateForPhase9Monitoring(position)).toThrow();
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('[P0.2]')
      );
    });

    test('E4: Valid entryPrice passes', () => {
      const position = createValidPosition();
      position.entryPrice = 45000;

      expect(() => validator.validateForPhase9Monitoring(position)).not.toThrow();
    });
  });

  // =========================================================================
  // UNREALIZEDPNL TESTS
  // =========================================================================

  describe('UnrealizedPnL Validation', () => {
    test('U1: Undefined unrealizedPnL throws error', () => {
      const position = createValidPosition();
      (position as any).unrealizedPnL = undefined;

      expect(() => validator.validateForPhase9Monitoring(position)).toThrow();
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('[P0.2]')
      );
    });

    test('U2: NaN unrealizedPnL throws error', () => {
      const position = createValidPosition();
      (position as any).unrealizedPnL = NaN;

      expect(() => validator.validateForPhase9Monitoring(position)).toThrow();
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('[P0.2]')
      );
    });

    test('U3: Valid unrealizedPnL passes', () => {
      const position = createValidPosition();
      position.unrealizedPnL = -1000;

      expect(() => validator.validateForPhase9Monitoring(position)).not.toThrow();
    });

    test('U4: Zero unrealizedPnL passes', () => {
      const position = createValidPosition();
      position.unrealizedPnL = 0;

      expect(() => validator.validateForPhase9Monitoring(position)).not.toThrow();
    });
  });

  // =========================================================================
  // LEVERAGE TESTS
  // =========================================================================

  describe('Leverage Validation', () => {
    test('L1: Invalid leverage throws error', () => {
      const position = createValidPosition();
      (position as any).leverage = undefined;

      expect(() => validator.validateForPhase9Monitoring(position)).toThrow();
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('[P0.2]')
      );
    });

    test('L2: Valid leverage passes', () => {
      const position = createValidPosition();
      position.leverage = 10;

      expect(() => validator.validateForPhase9Monitoring(position)).not.toThrow();
    });
  });

  // =========================================================================
  // STOPLOSS VALIDATION
  // =========================================================================

  describe('Stop Loss Validation', () => {
    test('SL1: Invalid stopLoss.price throws error', () => {
      const position = createValidPosition();
      (position.stopLoss as any).price = undefined;

      expect(() => validator.validateForPhase9Monitoring(position)).toThrow();
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('[P0.2]')
      );
    });

    test('SL2: NaN stopLoss.price throws error', () => {
      const position = createValidPosition();
      (position.stopLoss as any).price = NaN;

      expect(() => validator.validateForPhase9Monitoring(position)).toThrow();
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('[P0.2]')
      );
    });

    test('SL3: Valid stopLoss passes', () => {
      const position = createValidPosition();
      position.stopLoss.price = 44000;

      expect(() => validator.validateForPhase9Monitoring(position)).not.toThrow();
    });
  });

  // =========================================================================
  // BACKWARD COMPATIBILITY TESTS
  // =========================================================================

  describe('Backward Compatibility (fillMissingFields)', () => {
    test('BC1: Position without unrealizedPnL gets filled', () => {
      const position = createValidPosition();
      (position as any).unrealizedPnL = undefined; // Old position format

      // First validation will fail
      expect(() => validator.validateForPhase9Monitoring(position)).toThrow();

      // Fill missing fields
      const filled = validator.fillMissingFields(position, 45500);

      // Now validation passes
      expect(() => validator.validateForPhase9Monitoring(filled)).not.toThrow();
      expect(filled.unrealizedPnL).toBeCloseTo(500 * 1.0, 0); // (45500 - 45000) * 1
    });

    test('BC2: Position without marginUsed gets estimated', () => {
      const position = createValidPosition();
      (position as any).marginUsed = 0;

      const filled = validator.fillMissingFields(position, 45500);

      expect(filled.marginUsed).toBeGreaterThan(0);
      expect(filled.marginUsed).toBeCloseTo(4500, 0); // quantity * entryPrice / leverage
    });

    test('BC3: Position with all fields unchanged', () => {
      const position = createValidPosition();
      const original = JSON.parse(JSON.stringify(position));

      const filled = validator.fillMissingFields(position, 45500);

      expect(filled).toEqual(original); // No changes needed
    });
  });

  // =========================================================================
  // MULTIPLE ERROR TESTS
  // =========================================================================

  describe('Multiple Errors Reporting', () => {
    test('ME1: Multiple validation errors all reported', () => {
      const position = {
        id: '',
        symbol: '',
        side: PositionSide.LONG,
        quantity: NaN,
        entryPrice: '',
        leverage: undefined,
        marginUsed: 0,
        unrealizedPnL: NaN,
        status: 'OPEN',
        openedAt: Date.now(),
        orderId: 'order-123',
        reason: 'Test',
        takeProfits: [],
        stopLoss: {
          price: NaN,
          initialPrice: 44000,
          isBreakeven: false,
          isTrailing: false,
          updatedAt: Date.now(),
        },
      } as any;

      expect(() => validator.validateForPhase9Monitoring(position)).toThrow();

      // Error message should contain multiple validation failures
      const errorCall = mockLogger.error.mock.calls[0][0];
      expect(errorCall).toContain('Invalid id');
      expect(errorCall).toContain('Invalid symbol');
      expect(errorCall).toContain('Invalid entryPrice');
    });
  });
});
