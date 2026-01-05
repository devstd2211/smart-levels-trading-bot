/**
 * Console Dashboard Service
 * Provides real-time live trading dashboard in terminal using blessed
 * Updates in real-time without interfering with logs
 */

import blessed, { Widgets } from 'blessed';
import { EventEmitter } from 'events';
import { MarketData, Position, Signal } from '../types';

interface DashboardConfig {
  enabled: boolean;
  updateInterval?: number; // ms between refreshes
  theme?: 'dark' | 'light';
}

interface TimeframeData {
  timeframe: string;
  trend: string;
  rsi: number;
  emaFast: number;
  emaSlow: number;
  pattern: string;
}

interface DashboardState {
  marketData: Map<string, TimeframeData>;
  currentPrice: number;
  position?: Position;
  entryPrice?: number;
  currentPnL?: number;
  currentPnLPercent?: number;
  tpLevels: Array<{ level: number; percent: number; reached: boolean }>;
  slLevel?: number;
  patterns: string[];
  logs: Array<{ level: string; message: string; timestamp: Date }>;
  lastUpdate: Date;
}

export class ConsoleDashboardService extends EventEmitter {
  private screen?: Widgets.Screen;
  private config: DashboardConfig;
  private state: DashboardState;
  private widgets: Map<string, Widgets.BoxElement> = new Map();
  private updateTimer?: NodeJS.Timeout;

  constructor(config: DashboardConfig = { enabled: true }) {
    super();
    this.config = config;
    this.state = {
      marketData: new Map(),
      currentPrice: 0,
      tpLevels: [],
      patterns: [],
      logs: [],
      lastUpdate: new Date(),
    };

    if (this.config.enabled) {
      this.initialize();
    }
  }

  private initialize(): void {
    try {
      // Create screen
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
      this.startUpdating();
      console.log('[DASHBOARD] ✅ Console dashboard initialized successfully');
    } catch (error) {
      console.warn(
        '[DASHBOARD] ⚠️ Failed to initialize dashboard UI (logs will continue):',
        error instanceof Error ? error.message : String(error),
      );
      // Dashboard fails silently - logs continue working
      this.config.enabled = false;
    }
  }

  private createLayout(): void {
    if (!this.screen) return;

    // Header
    this.createHeader();

    // Main content area - split into sections
    this.createMarketSection();
    this.createPositionSection();
    this.createPatternsSection();
    this.createLogsPlaceholder();

    this.screen.render();
  }

  private createHeader(): void {
    if (!this.screen) return;

    const header = blessed.box({
      parent: this.screen,
      top: 0,
      left: 0,
      right: 0,
      height: 3,
      content: '{bold}{cyan-fg}📊 EDISON TRADING DASHBOARD{/cyan-fg}{/bold}',
      style: {
        fg: 'cyan',
        bg: 'blue',
      },
      tags: true,
    });

    this.widgets.set('header', header);
  }

  private createMarketSection(): void {
    if (!this.screen) return;

    const market = blessed.box({
      parent: this.screen,
      top: 3,
      left: 0,
      width: '50%',
      height: '35%',
      border: 'line',
      title: '📈 Market Data (Multi-Timeframe)',
      style: {
        border: {
          fg: 'cyan',
        },
      },
      scrollable: false,
      tags: true,
    });

    this.widgets.set('market', market);
  }

  private createPositionSection(): void {
    if (!this.screen) return;

    const position = blessed.box({
      parent: this.screen,
      top: 3,
      left: '50%',
      right: 0,
      height: '35%',
      border: 'line',
      title: '💼 Position',
      style: {
        border: {
          fg: 'green',
        },
      },
      tags: true,
    });

    this.widgets.set('position', position);
  }

  private createPatternsSection(): void {
    if (!this.screen) return;

    const patterns = blessed.box({
      parent: this.screen,
      top: '38%',
      left: 0,
      right: 0,
      height: '25%',
      border: 'line',
      title: '🎯 Detected Patterns',
      style: {
        border: {
          fg: 'yellow',
        },
      },
      tags: true,
    });

    this.widgets.set('patterns', patterns);
  }

