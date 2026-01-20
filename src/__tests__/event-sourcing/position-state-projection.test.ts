/**
 * PositionStateProjection Unit Tests
 * Tests state reconstruction from events
 */

import * as fs from 'fs';
import * as path from 'path';
import { PositionEventStore } from '../../event-sourcing/position-event-store.service';
import { PositionStateProjection } from '../../event-sourcing/position-state-projection.service';
import {
  PositionEventType,
  PositionOpenedEvent,
  TakeProfitHitEvent,
  StopLossHitEvent,
  StopLossUpdatedEvent,
  StopLossToBreakEvenEvent,
  TrailingStopActivatedEvent,
  PartialClosedEvent,
  PositionClosedEvent,
} from '../../event-sourcing/position.events';

describe('PositionStateProjection', () => {
  let store: PositionEventStore;
  let projection: PositionStateProjection;
  const testStorePath = path.join(__dirname, 'test-projection-events.jsonl');

  beforeEach(async () => {
    if (fs.existsSync(testStorePath)) {
      fs.unlinkSync(testStorePath);
    }

    store = new PositionEventStore(testStorePath);
    await store.initialize();
    projection = new PositionStateProjection(store);
  });

  afterEach(() => {
    if (fs.existsSync(testStorePath)) {
      fs.unlinkSync(testStorePath);
    }
  });

  describe('projectPosition', () => {
    it('should return null for non-existent position', async () => {
      const position = await projection.projectPosition('non-existent');
      expect(position).toBeNull();
    });

    it('should rebuild position from POSITION_OPENED event only', async () => {
      const now = Date.now();
      const openEvent: PositionOpenedEvent = {
        type: PositionEventType.POSITION_OPENED,
        positionId: 'pos-123',
        symbol: 'XRPUSD',
        timestamp: now,
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

      await store.appendEvent(openEvent);

      const position = await projection.projectPosition('pos-123');

      expect(position).not.toBeNull();
      expect(position!.id).toBe('pos-123');
      expect(position!.symbol).toBe('XRPUSD');
      expect(position!.status).toBe('OPEN');
      expect(position!.quantity).toBe(100);
      expect(position!.entryPrice).toBe(2.5);
      expect(position!.stopLoss.price).toBe(2.4);
      expect(position!.takeProfits).toHaveLength(3);
    });

    it('should apply TP hit events to position', async () => {
      const now = Date.now();

      // Open position
      const openEvent: PositionOpenedEvent = {
        type: PositionEventType.POSITION_OPENED,
        positionId: 'pos-123',
        symbol: 'XRPUSD',
        timestamp: now,
        source: 'system',
        entryPrice: 2.5,
        quantity: 100,
        leverage: 5,
        side: 'LONG',
        initialStopLoss: { price: 2.4, distance: 0.1, hit: false },
        takeProfits: [
          { price: 2.6, percent: 50, hit: false },
          { price: 2.7, percent: 30, hit: false },
          { price: 2.8, percent: 20, hit: false },
        ],
        confidence: 75,
        indicators: ['EMA'],
      };

      // TP1 hit
      const tp1Event: TakeProfitHitEvent = {
        type: PositionEventType.TAKE_PROFIT_HIT,
        positionId: 'pos-123',
        symbol: 'XRPUSD',
        timestamp: now + 1000,
        source: 'system',
        tpIndex: 0,
        tpPrice: 2.6,
        closedAtPrice: 2.6,
        closedQuantity: 50,
        remainingQuantity: 50,
        actions: {
          movedSLToBreakeven: true,
        },
      };

      await store.appendEvent(openEvent);
      await store.appendEvent(tp1Event);

      const position = await projection.projectPosition('pos-123');

      expect(position!.quantity).toBe(50); // 100 - 50 closed at TP1
      expect(position!.takeProfits[0].hit).toBe(true);
      expect(position!.stopLoss.isBreakeven).toBe(true);
      expect(position!.stopLoss.price).toBe(2.5); // Moved to entry
    });

    it('should apply SL hit and close position', async () => {
      const now = Date.now();

      const openEvent: PositionOpenedEvent = {
        type: PositionEventType.POSITION_OPENED,
        positionId: 'pos-123',
        symbol: 'XRPUSD',
        timestamp: now,
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
        positionId: 'pos-123',
        symbol: 'XRPUSD',
        timestamp: now + 5000,
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

      const position = await projection.projectPosition('pos-123');

      expect(position!.status).toBe('CLOSED');
      expect(position!.quantity).toBe(0);
      // Note: closePrice and realizedPnL are stored in TradingJournal, not Position
    });

    it('should apply multiple TP hits and trailing stop activation', async () => {
      const now = Date.now();

      const openEvent: PositionOpenedEvent = {
        type: PositionEventType.POSITION_OPENED,
        positionId: 'pos-123',
        symbol: 'XRPUSD',
        timestamp: now,
        source: 'system',
        entryPrice: 2.5,
        quantity: 100,
        leverage: 5,
        side: 'LONG',
        initialStopLoss: { price: 2.4, distance: 0.1, hit: false },
        takeProfits: [
          { price: 2.6, percent: 50, hit: false },
          { price: 2.7, percent: 30, hit: false },
          { price: 2.8, percent: 20, hit: false },
        ],
        confidence: 75,
        indicators: ['EMA'],
      };

      const tp1Event: TakeProfitHitEvent = {
        type: PositionEventType.TAKE_PROFIT_HIT,
        positionId: 'pos-123',
        symbol: 'XRPUSD',
        timestamp: now + 1000,
        source: 'system',
        tpIndex: 0,
        tpPrice: 2.6,
        closedAtPrice: 2.6,
        closedQuantity: 50,
        remainingQuantity: 50,
        actions: {
          movedSLToBreakeven: true,
        },
      };

      const tp2Event: TakeProfitHitEvent = {
        type: PositionEventType.TAKE_PROFIT_HIT,
        positionId: 'pos-123',
        symbol: 'XRPUSD',
        timestamp: now + 2000,
        source: 'system',
        tpIndex: 1,
        tpPrice: 2.7,
        closedAtPrice: 2.7,
        closedQuantity: 30,
        remainingQuantity: 20,
        actions: {
          activatedTrailing: true,
        },
      };

      const trailingEvent: TrailingStopActivatedEvent = {
        type: PositionEventType.TRAILING_STOP_ACTIVATED,
        positionId: 'pos-123',
        symbol: 'XRPUSD',
        timestamp: now + 2500,
        source: 'system',
        trailingDistance: 0.05,
        highPrice: 2.7,
        slPrice: 2.65,
      };

      await store.appendEvent(openEvent);
      await store.appendEvent(tp1Event);
      await store.appendEvent(tp2Event);
      await store.appendEvent(trailingEvent);

      const position = await projection.projectPosition('pos-123');

      expect(position!.quantity).toBe(20);
      expect(position!.takeProfits[0].hit).toBe(true);
      expect(position!.takeProfits[1].hit).toBe(true);
      expect(position!.stopLoss.isBreakeven).toBe(true);
      expect(position!.stopLoss.isTrailing).toBe(true);
    });
  });

  describe('projectPositionAtTime', () => {
    it('should rebuild position state at specific timestamp', async () => {
      const now = Date.now();

      const openEvent: PositionOpenedEvent = {
        type: PositionEventType.POSITION_OPENED,
        positionId: 'pos-123',
        symbol: 'XRPUSD',
        timestamp: now,
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

      const tp1Event: TakeProfitHitEvent = {
        type: PositionEventType.TAKE_PROFIT_HIT,
        positionId: 'pos-123',
        symbol: 'XRPUSD',
        timestamp: now + 5000,
        source: 'system',
        tpIndex: 0,
        tpPrice: 2.6,
        closedAtPrice: 2.6,
        closedQuantity: 100,
        remainingQuantity: 0,
        actions: {},
      };

      await store.appendEvent(openEvent);
      await store.appendEvent(tp1Event);

      // Query position before TP hit
      const positionBefore = await projection.projectPositionAtTime('pos-123', now + 2000);
      expect(positionBefore!.quantity).toBe(100);
      expect(positionBefore!.takeProfits[0].hit).toBe(false);

      // Query position after TP hit
      const positionAfter = await projection.projectPositionAtTime('pos-123', now + 6000);
      expect(positionAfter!.quantity).toBe(0);
      expect(positionAfter!.takeProfits[0].hit).toBe(true);
    });
  });

  describe('getPositionStatus', () => {
    it('should return OPEN for active position', async () => {
      const now = Date.now();

      const openEvent: PositionOpenedEvent = {
        type: PositionEventType.POSITION_OPENED,
        positionId: 'pos-123',
        symbol: 'XRPUSD',
        timestamp: now,
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

      await store.appendEvent(openEvent);

      const status = await projection.getPositionStatus('pos-123');
      expect(status).toBe('OPEN');
    });

    it('should return CLOSED for closed position', async () => {
      const now = Date.now();

      const openEvent: PositionOpenedEvent = {
        type: PositionEventType.POSITION_OPENED,
        positionId: 'pos-123',
        symbol: 'XRPUSD',
        timestamp: now,
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

      const closedEvent: PositionClosedEvent = {
        type: PositionEventType.POSITION_CLOSED,
        positionId: 'pos-123',
        symbol: 'XRPUSD',
        timestamp: now + 5000,
        source: 'system',
        finalClosedAtPrice: 2.6,
        finalClosedQuantity: 100,
        totalDurationMs: 5000,
        totalTakeProfitsClosed: 1,
        finalPnL: 100,
        pnlPercent: 4,
        closedReason: 'TP',
      };

      await store.appendEvent(openEvent);
      await store.appendEvent(closedEvent);

      const status = await projection.getPositionStatus('pos-123');
      expect(status).toBe('CLOSED');
    });

    it('should return INVALID for non-existent position', async () => {
      const status = await projection.getPositionStatus('non-existent');
      expect(status).toBe('INVALID');
    });
  });

  describe('validateEventSequence', () => {
    it('should validate correct event sequence', async () => {
      const now = Date.now();

      const openEvent: PositionOpenedEvent = {
        type: PositionEventType.POSITION_OPENED,
        positionId: 'pos-123',
        symbol: 'XRPUSD',
        timestamp: now,
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

      const closedEvent: PositionClosedEvent = {
        type: PositionEventType.POSITION_CLOSED,
        positionId: 'pos-123',
        symbol: 'XRPUSD',
        timestamp: now + 5000,
        source: 'system',
        finalClosedAtPrice: 2.6,
        finalClosedQuantity: 100,
        totalDurationMs: 5000,
        totalTakeProfitsClosed: 1,
        finalPnL: 100,
        pnlPercent: 4,
        closedReason: 'TP',
      };

      await store.appendEvent(openEvent);
      await store.appendEvent(closedEvent);

      const result = await projection.validateEventSequence('pos-123');

      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should detect events after POSITION_CLOSED', async () => {
      const now = Date.now();

      const openEvent: PositionOpenedEvent = {
        type: PositionEventType.POSITION_OPENED,
        positionId: 'pos-123',
        symbol: 'XRPUSD',
        timestamp: now,
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

      const closedEvent: PositionClosedEvent = {
        type: PositionEventType.POSITION_CLOSED,
        positionId: 'pos-123',
        symbol: 'XRPUSD',
        timestamp: now + 5000,
        source: 'system',
        finalClosedAtPrice: 2.6,
        finalClosedQuantity: 100,
        totalDurationMs: 5000,
        totalTakeProfitsClosed: 1,
        finalPnL: 100,
        pnlPercent: 4,
        closedReason: 'TP',
      };

      const extraEvent: StopLossUpdatedEvent = {
        type: PositionEventType.STOP_LOSS_UPDATED,
        positionId: 'pos-123',
        symbol: 'XRPUSD',
        timestamp: now + 6000,
        source: 'system',
        oldSlPrice: 2.4,
        newSlPrice: 2.5,
        reason: 'MANUAL',
      };

      await store.appendEvent(openEvent);
      await store.appendEvent(closedEvent);
      await store.appendEvent(extraEvent);

      const result = await projection.validateEventSequence('pos-123');

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.some((e) => e.includes('after POSITION_CLOSED'))).toBe(true);
    });
  });

  describe('projectSymbolPositions', () => {
    it('should rebuild all positions for a symbol', async () => {
      const now = Date.now();

      for (let i = 0; i < 3; i++) {
        const openEvent: PositionOpenedEvent = {
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

        await store.appendEvent(openEvent);
      }

      const positions = await projection.projectSymbolPositions('XRPUSD');

      expect(positions.size).toBe(3);
      expect(positions.has('pos-0')).toBe(true);
      expect(positions.has('pos-1')).toBe(true);
      expect(positions.has('pos-2')).toBe(true);
    });
  });
});
