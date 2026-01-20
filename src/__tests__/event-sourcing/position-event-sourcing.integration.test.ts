/**
 * Position Event Sourcing Integration Tests
 * Tests full event sourcing workflow
 */

import * as fs from 'fs';
import * as path from 'path';
import { PositionEventStore } from '../../event-sourcing/position-event-store.service';
import { PositionStateProjection } from '../../event-sourcing/position-state-projection.service';
import { PositionEventEmitter } from '../../event-sourcing/position-event-emitter.service';
import { PositionEventType, PositionOpenedEvent, TakeProfitHitEvent } from '../../event-sourcing/position.events';

describe('Position Event Sourcing - Integration', () => {
  let eventStore: PositionEventStore;
  let projection: PositionStateProjection;
  let emitter: PositionEventEmitter;
  const testStorePath = path.join(__dirname, 'test-integration-events.jsonl');

  beforeEach(async () => {
    if (fs.existsSync(testStorePath)) {
      fs.unlinkSync(testStorePath);
    }

    eventStore = new PositionEventStore(testStorePath);
    await eventStore.initialize();
    projection = new PositionStateProjection(eventStore);
    emitter = new PositionEventEmitter(eventStore);
  });

  afterEach(() => {
    if (fs.existsSync(testStorePath)) {
      fs.unlinkSync(testStorePath);
    }
  });

  describe('Full position lifecycle with events', () => {
    it('should track position from open to close with all events', async () => {
      const positionId = 'pos-123';
      const symbol = 'XRPUSD';
      const now = Date.now();

      // 1. Position opened
      await emitter.emitPositionOpened(
        positionId,
        symbol,
        2.5, // entryPrice
        100, // quantity
        5, // leverage
        'LONG',
        { price: 2.4, distance: 0.1 },
        [
          { price: 2.6, percent: 50 },
          { price: 2.7, percent: 30 },
          { price: 2.8, percent: 20 },
        ],
        75, // confidence
        ['EMA', 'RSI']
      );

      let position = await projection.projectPosition(positionId);
      expect(position!.status).toBe('OPEN');
      expect(position!.quantity).toBe(100);

      // 2. TP1 hit - move SL to breakeven
      await emitter.emitTakeProfitHit(
        positionId,
        symbol,
        0, // tpIndex
        2.6, // tpPrice
        2.6, // closedAtPrice
        50, // closedQuantity
        50, // remainingQuantity
        true // movedSLToBreakeven
      );

      position = await projection.projectPosition(positionId);
      expect(position!.quantity).toBe(50);
      expect(position!.takeProfits[0].hit).toBe(true);
      expect(position!.stopLoss.isBreakeven).toBe(true);
      expect(position!.stopLoss.price).toBe(2.5); // Entry price

      // 3. TP2 hit - activate trailing
      await emitter.emitTakeProfitHit(
        positionId,
        symbol,
        1, // tpIndex
        2.7, // tpPrice
        2.7, // closedAtPrice
        15, // closedQuantity
        35, // remainingQuantity
        false, // movedSLToBreakeven
        true // activatedTrailing
      );

      position = await projection.projectPosition(positionId);
      expect(position!.quantity).toBe(35);
      expect(position!.takeProfits[1].hit).toBe(true);
      expect(position!.stopLoss.isTrailing).toBe(true);

      // 4. SL updated (trailing)
      await emitter.emitStopLossUpdated(positionId, symbol, 2.5, 2.65, 'TRAILING');

      position = await projection.projectPosition(positionId);
      expect(position!.stopLoss.price).toBe(2.65);

      // 5. Position fully closed
      await emitter.emitPositionClosed(
        positionId,
        symbol,
        2.8, // finalClosedAtPrice
        35, // finalClosedQuantity
        5 * 60 * 1000, // totalDurationMs (5 minutes)
        2, // totalTakeProfitsClosed
        175, // finalPnL
        7, // pnlPercent
        'TP'
      );

      position = await projection.projectPosition(positionId);
      expect(position!.status).toBe('CLOSED');
      expect(position!.quantity).toBe(0);

      // Verify event count
      const eventCount = await eventStore.getEventCount(positionId);
      expect(eventCount).toBe(5); // OPEN + 2 TPs + 1 SL Update + CLOSED

      // Verify status
      const status = await projection.getPositionStatus(positionId);
      expect(status).toBe('CLOSED');
    });

    it('should track position closed by SL hit', async () => {
      const positionId = 'pos-456';
      const symbol = 'ETHUSD';

      // Position opened
      await emitter.emitPositionOpened(
        positionId,
        symbol,
        3000,
        10,
        5,
        'LONG',
        { price: 2900, distance: 100 },
        [{ price: 3100, percent: 100 }],
        80,
        ['EMA']
      );

      let position = await projection.projectPosition(positionId);
      expect(position!.status).toBe('OPEN');

      // SL hit
      await emitter.emitStopLossHit(
        positionId,
        symbol,
        2900,
        2890,
        10,
        -1000,
        -1000,
        -3.33
      );

      position = await projection.projectPosition(positionId);
      expect(position!.status).toBe('CLOSED');
      expect(position!.quantity).toBe(0);

      // Verify event sequence is valid
      const validation = await projection.validateEventSequence(positionId);
      expect(validation.valid).toBe(true);
    });
  });

  describe('Multiple positions in symbol', () => {
    it('should track multiple positions for same symbol', async () => {
      const symbol = 'BTCUSD';

      // Position 1
      await emitter.emitPositionOpened(
        'pos-1',
        symbol,
        50000,
        0.1,
        5,
        'LONG',
        { price: 49000, distance: 1000 },
        [{ price: 51000, percent: 100 }],
        85,
        ['EMA']
      );

      // Position 2
      await emitter.emitPositionOpened(
        'pos-2',
        symbol,
        50500,
        0.1,
        5,
        'LONG',
        { price: 49500, distance: 1000 },
        [{ price: 51500, percent: 100 }],
        80,
        ['RSI']
      );

      // Position 1 closed
      await emitter.emitPositionClosed('pos-1', symbol, 51000, 0.1, 3600000, 1, 200, 0.4, 'TP');

      // Position 2 still open
      const positions = await projection.projectSymbolPositions(symbol);
      expect(positions.size).toBe(2);

      const pos1 = positions.get('pos-1')!;
      const pos2 = positions.get('pos-2')!;

      expect(pos1.status).toBe('CLOSED');
      expect(pos2.status).toBe('OPEN');
    });
  });

  describe('Event persistence and recovery', () => {
    it('should recover positions from disk on restart', async () => {
      const positionId = 'pos-recovery';
      const symbol = 'XRPUSD';

      // Emit events
      await emitter.emitPositionOpened(
        positionId,
        symbol,
        2.5,
        100,
        5,
        'LONG',
        { price: 2.4, distance: 0.1 },
        [{ price: 2.6, percent: 100 }],
        75,
        ['EMA']
      );

      await emitter.emitTakeProfitHit(
        positionId,
        symbol,
        0,
        2.6,
        2.6,
        100,
        0,
        false,
        false
      );

      // Create new store instance (simulating restart)
      const newEventStore = new PositionEventStore(testStorePath);
      await newEventStore.initialize();
      const newProjection = new PositionStateProjection(newEventStore);

      // Verify position is recovered
      const position = await newProjection.projectPosition(positionId);
      expect(position).not.toBeNull();
      expect(position!.quantity).toBe(0);
      expect(position!.status).toBe('OPEN'); // Status is OPEN until PositionClosed event
      expect(position!.takeProfits[0].hit).toBe(true);
    });
  });

  describe('Temporal queries', () => {
    it('should provide state at specific timestamps', async () => {
      const positionId = 'pos-temporal';
      const symbol = 'XRPUSD';

      // Create custom event store with ability to control timestamps
      const customEventStore = new PositionEventStore(testStorePath);
      await customEventStore.initialize();

      // Manually create events with controlled timestamps
      const baseTime = 1000000000; // Fixed base time

      const openedEvent: PositionOpenedEvent = {
        type: PositionEventType.POSITION_OPENED,
        positionId,
        symbol,
        timestamp: baseTime,
        source: 'system',
        entryPrice: 2.5,
        quantity: 100,
        leverage: 5,
        side: 'LONG',
        initialStopLoss: { price: 2.4, distance: 0.1, hit: false },
        takeProfits: [
          { price: 2.6, percent: 50, hit: false },
          { price: 2.7, percent: 50, hit: false },
        ],
        confidence: 75,
        indicators: ['EMA'],
      };

      await customEventStore.appendEvent(openedEvent);

      // TP1 hit at baseTime + 2000
      const tpEvent: TakeProfitHitEvent = {
        type: PositionEventType.TAKE_PROFIT_HIT,
        positionId,
        symbol,
        timestamp: baseTime + 2000,
        source: 'system',
        tpIndex: 0,
        tpPrice: 2.6,
        closedAtPrice: 2.6,
        closedQuantity: 50,
        remainingQuantity: 50,
        actions: { movedSLToBreakeven: true },
      };

      await customEventStore.appendEvent(tpEvent);

      // Query at different points in time
      const customProjection = new PositionStateProjection(customEventStore);

      const beforeTp = await customProjection.projectPositionAtTime(positionId, baseTime + 1000);
      expect(beforeTp!.quantity).toBe(100);
      expect(beforeTp!.takeProfits[0].hit).toBe(false);

      const afterTp = await customProjection.projectPositionAtTime(positionId, baseTime + 3000);
      expect(afterTp!.quantity).toBe(50);
      expect(afterTp!.takeProfits[0].hit).toBe(true);
    });
  });

  describe('Event validation', () => {
    it('should validate event sequences', async () => {
      const positionId = 'pos-validate';
      const symbol = 'XRPUSD';

      await emitter.emitPositionOpened(
        positionId,
        symbol,
        2.5,
        100,
        5,
        'LONG',
        { price: 2.4, distance: 0.1 },
        [{ price: 2.6, percent: 100 }],
        75,
        ['EMA']
      );

      await emitter.emitPositionClosed(positionId, symbol, 2.6, 100, 3600000, 1, 100, 4, 'TP');

      const validation = await projection.validateEventSequence(positionId);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toBeUndefined();
    });
  });

  describe('Statistics', () => {
    it('should provide event store statistics', async () => {
      // Add multiple events
      const positions = ['pos-1', 'pos-2', 'pos-3'];
      const symbols = ['XRPUSD', 'ETHUSD', 'BTCUSD'];

      for (let i = 0; i < positions.length; i++) {
        await emitter.emitPositionOpened(
          positions[i],
          symbols[i],
          100 * (i + 1),
          10,
          5,
          'LONG',
          { price: 90 * (i + 1), distance: 10 },
          [{ price: 110 * (i + 1), percent: 100 }],
          80,
          ['EMA']
        );
      }

      const stats = await eventStore.getStatistics();
      expect(stats.totalEvents).toBe(3);
      expect(stats.uniquePositions).toBe(3);
      expect(stats.uniqueSymbols).toBe(3);
      expect(stats.timeRange).toBeDefined();
    });
  });
});
