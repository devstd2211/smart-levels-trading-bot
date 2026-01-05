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
    } catch (error) {
      console.error('Failed to initialize dashboard:', error);
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
      content: '{bold}{cyan}📊 EDISON TRADING DASHBOARD{/cyan}{/bold}',
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
      title: '📝 Logs (existing logs below)',
      style: {
        border: {
          fg: 'magenta',
        },
      },
      scrollable: true,
      mouse: true,
      tags: true,
    });

    this.widgets.set('logs', logs);
  }

  private startUpdating(): void {
    this.updateTimer = setInterval(() => {
      this.render();
    }, this.config.updateInterval || 1000);
  }

  private render(): void {
    if (!this.screen) return;

    try {
      this.renderMarketData();
      this.renderPosition();
      this.renderPatterns();
      this.screen.render();
    } catch (error) {
      // Silently fail - don't break the bot
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
        const trendColor = data.trend.includes('UP') ? '{green}' : '{red}';
        const rsiColor =
          data.rsi > 70 || data.rsi < 30 ? '{yellow}' : '{white}';

        content += `${tf.padEnd(10)}│ ${trendColor}${data.trend.padEnd(10)}{/}│ ${rsiColor}${data.rsi.toFixed(0).padEnd(4)}{/} │ ${data.emaFast.toFixed(4)}/${data.emaSlow.toFixed(4)} │ ${data.pattern}\n`;
      }
    });

    content += '\n{bold}Current Price: {cyan}' + this.state.currentPrice.toFixed(4) + '{/cyan}{/bold}';

    marketWidget.setContent(content);
  }

  private renderPosition(): void {
    const posWidget = this.widgets.get('position');
    if (!posWidget) return;

    if (!this.state.position) {
      posWidget.setContent('{yellow}No active position{/yellow}');
      return;
    }

    let content = '';
    const isOpen = (this.state.position as any).isOpen ?? true;
    content += `{bold}Status:{/bold} ${isOpen ? '{green}OPEN{/green}' : '{red}CLOSED{/red}'}\n`;
    content += `\n{bold}Entry Price:{/bold} ${this.state.entryPrice?.toFixed(4)}\n`;
    content += `{bold}Current Price:{/bold} ${this.state.currentPrice.toFixed(4)}\n`;

    const pnlColor =
      (this.state.currentPnLPercent || 0) >= 0 ? '{green}' : '{red}';
    content += `\n{bold}Current P&L:{/bold} ${pnlColor}${this.state.currentPnLPercent?.toFixed(2)}% ($${this.state.currentPnL?.toFixed(2)}){/}\n`;

    content += '\n{bold}Take Profits:{/bold}\n';
    this.state.tpLevels.forEach((tp, idx) => {
      const reached = tp.reached ? '{green}✓{/green}' : ' ';
      content += `  TP${idx + 1}: ${tp.level.toFixed(4)} (${tp.percent}%) ${reached}\n`;
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
      patternsWidget.setContent('{yellow}No patterns detected{/yellow}');
      return;
    }

    let content = '{bold}Detected Patterns:{/bold}\n';
    this.state.patterns.forEach((pattern) => {
      content += `  {green}✓{/green} ${pattern}\n`;
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

  public destroy(): void {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
    }
    if (this.screen) {
      this.screen.destroy();
    }
  }
}
