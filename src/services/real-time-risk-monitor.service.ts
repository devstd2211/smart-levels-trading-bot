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
  }

  /**
   * Calculate comprehensive health score for a position
   * Returns score 0-100, with details on each component
   */
  public async calculatePositionHealth(positionId: string, currentPrice: number): Promise<HealthScore> {
    const now = Date.now();
    const position = this.positionLifecycleService.getCurrentPosition();

    if (!position || position.id !== positionId) {
      this.logger.warn(`[RealTimeRiskMonitor] Position not found: ${positionId}`);
      throw new Error(`Position not found: ${positionId}`);
    }

    // Get cached score if available and recent
    const cached = this.healthScoreCache.get(positionId);
    if (cached && now - cached.lastUpdate < 60000) {
      // Cache for 1 minute
      return cached;
    }

    // Calculate component scores
    const timeAtRiskScore = this.calculateTimeAtRiskScore(position);
    const drawdownScore = this.calculateDrawdownScore(position, currentPrice);
    const volumeLiquidityScore = this.calculateVolumeLiquidityScore(position);
    const volatilityScore = this.calculateVolatilityScore(position);
    const profitabilityScore = this.calculateProfitabilityScore(position, currentPrice);

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
    const analysis = this.buildHealthAnalysis(position, currentPrice, timeAtRiskScore);

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

          // Emit alert event
          this.eventBus.publishSync({
            type: LiveTradingEventType.RISK_ALERT_TRIGGERED,
            data: {
              alert,
              shouldEmergencyClose: alert.shouldEmergencyClose,
            },
            timestamp: now,
          });
        }

        // Emit health score update event
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
        this.logger.error(`[RealTimeRiskMonitor] Error monitoring position ${position.id}: ${error}`);
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
}