  private createLogsPlaceholder(): void {
    if (!this.screen) return;

    const logs = blessed.box({
      parent: this.screen,
      top: '63%',
      left: 0,
      right: 0,
      bottom: 0,
      border: 'line',
      title: '📝 Live Logs',
      style: {
        border: {
          fg: 'magenta',
        },
      },
      scrollable: true,
      mouse: true,
      tags: true,
      keys: true,
      vi: true,
    });

    this.widgets.set('logs', logs);
  }

  private startUpdating(): void {
    this.updateTimer = setInterval(() => {
      this.render();
    }, this.config.updateInterval || 1000);
  }

  private render(): void {
    if (!this.screen || !this.config.enabled) return;

    try {
      this.renderMarketData();
      this.renderPosition();
      this.renderPatterns();
      this.renderLogs();
      this.screen.render();
    } catch (error) {
      // Silently fail - don't break the bot
      // Dashboard errors should never crash the trading bot
    }
  }

  private renderMarketData(): void {
    const marketWidget = this.widgets.get('market');
    if (!marketWidget) return;

    let content = '';
    const timeframes = ['1m', '5m', '15m', '30m', '1h'];

    content += '{bold}Timeframe  │ Trend      │ RSI  │ EMA F/S        │ Pattern{/bold}\n';
    content += '─'.repeat(70) + '\n';

    timeframes.forEach((tf) => {
      const data = this.state.marketData.get(tf);
      if (data) {
        const trendText = data.trend.includes('UP') ? `{green-fg}${data.trend}{/green-fg}` : `{red-fg}${data.trend}{/red-fg}`;
        const rsiText =
          data.rsi > 70 || data.rsi < 30
            ? `{yellow-fg}${data.rsi.toFixed(0)}{/yellow-fg}`
            : `${data.rsi.toFixed(0)}`;

        content += `${tf.padEnd(10)}│ ${trendText.padEnd(20)}│ ${rsiText.padEnd(4)} │ ${data.emaFast.toFixed(4)}/${data.emaSlow.toFixed(4)} │ ${data.pattern}\n`;
      }
    });

    content += `\n{bold}Current Price: {cyan-fg}${this.state.currentPrice.toFixed(4)}{/cyan-fg}{/bold}`;

    marketWidget.setContent(content);
  }

  private renderPosition(): void {
    const posWidget = this.widgets.get('position');
    if (!posWidget) return;

    if (!this.state.position) {
      posWidget.setContent('{yellow-fg}No active position{/yellow-fg}');
      return;
    }

    let content = '';
    const isOpen = (this.state.position as any).isOpen ?? true;
    const statusText = isOpen ? `{green-fg}OPEN{/green-fg}` : `{red-fg}CLOSED{/red-fg}`;
    content += `{bold}Status:{/bold} ${statusText}\n`;
    content += `\n{bold}Entry Price:{/bold} ${this.state.entryPrice?.toFixed(4)}\n`;
    content += `{bold}Current Price:{/bold} ${this.state.currentPrice.toFixed(4)}\n`;

    const pnlPercent = this.state.currentPnLPercent || 0;
    const pnlText =
      pnlPercent >= 0
        ? `{green-fg}${pnlPercent.toFixed(2)}% ($${this.state.currentPnL?.toFixed(2)}){/green-fg}`
        : `{red-fg}${pnlPercent.toFixed(2)}% ($${this.state.currentPnL?.toFixed(2)}){/red-fg}`;
    content += `\n{bold}Current P&L:{/bold} ${pnlText}\n`;

    content += '\n{bold}Take Profits:{/bold}\n';
    this.state.tpLevels.forEach((tp, idx) => {
      const reachedText = tp.reached ? '{green-fg}✓{/green-fg}' : ' ';
      content += `  TP${idx + 1}: ${tp.level.toFixed(4)} (${tp.percent}%) ${reachedText}\n`;
    });

    if (this.state.slLevel) {
      content += `\n{bold}Stop Loss:{/bold} ${this.state.slLevel.toFixed(4)}\n`;
    }

    posWidget.setContent(content);
  }

