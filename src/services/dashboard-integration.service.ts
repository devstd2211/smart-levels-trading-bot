/**
 * Dashboard Integration Service
 * Connects console dashboard to all data sources without modifying existing code
 * Uses event emitters and data snapshots to update the dashboard in real-time
 */

import { ConsoleDashboardService } from './console-dashboard.service';
import { BotEventBus } from './event-bus';
import { LoggerService, Position } from '../types';
import { TrendAnalyzer } from '../analyzers/trend-analyzer';
import { MultiTimeframeRSIAnalyzer } from '../analyzers/multi-timeframe-rsi.analyzer';
import { MultiTimeframeEMAAnalyzer } from '../analyzers/multi-timeframe-ema.analyzer';
import { PositionManagerService } from './position-manager.service';
import { PublicWebSocketService } from './public-websocket.service';

export class DashboardIntegrationService {
  private updateInterval?: NodeJS.Timeout;
  private lastPrice: number = 0;
  private lastTrend: Map<string, string> = new Map();
  private lastRSI: Map<string, number> = new Map();
  private lastEMA: Map<string, { fast: number; slow: number }> = new Map();
  private detectedPatterns: string[] = [];
  private isUpdatingAnalyzers: boolean = false; // Prevent concurrent analyzer updates

  constructor(
    private dashboard: ConsoleDashboardService,
    private eventBus: BotEventBus,
    private logger: LoggerService,
    private trendAnalyzer?: TrendAnalyzer,
    private rsiAnalyzer?: MultiTimeframeRSIAnalyzer,
    private emaAnalyzer?: MultiTimeframeEMAAnalyzer,
    private positionManager?: PositionManagerService,
    private publicWebSocket?: PublicWebSocketService,
  ) {
    this.initialize();
  }

  private initialize(): void {
    // Log which analyzers are available
    const hasAnalyzers = {
      trend: !!this.trendAnalyzer,
      rsi: !!this.rsiAnalyzer,
      ema: !!this.emaAnalyzer,
      publicWebSocket: !!this.publicWebSocket,
    };
    this.logger.info('📊 Dashboard Integration - Analyzer availability', hasAnalyzers);

    // Subscribe to all relevant events
    this.subscribeToEvents();

    // Start periodic update loop
    this.startUpdateLoop();

    this.logger.info('📊 Dashboard Integration Service initialized');
  }

