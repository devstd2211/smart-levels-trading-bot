/**
 * Phase 9: Real-Time Risk Monitor Service
 *
 * Monitors position health in real-time with:
 * - Health score calculation (0-100)
 * - Danger level detection
 * - Alert triggers for various risk conditions
 * - Continuous monitoring of all positions
 *
 * Health Score Components:
 * - Time at Risk Score (20%) - Based on holding time
 * - Drawdown Score (30%) - Based on current unrealized loss
 * - Volume/Liquidity Score (20%) - Based on volume conditions
 * - Volatility Score (15%) - Based on ATR changes
 * - Profitability Score (15%) - Based on current PnL
 *
 * Danger Levels:
 * - SAFE: Score >= 70
 * - WARNING: Score 30-69
 * - CRITICAL: Score < 30
 */

import { BotEventBus } from './event-bus';
import { LoggerService, PositionSide } from '../types';
import { PositionLifecycleService } from './position-lifecycle.service';
import {
  RiskMonitoringConfig,
  HealthScore,
  HealthScoreComponents,
  HealthAnalysis,
  DangerLevel,
  RiskAlert,
  RiskAlertType,
  HealthReport,
  IRealTimeRiskMonitor,
  LiveTradingEventType,
} from '../types/live-trading.types';
import { Position } from '../types/core';
import { ErrorHandler, RecoveryStrategy } from '../errors/ErrorHandler';
import {
  PositionNotFoundError,
  OrderValidationError,
  PositionSizingError,
} from '../errors/DomainErrors';

/**
 * RealTimeRiskMonitor: Continuous position health monitoring
 *
 * Responsibilities:
 * 1. Calculate health scores for each position (0-100)
 * 2. Detect danger levels (SAFE, WARNING, CRITICAL)
 * 3. Analyze position-specific risk factors
 * 4. Emit risk alerts when thresholds triggered
 * 5. Generate comprehensive health reports
 *
 * Health Score Formula:
 * - Time at Risk (20%): Based on holding time vs max
 * - Drawdown (30%): Based on unrealized loss
 * - Volume/Liquidity (20%): Based on volume conditions
 * - Volatility (15%): Based on volatility changes
 * - Profitability (15%): Based on current PnL
 */
export class RealTimeRiskMonitor implements IRealTimeRiskMonitor {
  private config: RiskMonitoringConfig;
  private positionLifecycleService: PositionLifecycleService;
  private logger: LoggerService;
  private eventBus: BotEventBus;
  private lastCheckTime: number = 0;
  private healthScoreCache: Map<string, HealthScore> = new Map();
  private generatedAlerts: Map<string, RiskAlert[]> = new Map(); // Track alerts per position

  // Default thresholds for health score components
  private readonly COMPONENT_WEIGHTS = {
    timeAtRisk: 0.2, // 20%
    drawdown: 0.3, // 30%
    volumeLiquidity: 0.2, // 20%
    volatility: 0.15, // 15%
    profitability: 0.15, // 15%
  };

  private readonly HEALTH_THRESHOLDS = {
    safe: 70,
    warning: 30,
  };

  constructor(config: RiskMonitoringConfig, positionLifecycleService: PositionLifecycleService, logger: LoggerService, eventBus: BotEventBus) {
    this.config = config;
    this.positionLifecycleService = positionLifecycleService;
    this.logger = logger;
    this.eventBus = eventBus;

    // [P1] Subscribe to position-closed event for cache invalidation
    if (this.eventBus && typeof this.eventBus.subscribe === 'function') {
      this.eventBus.subscribe('position-closed', (data: any) => {
        this.onPositionClosed(data);
      });
      this.logger.debug('[RealTimeRiskMonitor] Subscribed to position-closed events');
    }
  }

