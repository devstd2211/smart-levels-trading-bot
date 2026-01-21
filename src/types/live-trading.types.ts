/**
 * Phase 9: Live Trading Engine - Type Definitions
 *
 * Defines all types for:
 * - Position lifecycle management (timeouts, state validation)
 * - Real-time risk monitoring (health scores, danger levels)
 * - Order execution pipeline (retry logic, verification)
 * - Performance analytics (trade analysis, metrics)
 * - Graceful shutdown (state persistence, recovery)
 */

// ============================================================================
// POSITION LIFECYCLE TYPES
// ============================================================================

/**
 * Configuration for position lifecycle management
 */
export interface PositionLifecycleConfig {
  maxHoldingTimeMinutes: number; // Max time to hold position (default: 240 = 4h)
  warningThresholdMinutes: number; // Emit warning before timeout (default: 180 = 3h)
  enableAutomaticTimeout: boolean; // Auto-close on timeout (default: true)
}

/**
 * Tracked position with timing metadata
 */
export interface TrackedPosition {
  positionId: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  entryTime: number; // Timestamp when opened
  quantity: number;
  totalExposureUsdt: number;
  state: PositionLifecycleState;
  lastUpdateTime: number;
}

/**
 * Position lifecycle states for timeout management
 */
export enum PositionLifecycleState {
  OPEN = 'OPEN',
  WARNING = 'WARNING', // Approaching timeout
  CRITICAL = 'CRITICAL', // At timeout threshold
  CLOSING = 'CLOSING', // Emergency close in progress
  CLOSED = 'CLOSED',
}

/**
 * Position timeout detection result
 */
export interface TimeoutCheckResult {
  positions: TimeoutAlert[];
  anyWarnings: boolean;
  anyCritical: boolean;
}

/**
 * Individual position timeout alert
 */
export interface TimeoutAlert {
  positionId: string;
  symbol: string;
  holdingTimeMinutes: number;
  state: PositionLifecycleState;
  minutesUntilTimeout: number; // Negative if exceeded
}

/**
 * Emergency close request
 */
export interface EmergencyCloseRequest {
  positionId: string;
  reason: EmergencyCloseReason;
  priority: 'HIGH' | 'CRITICAL';
  details?: Record<string, any>;
}

/**
 * Reasons for emergency close
 */
export enum EmergencyCloseReason {
  POSITION_TIMEOUT = 'POSITION_TIMEOUT',
  HEALTH_CRITICAL = 'HEALTH_CRITICAL',
  EXCESSIVE_DRAWDOWN = 'EXCESSIVE_DRAWDOWN',
  MANUAL_TRIGGER = 'MANUAL_TRIGGER',
  BOT_SHUTDOWN = 'BOT_SHUTDOWN',
  RISK_LIMIT_EXCEEDED = 'RISK_LIMIT_EXCEEDED',
}

// ============================================================================
// REAL-TIME RISK MONITORING TYPES
// ============================================================================

/**
 * Configuration for real-time risk monitoring
 */
export interface RiskMonitoringConfig {
  enabled: boolean; // Default: true
  checkIntervalCandles: number; // Run every N candles (default: 5)
  healthScoreThreshold: number; // Below this % triggers danger (default: 30)
  emergencyCloseOnCritical: boolean; // Auto-close when critical (default: true)
}

/**
 * Position health score (0-100)
 */
export interface HealthScore {
  positionId: string;
  symbol: string;
  overallScore: number; // 0-100
  components: HealthScoreComponents;
  status: DangerLevel;
  lastUpdate: number;
  analysis: HealthAnalysis;
}

/**
 * Health score component breakdown
 */
export interface HealthScoreComponents {
  timeAtRiskScore: number; // Based on holding time
  drawdownScore: number; // Based on current loss
  volumeLiquidityScore: number; // Based on volume/liquidity
  volatilityScore: number; // Based on current volatility
  profitabilityScore: number; // Based on current PnL
}

/**
 * Detailed health analysis
 */
