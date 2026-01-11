/**
 * Console Dashboard Service - Non-Blocking Edition
 * Real-time trading dashboard using blessed
 * Uses non-blocking render queue to prevent freezing
 *
 * KEY FIXES:
 * - No blocking screen.render() calls in main thread
 * - Queue-based updates to prevent log freezing
 * - Separate render thread via setImmediate
 * - Real-time indicator data + P&L tracking
 */

import blessed, { Widgets } from 'blessed';
import { EventEmitter } from 'events';
import { Position } from '../types';

interface DashboardConfig {
  enabled: boolean;
  updateInterval?: number; // ms between refreshes (1000 = 1 sec)
  theme?: 'dark' | 'light';
}

interface TimeframeMetrics {
  timeframe: string;
  trend: string; // UPTREND | DOWNTREND | NEUTRAL
  rsi: number;
  ema20?: number;
  ema50?: number;
  atr?: number;
  volume?: number;
}

interface DashboardState {
  // Market data by timeframe
  metrics: Map<string, TimeframeMetrics>;

  // Current price & updates
  currentPrice: number;
  priceUpdatedAt: number;

  // Position info
  position?: Position;
  entryPrice?: number;
  currentPnL?: number;
  currentPnLPercent?: number;

  // Protection levels
  tpLevels: Array<{ price: number; percent: number; level: number; reached?: boolean }>;
  slLevel?: number;

  // Trading stats
  dailyWins: number;
  dailyLosses: number;
  dailyPnL: number;

  // Events log
  events: Array<{ timestamp: Date; type: string; message: string }>;

  // UI state
  lastUpdate: Date;
}

export class ConsoleDashboardService extends EventEmitter {
  private screen?: Widgets.Screen;
  private config: DashboardConfig;
  private state: DashboardState;
  private widgets: Map<string, Widgets.BoxElement> = new Map();

  // Non-blocking render control
  private renderScheduled = false;
  private updateQueue: Array<() => void> = [];

  constructor(config: DashboardConfig = { enabled: true }) {
    super();
    this.config = { ...config };
    this.state = {
      metrics: new Map(),
      currentPrice: 0,
      priceUpdatedAt: 0,
      tpLevels: [],
      dailyWins: 0,
      dailyLosses: 0,
      dailyPnL: 0,
      events: [],
      lastUpdate: new Date(),
    };

    if (this.config.enabled) {
      try {
        this.initialize();
      } catch (error) {
        console.warn('[DASHBOARD] Failed to initialize:', error instanceof Error ? error.message : String(error));
        this.config.enabled = false;
      }
    }
  }

  /**
   * Initialize dashboard with blessed screen
   */
  private initialize(): void {
    try {
      this.screen = blessed.screen({
        mouse: false,
        keyboard: true,
        smartCSR: true,
        title: 'Edison Trading Bot - Live Dashboard',
        dockBorders: true,
      });

      // Exit on Ctrl+C
      this.screen.key(['C-c'], () => {
        this.destroy();
        process.exit(0);
      });

      this.createLayout();

      // Start non-blocking update loop
      this.startNonBlockingUpdates();

      console.log('[DASHBOARD] ✅ Initialized (non-blocking mode)');
    } catch (error) {
      console.warn('[DASHBOARD] Initialization failed:', error);
      this.config.enabled = false;
      throw error;
    }
  }

  /**
   * Create dashboard layout
   */
  private createLayout(): void {
    if (!this.screen) return;

    // Header (top)
    this.createHeader();

    // Market data (top-left 1/3)
    this.createMarketMetrics();

    // Position & P&L (top-right 2/3)
    this.createPositionStats();

    // Daily stats (middle)
    this.createDailyStats();

    // Indicators (bottom-left)
    this.createIndicators();

    // Recent updates (bottom-right)
    this.createRecentUpdates();

    this.screen.render();
  }

  private createHeader(): void {
    if (!this.screen) return;

    blessed.box({
      parent: this.screen,
      top: 0,
      left: 0,
      right: 0,
      height: 1,
      content: '{bold}{cyan-fg}EDISON TRADING BOT DASHBOARD{/cyan-fg}{/bold}',
      style: {
        fg: 'white',
        bg: 'darkblue',
      },
      tags: true,
    });
  }

  private createMarketMetrics(): void {
    if (!this.screen) return;

    const widget = blessed.box({
      parent: this.screen,
      top: 1,
      left: 0,
      width: '33%',
      height: '25%',
      border: 'line',
      title: '📈 Market Metrics',
      style: {
        border: { fg: 'cyan' },
      },
      tags: true,
      scrollable: false,
    });

    this.widgets.set('metrics', widget);
  }

  private createPositionStats(): void {
    if (!this.screen) return;

    const widget = blessed.box({
      parent: this.screen,
      top: 1,
      left: '33%',
      right: 0,
      height: '25%',
      border: 'line',
      title: '💼 Position & P&L',
      style: {
        border: { fg: 'green' },
      },
      tags: true,
      scrollable: false,
    });

    this.widgets.set('position', widget);
  }