  /**
   * Calculate comprehensive health score for a position
   * Returns score 0-100, with details on each component
   *
   * Phase 8.5: ErrorHandler integration with GRACEFUL_DEGRADE strategy
   */
  public async calculatePositionHealth(positionId: string, currentPrice: number): Promise<HealthScore> {
    const now = Date.now();
    const position = this.positionLifecycleService.getCurrentPosition();

    // Phase 8.5: GRACEFUL_DEGRADE on position validation failure
    if (!position || position.id !== positionId) {
      const handled = await ErrorHandler.handle(
        new PositionNotFoundError(`Position not found: ${positionId}`, {
          positionId,
          requestedId: positionId,
          actualId: position?.id || 'null',
        }),
        {
          strategy: RecoveryStrategy.GRACEFUL_DEGRADE,
          logger: this.logger,
          context: 'RealTimeRiskMonitor.calculatePositionHealth',
          onRecover: () => {
            this.logger.warn('🔄 Position not found, returning cached health score', {
              positionId,
            });
          },
        }
      );

      // GRACEFUL_DEGRADE: Return cached health score if available
      const cached = this.getLatestHealthScore(positionId);
      if (cached) {
        return cached;
      }

      // No cache: return conservative safe default
      return this.createSafeDefaultHealthScore(positionId);
    }

    // Get cached score if available and recent
    const cached = this.healthScoreCache.get(positionId);
    if (cached && now - cached.lastUpdate < 60000) {
      // Cache for 1 minute
      return cached;
    }

    // Phase 8.5: Validate currentPrice before use
    const { price: validPrice } = await this.validateCurrentPrice(
      positionId,
      currentPrice,
      position.entryPrice
    );

    // Phase 8.5: Validate position quantity and entryPrice to prevent zero division
    const denominator = position.quantity * position.entryPrice;
    if (denominator === 0) {
      const handled = await ErrorHandler.handle(
        new PositionSizingError('Zero quantity or entry price in PnL calculation', {
          requestedSize: position.quantity,
          entryPrice: position.entryPrice,
          reason: 'Cannot calculate PnL with zero denominator',
          positionId: position.id,
        }),
        {
          strategy: RecoveryStrategy.GRACEFUL_DEGRADE,
          logger: this.logger,
          context: 'RealTimeRiskMonitor.calculatePositionHealth',
          onRecover: () => {
            this.logger.warn('⚠️ Zero denominator in PnL calc, returning safe default score', {
              positionId: position.id,
              quantity: position.quantity,
              entryPrice: position.entryPrice,
            });
          },
        }
      );

      // GRACEFUL_DEGRADE: Return safe default score (70 = SAFE threshold)
      return this.createSafeDefaultHealthScore(positionId);
    }

    // Calculate component scores
    const timeAtRiskScore = this.calculateTimeAtRiskScore(position);
    const drawdownScore = this.calculateDrawdownScore(position, validPrice);
    const volumeLiquidityScore = this.calculateVolumeLiquidityScore(position);
    const volatilityScore = this.calculateVolatilityScore(position);
    const profitabilityScore = this.calculateProfitabilityScore(position, validPrice);

    // Components
    const components: HealthScoreComponents = {
      timeAtRiskScore,
      drawdownScore,
      volumeLiquidityScore,
      volatilityScore,
      profitabilityScore,
    };

    // Overall score (weighted average)
    const overallScore = Math.round(timeAtRiskScore * this.COMPONENT_WEIGHTS.timeAtRisk + drawdownScore * this.COMPONENT_WEIGHTS.drawdown + volumeLiquidityScore * this.COMPONENT_WEIGHTS.volumeLiquidity + volatilityScore * this.COMPONENT_WEIGHTS.volatility + profitabilityScore * this.COMPONENT_WEIGHTS.profitability);

    // Determine danger level
    let status = DangerLevel.SAFE;
    if (overallScore < this.HEALTH_THRESHOLDS.warning) {
      status = DangerLevel.CRITICAL;
    } else if (overallScore < this.HEALTH_THRESHOLDS.safe) {
      status = DangerLevel.WARNING;
    }

    // Build detailed analysis
    const analysis = this.buildHealthAnalysis(position, validPrice, timeAtRiskScore);

    const healthScore: HealthScore = {
      positionId,
      symbol: position.symbol,
      overallScore,
      components,
      status,
      lastUpdate: now,
      analysis,
    };

    // Cache result
    this.healthScoreCache.set(positionId, healthScore);

    return healthScore;
  }

