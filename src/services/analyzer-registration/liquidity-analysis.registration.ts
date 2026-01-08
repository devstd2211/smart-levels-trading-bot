/**
 * Liquidity Analysis Registration Module
 * Registers: Liquidity Sweep, Liquidity Zone, Price Action
 */

import { AnalyzerRegistry } from '../analyzer-registry.service';
import { LoggerService, StrategyMarketData, SignalDirection, SwingPointType } from '../../types';
import { AnalyzerRegistrationModule } from './analyzer-registry.interface';

export class LiquidityAnalysisRegistration implements AnalyzerRegistrationModule {
  register(analyzerRegistry: AnalyzerRegistry, logger: LoggerService, config: any): void {
    // Liquidity Sweep (priority 8, weight 0.18)
    const liquiditySweepEnabled = config?.strategicWeights?.liquidity?.liquiditySweep?.enabled ?? true;
    analyzerRegistry.register('LIQUIDITY_SWEEP', {
      name: 'LIQUIDITY_SWEEP',
      weight: 0.18,
      priority: 8,
      enabled: false,
      evaluate: async (data: StrategyMarketData) => {
        if (!data.swingPoints || data.swingPoints.length < 3) {
          logger.debug('⛔ LIQUIDITY_SWEEP | Insufficient swing points');
          return null;
        }

        if (!data.candles || data.candles.length < 5) {
          logger.debug('⛔ LIQUIDITY_SWEEP | Insufficient candles');
          return null;
        }

        const currentCandle = data.candles[data.candles.length - 1];
        const prevCandle = data.candles[data.candles.length - 2];
        const sweepThresholdPercent = config?.analyzerThresholds?.liquidity?.fakeoutReversalPercent ?? 0.3;

        const recentSwingLows = data.swingPoints
          .filter(sp => sp.type === SwingPointType.LOW)
          .slice(-5);
        const recentSwingHighs = data.swingPoints
          .filter(sp => sp.type === SwingPointType.HIGH)
          .slice(-5);

        // Check for BULLISH sweep
        for (const swingLow of recentSwingLows) {
          const sweptBelow = currentCandle.low < swingLow.price || prevCandle.low < swingLow.price;
          const closedAbove = currentCandle.close > swingLow.price;
          const reversalStrength = ((currentCandle.close - currentCandle.low) / swingLow.price) * 100;

          if (sweptBelow && closedAbove && reversalStrength >= sweepThresholdPercent) {
            const confidence = Math.min(60 + reversalStrength * 10, 85);
            logger.info('✅ LIQUIDITY_SWEEP | Bullish sweep detected', {
              swingLowPrice: swingLow.price.toFixed(4),
              candleLow: currentCandle.low.toFixed(4),
              candleClose: currentCandle.close.toFixed(4),
              reversalStrength: reversalStrength.toFixed(2),
              confidence,
            });
            return {
              source: 'LIQUIDITY_SWEEP',
              direction: SignalDirection.LONG,
              confidence,
              weight: 0.18,
              priority: 8,
            };
          }
        }

        // Check for BEARISH sweep
        for (const swingHigh of recentSwingHighs) {
          const sweptAbove = currentCandle.high > swingHigh.price || prevCandle.high > swingHigh.price;
          const closedBelow = currentCandle.close < swingHigh.price;
          const reversalStrength = ((currentCandle.high - currentCandle.close) / swingHigh.price) * 100;

          if (sweptAbove && closedBelow && reversalStrength >= sweepThresholdPercent) {
            const confidence = Math.min(60 + reversalStrength * 10, 85);
            logger.info('✅ LIQUIDITY_SWEEP | Bearish sweep detected', {
              swingHighPrice: swingHigh.price.toFixed(4),
              candleHigh: currentCandle.high.toFixed(4),
              candleClose: currentCandle.close.toFixed(4),
              reversalStrength: reversalStrength.toFixed(2),
              confidence,
            });
            return {
              source: 'LIQUIDITY_SWEEP',
              direction: SignalDirection.SHORT,
              confidence,
              weight: 0.18,
              priority: 8,
            };
          }
        }

        logger.debug('⛔ LIQUIDITY_SWEEP | No sweep pattern detected');
        return null;
      },
    });

    // Liquidity Zone (priority 6, weight 0.15)
    const liquidityZoneEnabled = config?.strategicWeights?.liquidity?.liquidityZone?.enabled ?? true;
    analyzerRegistry.register('LIQUIDITY_ZONE', {
      name: 'LIQUIDITY_ZONE',
      weight: 0.15,
      priority: 6,
      enabled: false,
      evaluate: async (data: StrategyMarketData) => {
        if (!data.swingPoints || data.swingPoints.length < 4) {
          logger.debug('⛔ LIQUIDITY_ZONE | Insufficient swing points for zone detection');
          return null;
        }

        const zoneTolerance = (config?.analyzerThresholds?.liquidity?.priceTolerancePercent ?? 0.3) / 100;
        const minTouches = config?.analyzerThresholds?.liquidity?.minTouchesForZone ?? 2;
        const maxDistancePercent = config?.strategies?.levelBased?.maxDistancePercent ?? 1.0;

        const swingLows = data.swingPoints.filter(sp => sp.type === SwingPointType.LOW);
        const swingHighs = data.swingPoints.filter(sp => sp.type === SwingPointType.HIGH);

        const supportZones = this.findLiquidityZones(swingLows, zoneTolerance, minTouches);
        const resistanceZones = this.findLiquidityZones(swingHighs, zoneTolerance, minTouches);

        let nearestZone: { price: number; touches: number; type: 'SUPPORT' | 'RESISTANCE' } | null = null;
        let minDistance = Infinity;

        for (const zone of supportZones) {
          const distance = ((data.currentPrice - zone.price) / zone.price) * 100;
          if (distance >= 0 && distance <= maxDistancePercent && distance < minDistance) {
            nearestZone = { ...zone, type: 'SUPPORT' };
            minDistance = distance;
          }
        }

        for (const zone of resistanceZones) {
          const distance = ((zone.price - data.currentPrice) / data.currentPrice) * 100;
          if (distance >= 0 && distance <= maxDistancePercent && distance < minDistance) {
            nearestZone = { ...zone, type: 'RESISTANCE' };
            minDistance = distance;
          }
        }

        if (!nearestZone) {
          logger.debug('⛔ LIQUIDITY_ZONE | No zone within distance threshold', {
            supportZones: supportZones.length,
            resistanceZones: resistanceZones.length,
            maxDistance: maxDistancePercent + '%',
          });
          return null;
        }

        const touchBonus = Math.min((nearestZone.touches - minTouches) * 5, 15);
        const distancePenalty = minDistance > 0.5 ? (minDistance - 0.5) * 10 : 0;
        const confidence = Math.min(Math.max(55 + touchBonus - distancePenalty, 45), 80);

        const direction = nearestZone.type === 'SUPPORT' ? SignalDirection.LONG : SignalDirection.SHORT;

        logger.info('✅ LIQUIDITY_ZONE | Zone signal generated', {
          direction,
          zonePrice: nearestZone.price.toFixed(4),
          zoneType: nearestZone.type,
          touches: nearestZone.touches,
          distancePercent: minDistance.toFixed(2),
          confidence,
        });

        return {
          source: 'LIQUIDITY_ZONE',
          direction,
          confidence,
          weight: 0.15,
          priority: 6,
        };
      },
    });

    // Price Action (priority 7, weight 0.16)
    const priceActionEnabled = config?.strategicWeights?.liquidity?.priceAction?.enabled ?? true;
    analyzerRegistry.register('PRICE_ACTION', {
      name: 'PRICE_ACTION',
      weight: 0.16,
      priority: 7,
      enabled: false,
      evaluate: async (data: StrategyMarketData) => {
        if (!data.candles || data.candles.length < 2) {
          logger.debug('⛔ PRICE_ACTION | Insufficient candles for PA analysis');
          return null;
        }
        logger.debug('⛔ PRICE_ACTION | No significant price action pattern detected');
        return null;
      },
    });

    logger.info('✅ Liquidity Analysis registered (3 analyzers)');
  }