  private renderPatterns(): void {
    const patternsWidget = this.widgets.get('patterns');
    if (!patternsWidget) return;

    if (this.state.patterns.length === 0) {
      patternsWidget.setContent('{yellow-fg}No patterns detected{/yellow-fg}');
      return;
    }

    let content = '{bold}Detected Patterns:{/bold}\n';
    this.state.patterns.forEach((pattern) => {
      content += `  {green-fg}✓{/green-fg} ${pattern}\n`;
    });

    patternsWidget.setContent(content);
  }

  // Public methods for updating state
  public updateMarketData(
    timeframe: string,
    data: Partial<TimeframeData>
  ): void {
    const existing = this.state.marketData.get(timeframe) || {
      timeframe,
      trend: 'NEUTRAL',
      rsi: 50,
      emaFast: 0,
      emaSlow: 0,
      pattern: '-',
    };

    this.state.marketData.set(timeframe, {
      ...existing,
      ...data,
    });
    this.state.lastUpdate = new Date();
  }

  public updatePrice(price: number): void {
    this.state.currentPrice = price;
  }

  public updatePosition(position: Position | undefined): void {
    this.state.position = position;
  }

  public setEntryPrice(price: number): void {
    this.state.entryPrice = price;
  }

  public updatePnL(pnl: number, pnlPercent: number): void {
    this.state.currentPnL = pnl;
    this.state.currentPnLPercent = pnlPercent;
  }

  public setTakeProfits(
    levels: Array<{ level?: number; percent: number; reached?: boolean }>
  ): void {
    this.state.tpLevels = levels.map((l, idx) => ({
      level: l.level ?? idx + 1,
      percent: l.percent,
      reached: l.reached ?? false,
    }));
  }

  public setStopLoss(level: number): void {
    this.state.slLevel = level;
  }

  public addPattern(pattern: string): void {
    if (!this.state.patterns.includes(pattern)) {
      this.state.patterns.push(pattern);
      // Keep only last 5 patterns
      if (this.state.patterns.length > 5) {
        this.state.patterns.shift();
      }
    }
  }

  public clearPatterns(): void {
    this.state.patterns = [];
  }

  private renderLogs(): void {
    const logsWidget = this.widgets.get('logs');
    if (!logsWidget) return;

    // Show last 20 logs
    const lastLogs = this.state.logs.slice(-20);
    let content = '';

    lastLogs.forEach((log) => {
      const levelColor = this.getLevelColor(log.level);
      const time = log.timestamp.toLocaleTimeString();
      content += `${levelColor}[${time}] ${log.level.toUpperCase()}{/${this.getLevelColorClose(log.level)}} ${log.message}\n`;
    });

    logsWidget.setContent(content || '{yellow-fg}No logs yet...{/yellow-fg}');
  }

  private getLevelColor(level: string): string {
    switch (level.toLowerCase()) {
      case 'error':
        return '{red-fg}';
      case 'warn':
        return '{yellow-fg}';
      case 'info':
        return '{cyan-fg}';
      case 'debug':
        return '{gray-fg}';
      default:
        return '{white-fg}';
    }
  }

  private getLevelColorClose(level: string): string {
    switch (level.toLowerCase()) {
      case 'error':
        return 'red-fg}';
      case 'warn':
        return 'yellow-fg}';
      case 'info':
        return 'cyan-fg}';
      case 'debug':
        return 'gray-fg}';
      default:
        return 'white-fg}';
    }
  }

  public addLog(level: string, message: string): void {
    this.state.logs.push({
      level,
      message: message.substring(0, 100), // Truncate long messages
      timestamp: new Date(),
    });

    // Keep only last 100 logs in memory
    if (this.state.logs.length > 100) {
      this.state.logs.shift();
    }
  }

  public destroy(): void {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
    }
    if (this.screen) {
      this.screen.destroy();
    }
  }
}