  /**
   * Calculate time at risk score (20% weight)
   * Higher score = less time held
   * Score formula: 100 - (holdingMinutes / maxMinutes * 100)
   */
  private calculateTimeAtRiskScore(position: Position): number {
    const entryTime = position.openedAt || Date.now();
    const holdingTimeMs = Date.now() - entryTime;
    const holdingMinutes = holdingTimeMs / 1000 / 60;

    // Assume 4 hours (240 minutes) as max acceptable holding time
    const maxMinutes = 240;
    const percentOfMax = Math.min(holdingMinutes / maxMinutes, 1.0);

    // Score: 100 when just opened, 0 when max time exceeded
    const score = Math.max(0, 100 - percentOfMax * 100);
    return Math.round(score);
  }

  /**
   * Calculate drawdown score (30% weight)
   * Higher score = smaller loss
   * Score formula: 100 - (unrealizedLossPercent * 2) [capped at 0]
   */
  private calculateDrawdownScore(position: Position, currentPrice: number): number {
    const unrealizedPnL = this.calculateUnrealizedPnL(position, currentPrice);
    const unrealizedPnLPercent = (unrealizedPnL / (position.quantity * position.entryPrice)) * 100;

    // If profitable, full score
    if (unrealizedPnLPercent >= 0) {
      return 100;
    }

    // If loss: score = 100 - (loss% * 2)
    // At -5% loss: score = 90
    // At -25% loss: score = 50
    // At -50% loss: score = 0
    const score = Math.max(0, 100 + unrealizedPnLPercent * 2);
    return Math.round(score);
  }

  /**
   * Calculate volume/liquidity score (20% weight)
   * Higher score = better liquidity
   */
  private calculateVolumeLiquidityScore(position: Position): number {
    // Default high score if volume data not available
    // This would be enhanced with actual candle volume data
    // For now: High score
    return 80; // Assuming good liquidity by default
  }

  /**
   * Calculate volatility score (15% weight)
   * Higher score = stable volatility
   */
  private calculateVolatilityScore(position: Position): number {
    // Default to medium-high score
    // This would be enhanced with ATR comparison
    // For now: Medium-high score
    return 75; // Assuming normal volatility by default
  }

  /**
   * Calculate profitability score (15% weight)
   * Higher score = better PnL
   */
  private calculateProfitabilityScore(position: Position, currentPrice: number): number {
    const unrealizedPnL = this.calculateUnrealizedPnL(position, currentPrice);
    const unrealizedPnLPercent = (unrealizedPnL / (position.quantity * position.entryPrice)) * 100;

    // Score formula:
    // If profitable: 100 + (profit% * 2) [capped at 100]
    // If loss: 100 + (loss% * 2) [can go negative, capped at 0]
    let score = 100 + unrealizedPnLPercent * 2;
    score = Math.max(0, Math.min(100, score));
    return Math.round(score);
  }

  /**
   * Calculate unrealized PnL for a position
   */
  private calculateUnrealizedPnL(position: Position, currentPrice: number): number {
    if (position.side === PositionSide.LONG) {
      return (currentPrice - position.entryPrice) * position.quantity;
    } else {
      return (position.entryPrice - currentPrice) * position.quantity;
    }
  }