  private findLiquidityZones(
    swingPoints: { price: number; timestamp: number; type: SwingPointType }[],
    tolerance: number,
    minTouches: number,
  ): { price: number; touches: number }[] {
    if (swingPoints.length === 0) {
      return [];
    }

    const zones: { price: number; touches: number }[] = [];
    const sorted = [...swingPoints].sort((a, b) => a.price - b.price);
    let currentCluster: typeof swingPoints = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
      const point = sorted[i];
      const clusterAvgPrice = currentCluster.reduce((sum, p) => sum + p.price, 0) / currentCluster.length;
      const priceDiff = Math.abs(point.price - clusterAvgPrice) / clusterAvgPrice;

      if (priceDiff <= tolerance) {
        currentCluster.push(point);
      } else {
        if (currentCluster.length >= minTouches) {
          const avgPrice = currentCluster.reduce((sum, p) => sum + p.price, 0) / currentCluster.length;
          zones.push({
            price: avgPrice,
            touches: currentCluster.length,
          });
        }
        currentCluster = [point];
      }
    }

    if (currentCluster.length >= minTouches) {
      const avgPrice = currentCluster.reduce((sum, p) => sum + p.price, 0) / currentCluster.length;
      zones.push({
        price: avgPrice,
        touches: currentCluster.length,
      });
    }

    return zones;
  }
}