  private subscribeToEvents(): void {
    // Intercept logger FIRST to capture all logs
    this.interceptLoggerOutput();

    // NOTE: Do NOT disable console output in logger!
    // If we disable it, LoggerService.writeToConsole() returns early before calling console methods,
    // so our interception never gets triggered for DEBUG/INFO/WARN/ERROR logs.
    // Instead, we let all console calls go through to our interception which routes them to dashboard.
    // this.logger.disableConsoleOutput();  // ← REMOVED - keeps console methods active for interception

    // Position events
    this.eventBus.on('position-opened', (data: any) => {
      this.logger.info('🎯 [DASHBOARD] position-opened received', { positionId: data?.position?.id });
      this.updatePositionData(data?.position);
      this.dashboard.addPattern('Position Opened');
    });

    this.eventBus.on('position-closed', (data: any) => {
      this.logger.info('🎯 [DASHBOARD] position-closed received', { positionId: data?.position?.id });
      this.dashboard.updatePosition(undefined);
      this.dashboard.addPattern('Position Closed');
    });

    // Entry signal events - extract pattern name from reason
    this.eventBus.on('entry-signal', (data: any) => {
      if (data?.signal) {
        const direction = data.signal.direction || 'UNKNOWN';
        const confidence = data.signal.confidence ? `${Math.round(data.signal.confidence)}%` : '';
        const reason = data.signal.reason || '';

        // Extract pattern name from reason (e.g., "Chart Pattern: Head & Shoulders" -> "Head & Shoulders")
        let patternName = direction;
        if (reason) {
          const match = reason.match(/(?:Chart Pattern|Engulfing|Flag|Triangle|Wedge|Triple):\s*(.+?)(?:\s*\(|$)/);
          if (match && match[1]) {
            patternName = match[1].trim();
          }
        }

        const pattern = confidence ? `${patternName} (${confidence})` : patternName;
        this.dashboard.addPattern(pattern);
      }
    });

    // Price updates via WebSocket - also trigger analyzer updates
    if (this.publicWebSocket) {
      this.publicWebSocket.on('candleClosed', (data: any) => {
        this.logger.debug('📊 [DASHBOARD] candleClosed event received', { role: data?.role, price: data?.candle?.close });
        if (data?.candle?.close) {
          this.lastPrice = data.candle.close;
          this.dashboard.updatePrice(data.candle.close);

          // Update all analyzers on candle close
          void this.updateAnalyzerData();
        }
      });
    } else {
      this.logger.warn('⚠️ [DASHBOARD] PublicWebSocket not available - price updates disabled');
    }
  }

  private interceptLoggerOutput(): void {
    // Store original console methods
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;
    const originalDebug = console.debug;
    const originalInfo = console.info;

    // Override console methods to also update dashboard
    console.debug = (...args: any[]) => {
      const message = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
      this.dashboard.addLog('debug', message);
    };

    console.info = (...args: any[]) => {
      const message = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
      this.dashboard.addLog('info', message);
    };

    console.log = (...args: any[]) => {
      const message = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
      // Extract log level from message if present
      let level = 'info';
      let cleanMessage = message;

      if (message.includes('[ERROR]') || message.includes('error TS')) {
        level = 'error';
        cleanMessage = message.replace(/\[ERROR\]/g, '').trim();
      } else if (message.includes('[WARN]') || message.includes('warning')) {
        level = 'warn';
        cleanMessage = message.replace(/\[WARN\]/g, '').trim();
      } else if (message.includes('[DEBUG]')) {
        level = 'debug';
        cleanMessage = message.replace(/\[DEBUG\]/g, '').trim();
      } else if (message.includes('[DASHBOARD]')) {
        level = 'info';
        cleanMessage = message.replace(/\[DASHBOARD\]/g, '').trim();
      }

      this.dashboard.addLog(level, cleanMessage);
      // Still log to original console for debugging if needed
      // originalLog.apply(console, args);
    };

    console.warn = (...args: any[]) => {
      const message = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
      this.dashboard.addLog('warn', message);
      // originalWarn.apply(console, args);
    };

    console.error = (...args: any[]) => {
      const message = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
      this.dashboard.addLog('error', message);
      // originalError.apply(console, args);
    };
  }

  private startUpdateLoop(): void {
    this.updateInterval = setInterval(() => {
      // Periodic update for position/PnL (not dependent on candle close)
      void this.updatePositionPnLData();
    }, 1000); // Update every second
  }

  private async updateAnalyzerData(): Promise<void> {
    // Skip if already updating - prevent concurrent updates from piling up
    if (this.isUpdatingAnalyzers) return;

    this.isUpdatingAnalyzers = true;
    try {
      // Log which analyzers we have
      const hasAnalyzers = {
        trend: !!this.trendAnalyzer,
        rsi: !!this.rsiAnalyzer,
        ema: !!this.emaAnalyzer,
      };

      if (!hasAnalyzers.trend && !hasAnalyzers.rsi && !hasAnalyzers.ema) {
        this.logger.warn('⚠️ [DASHBOARD] No analyzers available yet', hasAnalyzers);
      }

      // Get real-time data from analyzers when candle closes
      // Add timeout to prevent hanging on slow analyzer calls
      await Promise.race([
        Promise.all([
          this.updateTrendDataAsync(),
          this.updateRSIDataAsync(),
          this.updateEMADataAsync(),
        ]),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Dashboard analyzer update timeout')), 2000)
        ),
      ]);
      this.updatePositionData();
    } catch (error) {
      // Silently fail - don't break the bot
      // Error likely means analyzers are slow - that's ok
    } finally {
      this.isUpdatingAnalyzers = false;
    }
  }

  private async updateTrendDataAsync(): Promise<void> {
    if (!this.trendAnalyzer) {
      this.logger.debug('⚠️ [DASHBOARD] TrendAnalyzer not available');
      return;
    }

    try {
      // Use multiTimeframeAnalysis to get all timeframes
      const multiTrend = (this.trendAnalyzer as any).lastAnalysis;
      if (!multiTrend) {
        this.logger.debug('⚠️ [DASHBOARD] TrendAnalyzer.lastAnalysis is null/undefined');
        return;
      }

      if (multiTrend && multiTrend.byTimeframe) {
        this.logger.debug('📈 [DASHBOARD] Trend data found', { timeframes: Object.keys(multiTrend.byTimeframe).join(', ') });
        // Update each timeframe from the analysis
        Object.entries(multiTrend.byTimeframe).forEach(([timeframe, analysis]: any) => {
          if (analysis && analysis.bias) {
            const trend = analysis.bias === 'BULLISH' ? 'UPTREND ↑' : 'DOWNTREND ↓';

            if (this.lastTrend.get(timeframe) !== trend) {
              this.lastTrend.set(timeframe, trend);
              this.dashboard.updateMarketData(timeframe, {
                timeframe,
                trend,
                pattern: this.detectCurrentPattern(),
              });
            }
          }
        });
      } else {
        this.logger.debug('⚠️ [DASHBOARD] TrendAnalyzer.lastAnalysis.byTimeframe missing');
      }
    } catch (error) {
      this.logger.debug('❌ [DASHBOARD] Trend update error', { error: error instanceof Error ? error.message : String(error) });
    }
  }

