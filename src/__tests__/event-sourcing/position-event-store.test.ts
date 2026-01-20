/**
 * PositionEventStore Unit Tests
 * Tests append-only event storage and retrieval
 */

import * as fs from 'fs';
import * as path from 'path';
import { PositionEventStore } from '../../event-sourcing/position-event-store.service';
import {
  PositionEventType,
  PositionOpenedEvent,
  TakeProfitHitEvent,
  StopLossHitEvent,
} from '../../event-sourcing/position.events';

describe('PositionEventStore', () => {
  let store: PositionEventStore;
  const testStorePath = path.join(__dirname, 'test-position-events.jsonl');

  beforeEach(async () => {
    // Clean up any existing test file
    if (fs.existsSync(testStorePath)) {
      fs.unlinkSync(testStorePath);
    }

    store = new PositionEventStore(testStorePath);
    await store.initialize();
  });

  afterEach(async () => {
    // Clean up
    if (fs.existsSync(testStorePath)) {
      fs.unlinkSync(testStorePath);
    }
  });

  describe('appendEvent', () => {
    it('should append a POSITION_OPENED event', async () => {
      const event: PositionOpenedEvent = {
        type: PositionEventType.POSITION_OPENED,
        positionId: 'pos-123',
        symbol: 'XRPUSD',
        timestamp: Date.now(),
        source: 'system',
        entryPrice: 2.5,
        quantity: 100,
        leverage: 5,
        side: 'LONG',
        initialStopLoss: {
          price: 2.4,
          distance: 0.1,
          hit: false,
        },
        takeProfits: [
          { price: 2.6, percent: 50, hit: false },
          { price: 2.7, percent: 30, hit: false },
          { price: 2.8, percent: 20, hit: false },
        ],
        confidence: 75,
        indicators: ['EMA', 'RSI'],
      };

      const record = await store.appendEvent(event);

      expect(record.id).toBeDefined();
      expect(record.event).toEqual(event);
      expect(record.version).toBe(1);
      expect(fs.existsSync(testStorePath)).toBe(true);
    });

    it('should generate unique IDs for events', async () => {
      const event1: PositionOpenedEvent = {
        type: PositionEventType.POSITION_OPENED,
        positionId: 'pos-123',
        symbol: 'XRPUSD',
        timestamp: Date.now(),
        source: 'system',
        entryPrice: 2.5,
        quantity: 100,
        leverage: 5,
        side: 'LONG',
        initialStopLoss: { price: 2.4, distance: 0.1, hit: false },
        takeProfits: [{ price: 2.6, percent: 100, hit: false }],
        confidence: 75,
        indicators: ['EMA'],
      };

      const event2: PositionOpenedEvent = {
        ...event1,
        positionId: 'pos-124',
      };

      const record1 = await store.appendEvent(event1);
      const record2 = await store.appendEvent(event2);

      expect(record1.id).not.toEqual(record2.id);
    });
  });

  describe('getPositionEvents', () => {
    it('should retrieve all events for a position', async () => {
      const posId = 'pos-123';

      const openEvent: PositionOpenedEvent = {
        type: PositionEventType.POSITION_OPENED,
        positionId: posId,
        symbol: 'XRPUSD',
        timestamp: Date.now(),
        source: 'system',
        entryPrice: 2.5,
        quantity: 100,
        leverage: 5,
        side: 'LONG',
        initialStopLoss: { price: 2.4, distance: 0.1, hit: false },
        takeProfits: [{ price: 2.6, percent: 100, hit: false }],
        confidence: 75,
        indicators: ['EMA'],
      };

      const slEvent: StopLossHitEvent = {
        type: PositionEventType.STOP_LOSS_HIT,
        positionId: posId,
        symbol: 'XRPUSD',
        timestamp: Date.now() + 1000,
        source: 'system',
        slPrice: 2.4,
        closedAtPrice: 2.39,
        closedQuantity: 100,
        unrealizedPnL: -100,
        realizedPnL: -100,
        pnlPercent: -4,
      };

      await store.appendEvent(openEvent);
      await store.appendEvent(slEvent);

      const events = await store.getPositionEvents(posId);

      expect(events).toHaveLength(2);
      expect(events[0].type).toBe(PositionEventType.POSITION_OPENED);
      expect(events[1].type).toBe(PositionEventType.STOP_LOSS_HIT);
    });

    it('should return empty array for non-existent position', async () => {
      const events = await store.getPositionEvents('non-existent');
      expect(events).toEqual([]);
    });
  });

  describe('getSymbolEvents', () => {
    it('should retrieve all events for a symbol', async () => {
      const symbol = 'XRPUSD';

      const event1: PositionOpenedEvent = {
        type: PositionEventType.POSITION_OPENED,
        positionId: 'pos-123',
        symbol,
        timestamp: Date.now(),
        source: 'system',
        entryPrice: 2.5,
        quantity: 100,
        leverage: 5,
        side: 'LONG',
        initialStopLoss: { price: 2.4, distance: 0.1, hit: false },
        takeProfits: [{ price: 2.6, percent: 100, hit: false }],
        confidence: 75,
        indicators: ['EMA'],
      };

      const event2: PositionOpenedEvent = {
        ...event1,
        positionId: 'pos-124',
        timestamp: Date.now() + 1000,
      };

      await store.appendEvent(event1);
      await store.appendEvent(event2);

      const events = await store.getSymbolEvents(symbol);

      expect(events).toHaveLength(2);
      expect(events.every((e) => e.symbol === symbol)).toBe(true);
    });
  });

  describe('positionExists', () => {
    it('should return true if position exists', async () => {
      const event: PositionOpenedEvent = {
        type: PositionEventType.POSITION_OPENED,
        positionId: 'pos-123',
        symbol: 'XRPUSD',
        timestamp: Date.now(),
        source: 'system',
        entryPrice: 2.5,
        quantity: 100,
        leverage: 5,
        side: 'LONG',
        initialStopLoss: { price: 2.4, distance: 0.1, hit: false },
        takeProfits: [{ price: 2.6, percent: 100, hit: false }],
        confidence: 75,
        indicators: ['EMA'],
      };

      await store.appendEvent(event);

      const exists = await store.positionExists('pos-123');
      expect(exists).toBe(true);
    });

    it('should return false if position does not exist', async () => {
      const exists = await store.positionExists('non-existent');
      expect(exists).toBe(false);
    });
  });

  describe('getEventCount', () => {
    it('should count events for a position', async () => {
      const posId = 'pos-123';

      for (let i = 0; i < 5; i++) {
        const event: PositionOpenedEvent = {
          type: PositionEventType.POSITION_OPENED,
          positionId: posId,
          symbol: 'XRPUSD',
          timestamp: Date.now() + i * 1000,
          source: 'system',
          entryPrice: 2.5,
          quantity: 100,
          leverage: 5,
          side: 'LONG',
          initialStopLoss: { price: 2.4, distance: 0.1, hit: false },
          takeProfits: [{ price: 2.6, percent: 100, hit: false }],
          confidence: 75,
          indicators: ['EMA'],
        };
        await store.appendEvent(event);
      }

      const count = await store.getEventCount(posId);
      expect(count).toBe(5);
    });
  });

  describe('persistence', () => {
    it('should load events from disk on initialization', async () => {
      const event: PositionOpenedEvent = {
        type: PositionEventType.POSITION_OPENED,
        positionId: 'pos-123',
        symbol: 'XRPUSD',
        timestamp: Date.now(),
        source: 'system',
        entryPrice: 2.5,
        quantity: 100,
        leverage: 5,
        side: 'LONG',
        initialStopLoss: { price: 2.4, distance: 0.1, hit: false },
        takeProfits: [{ price: 2.6, percent: 100, hit: false }],
        confidence: 75,
        indicators: ['EMA'],
      };

      await store.appendEvent(event);

      // Create new store instance and initialize
      const newStore = new PositionEventStore(testStorePath);
      await newStore.initialize();

      const events = await newStore.getPositionEvents('pos-123');
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(PositionEventType.POSITION_OPENED);
    });
  });

  describe('getEventsByTimeRange', () => {
    it('should retrieve events within time range', async () => {
      const now = Date.now();

      for (let i = 0; i < 5; i++) {
        const event: PositionOpenedEvent = {
          type: PositionEventType.POSITION_OPENED,
          positionId: `pos-${i}`,
          symbol: 'XRPUSD',
          timestamp: now + i * 1000,
          source: 'system',
          entryPrice: 2.5,
          quantity: 100,
          leverage: 5,
          side: 'LONG',
          initialStopLoss: { price: 2.4, distance: 0.1, hit: false },
          takeProfits: [{ price: 2.6, percent: 100, hit: false }],
          confidence: 75,
          indicators: ['EMA'],
        };
        await store.appendEvent(event);
      }

      const events = await store.getEventsByTimeRange(now + 1000, now + 3000);

      expect(events.length).toBeGreaterThanOrEqual(2);
      expect(events.every((e) => e.timestamp >= now + 1000 && e.timestamp <= now + 3000)).toBe(
        true
      );
    });
  });

  describe('getStatistics', () => {
    it('should return store statistics', async () => {
      const event1: PositionOpenedEvent = {
        type: PositionEventType.POSITION_OPENED,
        positionId: 'pos-123',
        symbol: 'XRPUSD',
        timestamp: Date.now(),
        source: 'system',
        entryPrice: 2.5,
        quantity: 100,
        leverage: 5,
        side: 'LONG',
        initialStopLoss: { price: 2.4, distance: 0.1, hit: false },
        takeProfits: [{ price: 2.6, percent: 100, hit: false }],
        confidence: 75,
        indicators: ['EMA'],
      };

      const event2: PositionOpenedEvent = {
        ...event1,
        positionId: 'pos-124',
        symbol: 'ETHUSD',
      };

      await store.appendEvent(event1);
      await store.appendEvent(event2);

      const stats = await store.getStatistics();

      expect(stats.totalEvents).toBe(2);
      expect(stats.uniquePositions).toBe(2);
      expect(stats.uniqueSymbols).toBe(2);
      expect(stats.timeRange).toBeDefined();
    });
  });
});