export interface HealthAnalysis {
  timeAtRisk: {
    minutesHeld: number;
    maxMinutes: number;
    percentOfMax: number;
  };
  currentDrawdown: {
    percent: number;
    maxThreshold: number;
  };
  volume: {
    lastCandleVolume: number;
    averageVolume: number;
    liquidity: 'HIGH' | 'MEDIUM' | 'LOW';
  };
  volatility: {
    currentAtr: number;
    averageAtr: number;
    regimeChange: boolean;
  };
  profitability: {
    currentPnL: number;
    currentPnLPercent: number;
    projectedPnL: number;
  };
}

/**
 * Risk danger levels
 */
export enum DangerLevel {
  SAFE = 'SAFE', // Score >= 70
  WARNING = 'WARNING', // Score 30-69
  CRITICAL = 'CRITICAL', // Score < 30
}

/**
 * Real-time risk alert
 */
export interface RiskAlert {
  positionId: string;
  symbol: string;
  alertType: RiskAlertType;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  message: string;
  data: Record<string, any>;
  timestamp: number;
  shouldEmergencyClose: boolean;
}

/**
 * Types of risk alerts
 */
export enum RiskAlertType {
  HEALTH_SCORE_LOW = 'HEALTH_SCORE_LOW',
  EXCESSIVE_DRAWDOWN = 'EXCESSIVE_DRAWDOWN',
  TIME_AT_RISK_HIGH = 'TIME_AT_RISK_HIGH',
  VOLUME_LIQUIDITY_DROP = 'VOLUME_LIQUIDITY_DROP',
  VOLATILITY_SPIKE = 'VOLATILITY_SPIKE',
  COMBINED_DANGER = 'COMBINED_DANGER',
}

/**
 * Health report for all positions
 */
export interface HealthReport {
  timestamp: number;
  totalPositions: number;
  safePositions: number;
  warningPositions: number;
  criticalPositions: number;
  scores: HealthScore[];
  alerts: RiskAlert[];
  averageScore: number;
}

// ============================================================================
// ORDER EXECUTION PIPELINE TYPES
// ============================================================================

/**
 * Configuration for order execution
 */
export interface OrderExecutionConfig {
  maxRetries: number; // Default: 3
  retryDelayMs: number; // Default: 1000
  orderTimeoutSeconds: number; // Default: 30
  maxSlippagePercent: number; // Default: 0.5
  backoffMultiplier: number; // Exponential backoff (default: 2.0)
}

/**
 * Order request with execution metadata
 */
export interface OrderRequest {
  orderId?: string; // Generated if not provided
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  orderType: 'MARKET' | 'LIMIT';
  timeInForce?: 'GTC' | 'IOC' | 'FOK';
  clientOrderId?: string;
  timestamp: number;
}

/**
 * Order execution result
 */
export interface OrderResult {
  success: boolean;
  orderId: string;
  orderStatus: OrderStatus;
  filledQuantity: number;
  filledPrice: number;
  actualSlippage: number; // Percent
  executionTime: number; // MS
  error?: string;
  retryCount: number;
  timestamp: number;
}

/**
 * Order statuses
 */
export enum OrderStatus {
  PENDING = 'PENDING',
  PARTIALLY_FILLED = 'PARTIALLY_FILLED',
  FILLED = 'FILLED',
  CANCELLED = 'CANCELLED',
  FAILED = 'FAILED',
  TIMEOUT = 'TIMEOUT',
}

/**
 * Slippage analysis
 */
export interface SlippageAnalysis {
  expectedPrice: number;
  actualPrice: number;
  slippageAmount: number;
  slippagePercent: number;
  withinLimits: boolean;
}

/**
 * Execution pipeline metrics
 */
export interface ExecutionMetrics {
  totalOrders: number;
  successfulOrders: number;
  failedOrders: number;
  averageExecutionTime: number; // MS
  averageSlippage: number; // Percent
  averageRetries: number;
  totalRetries: number;
  lastUpdateTime: number;
}

// ============================================================================
// PERFORMANCE ANALYTICS TYPES
// ============================================================================

/**
 * Configuration for performance analytics
 */
export interface PerformanceAnalyticsConfig {
  enabled: boolean; // Default: true
  metricsInterval: number; // Update interval in candles
  historicalPeriods: {
    last10Trades: boolean;
    last30Trades: boolean;
    last100Trades: boolean;
    sessionMetrics: boolean;
    allTimeMetrics: boolean;
  };
}

/**
 * Comprehensive trade statistics
 */