  private async updateRSIDataAsync(): Promise<void> {
    if (!this.rsiAnalyzer) {
      this.logger.debug('⚠️ [DASHBOARD] RSIAnalyzer not available');
      return;
    }

    try {
      // Call calculateAll() directly to preserve 'this' context
      const rsiData = await (this.rsiAnalyzer as any).calculateAll();
      if (rsiData) {
        this.logger.debug('📊 [DASHBOARD] RSI data received', { keys: Object.keys(rsiData).join(', ') });
        const timeframeMap: Record<string, string> = {
          entry: '1m',
          primary: '5m',
          trend1: '15m',
          trend2: '30m',
        };

        Object.entries(timeframeMap).forEach(([key, tf]) => {
          const rsi = (rsiData as any)[key] || 50;
          if (Math.abs((this.lastRSI.get(tf) || 50) - rsi) > 0.5) {
            this.lastRSI.set(tf, rsi);
            this.dashboard.updateMarketData(tf, { rsi });
          }
        });
      } else {
        this.logger.debug('⚠️ [DASHBOARD] RSIAnalyzer.calculateAll() returned empty/null');
      }
    } catch (error) {
      this.logger.debug('❌ [DASHBOARD] RSI update error', { error: error instanceof Error ? error.message : String(error) });
    }
  }

  private async updateEMADataAsync(): Promise<void> {
    if (!this.emaAnalyzer) {
      this.logger.debug('⚠️ [DASHBOARD] EMAAnalyzer not available');
      return;
    }

    try {
      // Call calculateAll() directly to preserve 'this' context
      const emaData = await (this.emaAnalyzer as any).calculateAll();
      if (emaData) {
        this.logger.debug('📊 [DASHBOARD] EMA data received', { keys: Object.keys(emaData).join(', ') });
        const timeframeMap: Record<string, string> = {
          entry: '1m',
          primary: '5m',
          trend1: '15m',
          trend2: '30m',
        };

        Object.entries(timeframeMap).forEach(([key, tf]) => {
          const emaValues = (emaData as any)[key];
          if (emaValues) {
            const fast = emaValues.fast || 0;
            const slow = emaValues.slow || 0;

            const lastEma = this.lastEMA.get(tf);
            if (!lastEma || Math.abs(lastEma.fast - fast) > 0.0001) {
              this.lastEMA.set(tf, { fast, slow });
              this.dashboard.updateMarketData(tf, { emaFast: fast, emaSlow: slow });
            }
          }
        });
      } else {
        this.logger.debug('⚠️ [DASHBOARD] EMAAnalyzer.calculateAll() returned empty/null');
      }
    } catch (error) {
      this.logger.debug('❌ [DASHBOARD] EMA update error', { error: error instanceof Error ? error.message : String(error) });
    }
  }

  private updatePositionPnLData(): void {
    try {
      this.updatePositionData();
      this.updatePnLData();
    } catch (error) {
      // Ignore errors
    }
  }

  private updatePositionData(position?: Position): void {
    if (!this.positionManager && !position) return;

    try {
      const currentPosition =
        position || (this.positionManager as any).getCurrentPosition?.();

      if (currentPosition) {
        this.dashboard.updatePosition(currentPosition);
        this.dashboard.setEntryPrice(currentPosition.entryPrice);

        if (currentPosition.tpLevels) {
          this.dashboard.setTakeProfits(currentPosition.tpLevels);
        }

        if (currentPosition.stopLoss) {
          this.dashboard.setStopLoss(currentPosition.stopLoss);
        }
      } else {
        this.dashboard.updatePosition(undefined);
      }
    } catch (error) {
      // Ignore errors
    }
  }

  private updatePnLData(): void {
    if (!this.positionManager) return;

    try {
      const currentPosition = (this.positionManager as any).getCurrentPosition?.();
      if (currentPosition && this.lastPrice > 0) {
        const entryPrice = currentPosition.entryPrice;
        const currentPrice = this.lastPrice;

        let pnlPercent = 0;
        if (currentPosition.side === 'LONG') {
          pnlPercent = ((currentPrice - entryPrice) / entryPrice) * 100;
        } else {
          pnlPercent = ((entryPrice - currentPrice) / entryPrice) * 100;
        }

        const positionSize = currentPosition.quantity || 0;
        const pnl = (pnlPercent / 100) * positionSize;

        this.dashboard.updatePnL(pnl, pnlPercent);
      }
    } catch (error) {
      // Ignore errors
    }
  }

  private detectCurrentPattern(): string {
    if (this.detectedPatterns.length > 0) {
      return this.detectedPatterns[this.detectedPatterns.length - 1];
    }
    return '-';
  }

  public addPattern(pattern: string): void {
    this.detectedPatterns.push(pattern);
    if (this.detectedPatterns.length > 5) {
      this.detectedPatterns.shift();
    }
    this.dashboard.addPattern(pattern);
  }

  public destroy(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
  }
}
