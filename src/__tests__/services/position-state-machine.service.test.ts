/**
 * Position State Machine Service Tests
 * PHASE 4.5: Tests for unified position state management
 *
 * Focused tests for core functionality:
 * - State transitions (valid and invalid)
 * - Exit mode tracking
 * - Position lifecycle
 */

import { PositionStateMachineService } from '../../services/position-state-machine.service';
import { PositionState } from '../../types/enums';
import { LoggerService } from '../../services/logger.service';

describe('PositionStateMachineService', () => {
  let logger: LoggerService;

  beforeEach(() => {
    logger = {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      log: jest.fn(),
    } as unknown as LoggerService;
  });

  describe('State Transitions', () => {
    let service: PositionStateMachineService;

    beforeEach(async () => {
      service = new PositionStateMachineService(logger);
      await service.initialize();
    });

    it('should allow OPEN -> TP1_HIT transition', () => {
      const posId = `pos-${Date.now()}`;
      const result = service.transitionState({
        symbol: 'BTCUSDT',
        positionId: posId,
        targetState: PositionState.TP1_HIT,
        reason: 'TP1 hit',
      });

      expect(result.allowed).toBe(true);
      expect(result.currentState).toBe(PositionState.TP1_HIT);
    });

    it('should allow OPEN -> CLOSED transition', () => {
      const posId = `pos-${Date.now()}`;
      const result = service.transitionState({
        symbol: 'BTCUSDT',
        positionId: posId,
        targetState: PositionState.CLOSED,
        reason: 'SL hit',
      });

      expect(result.allowed).toBe(true);
      expect(result.currentState).toBe(PositionState.CLOSED);
    });

    it('should allow TP1_HIT -> TP2_HIT transition', () => {
      const posId = `pos-${Date.now()}`;

      service.transitionState({
        symbol: 'BTCUSDT',
        positionId: posId,
        targetState: PositionState.TP1_HIT,
        reason: 'TP1 hit',
      });

      const result = service.transitionState({
        symbol: 'BTCUSDT',
        positionId: posId,
        targetState: PositionState.TP2_HIT,
        reason: 'TP2 hit',
      });

      expect(result.allowed).toBe(true);
      expect(result.currentState).toBe(PositionState.TP2_HIT);
    });

    it('should allow full lifecycle: OPEN -> TP1_HIT -> TP2_HIT -> TP3_HIT -> CLOSED', () => {
      const posId = `pos-${Date.now()}`;

      // OPEN -> TP1_HIT
      let result = service.transitionState({
        symbol: 'BTCUSDT',
        positionId: posId,
        targetState: PositionState.TP1_HIT,
        reason: 'TP1 hit',
      });
      expect(result.allowed).toBe(true);

      // TP1_HIT -> TP2_HIT
      result = service.transitionState({
        symbol: 'BTCUSDT',
        positionId: posId,
        targetState: PositionState.TP2_HIT,
        reason: 'TP2 hit',
      });
      expect(result.allowed).toBe(true);

      // TP2_HIT -> TP3_HIT
      result = service.transitionState({
        symbol: 'BTCUSDT',
        positionId: posId,
        targetState: PositionState.TP3_HIT,
        reason: 'TP3 hit',
      });
      expect(result.allowed).toBe(true);

      // TP3_HIT -> CLOSED
      result = service.closePosition('BTCUSDT', posId, 'SL hit');
      expect(result.allowed).toBe(true);
      expect(result.currentState).toBe(PositionState.CLOSED);
    });
  });

  describe('Invalid Transitions', () => {
    let service: PositionStateMachineService;

    beforeEach(async () => {
      service = new PositionStateMachineService(logger);
      await service.initialize();
    });

    it('should prevent backward transitions', () => {
      const posId = `pos-${Date.now()}`;

      service.transitionState({
        symbol: 'BTCUSDT',
        positionId: posId,
        targetState: PositionState.TP2_HIT,
        reason: 'Invalid',
      });

      const result = service.transitionState({
        symbol: 'BTCUSDT',
        positionId: posId,
        targetState: PositionState.OPEN,
        reason: 'Try to go back',
      });

      expect(result.allowed).toBe(false);
    });

    it('should prevent skipping TP levels', () => {
      const posId = `pos-${Date.now()}`;

      const result = service.transitionState({
        symbol: 'BTCUSDT',
        positionId: posId,
        targetState: PositionState.TP2_HIT,
        reason: 'Skip TP1',
      });

      expect(result.allowed).toBe(false);
    });

    it('should prevent transitions from CLOSED', () => {
      const posId = `pos-${Date.now()}`;

      service.transitionState({
        symbol: 'BTCUSDT',
        positionId: posId,
        targetState: PositionState.CLOSED,
        reason: 'Close',
      });

      const result = service.transitionState({
        symbol: 'BTCUSDT',
        positionId: posId,
        targetState: PositionState.OPEN,
        reason: 'Try to reopen',
      });

      expect(result.allowed).toBe(false);
    });
  });

  describe('Exit Modes', () => {
    let service: PositionStateMachineService;

    beforeEach(async () => {
      service = new PositionStateMachineService(logger);
      await service.initialize();
    });

    it('should track pre-BE mode', () => {
      const posId = `pos-${Date.now()}`;

      service.transitionState({
        symbol: 'BTCUSDT',
        positionId: posId,
        targetState: PositionState.TP1_HIT,
        reason: 'TP1 hit',
      });

      const now = Date.now();
      service.updateExitMode('BTCUSDT', posId, {
        preBEMode: {
          activatedAt: now,
          candlesWaited: 2,
          candleCount: 5,
        },
      });

      const state = service.getFullState('BTCUSDT', posId);
      expect(state?.preBEMode?.candlesWaited).toBe(2);
      expect(state?.preBEMode?.candleCount).toBe(5);
    });

    it('should track trailing mode', () => {
      const posId = `pos-${Date.now()}`;

      service.transitionState({
        symbol: 'BTCUSDT',
        positionId: posId,
        targetState: PositionState.TP1_HIT,
        reason: 'TP1 hit',
      });

      service.transitionState({
        symbol: 'BTCUSDT',
        positionId: posId,
        targetState: PositionState.TP2_HIT,
        reason: 'TP2 hit',
      });

      service.updateExitMode('BTCUSDT', posId, {
        trailingMode: {
          isTrailing: true,
          currentTrailingPrice: 50000,
          lastUpdatePrice: 51000,
        },
      });

      const state = service.getFullState('BTCUSDT', posId);
      expect(state?.trailingMode?.isTrailing).toBe(true);
      expect(state?.trailingMode?.currentTrailingPrice).toBe(50000);
    });
  });

  describe('State Queries', () => {
    let service: PositionStateMachineService;

    beforeEach(async () => {
      service = new PositionStateMachineService(logger);
      await service.initialize();
    });

    it('should get current state', () => {
      const posId = `pos-${Date.now()}`;

      service.transitionState({
        symbol: 'BTCUSDT',
        positionId: posId,
        targetState: PositionState.TP1_HIT,
        reason: 'Test',
      });

      const state = service.getState('BTCUSDT', posId);
      expect(state).toBe(PositionState.TP1_HIT);
    });

    it('should get full state with metadata', () => {
      const posId = `pos-${Date.now()}`;

      service.transitionState({
        symbol: 'BTCUSDT',
        positionId: posId,
        targetState: PositionState.TP1_HIT,
        reason: 'Test',
        metadata: {
          preBEMode: {
            activatedAt: Date.now(),
            candlesWaited: 1,
            candleCount: 5,
          },
        },
      });

      const fullState = service.getFullState('BTCUSDT', posId);
      expect(fullState?.currentState).toBe(PositionState.TP1_HIT);
      expect(fullState?.preBEMode?.candleCount).toBe(5);
    });

    it('should return null for non-existent position', () => {
      const state = service.getState('BTCUSDT', 'non-existent-pos-id');
      expect(state).toBeNull();
    });
  });

  describe('Position Lifecycle', () => {
    let service: PositionStateMachineService;

    beforeEach(async () => {
      service = new PositionStateMachineService(logger);
      await service.initialize();
    });

    it('should close position', () => {
      const posId = `pos-${Date.now()}`;

      service.transitionState({
        symbol: 'BTCUSDT',
        positionId: posId,
        targetState: PositionState.TP2_HIT,
        reason: 'TP2 hit',
      });

      const result = service.closePosition('BTCUSDT', posId, 'SL hit');
      expect(result.allowed).toBe(true);
      expect(result.currentState).toBe(PositionState.CLOSED);
    });

    it('should set closedAt on close', () => {
      const posId = `pos-${Date.now()}`;

      service.transitionState({
        symbol: 'BTCUSDT',
        positionId: posId,
        targetState: PositionState.TP1_HIT,
        reason: 'TP1 hit',
      });

      service.closePosition('BTCUSDT', posId, 'Manual close');

      const state = service.getFullState('BTCUSDT', posId);
      expect(state?.closedAt).toBeDefined();
      expect(state?.reason).toBe('Manual close');
    });

    it('should track closure reason (SL_HIT)', () => {
      const posId = `pos-${Date.now()}`;

      service.transitionState({
        symbol: 'BTCUSDT',
        positionId: posId,
        targetState: PositionState.TP2_HIT,
        reason: 'TP2 hit',
      });

      service.closePosition('BTCUSDT', posId, 'Stop loss triggered', {
        closureReason: 'SL_HIT',
        closurePrice: 45000,
        closurePnL: -100,
      });

      const state = service.getFullState('BTCUSDT', posId);
      expect(state?.closureReason).toBe('SL_HIT');
      expect(state?.closurePrice).toBe(45000);
      expect(state?.closurePnL).toBe(-100);
    });

    it('should track closure reason (TRAILING_STOP)', () => {
      const posId = `pos-${Date.now()}`;

      service.transitionState({
        symbol: 'BTCUSDT',
        positionId: posId,
        targetState: PositionState.TP3_HIT,
        reason: 'TP3 hit',
      });

      service.closePosition('BTCUSDT', posId, 'Trailing stop triggered', {
        closureReason: 'TRAILING_STOP',
        closurePrice: 52000,
        closurePnL: 500,
      });

      const state = service.getFullState('BTCUSDT', posId);
      expect(state?.closureReason).toBe('TRAILING_STOP');
      expect(state?.closurePrice).toBe(52000);
      expect(state?.closurePnL).toBe(500);
    });

    it('should track multiple positions', () => {
      const pos1 = `pos-1-${Date.now()}`;
      const pos2 = `pos-2-${Date.now()}`;

      service.transitionState({
        symbol: 'BTCUSDT',
        positionId: pos1,
        targetState: PositionState.TP1_HIT,
        reason: 'Test 1',
      });

      service.transitionState({
        symbol: 'BTCUSDT',
        positionId: pos2,
        targetState: PositionState.TP1_HIT,
        reason: 'Test 2 - TP1',
      });

      service.transitionState({
        symbol: 'BTCUSDT',
        positionId: pos2,
        targetState: PositionState.TP2_HIT,
        reason: 'Test 2 - TP2',
      });

      const states = service.getStatesBySymbol('BTCUSDT');
      const pos1State = states.get(pos1);
      const pos2State = states.get(pos2);

      expect(pos1State?.currentState).toBe(PositionState.TP1_HIT);
      expect(pos2State?.currentState).toBe(PositionState.TP2_HIT);
    });
  });

  describe('Statistics', () => {
    let service: PositionStateMachineService;

    beforeEach(async () => {
      service = new PositionStateMachineService(logger);
      await service.initialize();
    });

    it('should return statistics', () => {
      const posId = `pos-${Date.now()}`;

      service.transitionState({
        symbol: 'BTCUSDT',
        positionId: posId,
        targetState: PositionState.TP1_HIT,
        reason: 'Test',
      });

      const stats = service.getStatistics();

      expect(stats.totalPositions).toBeGreaterThan(0);
      expect(stats.byState).toBeDefined();
      expect(stats.averageStateHoldTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Clear State', () => {
    let service: PositionStateMachineService;

    beforeEach(async () => {
      service = new PositionStateMachineService(logger);
      await service.initialize();
    });

    it('should clear position state', () => {
      const posId = `pos-${Date.now()}`;

      service.transitionState({
        symbol: 'BTCUSDT',
        positionId: posId,
        targetState: PositionState.TP1_HIT,
        reason: 'Test',
      });

      expect(service.getState('BTCUSDT', posId)).toBe(PositionState.TP1_HIT);

      service.clearState('BTCUSDT', posId);

      expect(service.getState('BTCUSDT', posId)).toBeNull();
    });
  });

  describe('Initialization', () => {
    it('should initialize without errors', async () => {
      const service = new PositionStateMachineService(logger);
      await expect(service.initialize()).resolves.not.toThrow();
      expect(service.isInitialized()).toBe(true);
    });
  });
});
