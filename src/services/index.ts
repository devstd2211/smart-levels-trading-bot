/**
 * Services barrel export
 * Centralizes all service exports for cleaner imports
 */

export * from './bybit';
export * from './position-lifecycle.service'; // Consolidated position management service
export * from './position-exiting.service'; // Handles partial TP, breakeven, trailing
export * from './websocket-manager.service';
export * from './position-monitor.service';
export * from './exit-type-detector.service'; // Determines position exit type from order history
export * from './position-pnl-calculator.service'; // Calculates unrealized P&L
export * from './position-sync.service'; // Syncs position state with exchange
export * from './trading-journal.service';
export * from './logger.service';
export * from './time.service';
export * from './public-websocket.service';
export * from './telegram.service';
export * from './session-stats.service';
export * from './event-bus';
export * from './bot-metrics.service';
export * from './swing-point-detector.service';
export * from './multi-timeframe-trend.service';
export * from './timeframe-weighting.service';
export * from './console-dashboard.service';
export * from './dashboard-integration.service';
export * from './orchestrator-initialization.service'; // TradingOrchestrator initialization (extracted from constructor)
export * from './signal-filtering.service'; // Filters signals by trend alignment and applies confidence adjustments
export * from './market-condition-analyzer.service'; // Adjusts take profits based on market conditions