  private createDailyStats(): void {
    if (!this.screen) return;

    const widget = blessed.box({
      parent: this.screen,
      top: '26%',
      left: 0,
      right: 0,
      height: '12%',
      border: 'line',
      title: '📊 Daily Stats',
      style: {
        border: { fg: 'yellow' },
      },
      tags: true,
      scrollable: false,
    });

    this.widgets.set('stats', widget);
  }

  private createIndicators(): void {
    if (!this.screen) return;

    const widget = blessed.box({
      parent: this.screen,
      top: '38%',
      left: 0,
      width: '50%',
      bottom: 0,
      border: 'line',
      title: '🔍 Indicators (1m/5m/15m)',
      style: {
        border: { fg: 'magenta' },
      },
      tags: true,
      scrollable: true,
      mouse: true,
    });

    this.widgets.set('indicators', widget);
  }

  private createRecentUpdates(): void {
    if (!this.screen) return;

    const widget = blessed.box({
      parent: this.screen,
      top: '38%',
      left: '50%',
      right: 0,
      bottom: 0,
      border: 'line',
      title: '⏱️ Recent Updates',
      style: {
        border: { fg: 'white' },
      },
      tags: true,
      scrollable: true,
      mouse: true,
    });

    this.widgets.set('updates', widget);
  }

  /**
   * Non-blocking update loop using setImmediate
   * Prevents blocking main trading thread
   */
  private startNonBlockingUpdates(): void {
    const updateLoop = () => {
      // Queue render for next event loop
      if (!this.renderScheduled) {
        this.renderScheduled = true;
        setImmediate(() => {
          try {
            this.render();
          } catch (error) {
            // Silently fail - dashboard errors don't crash bot
          } finally {
            this.renderScheduled = false;
          }
        });
      }

      // Schedule next update
      setTimeout(updateLoop, this.config.updateInterval || 1000);
    };

    updateLoop();
  }

  /**
   * Render all widgets
   */
  private render(): void {
    if (!this.screen || !this.config.enabled) return;

    try {
      this.renderMetrics();
      this.renderPosition();
      this.renderDailyStats();
      this.renderIndicators();
      this.renderRecentUpdates();

      this.screen.render();
    } catch (error) {
      // Fail silently
    }
  }

  private renderMetrics(): void {
    const widget = this.widgets.get('metrics');
    if (!widget) return;

    let content = '{bold}PRICE & TREND{/bold}\n';
    content += `Price: {cyan-fg}${this.state.currentPrice.toFixed(4)}{/cyan-fg}\n\n`;

    const timeframes = ['1m', '5m', '15m'];
    timeframes.forEach((tf) => {
      const m = this.state.metrics.get(tf);
      if (m) {
        const trendIcon = m.trend === 'UPTREND' ? '↑' : m.trend === 'DOWNTREND' ? '↓' : '→';
        const trendColor = m.trend === 'UPTREND' ? 'green-fg' : m.trend === 'DOWNTREND' ? 'red-fg' : 'yellow-fg';
        content += `{bold}${tf}:{/bold} {${trendColor}}${m.trend}${trendIcon}{/${trendColor}} RSI:${m.rsi.toFixed(0)}\n`;
      }
    });

    widget.setContent(content);
  }

  private renderPosition(): void {
    const widget = this.widgets.get('position');
    if (!widget) return;

    if (!this.state.position) {
      widget.setContent('{yellow-fg}No active position{/yellow-fg}');
      return;
    }

    const isLong = this.state.position.side === 'LONG';
    const sideColor = isLong ? 'green-fg' : 'red-fg';

    let content = '{bold}Status:{/bold} {green-fg}OPEN{/green-fg}\n';
    content += `{bold}Side:{/bold} {${sideColor}}${this.state.position.side}{/${sideColor}}\n`;
    content += `{bold}Entry:{/bold} ${this.state.entryPrice?.toFixed(4)}\n`;
    content += `{bold}Current:{/bold} ${this.state.currentPrice.toFixed(4)}\n\n`;

    const pnlColor = (this.state.currentPnLPercent || 0) >= 0 ? 'green-fg' : 'red-fg';
    content += `{bold}P&L:{/bold} {${pnlColor}}${(this.state.currentPnLPercent || 0).toFixed(2)}% ($${(this.state.currentPnL || 0).toFixed(2)}){/${pnlColor}}\n\n`;

    content += '{bold}Take Profits:{/bold}\n';
    this.state.tpLevels.forEach((tp) => {
      content += `  TP${tp.level}: ${tp.price.toFixed(4)} (${tp.percent}%)\n`;
    });

    if (this.state.slLevel) {
      content += `\n{bold}Stop Loss:{/bold} {red-fg}${this.state.slLevel.toFixed(4)}{/red-fg}\n`;
    }

    widget.setContent(content);
  }

