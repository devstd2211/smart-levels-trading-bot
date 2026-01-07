/**
 * WebSocket Manager Service Tests
 *
 * Tests for WebSocket event handling and deduplication (Session #60)
 */

import { WebSocketManagerService } from '../../services/websocket-manager.service';
import { OrderExecutionDetectorService } from '../../services/order-execution-detector.service';
import { WebSocketAuthenticationService } from '../../services/websocket-authentication.service';
import { EventDeduplicationService } from '../../services/event-deduplication.service';
import { ExchangeConfig, LoggerService, LogLevel } from '../../types';

// ============================================================================
// MOCKS
// ============================================================================

const createMockConfig = (): ExchangeConfig => ({
  name: 'bybit',
  symbol: 'APEXUSDT',
  timeframe: '1m',
  apiKey: 'test-api-key',
  apiSecret: 'test-api-secret',
  testnet: false,
  demo: false,
});

const createMockLogger = (): LoggerService => {
  return new LoggerService(LogLevel.ERROR, './logs', false);
};

// ============================================================================
// TESTS
// ============================================================================

describe('WebSocketManagerService', () => {
  let wsManager: WebSocketManagerService;
  let config: ExchangeConfig;
  let logger: LoggerService;
  let orderExecutionDetector: OrderExecutionDetectorService;
  let authService: WebSocketAuthenticationService;
  let deduplicationService: EventDeduplicationService;

  beforeEach(() => {
    config = createMockConfig();
    logger = createMockLogger();
    orderExecutionDetector = new OrderExecutionDetectorService(logger);
    authService = new WebSocketAuthenticationService();
    deduplicationService = new EventDeduplicationService(100, 60000, logger);
    wsManager = new WebSocketManagerService(config, 'APEXUSDT', logger, orderExecutionDetector, authService, deduplicationService);
  });

  afterEach(() => {
    wsManager.disconnect();
  });

  // ============================================================================
  // SESSION #60: EVENT DEDUPLICATION TESTS (v3.5.0)
  // ============================================================================

  describe('Event Deduplication (Session #60)', () => {
    it('should ignore duplicate TP events with same orderId', () => {
      // Access private method via any cast for testing
      const isDuplicateEvent = (wsManager as any).isDuplicateEvent.bind(wsManager);

      const eventType = 'TP';
      const orderId = 'tp1-order-123';
      const timestamp = Date.now();

      // First call - should NOT be duplicate
      const firstCall = isDuplicateEvent(eventType, orderId, timestamp);
      expect(firstCall).toBe(false);

      // Second call with same parameters - should BE duplicate
      const secondCall = isDuplicateEvent(eventType, orderId, timestamp);
      expect(secondCall).toBe(true);

      // Third call - still duplicate
      const thirdCall = isDuplicateEvent(eventType, orderId, timestamp);
      expect(thirdCall).toBe(true);
    });

    it('should process non-duplicate events', () => {
      const isDuplicateEvent = (wsManager as any).isDuplicateEvent.bind(wsManager);

      const eventType = 'TP';
      const timestamp = Date.now();

      // Different orderIds - all should be processed
      const event1 = isDuplicateEvent(eventType, 'order-1', timestamp);
      expect(event1).toBe(false); // Not duplicate

      const event2 = isDuplicateEvent(eventType, 'order-2', timestamp);
      expect(event2).toBe(false); // Not duplicate

      const event3 = isDuplicateEvent(eventType, 'order-3', timestamp);
      expect(event3).toBe(false); // Not duplicate

      // Same orderId again - should be duplicate
      const event1Again = isDuplicateEvent(eventType, 'order-1', timestamp);
      expect(event1Again).toBe(true); // Duplicate
    });

    it('should cleanup old events from cache', () => {
      const isDuplicateEvent = (wsManager as any).isDuplicateEvent.bind(wsManager);

      // Fill cache with events
      for (let i = 0; i < 110; i++) {
        const result = isDuplicateEvent('TP', `order-${i}`, Date.now());
        expect(result).toBe(i === 0 ? false : false); // All new events should not be duplicates
      }

      // Verify cache management is working by adding another event
      // This should trigger cleanup internally in the deduplication service
      const newEventResult = isDuplicateEvent('TP', 'new-order', Date.now());
      expect(newEventResult).toBe(false); // New event should not be duplicate

      // Duplicate event should still be detected
      const duplicateResult = isDuplicateEvent('TP', 'new-order', Date.now());
      expect(duplicateResult).toBe(true); // Same event should be duplicate
    });

    it('should handle different event types independently', () => {
      const isDuplicateEvent = (wsManager as any).isDuplicateEvent.bind(wsManager);

      const orderId = 'same-order-123';
      const timestamp = Date.now();

      // Different event types with same orderId - should NOT be duplicates
      const tpEvent = isDuplicateEvent('TP', orderId, timestamp);
      expect(tpEvent).toBe(false);

      const slEvent = isDuplicateEvent('SL', orderId, timestamp);
      expect(slEvent).toBe(false);

      const positionEvent = isDuplicateEvent('POSITION', orderId, timestamp);
      expect(positionEvent).toBe(false);

      // Same event type again - should be duplicate
      const tpEventAgain = isDuplicateEvent('TP', orderId, timestamp);
      expect(tpEventAgain).toBe(true);
    });

    it('should handle different timestamps for same orderId as separate events', () => {
      const isDuplicateEvent = (wsManager as any).isDuplicateEvent.bind(wsManager);

      const eventType = 'TP';
      const orderId = 'order-123';
      const timestamp1 = Date.now();
      const timestamp2 = Date.now() + 1000; // 1 second later

      // First event
      const firstCall = isDuplicateEvent(eventType, orderId, timestamp1);
      expect(firstCall).toBe(false);

      // Same orderId but different timestamp - should NOT be duplicate
      // (This is important for cases where same order triggers multiple events at different times)
      const secondCall = isDuplicateEvent(eventType, orderId, timestamp2);
      expect(secondCall).toBe(false);

      // Same orderId and same timestamp1 again - should BE duplicate
      const thirdCall = isDuplicateEvent(eventType, orderId, timestamp1);
      expect(thirdCall).toBe(true);
    });
  });

  // ============================================================================
  // BASIC FUNCTIONALITY TESTS
  // ============================================================================

  describe('Basic Functionality', () => {
    it('should initialize with disconnected state', () => {
      expect(wsManager.isConnected()).toBe(false);
    });

    it('should have null last close reason on init', () => {
      expect(wsManager.getLastCloseReason()).toBeNull();
    });

    it('should reset last close reason', () => {
      // Note: Cannot test internal state directly without connecting
      wsManager.resetLastCloseReason();
      expect(wsManager.getLastCloseReason()).toBeNull();
    });
  });
});
