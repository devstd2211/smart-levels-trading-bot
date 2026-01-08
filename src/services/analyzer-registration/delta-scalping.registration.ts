/**
 * Delta & Scalping Registration Module
 * Registers: Delta Analyzer, Tick Delta, Order Flow, Micro Wall
 */

import { AnalyzerRegistry } from '../analyzer-registry.service';
import { LoggerService, StrategyMarketData, SignalDirection } from '../../types';
import { AnalyzerRegistrationModule } from './analyzer-registry.interface';
import { DeltaAnalyzerService } from '../delta-analyzer.service';
import { OrderbookImbalanceService } from '../orderbook-imbalance.service';

export class DeltaScalpingRegistration implements AnalyzerRegistrationModule {
  constructor(
    private deltaAnalyzerService?: DeltaAnalyzerService | null,
    private orderbookImbalanceService?: OrderbookImbalanceService | null,
  ) {}

  register(analyzerRegistry: AnalyzerRegistry, logger: LoggerService, config: any): void {
    // Delta Analyzer (priority 6, weight 0.15)
    const deltaEnabled = config?.strategicWeights?.advancedAnalysis?.delta?.enabled ?? true;
    analyzerRegistry.register('DELTA_ANALYZER', {
      name: 'DELTA_ANALYZER',
      weight: 0.15,
      priority: 6,
      enabled: false,
      evaluate: async (data: StrategyMarketData) => {
        if (!this.deltaAnalyzerService) {
          return null;
        }

        const deltaAnalysis = this.deltaAnalyzerService.analyze();
        const maxConfidence = config?.analyzerConstants?.delta?.maxConfidence ?? 70;

        if (deltaAnalysis.trend === 'BULLISH') {
          return {
            source: 'DELTA_ANALYZER',
            direction: SignalDirection.LONG,
            confidence: Math.min(deltaAnalysis.strength, maxConfidence),
            weight: 0.15,
            priority: 6,
          };
        } else if (deltaAnalysis.trend === 'BEARISH') {
          return {
            source: 'DELTA_ANALYZER',
            direction: SignalDirection.SHORT,
            confidence: Math.min(deltaAnalysis.strength, maxConfidence),
            weight: 0.15,
            priority: 6,
          };
        }

        return null;
      },
    });

    // Tick Delta Analyzer (priority 8, weight 0.2)
    analyzerRegistry.register('TICK_DELTA', {
      name: 'TICK_DELTA',
      weight: 0.2,
      priority: 8,
      enabled: false,
      evaluate: async (data: StrategyMarketData) => {
        return null;
      },
    });

    // Order Flow Analyzer (priority 8, weight 0.19)
    analyzerRegistry.register('ORDER_FLOW', {
      name: 'ORDER_FLOW',
      weight: 0.19,
      priority: 8,
      enabled: false,
      evaluate: async (data: StrategyMarketData) => {
        if (!this.orderbookImbalanceService || !data.orderbook) {
          return null;
        }

        const bids = (data.orderbook.bids || []).map(b => {
          if (Array.isArray(b)) {
            return b as [number, number];
          }
          const obj = b as { price: number; size: number };
          return [obj.price, obj.size] as [number, number];
        });
        const asks = (data.orderbook.asks || []).map(a => {
          if (Array.isArray(a)) {
            return a as [number, number];
          }
          const obj = a as { price: number; size: number };
          return [obj.price, obj.size] as [number, number];
        });

        const imbalanceAnalysis = this.orderbookImbalanceService.analyze({
          bids,
          asks,
        });

        if (imbalanceAnalysis.direction === 'BID') {
          return {
            source: 'ORDER_FLOW',
            direction: SignalDirection.LONG,
            confidence: Math.min(imbalanceAnalysis.strength, 70),
            weight: 0.19,
            priority: 8,
          };
        } else if (imbalanceAnalysis.direction === 'ASK') {
          return {
            source: 'ORDER_FLOW',
            direction: SignalDirection.SHORT,
            confidence: Math.min(imbalanceAnalysis.strength, 70),
            weight: 0.19,
            priority: 8,
          };
        }

        return null;
      },
    });

    // Micro Wall Detector (priority 8, weight 0.18)
    analyzerRegistry.register('MICRO_WALL', {
      name: 'MICRO_WALL',
      weight: 0.18,
      priority: 8,
      enabled: false,
      evaluate: async (data: StrategyMarketData) => {
        return null;
      },
    });

    logger.info('✅ Delta & Scalping registered (4 analyzers)');
  }
}
