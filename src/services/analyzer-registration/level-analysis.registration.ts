/**
 * Level Analysis Registration Module
 * Registers: Level Analyzer, Volume Profile
 */

import { AnalyzerRegistry } from '../analyzer-registry.service';
import { LoggerService, StrategyMarketData } from '../../types';
import { AnalyzerRegistrationModule } from './analyzer-registry.interface';
import { LevelAnalyzer } from '../../analyzers/level.analyzer';
import { VolumeProfileAnalyzer } from '../../analyzers/volume-profile.analyzer';

export class LevelAnalysisRegistration implements AnalyzerRegistrationModule {
  constructor(
    private levelAnalyzer: LevelAnalyzer,
    private volumeProfileAnalyzer: VolumeProfileAnalyzer,
  ) {}

  register(analyzerRegistry: AnalyzerRegistry, logger: LoggerService, config: any): void {
    // Level Analyzer (priority 7, weight 0.25) - HIGH WEIGHT - core level analysis
    const levelAnalyzerEnabled = config?.strategicWeights?.levelAnalysis?.enabled ?? true;
    analyzerRegistry.register('LEVEL_ANALYZER', {
      name: 'LEVEL_ANALYZER',
      weight: 0.25,
      priority: 7,
      enabled: levelAnalyzerEnabled,
      evaluate: async (data: StrategyMarketData) => {
        // Validate required data
        if (!data.swingPoints || data.swingPoints.length < 4) {
          logger.debug('⛔ LEVEL_ANALYZER | Insufficient swing points', {
            count: data.swingPoints?.length ?? 0,
            required: 4,
          });
          return null;
        }

        if (!data.candles || data.candles.length < 50) {
          logger.debug('⛔ LEVEL_ANALYZER | Insufficient candles for level analysis');
          return null;
        }

        // Generate signal using LevelAnalyzer
        const signal = this.levelAnalyzer.generateSignal(
          data.swingPoints,
          data.currentPrice,
          data.candles,
          data.timestamp,
        );

        if (!signal) {
          logger.debug('⛔ LEVEL_ANALYZER | No level-based signal generated');
          return null;
        }

        // Get analysis result for detailed logging
        const analysis = this.levelAnalyzer.analyze(
          data.swingPoints,
          data.currentPrice,
          data.candles,
          data.timestamp,
        );

        logger.info('✅ LEVEL_ANALYZER | Signal generated', {
          direction: signal.direction,
          confidence: signal.confidence,
          levelPrice: analysis.nearestLevel?.price.toFixed(4),
          levelType: analysis.nearestLevel?.type,
          touches: analysis.nearestLevel?.touches,
          strength: analysis.nearestLevel?.strength.toFixed(2),
          distancePercent: analysis.distancePercent.toFixed(2),
          reason: analysis.reason,
        });

        return signal;
      },
    });

    // Volume Profile Analyzer (priority 7, weight 0.18)
    const volumeProfileEnabled = false; // DISABLED - not in new config structure
    analyzerRegistry.register('VOLUME_PROFILE', {
      name: 'VOLUME_PROFILE',
      weight: 0.18,
      priority: 7,
      enabled: volumeProfileEnabled,
      evaluate: async (data: StrategyMarketData) => {
        if (!data.candles || data.candles.length < 50) {
          logger.debug('⛔ VOLUME_PROFILE | Insufficient candles for analysis');
          return null;
        }

        const signal = this.volumeProfileAnalyzer.generateSignal(
          data.candles,
          data.currentPrice,
        );

        if (!signal) {
          logger.debug('⛔ VOLUME_PROFILE | No signal generated');
          return null;
        }

        const profile = this.volumeProfileAnalyzer.calculateProfile(data.candles);
        if (profile) {
          logger.info('✅ VOLUME_PROFILE | Signal generated', {
            direction: signal.direction,
            confidence: signal.confidence,
            poc: profile.poc.price.toFixed(4),
            vah: profile.vah.toFixed(4),
            val: profile.val.toFixed(4),
            hvnCount: profile.hvnLevels.length,
            currentPrice: data.currentPrice.toFixed(4),
          });
        }

        return signal;
      },
    });

    logger.info('✅ Level Analysis registered (2 analyzers)');
  }
}
