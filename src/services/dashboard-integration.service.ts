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
      this.updatePositionData(data?.position);
      this.dashboard.addPattern('Position Opened');
    });

    this.eventBus.on('position-closed', (data: any) => {
      this.dashboard.updatePosition(undefined);
      this.dashboard.addPattern('Position Closed');
    });

    // Entry signal events
    this.eventBus.on('entry-signal', (data: any) => {
      if (data?.signal) {
        this.dashboard.addPattern(`Signal: ${data.signal.direction}`);
      }
    });

    // Price updates via WebSocket
    if (this.publicWebSocket) {
      this.publicWebSocket.on('candleClosed', (data: any) => {
        if (data?.candle?.close) {
          this.lastPrice = data.candle.close;
          this.dashboard.updatePrice(data.candle.close);
        }
      });
    }

    // Candle updates
    this.eventBus.on('candle-closed', (data: any) => {
      if (data?.candle?.close) {
        this.lastPrice = data.candle.close;
        this.dashboard.updatePrice(data.candle.close);
      }
    });
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
      this.updateAllData();
    }, 1000); // Update every second
  }

  private updateAllData(): void {
    try {
      this.updateTrendData();
      this.updateRSIData();
      this.updateEMAData();
      this.updatePositionData();
      this.updatePnLData();
    } catch (error) {
      // Silently fail - don't break the bot
    }
  }

  private updateTrendData(): void {
    if (!this.trendAnalyzer) return;

    try {
      // Get current analysis from trend analyzer
      const analysis = (this.trendAnalyzer as any).lastAnalysis;
      if (analysis && analysis.bias) {
        const timeframe = (this.trendAnalyzer as any).timeframe || '5m';

        const trend =
          analysis.bias === 'BULLISH' ? 'UPTREND ↑' : 'DOWNTREND ↓';

        if (this.lastTrend.get(timeframe) !== trend) {
          this.lastTrend.set(timeframe, trend);
          this.dashboard.updateMarketData(timeframe, {
            timeframe,
            trend,
            pattern: this.detectCurrentPattern(),
          });
        }
      }
    } catch (error) {
      // Ignore errors
    }
  }

  private updateRSIData(): void {
    if (!this.rsiAnalyzer) return;

    try {
      const rsiData = (this.rsiAnalyzer as any).getCurrentRSI?.();
      if (rsiData) {
        const timeframes = ['1m', '5m', '15m', '30m'];
        timeframes.forEach((tf) => {
          const rsi = rsiData[tf] || 50;
          if (Math.abs((this.lastRSI.get(tf) || 50) - rsi) > 0.5) {
            this.lastRSI.set(tf, rsi);
            this.dashboard.updateMarketData(tf, { rsi });
          }
        });
      }
    } catch (error) {
      // Ignore errors
    }
  }

  private updateEMAData(): void {
    if (!this.emaAnalyzer) return;

    try {
      const emaData = (this.emaAnalyzer as any).getCurrentEMA?.();
      if (emaData) {
        const timeframes = ['1m', '5m', '15m', '30m'];
        timeframes.forEach((tf) => {
          const fast = emaData.fast?.[tf] || 0;
          const slow = emaData.slow?.[tf] || 0;

          const lastEma = this.lastEMA.get(tf);
          if (!lastEma || Math.abs(lastEma.fast - fast) > 0.0001) {
            this.lastEMA.set(tf, { fast, slow });
            this.dashboard.updateMarketData(tf, { emaFast: fast, emaSlow: slow });
          }
        });
      }
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
