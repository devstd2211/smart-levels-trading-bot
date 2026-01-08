/**
 * Proper Journal Analysis - Find which analyzers actually made profit
 *
 * Parses trade journal and extracts:
 * - Entry sources (analyzers that gave signal)
 * - Trade outcomes (PnL)
 * - Win rate per analyzer
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// TYPES
// ============================================================================

interface TakeProfit {
  level: number;
  percent: number;
  sizePercent: number;
  price: number;
  hit: boolean;
}

interface Signal {
  type: string;
  direction: string;
  price: number;
  stopLoss: number;
  takeProfits: TakeProfit[];
  confidence: number;
  reason: string;  // ← Contains sources info
  timestamp: number;
}

interface ExitCondition {
  exitType: string;
  price: number;
  timestamp: number;
  reason: string;
  pnlUsdt?: number;
  pnlPercent?: number;
  realizedPnL?: number;
  tpLevelsHit?: number[];
  tpLevelsHitCount?: number;
  holdingTimeMs?: number;
  holdingTimeMinutes?: number;
  stoppedOut?: boolean;
}

interface Trade {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  quantity: number;
  leverage: number;
  entryCondition: {
    signal: Signal;
  };
  openedAt: number;
  status: 'OPEN' | 'CLOSED';
  exitPrice?: number;
  exitCondition?: ExitCondition;
  realizedPnL?: number;
}

interface AnalyzerStats {
  name: string;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnL: number;
  avgPnL: number;
  avgWin: number;
  avgLoss: number;
}

// ============================================================================
// PARSING FUNCTIONS
// ============================================================================

function extractSources(reason: string): string[] {
  // Pattern: "Sources: ANALYZER1(XX%,wY), ANALYZER2(XX%,wZ)"
  const sourcesMatch = reason.match(/Sources:\s*([^\[\]]+?)(?:\s*\[|$)/);
  if (!sourcesMatch) return [];

  return sourcesMatch[1]
    .split(',')
    .map(s => {
      const match = s.trim().match(/^([A-Z_]+)\(/);
      return match ? match[1] : null;
    })
    .filter((s): s is string => s !== null);
}

function analyzeTrades(trades: Trade[]): Map<string, AnalyzerStats> {
  const stats = new Map<string, AnalyzerStats>();

  // Initialize all found analyzers
  const allAnalyzers = new Set<string>();
  trades.forEach(trade => {
    const sources = extractSources(trade.entryCondition.signal.reason);
    sources.forEach(src => allAnalyzers.add(src));
  });

  // Initialize stats for each analyzer
  for (const analyzer of allAnalyzers) {
    stats.set(analyzer, {
      name: analyzer,
      totalTrades: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      totalPnL: 0,
      avgPnL: 0,
      avgWin: 0,
      avgLoss: 0,
    });
  }

  // Process each trade
  for (const trade of trades) {
    if (trade.status !== 'CLOSED' || !trade.exitCondition) continue;

    const pnl = trade.realizedPnL || 0;
    const isWin = pnl > 0;
    const sources = extractSources(trade.entryCondition.signal.reason);

    // Credit each source with this trade's result
    for (const source of sources) {
      if (!stats.has(source)) {
        stats.set(source, {
          name: source,
          totalTrades: 0,
          wins: 0,
          losses: 0,
          winRate: 0,
          totalPnL: 0,
          avgPnL: 0,
          avgWin: 0,
          avgLoss: 0,
        });
      }

      const stat = stats.get(source)!;
      stat.totalTrades++;
      stat.totalPnL += pnl;

      if (isWin) {
        stat.wins++;
        stat.avgWin += pnl;
      } else {
        stat.losses++;
        stat.avgLoss += pnl;
      }
    }
  }

  // Calculate averages and win rates
  for (const stat of stats.values()) {
    stat.winRate = stat.totalTrades > 0 ? (stat.wins / stat.totalTrades) * 100 : 0;
    stat.avgPnL = stat.totalTrades > 0 ? stat.totalPnL / stat.totalTrades : 0;
    stat.avgWin = stat.wins > 0 ? stat.avgWin / stat.wins : 0;
    stat.avgLoss = stat.losses > 0 ? stat.avgLoss / stat.losses : 0;
  }

  return stats;
}

function getAnalyzerCombinations(
  trades: Trade[]
): { combo: string; count: number; winRate: number; totalPnL: number }[] {
  const combos = new Map<string, { count: number; wins: number; totalPnL: number }>();

  for (const trade of trades) {
    if (trade.status !== 'CLOSED' || !trade.exitCondition) continue;

    const sources = extractSources(trade.entryCondition.signal.reason).sort();
    const comboKey = sources.join(' + ');
    const pnl = trade.realizedPnL || 0;
    const isWin = pnl > 0;

    if (!combos.has(comboKey)) {
      combos.set(comboKey, { count: 0, wins: 0, totalPnL: 0 });
    }

    const combo = combos.get(comboKey)!;
    combo.count++;
    combo.totalPnL += pnl;
    if (isWin) combo.wins++;
  }

  return Array.from(combos.entries())
    .map(([combo, data]) => ({
      combo,
      count: data.count,
      winRate: (data.wins / data.count) * 100,
      totalPnL: data.totalPnL,
    }))
    .sort((a, b) => b.count - a.count);
}

// ============================================================================
// MAIN
// ============================================================================

function main() {
  const journalPath = 'D:\\src\\Edison\\data\\trade-journal.json';

  if (!fs.existsSync(journalPath)) {
    console.error(`❌ Journal file not found: ${journalPath}`);
    process.exit(1);
  }

  console.log(`📂 Loading journal: ${journalPath}`);
  const journalData = fs.readFileSync(journalPath, 'utf-8');
  const trades: Trade[] = JSON.parse(journalData);

  const closedTrades = trades.filter(t => t.status === 'CLOSED');
  const winningTrades = closedTrades.filter(t => (t.realizedPnL || 0) > 0);
  const losingTrades = closedTrades.filter(t => (t.realizedPnL || 0) < 0);

  console.log('\n' + '='.repeat(100));
  console.log('📊 JOURNAL ANALYSIS - ANALYZER PERFORMANCE');
  console.log('='.repeat(100) + '\n');

  console.log(`📈 Overall Statistics:`);
  console.log(`   Total Trades: ${closedTrades.length}`);
  console.log(`   ✅ Winning: ${winningTrades.length} (${((winningTrades.length / closedTrades.length) * 100).toFixed(1)}%)`);
  console.log(`   ❌ Losing: ${losingTrades.length} (${((losingTrades.length / closedTrades.length) * 100).toFixed(1)}%)`);

  const totalPnL = closedTrades.reduce((sum, t) => sum + (t.realizedPnL || 0), 0);
  console.log(`   💰 Total PnL: ${totalPnL.toFixed(2)} USDT\n`);

  // Analyze per analyzer
  const analyzerStats = analyzeTrades(closedTrades);
  const sortedAnalyzers = Array.from(analyzerStats.values())
    .sort((a, b) => b.winRate - a.winRate);

  console.log('\n📊 INDIVIDUAL ANALYZER WIN RATES (sorted by profitability):');
  console.log('─'.repeat(100));
  console.log(
    'Analyzer'.padEnd(30) +
    'Trades'.padStart(10) +
    'Wins'.padStart(10) +
    'Win %'.padStart(10) +
    'Total PnL'.padStart(15) +
    'Avg PnL'.padStart(12)
  );
  console.log('─'.repeat(100));

  for (const stat of sortedAnalyzers) {
    console.log(
      stat.name.padEnd(30) +
      String(stat.totalTrades).padStart(10) +
      String(stat.wins).padStart(10) +
      `${stat.winRate.toFixed(1)}%`.padStart(10) +
      `${stat.totalPnL.toFixed(2)}`.padStart(15) +
      `${stat.avgPnL.toFixed(2)}`.padStart(12)
    );
  }

  // Analyzer combinations
  console.log('\n\n🔗 ANALYZER COMBINATIONS (Winning):');
  console.log('─'.repeat(100));

  const combos = getAnalyzerCombinations(closedTrades);
  const winningCombos = combos.filter(c => c.winRate > 0);

  for (const combo of winningCombos.slice(0, 10)) {
    console.log(
      `${combo.combo.padEnd(70)} ` +
      `${combo.count} trades, ` +
      `${combo.winRate.toFixed(1)}% win, ` +
      `${combo.totalPnL.toFixed(2)} USDT`
    );
  }

  console.log('\n\n❌ ANALYZER COMBINATIONS (Losing):');
  console.log('─'.repeat(100));

  const losingCombos = combos.filter(c => c.winRate === 0);
  for (const combo of losingCombos.slice(0, 10)) {
    console.log(
      `${combo.combo.padEnd(70)} ` +
      `${combo.count} trades, ` +
      `${combo.winRate.toFixed(1)}% win, ` +
      `${combo.totalPnL.toFixed(2)} USDT`
    );
  }

  console.log('\n' + '='.repeat(100) + '\n');
}

main();