export interface TradeStatistics {
  totalTrades: number;
  winRate: number; // Percent (0-100)
  lossRate: number; // Percent (0-100)
  profitFactor: number; // Gross profit / Gross loss
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdown: number; // Percent
  averageWin: number; // USDT
  averageLoss: number; // USDT
  largestWin: number; // USDT
  largestLoss: number; // USDT
  averageHoldingTime: number; // Minutes
  totalPnL: number; // USDT
  totalPnLPercent: number; // Percent
}

/**
 * Trade metrics over a specific period
 */
export interface PeriodMetrics {
  period: 'ALL' | 'TODAY' | 'WEEK' | 'MONTH';
  startTime: number;
  endTime: number;
  trades: number;
  stats: TradeStatistics;
}

/**
 * Session-based analytics
 */
export interface SessionAnalytics {
  sessionId: string;
  startTime: number;
  endTime?: number;
  duration?: number; // MS
  trades: number;
  stats: TradeStatistics;
  topTrades: TopTrade[];
  worstTrades: TopTrade[];
}

/**
 * Individual top/worst trade
 */
export interface TopTrade {
  tradeId: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  exitPrice: number;
  pnl: number; // USDT
  pnlPercent: number;
  holdingTimeMinutes: number;
  entryTime: number;
  exitTime: number;
  reason: string;
}

/**
 * Strategy-specific analytics (for Phase 10)
 */
export interface StrategyAnalytics {
  strategyName: string;
  enabledAt: number;
  stats: TradeStatistics;
  byDirection: {
    long: TradeStatistics;
    short: TradeStatistics;
  };
  byTimeframe: {
    [timeframe: string]: TradeStatistics;
  };
}

/**
 * Performance metrics API response
 */
export interface PerformanceMetricsResponse {
  timestamp: number;
  account: {
    balance: number;
    equity: number;
    unrealizedPnL: number;
  };
  all: TradeStatistics;
  periods: PeriodMetrics[];
  currentSession: SessionAnalytics;
  strategies: StrategyAnalytics[];
}

// ============================================================================
// GRACEFUL SHUTDOWN TYPES
// ============================================================================

/**
 * Configuration for graceful shutdown
 */
export interface GracefulShutdownConfig {
  closePositionsOnShutdown: boolean; // Default: false (persist instead)
  shutdownTimeoutSeconds: number; // Default: 60
  cancelOrdersOnShutdown: boolean; // Default: true
  persistStateOnShutdown: boolean; // Default: true
}

/**
 * Shutdown sequence result
 */
export interface ShutdownResult {
  success: boolean;
  duration: number; // MS
  closedPositions: number;
  cancelledOrders: number;
  persistedState: boolean;
  error?: string;
  timestamp: number;
}

/**
 * Position state for persistence
 */
export interface PersistedPositionState {
  positionId: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  quantity: number;
  entryPrice: number;
  entryTime: number;
  currentPrice?: number;
  currentPnL?: number;
  currentPnLPercent?: number;
  openOrders?: any[];
  state: string;
  persistedAt: number;
}

/**
 * Recovery metadata after restart
 */
export interface RecoveryMetadata {
  recoveredAt: number;
  recoveredPositions: number;
  recoveredOrders: number;
  sourcePath: string;
  warning?: string;
}

/**
 * Bot state snapshot for persistence
 */
export interface BotStateSnapshot {
  snapshotTime: number;
  positions: PersistedPositionState[];
  sessionMetrics: {
    totalTrades: number;
    totalPnL: number;
    startTime: number;
  };
  riskMetrics: {
    dailyPnL: number;
    consecutiveLosses: number;
    totalExposure: number;
  };
}

// ============================================================================
// LIVE TRADING CONFIG (Main Configuration Interface)
// ============================================================================

/**
 * Combined Phase 9 configuration
 * Injected into BotConfig at root level
 */
export interface LiveTradingConfig {
  enabled: boolean; // Master switch for all Phase 9 features

  lifecycle: PositionLifecycleConfig;
  riskMonitoring: RiskMonitoringConfig;
  orderExecution: OrderExecutionConfig;
  performanceAnalytics: PerformanceAnalyticsConfig;
  shutdown: GracefulShutdownConfig;
}

// ============================================================================
// EVENT TYPES (for EventBus)
// ============================================================================

/**
 * Events emitted by Phase 9 services
 */