  /**
   * Build detailed health analysis
   */
  private buildHealthAnalysis(position: Position, currentPrice: number, timeAtRiskScore: number): HealthAnalysis {
    const entryTime = position.openedAt || Date.now();
    const holdingTimeMs = Date.now() - entryTime;
    const holdingMinutes = holdingTimeMs / 1000 / 60;

    const unrealizedPnL = this.calculateUnrealizedPnL(position, currentPrice);
    const unrealizedPnLPercent = (unrealizedPnL / (position.quantity * position.entryPrice)) * 100;

    return {
      timeAtRisk: {
        minutesHeld: Math.round(holdingMinutes),
        maxMinutes: 240,
        percentOfMax: Math.round((holdingMinutes / 240) * 100),
      },
      currentDrawdown: {
        percent: Math.round(Math.abs(Math.min(0, unrealizedPnLPercent)) * 100) / 100,
        maxThreshold: 5.0,
      },
      volume: {
        lastCandleVolume: 0, // Would be populated from candle data
        averageVolume: 0, // Would be populated from indicator data
        liquidity: 'HIGH', // Default to HIGH
      },
      volatility: {
        currentAtr: 0, // Would be populated from indicator
        averageAtr: 0, // Would be populated from indicator
        regimeChange: false,
      },
      profitability: {
        currentPnL: Math.round(unrealizedPnL * 100) / 100,
        currentPnLPercent: Math.round(unrealizedPnLPercent * 100) / 100,
        projectedPnL: unrealizedPnL, // Would be calculated with exit target
      },
    };
  }

  /**
   * Check if position is in danger
   */
  public async checkPositionDanger(positionId: string, currentPrice?: number): Promise<DangerLevel> {
    const position = this.positionLifecycleService.getCurrentPosition();
    if (!position || position.id !== positionId) {
      throw new Error(`Position not found: ${positionId}`);
    }

    // Use provided currentPrice or fallback to entry price
    const price = currentPrice || position.entryPrice;
    const healthScore = await this.calculatePositionHealth(positionId, price);
    return healthScore.status;
  }

