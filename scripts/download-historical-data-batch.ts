/**
 * Batch Historical Data Downloader
 *
 * Downloads 1 month of historical data for multiple symbols
 * Automatically aggregates 1m → 5m, 15m timeframes
 * Perfect for backtesting level-trading strategies
 */

import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

// ============================================================================
// TYPES
// ============================================================================

interface Kline {
  timestamp: number;      // Open time (ms)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  turnover: number;
}

interface BatchConfig {
  symbols: string[];      // e.g., ["BTCUSDT", "XRPUSDT"]
  startDate: string;      // "2024-12-10"
  endDate: string;        // "2025-01-10"
  outputDir: string;      // "./data/historical"
}

// ============================================================================
// CONSTANTS
// ============================================================================

const BYBIT_API_URL = 'https://api.bybit.com';
const MAX_LIMIT = 1000;  // Bybit max limit per request
const DELAY_MS = 500;    // Delay between requests

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function dateToTimestamp(dateStr: string): number {
  return new Date(dateStr).getTime();
}

function intervalToMinutes(interval: string): number {
  const map: Record<string, number> = {
    '1': 1,
    '5': 5,
    '15': 15,
    '30': 30,
    '60': 60,
  };
  return map[interval] || 1;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function formatNumber(num: number): string {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toISOString().split('T')[0];
}

// ============================================================================
// DOWNLOAD FUNCTIONS
// ============================================================================

/**
 * Fetch klines from Bybit API
 */
async function fetchKlines(
  symbol: string,
  interval: string,
  startTime: number,
  endTime: number
): Promise<Kline[]> {
  try {
    const url = `${BYBIT_API_URL}/v5/market/kline`;
    const params = {
      category: 'linear',
      symbol: symbol,
      interval: interval,
      start: startTime,
      end: endTime,
      limit: MAX_LIMIT,
    };

    const response = await axios.get(url, { params });

    if (response.data.retCode !== 0) {
      throw new Error(`Bybit API error: ${response.data.retMsg}`);
    }

    const list = response.data.result.list;

    // Convert Bybit format to our format
    const klines: Kline[] = list.map((item: any) => ({
      timestamp: parseInt(item[0]),
      open: parseFloat(item[1]),
      high: parseFloat(item[2]),
      low: parseFloat(item[3]),
      close: parseFloat(item[4]),
      volume: parseFloat(item[5]),
      turnover: parseFloat(item[6]),
    }));

    // Sort by timestamp ascending
    klines.sort((a, b) => a.timestamp - b.timestamp);

    return klines;
  } catch (error: any) {
    console.error('❌ Failed to fetch klines:', error.message);
    throw error;
  }
}

/**
 * Download all klines for given period
 */
async function downloadKlines(
  symbol: string,
  startDate: string,
  endDate: string
): Promise<Kline[]> {
  console.log(`\n  📥 Downloading ${symbol}...`);
  console.log(`     Period: ${startDate} to ${endDate}`);

  const startTime = dateToTimestamp(startDate);
  const endTime = dateToTimestamp(endDate);
  const intervalMs = 60 * 1000; // 1m

  const allKlines: Kline[] = [];
  let currentStart = startTime;
  let requestCount = 0;

  while (currentStart < endTime) {
    const currentEnd = Math.min(currentStart + (MAX_LIMIT * intervalMs), endTime);

    const klines = await fetchKlines(symbol, '1', currentStart, currentEnd);

    if (klines.length === 0) {
      console.log('     ⚠️  No more data available');
      break;
    }

    allKlines.push(...klines);
    requestCount++;

    // Move to next batch
    currentStart = klines[klines.length - 1].timestamp + intervalMs;

    // Rate limiting
    if (currentStart < endTime) {
      await sleep(DELAY_MS);
    }
  }

  console.log(`     ✅ Downloaded ${formatNumber(allKlines.length)} candles (${requestCount} requests)`);
  return allKlines;
}

/**
 * Aggregate 1m candles to higher timeframes
 */
function aggregateCandles(candles: Kline[], targetIntervalMinutes: number): Kline[] {
  if (targetIntervalMinutes === 1) {
    return candles;
  }

  const aggregated: Kline[] = [];
  const intervalMs = targetIntervalMinutes * 60 * 1000;

  let i = 0;
  while (i < candles.length) {
    const bucketStart = candles[i].timestamp;
    const bucketEnd = bucketStart + intervalMs;

    // Collect all candles in this bucket
    const bucket: Kline[] = [];
    while (i < candles.length && candles[i].timestamp < bucketEnd) {
      bucket.push(candles[i]);
      i++;
    }

    if (bucket.length === 0) continue;

    // Aggregate
    const aggregatedCandle: Kline = {
      timestamp: bucketStart,
      open: bucket[0].open,
      high: Math.max(...bucket.map(c => c.high)),
      low: Math.min(...bucket.map(c => c.low)),
      close: bucket[bucket.length - 1].close,
      volume: bucket.reduce((sum, c) => sum + c.volume, 0),
      turnover: bucket.reduce((sum, c) => sum + c.turnover, 0),
    };

    aggregated.push(aggregatedCandle);
  }

  return aggregated;
}

/**
 * Save klines to JSON file
 */
function saveKlines(klines: Kline[], outputPath: string): void {
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(outputPath, JSON.stringify(klines, null, 2));

  const sizeKb = (fs.statSync(outputPath).size / 1024).toFixed(2);
  console.log(`     💾 ${path.basename(outputPath)} (${sizeKb} KB)`);
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('📊 BATCH HISTORICAL DATA DOWNLOADER - 1 MONTH');
  console.log('═══════════════════════════════════════════════════════════════');

  // Parse command line arguments
  const args = process.argv.slice(2);

  // Default: BTC + XRP for 1 month (Dec 10, 2024 - Jan 10, 2025)
  const symbols = args.length > 0 ? args[0].split(',') : ['BTCUSDT', 'XRPUSDT'];
  const startDate = args.length > 1 ? args[1] : '2024-12-10';
  const endDate = args.length > 2 ? args[2] : '2025-01-10';
  const outputDir = args.length > 3 ? args[3] : './data/historical';

  console.log(`\n⏳ Starting download for ${symbols.length} symbols...`);
  console.log(`   Symbols: ${symbols.join(', ')}`);
  console.log(`   Period: ${startDate} to ${endDate}`);
  console.log(`   Output: ${outputDir}\n`);

  try {
    for (const symbol of symbols) {
      console.log(`\n🔄 Processing ${symbol}...`);

      // Download 1m candles
      const candles1m = await downloadKlines(symbol, startDate, endDate);

      if (candles1m.length === 0) {
        console.log(`⚠️  No data downloaded for ${symbol}`);
        continue;
      }

      // Save 1m candles
      const filename1m = `${symbol}_1m_${startDate}_${endDate}`;
      saveKlines(candles1m, path.join(outputDir, `${filename1m}.json`));

      // Generate higher timeframes
      console.log(`   🔄 Aggregating to 5m, 15m...`);

      const timeframes = [
        { interval: 5, name: '5m' },
        { interval: 15, name: '15m' },
      ];

      for (const tf of timeframes) {
        const aggregated = aggregateCandles(candles1m, tf.interval);
        const filename = `${symbol}_${tf.name}_${startDate}_${endDate}`;
        saveKlines(aggregated, path.join(outputDir, `${filename}.json`));
      }

      console.log(`   ✅ ${symbol} complete!`);
    }

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('✅ ALL DOWNLOADS COMPLETE!');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`\nData saved to: ${outputDir}`);
    console.log('\nGenerated files:');
    for (const symbol of symbols) {
      console.log(`  📄 ${symbol}_1m_${startDate}_${endDate}.json`);
      console.log(`  📄 ${symbol}_5m_${startDate}_${endDate}.json`);
      console.log(`  📄 ${symbol}_15m_${startDate}_${endDate}.json`);
    }

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

// ============================================================================
// USAGE
// ============================================================================

/*
USAGE:

# Download default (BTCUSDT + XRPUSDT for 1 month)
npm run download-data-batch

# Download specific symbols
npm run download-data-batch BTCUSDT,SUIUSDT

# Download with custom dates
npm run download-data-batch BTCUSDT,XRPUSDT 2024-11-01 2025-01-31

# Download with custom output
npm run download-data-batch BTCUSDT,XRPUSDT 2024-12-10 2025-01-10 ./data/backtest

MANUAL:
npx ts-node scripts/download-historical-data-batch.ts [SYMBOLS] [START_DATE] [END_DATE] [OUTPUT_DIR]
*/

// Run
if (require.main === module) {
  main();
}

export { downloadKlines, aggregateCandles, saveKlines };