export enum LiveTradingEventType {
  // Position lifecycle events
  POSITION_TIMEOUT_WARNING = 'position-timeout-warning',
  POSITION_TIMEOUT_CRITICAL = 'position-timeout-critical',
  POSITION_TIMEOUT_TRIGGERED = 'position-timeout-triggered',

  // Risk monitoring events
  HEALTH_SCORE_UPDATED = 'health-score-updated',
  DANGER_LEVEL_CHANGED = 'danger-level-changed',
  RISK_ALERT_TRIGGERED = 'risk-alert-triggered',
  EMERGENCY_CLOSE_TRIGGERED = 'emergency-close-triggered',

  // Order execution events
  ORDER_EXECUTION_STARTED = 'order-execution-started',
  ORDER_EXECUTION_FAILED = 'order-execution-failed',
  ORDER_EXECUTION_TIMEOUT = 'order-execution-timeout',

  // Shutdown events
  SHUTDOWN_STARTED = 'shutdown-started',
  SHUTDOWN_COMPLETED = 'shutdown-completed',
  SHUTDOWN_FAILED = 'shutdown-failed',
  STATE_PERSISTED = 'state-persisted',
  STATE_RECOVERED = 'state-recovered',
}

/**
 * Event payloads
 */
export interface PositionTimeoutWarningEvent {
  positionId: string;
  symbol: string;
  holdingTimeMinutes: number;
  minutesUntilTimeout: number;
}

export interface HealthScoreUpdatedEvent {
  positionId: string;
  symbol: string;
  newScore: number;
  oldScore: number;
  newStatus: DangerLevel;
  oldStatus: DangerLevel;
}

export interface RiskAlertTriggeredEvent {
  alert: RiskAlert;
  shouldEmergencyClose: boolean;
}

export interface ShutdownStartedEvent {
  reason: string;
  timestamp: number;
  timeoutSeconds: number;
}

export interface ShutdownCompletedEvent {
  result: ShutdownResult;
  recovery?: RecoveryMetadata;
}

// ============================================================================
// SERVICE INTERFACES
// ============================================================================

/**
 * TradingLifecycleManager interface
 */
export interface ITradingLifecycleManager {
  trackPosition(position: TrackedPosition): void;
  untrackPosition(positionId: string): void;
  checkPositionTimeouts(): Promise<TimeoutCheckResult>;
  handlePositionTimeout(position: TrackedPosition): Promise<void>;
  triggerEmergencyClose(request: EmergencyCloseRequest): Promise<void>;
  validateStateTransition(from: PositionLifecycleState, to: PositionLifecycleState): boolean;
}

/**
 * RealTimeRiskMonitor interface
 */
export interface IRealTimeRiskMonitor {
  calculatePositionHealth(positionId: string, currentPrice: number): Promise<HealthScore>;
  checkPositionDanger(positionId: string): Promise<DangerLevel>;
  monitorAllPositions(): Promise<HealthReport>;
  shouldTriggerAlert(positionId: string): Promise<RiskAlert | null>;
}

/**
 * OrderExecutionPipeline interface
 */
export interface IOrderExecutionPipeline {
  placeOrder(order: OrderRequest): Promise<OrderResult>;
  verifyOrderPlacement(orderId: string): Promise<OrderStatus>;
  pollOrderStatus(orderId: string, maxAttempts: number): Promise<OrderStatus>;
  calculateSlippage(expectedPrice: number, actualPrice: number): SlippageAnalysis;
}

/**
 * PerformanceAnalytics interface
 */
export interface IPerformanceAnalytics {
  calculateWinRate(trades: any[], period: number): number;
  calculateProfitFactor(trades: any[]): number;
  calculateAverageHoldTime(trades: any[]): number;
  getMetrics(period: 'ALL' | 'TODAY' | 'WEEK' | 'MONTH'): Promise<TradeStatistics>;
  getTopTrades(limit: number): Promise<TopTrade[]>;
}

/**
 * GracefulShutdownManager interface
 */
export interface IGracefulShutdownManager {
  initiateShutdown(reason: string): Promise<ShutdownResult>;
  closeAllPositions(reason: EmergencyCloseReason): Promise<void>;
  persistState(): Promise<void>;
  recoverState(): Promise<RecoveryMetadata | null>;
}