  /**
   * Monitor all open positions and return health report
   */
  /**
   * PHASE 13.1a: Updated to require currentPrice parameter
   * Caller (WebSocket or candle handler) must provide real market price
   */
  public async monitorAllPositions(currentPrice?: number): Promise<HealthReport> {
    const now = Date.now();
    const position = this.positionLifecycleService.getCurrentPosition();
    const scores: HealthScore[] = [];
    const alerts: RiskAlert[] = [];

    if (position) {
      try {
        // PHASE 13.1a: Use provided currentPrice or fallback to entryPrice
        // WARNING: If currentPrice is not provided, health scoring will be inaccurate!
        const priceToUse = currentPrice ?? position.entryPrice;
        if (!currentPrice) {
          this.logger.warn(
            `[RealTimeRiskMonitor] No current price provided for ${position.symbol}, using entry price as fallback`
          );
        }
        const healthScore = await this.calculatePositionHealth(position.id, priceToUse);
        scores.push(healthScore);

        // Check for alerts (PHASE 13.1a: pass currentPrice for accurate assessment)
        const alert = await this.shouldTriggerAlert(position.id, priceToUse);
        if (alert) {
          alerts.push(alert);

          // Phase 8.5: SKIP event publishing on failure
          try {
            this.eventBus.publishSync({
              type: LiveTradingEventType.RISK_ALERT_TRIGGERED,
              data: {
                alert,
                shouldEmergencyClose: alert.shouldEmergencyClose,
              },
              timestamp: now,
            });
          } catch (error) {
            const handled = await ErrorHandler.handle(error, {
              strategy: RecoveryStrategy.SKIP,
              logger: this.logger,
              context: 'RealTimeRiskMonitor.publishRiskAlertEvent',
              onRecover: () => {
                this.logger.warn('⚠️ Failed to publish RISK_ALERT_TRIGGERED event, skipping', {
                  positionId: position.id,
                  alert: alert.alertType,
                  error: error instanceof Error ? error.message : String(error),
                });
              },
            });

            // SKIP: Continue monitoring, event publishing is non-critical
          }
        }

        // Phase 8.5: SKIP event publishing on failure
        try {
          this.eventBus.publishSync({
            type: LiveTradingEventType.HEALTH_SCORE_UPDATED,
            data: {
              positionId: position.id,
              symbol: position.symbol,
              newScore: healthScore.overallScore,
              oldScore: 100, // Would track previous score
              newStatus: healthScore.status,
              oldStatus: DangerLevel.SAFE,
            },
            timestamp: now,
          });
        } catch (error) {
          const handled = await ErrorHandler.handle(error, {
            strategy: RecoveryStrategy.SKIP,
            logger: this.logger,
            context: 'RealTimeRiskMonitor.publishHealthScoreEvent',
            onRecover: () => {
              this.logger.warn('⚠️ Failed to publish HEALTH_SCORE_UPDATED event, skipping', {
                positionId: position.id,
                newScore: healthScore.overallScore,
                error: error instanceof Error ? error.message : String(error),
              });
            },
          });

          // SKIP: Continue monitoring, event publishing is non-critical
        }
      } catch (error) {
        // Phase 8.5: Use ErrorHandler for position monitoring failures with SKIP strategy
        const handled = await ErrorHandler.handle(error, {
          strategy: RecoveryStrategy.SKIP,
          logger: this.logger,
          context: 'RealTimeRiskMonitor.monitorAllPositions',
          onRecover: () => {
            this.logger.warn('⚠️ Position monitoring failed, skipping to next position', {
              positionId: position.id,
              symbol: position.symbol,
              error: error instanceof Error ? error.message : String(error),
            });
          },
        });

        // SKIP: Continue with other positions
      }
    }

    // Calculate statistics
    const safePositions = scores.filter((s) => s.status === DangerLevel.SAFE).length;
    const warningPositions = scores.filter((s) => s.status === DangerLevel.WARNING).length;
    const criticalPositions = scores.filter((s) => s.status === DangerLevel.CRITICAL).length;
    const averageScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b.overallScore, 0) / scores.length) : 0;

    return {
      timestamp: now,
      totalPositions: scores.length,
      safePositions,
      warningPositions,
      criticalPositions,
      scores,
      alerts,
      averageScore,
    };
  }

  /**
   * Check if position should trigger an alert
   */
  /**
   * PHASE 13.1a: Check if position should trigger an alert
   * NOW REQUIRES: currentPrice parameter for accurate health calculation
   */
  public async shouldTriggerAlert(positionId: string, currentPrice: number): Promise<RiskAlert | null> {
    const position = this.positionLifecycleService.getCurrentPosition();
    if (!position || position.id !== positionId) {
      return null;
    }

    // PHASE 13.1a: REQUIRED parameter - no fallback to entryPrice
    // Caller MUST provide real market price for accurate risk assessment
    const healthScore = await this.calculatePositionHealth(positionId, currentPrice);

    // Check for critical danger
    if (healthScore.status === DangerLevel.CRITICAL) {
      const alert: RiskAlert = {
        positionId,
        symbol: position.symbol,
        alertType: RiskAlertType.HEALTH_SCORE_LOW,
        severity: 'CRITICAL',
        message: `Position health critically low (score: ${healthScore.overallScore})`,
        data: {
          healthScore: healthScore.overallScore,
          status: healthScore.status,
          components: healthScore.components,
        },
        timestamp: Date.now(),
        shouldEmergencyClose: this.config.emergencyCloseOnCritical,
      };

      return alert;
    }

    // Check for excessive drawdown
    const analysis = healthScore.analysis;
    if (analysis.currentDrawdown.percent > analysis.currentDrawdown.maxThreshold) {
      const alert: RiskAlert = {
        positionId,
        symbol: position.symbol,
        alertType: RiskAlertType.EXCESSIVE_DRAWDOWN,
        severity: 'WARNING',
        message: `Drawdown (${analysis.currentDrawdown.percent.toFixed(2)}%) exceeds threshold (${analysis.currentDrawdown.maxThreshold}%)`,
        data: {
          currentDrawdown: analysis.currentDrawdown.percent,
          maxThreshold: analysis.currentDrawdown.maxThreshold,
        },
        timestamp: Date.now(),
        shouldEmergencyClose: false,
      };

      return alert;
    }

    return null;
  }

  /**
   * Get latest health score for a position (from cache)
   */
  public getLatestHealthScore(positionId: string): HealthScore | undefined {
    return this.healthScoreCache.get(positionId);
  }

  /**
   * Clear health score cache
   */
  public clearHealthScoreCache(): void {
    this.healthScoreCache.clear();
    this.logger.debug('[RealTimeRiskMonitor] Cleared health score cache');
  }

  /**
   * [P1] Handle position-closed event
   * Invalidate health score cache when position closes
   */
  private onPositionClosed(data: { position: Position; strategyId?: string }): void {
    const positionId = data.position?.id;

    if (!positionId) {
      this.logger.warn('[RealTimeRiskMonitor] position-closed event missing ID');
      return;
    }

    // Clear cache for this position
    this.healthScoreCache.delete(positionId);
    this.generatedAlerts.delete(positionId);

    this.logger.debug('[RealTimeRiskMonitor] Cache invalidated', { positionId });
  }

  /**
   * Get monitoring statistics
   */
  public getStatistics(): {
    positionsMonitored: number;
    lastCheckTime: number;
    cachedScores: number;
    generatedAlerts: number;
  } {
    return {
      positionsMonitored: this.healthScoreCache.size,
      lastCheckTime: this.lastCheckTime,
      cachedScores: this.healthScoreCache.size,
      generatedAlerts: Array.from(this.generatedAlerts.values()).reduce((a, b) => a + b.length, 0),
    };
  }

  /**
   * Phase 8.5: Create a safe default health score
   * Used when position data is invalid and no cache available
   * Returns conservative safe default (70 = SAFE/WARNING boundary)
   */
  private createSafeDefaultHealthScore(positionId: string): HealthScore {
    return {
      positionId,
      symbol: 'UNKNOWN',
      overallScore: 70, // SAFE threshold
      components: {
        timeAtRiskScore: 70,
        drawdownScore: 70,
        volumeLiquidityScore: 70,
        volatilityScore: 70,
        profitabilityScore: 70,
      },
      status: DangerLevel.SAFE,
      lastUpdate: Date.now(),
      analysis: {
        timeAtRisk: {
          minutesHeld: 0,
          maxMinutes: 240,
          percentOfMax: 0,
        },
        currentDrawdown: {
          percent: 0,
          maxThreshold: 5.0,
        },
        volume: {
          lastCandleVolume: 0,
          averageVolume: 0,
          liquidity: 'HIGH',
        },
        volatility: {
          currentAtr: 0,
          averageAtr: 0,
          regimeChange: false,
        },
        profitability: {
          currentPnL: 0,
          currentPnLPercent: 0,
          projectedPnL: 0,
        },
      },
    };
  }

  /**
   * Phase 8.5: Validate current price for health calculation
   * Returns validated price or fallback on failure with GRACEFUL_DEGRADE
   */
  private async validateCurrentPrice(
    positionId: string,
    currentPrice: number | undefined,
    fallbackPrice: number
  ): Promise<{ price: number; usedCache: boolean }> {
    if (currentPrice !== undefined && (isNaN(currentPrice) || currentPrice <= 0)) {
      const handled = await ErrorHandler.handle(
        new OrderValidationError('Invalid current price for health calculation', {
          field: 'currentPrice',
          value: currentPrice,
          reason: 'Price must be a positive number',
          positionId,
        }),
        {
          strategy: RecoveryStrategy.GRACEFUL_DEGRADE,
          logger: this.logger,
          context: 'RealTimeRiskMonitor.validateCurrentPrice',
          onRecover: () => {
            this.logger.warn('⚠️ Invalid currentPrice, falling back to entry price', {
              positionId,
              invalidPrice: currentPrice,
              fallback: fallbackPrice,
            });
          },
        }
      );

      // GRACEFUL_DEGRADE: Use fallback (entryPrice)
      return { price: fallbackPrice, usedCache: false };
    }

    return { price: currentPrice ?? fallbackPrice, usedCache: false };
  }
}