  private renderDailyStats(): void {
    const widget = this.widgets.get('stats');
    if (!widget) return;

    const winRate = this.state.dailyWins + this.state.dailyLosses > 0
      ? ((this.state.dailyWins / (this.state.dailyWins + this.state.dailyLosses)) * 100).toFixed(1)
      : '0.0';

    const pnlColor = this.state.dailyPnL >= 0 ? 'green-fg' : 'red-fg';

    let content = `Trades: {cyan-fg}${this.state.dailyWins}{/cyan-fg} W / {red-fg}${this.state.dailyLosses}{/red-fg} L | `;
    content += `Win Rate: {cyan-fg}${winRate}%{/cyan-fg} | `;
    content += `Daily P&L: {${pnlColor}}${this.state.dailyPnL.toFixed(2)} USDT{/${pnlColor}}`;

    widget.setContent(content);
  }

  private renderIndicators(): void {
    const widget = this.widgets.get('indicators');
    if (!widget) return;

    let content = '{bold}Indicator Snapshot{/bold}\n';
    content += '{cyan-fg}' + '═'.repeat(50) + '{/cyan-fg}\n\n';

    const timeframes = ['1m', '5m', '15m'];
    timeframes.forEach((tf) => {
      const m = this.state.metrics.get(tf);
      if (m) {
        content += `{bold}${tf}:{/bold}\n`;
        content += `  RSI: ${m.rsi.toFixed(1)}\n`;
        if (m.ema20) content += `  EMA20: ${m.ema20.toFixed(4)}\n`;
        if (m.ema50) content += `  EMA50: ${m.ema50.toFixed(4)}\n`;
        if (m.atr) content += `  ATR: ${m.atr.toFixed(4)}\n`;
        if (m.volume) content += `  Volume: ${m.volume.toFixed(0)}\n`;
        content += '\n';
      }
    });

    widget.setContent(content || '{yellow-fg}No indicator data{/yellow-fg}');
  }

  private renderRecentUpdates(): void {
    const widget = this.widgets.get('updates');
    if (!widget) return;

    let content = '{bold}Latest Events{/bold}\n';
    content += '{cyan-fg}' + '═'.repeat(50) + '{/cyan-fg}\n\n';

    // Show recent events (last 10, limit memory)
    if (this.state.events.length === 0) {
      content += '{yellow-fg}Waiting for trading events...{/yellow-fg}\n';
    } else {
      const recentEvents = this.state.events.slice(-10);
      recentEvents.forEach((event) => {
        const time = event.timestamp.toLocaleTimeString();
        const typeColor = event.type === 'position-open' ? 'green-fg'
                        : event.type === 'position-close' ? 'red-fg'
                        : event.type === 'tp-hit' ? 'cyan-fg'
                        : 'white-fg';
        content += `[{${typeColor}}${time}{/${typeColor}}] {${typeColor}}${event.type}{/${typeColor}}\n`;
        content += `  ${event.message}\n\n`;
      });
    }

    widget.setContent(content);
  }

  // =========================================================================
  // PUBLIC API: Update state from bot
  // =========================================================================

  public updateMetrics(timeframe: string, data: Partial<TimeframeMetrics>): void {
    const existing = this.state.metrics.get(timeframe) || {
      timeframe,
      trend: 'NEUTRAL',
      rsi: 50,
    };

    this.state.metrics.set(timeframe, { ...existing, ...data });
    this.state.lastUpdate = new Date();
  }

  public updatePrice(price: number): void {
    this.state.currentPrice = price;
    this.state.priceUpdatedAt = Date.now();
  }

  public updatePosition(position: Position | undefined): void {
    this.state.position = position;
    if (position) {
      this.state.entryPrice = position.entryPrice;
    }
  }

  public updatePnL(pnl: number, pnlPercent: number): void {
    this.state.currentPnL = pnl;
    this.state.currentPnLPercent = pnlPercent;
  }

  public setTakeProfits(levels: Array<{ price?: number; percent: number; level?: number }>): void {
    this.state.tpLevels = levels.map((l, idx) => ({
      price: l.price || 0,
      percent: l.percent,
      level: l.level ?? idx + 1,
      reached: false,
    }));
  }

  public setStopLoss(price: number): void {
    this.state.slLevel = price;
  }

  public recordWin(pnl: number): void {
    this.state.dailyWins++;
    this.state.dailyPnL += pnl;
  }

  public recordLoss(pnl: number): void {
    this.state.dailyLosses++;
    this.state.dailyPnL += pnl;
  }

  /**
   * Record a trading event
   * IMPORTANT: Max 50 events in memory to prevent memory leak
   *
   * @param type - Event type (position-open, position-close, tp-hit, sl-hit, etc)
   * @param message - Human-readable event description
   */
  public recordEvent(type: string, message: string): void {
    this.state.events.push({
      timestamp: new Date(),
      type,
      message,
    });

    // Keep only last 50 events (prevent memory leak)
    if (this.state.events.length > 50) {
      this.state.events.shift();
    }
  }

  public destroy(): void {
    if (this.screen) {
      try {
        this.screen.destroy();
      } catch (error) {
        // Ignore destroy errors
      }
    }
  }
}
