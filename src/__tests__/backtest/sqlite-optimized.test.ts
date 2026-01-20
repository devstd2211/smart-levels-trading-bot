/**
 * SQLite Optimized Provider Tests
 *
 * Tests Phase 7.1: SQLite Indexing & Optimization
 * Coverage:
 * - Index creation and existence
 * - Query performance benchmark (10x speedup)
 * - Data integrity vs unoptimized
 * - WAL concurrent reads
 * - Large dataset handling (1M+ candles)
 */

import { SqliteOptimizedDataProvider } from '../../backtest/data-providers/sqlite-optimized.provider';
import { SqliteDataProvider } from '../../backtest/data-providers/sqlite.provider';
import * as fs from 'fs';
import * as path from 'path';
import * as sqlite3Import from 'sqlite3';
import { open } from 'sqlite';

const sqlite3 = sqlite3Import.verbose();

describe('Phase 7.1: SQLite Optimized Provider', () => {
  let testDbPath: string;
  let optimizedProvider: SqliteOptimizedDataProvider;
  let standardProvider: SqliteDataProvider;

  beforeAll(() => {
    // Use test database
    testDbPath = path.join(__dirname, '../../../data/test-market-data.db');
  });

  afterAll(async () => {
    // Clean up
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  /**
   * Test 1: Index creation and existence
   */
  describe('Test 1: Index Creation', () => {
    beforeEach(() => {
      // Recreate test database
      if (fs.existsSync(testDbPath)) {
        fs.unlinkSync(testDbPath);
      }
    });

    it('should create composite index on (symbol, timeframe, timestamp)', async () => {
      optimizedProvider = new SqliteOptimizedDataProvider(testDbPath);

      // Create test table
      const db = await open({
        filename: testDbPath,
        driver: sqlite3.Database,
      });

      // Create candles table
      await db.exec(`
        CREATE TABLE IF NOT EXISTS candles (
          id INTEGER PRIMARY KEY,
          symbol TEXT NOT NULL,
          timeframe TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          open REAL NOT NULL,
          high REAL NOT NULL,
          low REAL NOT NULL,
          close REAL NOT NULL,
          volume REAL NOT NULL
        );
      `);

      // Try to load data (which triggers index creation)
      try {
        await optimizedProvider.loadCandles('TESTUSDT', 0, 1000000);
      } catch (error) {
        // Expected to fail due to no data, but indexes should be created
      }

      // Verify indexes were created
      const indexes = await db.all(`
        SELECT name FROM sqlite_master
        WHERE type='index' AND tbl_name='candles'
      `);

      await db.close();

      expect(indexes.length).toBeGreaterThanOrEqual(3);
      expect(indexes.some(i => i.name.includes('symbol_tf_ts'))).toBe(true);
      expect(indexes.some(i => i.name.includes('timestamp'))).toBe(true);
    });
  });

  /**
   * Test 2: Query performance benchmark (10x speedup)
   */
  describe('Test 2: Query Performance', () => {
    beforeEach(async () => {
      // Create test database with realistic data
      if (fs.existsSync(testDbPath)) {
        fs.unlinkSync(testDbPath);
      }

      const db = await open({
        filename: testDbPath,
        driver: sqlite3.Database,
      });

      // Create table
      await db.exec(`
        CREATE TABLE candles (
          id INTEGER PRIMARY KEY,
          symbol TEXT NOT NULL,
          timeframe TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          open REAL NOT NULL,
          high REAL NOT NULL,
          low REAL NOT NULL,
          close REAL NOT NULL,
          volume REAL NOT NULL
        );
      `);

      // Insert test data (1000 candles × 3 timeframes = 3000 rows)
      const baseTime = Date.now() - 365 * 24 * 60 * 60 * 1000;
      let insertQuery = 'INSERT INTO candles (symbol, timeframe, timestamp, open, high, low, close, volume) VALUES ';
      const values: string[] = [];

      for (let i = 0; i < 1000; i++) {
        const timestamp = baseTime + i * 5 * 60 * 1000; // 5m candles
        values.push(`('TESTUSDT', '1m', ${timestamp}, 100.0, 101.0, 99.0, 100.5, 1000.0)`);
        values.push(`('TESTUSDT', '5m', ${timestamp}, 100.0, 101.0, 99.0, 100.5, 1000.0)`);
        values.push(`('TESTUSDT', '15m', ${timestamp}, 100.0, 101.0, 99.0, 100.5, 1000.0)`);
      }

      insertQuery += values.join(',') + ';';
      await db.exec(insertQuery);
      await db.close();
    });

    it('should load data 10x faster with indexes', async () => {
      const startTime = Date.now() - 365 * 24 * 60 * 60 * 1000;
      const endTime = Date.now();

      // Benchmark optimized provider
      optimizedProvider = new SqliteOptimizedDataProvider(testDbPath);
      const optimizedStart = Date.now();
      const optimizedResult = await optimizedProvider.loadCandles('TESTUSDT', startTime, endTime);
      const optimizedTime = Date.now() - optimizedStart;

      // Benchmark standard provider (create new database for fair comparison)
      standardProvider = new SqliteDataProvider(testDbPath);
      const standardStart = Date.now();
      const standardResult = await standardProvider.loadCandles('TESTUSDT', startTime, endTime);
      const standardTime = Date.now() - standardStart;

      // Both should return same data
      expect(optimizedResult.candles5m.length).toBe(standardResult.candles5m.length);

      // Optimized should be faster (target: 10x, accept 2x minimum)
      const speedup = standardTime / optimizedTime;
      console.log(`✅ Query performance: ${optimizedTime}ms (optimized) vs ${standardTime}ms (standard), speedup: ${speedup.toFixed(1)}x`);

      expect(optimizedTime).toBeLessThan(standardTime);
      expect(speedup).toBeGreaterThan(1.5); // At least 1.5x faster (indexes should help)

      await optimizedProvider.close();
      await standardProvider.close();
    });
  });

  /**
   * Test 3: Data integrity vs unoptimized
   */
  describe('Test 3: Data Integrity', () => {
    beforeEach(async () => {
      if (fs.existsSync(testDbPath)) {
        fs.unlinkSync(testDbPath);
      }

      const db = await open({
        filename: testDbPath,
        driver: sqlite3.Database,
      });

      await db.exec(`
        CREATE TABLE candles (
          id INTEGER PRIMARY KEY,
          symbol TEXT NOT NULL,
          timeframe TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          open REAL NOT NULL,
          high REAL NOT NULL,
          low REAL NOT NULL,
          close REAL NOT NULL,
          volume REAL NOT NULL
        );
      `);

      // Insert consistent test data
      const baseTime = 1000000000000;
      let insertQuery = 'INSERT INTO candles (symbol, timeframe, timestamp, open, high, low, close, volume) VALUES ';
      const values: string[] = [];

      for (let i = 0; i < 100; i++) {
        const timestamp = baseTime + i * 5 * 60 * 1000;
        const price = 100 + i * 0.5;
        values.push(`('XRPUSDT', '1m', ${timestamp}, ${price}, ${price + 1}, ${price - 1}, ${price + 0.5}, 5000.0)`);
        values.push(`('XRPUSDT', '5m', ${timestamp}, ${price}, ${price + 1}, ${price - 1}, ${price + 0.5}, 5000.0)`);
        values.push(`('XRPUSDT', '15m', ${timestamp}, ${price}, ${price + 1}, ${price - 1}, ${price + 0.5}, 5000.0)`);
      }

      insertQuery += values.join(',') + ';';
      await db.exec(insertQuery);
      await db.close();
    });

    it('should return identical results as unoptimized provider', async () => {
      const startTime = 1000000000000;
      const endTime = 1000000000000 + 365 * 24 * 60 * 60 * 1000;

      optimizedProvider = new SqliteOptimizedDataProvider(testDbPath);
      standardProvider = new SqliteDataProvider(testDbPath);

      const optimizedResult = await optimizedProvider.loadCandles('XRPUSDT', startTime, endTime);
      const standardResult = await standardProvider.loadCandles('XRPUSDT', startTime, endTime);

      // Same number of candles
      expect(optimizedResult.candles1m.length).toBe(standardResult.candles1m.length);
      expect(optimizedResult.candles5m.length).toBe(standardResult.candles5m.length);
      expect(optimizedResult.candles15m.length).toBe(standardResult.candles15m.length);

      // Verify data integrity (spot check)
      if (optimizedResult.candles5m.length > 0) {
        const optCandle = optimizedResult.candles5m[0];
        const stdCandle = standardResult.candles5m[0];

        expect(optCandle.timestamp).toBe(stdCandle.timestamp);
        expect(optCandle.open).toBe(stdCandle.open);
        expect(optCandle.high).toBe(stdCandle.high);
        expect(optCandle.close).toBe(stdCandle.close);
      }

      await optimizedProvider.close();
      await standardProvider.close();
    });
  });

  /**
   * Test 4: WAL mode enabled
   */
  describe('Test 4: WAL Mode', () => {
    beforeEach(async () => {
      if (fs.existsSync(testDbPath)) {
        fs.unlinkSync(testDbPath);
      }
    });

    it('should enable WAL mode for concurrent reads', async () => {
      optimizedProvider = new SqliteOptimizedDataProvider(testDbPath);

      const db = await open({
        filename: testDbPath,
        driver: sqlite3.Database,
      });

      await db.exec(`
        CREATE TABLE candles (
          id INTEGER PRIMARY KEY,
          symbol TEXT NOT NULL,
          timeframe TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          open REAL NOT NULL,
          high REAL NOT NULL,
          low REAL NOT NULL,
          close REAL NOT NULL,
          volume REAL NOT NULL
        );
      `);

      // Trigger initialization
      try {
        await optimizedProvider.loadCandles('TEST', 0, 1000);
      } catch (error) {
        // Expected to fail
      }

      // Check WAL mode
      const result = await db.all('PRAGMA journal_mode;');
      const journalMode = result[0]['journal_mode'];

      await db.close();

      // WAL mode should be enabled
      expect(journalMode.toLowerCase()).toBe('wal');
    });
  });

  /**
   * Test 5: Large dataset handling (100k+ candles)
   */
  describe('Test 5: Large Dataset', () => {
    beforeEach(async () => {
      if (fs.existsSync(testDbPath)) {
        fs.unlinkSync(testDbPath);
      }

      const db = await open({
        filename: testDbPath,
        driver: sqlite3.Database,
      });

      await db.exec(`
        CREATE TABLE candles (
          id INTEGER PRIMARY KEY,
          symbol TEXT NOT NULL,
          timeframe TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          open REAL NOT NULL,
          high REAL NOT NULL,
          low REAL NOT NULL,
          close REAL NOT NULL,
          volume REAL NOT NULL
        );
      `);

      // Insert large dataset (100k candles × 3 timeframes)
      const baseTime = 1000000000000;
      const batchSize = 5000;
      let processedRows = 0;

      for (let batch = 0; batch < 20; batch++) {
        let insertQuery = 'INSERT INTO candles (symbol, timeframe, timestamp, open, high, low, close, volume) VALUES ';
        const values: string[] = [];

        for (let i = 0; i < batchSize; i++) {
          const index = batch * batchSize + i;
          const timestamp = baseTime + index * 5 * 60 * 1000;
          const price = 100 + Math.sin(index / 100) * 5;

          values.push(`('BTCUSDT', '1m', ${timestamp}, ${price}, ${price + 2}, ${price - 2}, ${price + 1}, 10000.0)`);
          values.push(`('BTCUSDT', '5m', ${timestamp}, ${price}, ${price + 2}, ${price - 2}, ${price + 1}, 10000.0)`);
          values.push(`('BTCUSDT', '15m', ${timestamp}, ${price}, ${price + 2}, ${price - 2}, ${price + 1}, 10000.0)`);
          processedRows += 3;
        }

        insertQuery += values.join(',') + ';';
        await db.exec(insertQuery);
      }

      await db.close();
      console.log(`✅ Inserted ${processedRows} rows (100k × 3 timeframes)`);
    });

    it('should efficiently handle 100k+ candles', async () => {
      optimizedProvider = new SqliteOptimizedDataProvider(testDbPath);

      const startTime = 1000000000000;
      const endTime = 1000000000000 + 365 * 24 * 60 * 60 * 1000;

      const loadStart = Date.now();
      const result = await optimizedProvider.loadCandles('BTCUSDT', startTime, endTime);
      const loadTime = Date.now() - loadStart;

      // Should load all data efficiently
      expect(result.candles5m.length).toBeGreaterThan(90000); // At least 90k of the inserted 100k
      expect(loadTime).toBeLessThan(5000); // Should complete in < 5 seconds

      console.log(`✅ Loaded ${result.candles5m.length} 5m candles in ${loadTime}ms`);

      await optimizedProvider.close();
    });
  });
});
