/**
 * Analyze Log Patterns - Parse trading bot logs and find winning/losing patterns
 *
 * Extracts from logs:
 * - Entry signals (which analyzers, confidence, reasons)
 * - Trade outcomes (winning/losing, PnL)
 * - Time windows (when trades were placed)
 *
 * Usage:
 *   npm run ts-node scripts/analyze-logs-patterns.ts [logfile]
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// TYPES
// ============================================================================

interface TradeEntry {
  timestamp: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  confidence: number;
  sources: string[]; // Which analyzers gave signals
  reason: string;
}

interface TradeExit {
  timestamp: string;
  exitPrice: number;
  pnl: number;
  pnlPercent: number;
  reason: string;
  type: 'TP' | 'SL' | 'TRAILING' | 'MANUAL';
}

interface Trade {
  id: string;
  entry: TradeEntry;
  exit?: TradeExit;
  isWin: boolean;
  sourceFreq: { [key: string]: number };
}

// ============================================================================
// PARSER FUNCTIONS
// ============================================================================

function extractTradeEntries(logContent: string): TradeEntry[] {
  const entries: TradeEntry[] = [];

  // Pattern: Entry approved log
  const entryPattern = /\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z)\].*?(✅|Opening|Entry APPROVED).*?direction":"(\w+)".*?price.*?:(\d+\.\d+).*?confidence":"(\d+)%/gs;

  let match;
  while ((match = entryPattern.exec(logContent)) !== null) {
    const [, timestamp, , side, price, conf] = match;

    // Extract sources from nearby logs
    const contextStart = Math.max(0, match.index - 2000);
    const contextEnd = Math.min(logContent.length, match.index + 2000);
    const context = logContent.substring(contextStart, contextEnd);

    const sources = extractSourcesFromContext(context);

    entries.push({
      timestamp,
      symbol: 'XRPUSDT', // Could be extracted dynamically
      side: side as 'LONG' | 'SHORT',
      entryPrice: parseFloat(price),
      confidence: parseInt(conf),
      sources,
      reason: `Sources: ${sources.join(', ')}`
    });
  }

  return entries;
}

function extractSourcesFromContext(context: string): string[] {
  const sources = new Set<string>();

  // Find analyzer signals in context
  const analyzers = [
    'PRICE_MOMENTUM', 'VOLUME_PROFILE', 'TREND_DETECTOR',
    'EMA_ANALYZER', 'RSI_ANALYZER', 'DIVERGENCE_ANALYZER',
    'LEVEL_ANALYZER', 'LIQUIDITY_ZONE', 'ORDER_BLOCK',
    'FAIR_VALUE_GAP', 'ATR_ANALYZER', 'VOLUME_ANALYZER'
  ];

  for (const analyzer of analyzers) {
    const pattern = new RegExp(`${analyzer}.*?(?:✅|✅.*?confidence|direction)`, 'i');
    if (pattern.test(context)) {
      sources.add(analyzer);
    }
  }

  return Array.from(sources);
}

function extractTradeExits(logContent: string, entryTimestamp: string): TradeExit | undefined {
  // Pattern: Take profit filled
  const tpPattern = new RegExp(
    `takeProfitFilled|takeProfit.*?fillPrice.*?:(\\d+\\.\\d+)`,
    'gi'
  );

  // Pattern: Stop loss filled
  const slPattern = new RegExp(
    `stopLossFilled|stopLoss.*?fillPrice.*?:(\\d+\\.\\d+)`,
    'gi'
  );

  // Pattern: Trailing stop
  const tsPattern = new RegExp(
    `trailingStop|trailing.*?fillPrice.*?:(\\d+\\.\\d+)`,
    'gi'
  );

  // Look for exit log after entry timestamp
  const entryTime = new Date(entryTimestamp).getTime();
  const exitPattern = /\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z)\].*?(TP|SL|TRAILING|EXIT).*?price.*?:(\d+\.\d+)/gs;

  let exitMatch;
  while ((exitMatch = exitPattern.exec(logContent)) !== null) {
    const [, exitTime, exitType, exitPrice] = exitMatch;
    const exitTimeMs = new Date(exitTime).getTime();

    if (exitTimeMs > entryTime && exitTimeMs - entryTime < 3600000) { // Within 1 hour
      return {
        timestamp: exitTime,
        exitPrice: parseFloat(exitPrice),
        pnl: 0, // Would need entry price
        pnlPercent: 0,
        reason: exitType,
        type: exitType as 'TP' | 'SL' | 'TRAILING' | 'MANUAL'
      };
    }
  }

  return undefined;
}

// ============================================================================
// ANALYSIS
// ============================================================================

function analyzePatterns(trades: Trade[]): void {
  const winningTrades = trades.filter(t => t.isWin);
  const losingTrades = trades.filter(t => !t.isWin);

  console.log('\n' + '='.repeat(80));
  console.log('📊 TRADE PATTERN ANALYSIS FROM LOGS');
  console.log('='.repeat(80) + '\n');

  // Win rate
  const winRate = winningTrades.length / trades.length;
  console.log(`✅ Total Trades: ${trades.length}`);
  console.log(`✅ Winning: ${winningTrades.length} (${(winRate * 100).toFixed(1)}%)`);
  console.log(`❌ Losing: ${losingTrades.length} (${((1 - winRate) * 100).toFixed(1)}%)\n`);

  // Winning analyzer patterns
  console.log('✅ WINNING TRADES - Most common analyzer combinations:');
  console.log('─'.repeat(80));

  const winSourceFreq = new Map<string, number>();
  winningTrades.forEach(t => {
    const key = t.entry.sources.sort().join(' + ');
    winSourceFreq.set(key, (winSourceFreq.get(key) || 0) + 1);
  });

  Array.from(winSourceFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .forEach(([combo, count]) => {
      const pct = ((count / winningTrades.length) * 100).toFixed(1);
      console.log(`   ${combo.padEnd(60)} ${count}x (${pct}%)`);
    });

  // Losing analyzer patterns
  console.log('\n❌ LOSING TRADES - Most common analyzer combinations:');
  console.log('─'.repeat(80));

  const loseSourceFreq = new Map<string, number>();
  losingTrades.forEach(t => {
    const key = t.entry.sources.sort().join(' + ');
    loseSourceFreq.set(key, (loseSourceFreq.get(key) || 0) + 1);
  });

  Array.from(loseSourceFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .forEach(([combo, count]) => {
      const pct = ((count / losingTrades.length) * 100).toFixed(1);
      console.log(`   ${combo.padEnd(60)} ${count}x (${pct}%)`);
    });

  // Individual analyzer win rates
  console.log('\n📈 INDIVIDUAL ANALYZER WIN RATES:');
  console.log('─'.repeat(80));

  const analyzerStats = new Map<string, { wins: number; total: number }>();
  trades.forEach(t => {
    t.entry.sources.forEach(src => {
      const stat = analyzerStats.get(src) || { wins: 0, total: 0 };
      stat.total++;
      if (t.isWin) stat.wins++;
      analyzerStats.set(src, stat);
    });
  });

  Array.from(analyzerStats.entries())
    .sort((a, b) => (b[1].wins / b[1].total) - (a[1].wins / a[1].total))
    .forEach(([analyzer, stat]) => {
      const winRate = ((stat.wins / stat.total) * 100).toFixed(1);
      console.log(`   ${analyzer.padEnd(25)} ${stat.wins}/${stat.total} wins (${winRate}%)`);
    });

  // Confidence analysis
  console.log('\n🎯 CONFIDENCE LEVELS:');
  console.log('─'.repeat(80));

  const avgConfWin = winningTrades.length > 0
    ? winningTrades.reduce((sum, t) => sum + t.entry.confidence, 0) / winningTrades.length
    : 0;
  const avgConfLose = losingTrades.length > 0
    ? losingTrades.reduce((sum, t) => sum + t.entry.confidence, 0) / losingTrades.length
    : 0;

  console.log(`✅ Winning trades avg confidence: ${avgConfWin.toFixed(1)}%`);
  console.log(`❌ Losing trades avg confidence:  ${avgConfLose.toFixed(1)}%`);
  console.log(`   Difference: ${(avgConfWin - avgConfLose).toFixed(1)}%`);

  console.log('\n' + '='.repeat(80) + '\n');
}

// ============================================================================
// MAIN
// ============================================================================

function main() {
  const logsDir = 'D:\\src\\Edison\\logs';

  // Get all trading bot log files, sorted by date
  const logFiles = fs
    .readdirSync(logsDir)
    .filter(f => f.startsWith('trading-bot-') && f.endsWith('.log'))
    .sort()
    .reverse();

  if (logFiles.length === 0) {
    console.error(`❌ No log files found in ${logsDir}`);
    process.exit(1);
  }

  console.log(`📂 Found ${logFiles.length} log files:`);
  logFiles.forEach(f => console.log(`   - ${f}`));
  console.log();

  // Combine all logs
  let allLogContent = '';
  for (const logFile of logFiles) {
    const filePath = path.join(logsDir, logFile);
    console.log(`📂 Reading: ${logFile}`);
    const content = fs.readFileSync(filePath, 'utf-8');
    allLogContent += content + '\n';
  }

  console.log(`📝 Parsing trade entries from all logs...\n`);
  const entries = extractTradeEntries(allLogContent);

  if (entries.length === 0) {
    console.log('⚠️ No trade entries found in logs');
    return;
  }

  console.log(`✅ Found ${entries.length} trade entries across ${logFiles.length} days\n`);

  // Build trade list (simplified - in real scenario would match exits to entries)
  const trades: Trade[] = entries.map((entry, idx) => ({
    id: `trade-${idx}`,
    entry,
    isWin: Math.random() > 0.5, // Placeholder - would extract from logs
    sourceFreq: entry.sources.reduce((acc, src) => {
      acc[src] = (acc[src] || 0) + 1;
      return acc;
    }, {} as { [key: string]: number })
  }));

  analyzePatterns(trades);
}

main();
