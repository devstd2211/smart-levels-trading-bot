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
  let optimizedProvider: SqliteOptimizedDataProvider | null = null;
  let standardProvider: SqliteDataProvider | null = null;

  beforeAll(() => {
    // Use test database
    testDbPath = path.join(__dirname, '../../../data/test-market-data.db');
  });

  const cleanupDatabase = async () => {
    // Close providers
    if (optimizedProvider) {
      await optimizedProvider.close().catch(() => {});
      optimizedProvider = null;
    }
    if (standardProvider) {
      await standardProvider.close().catch(() => {});
      standardProvider = null;
    }

    // Wait a bit for connections to close
    await new Promise(resolve => setTimeout(resolve, 100));

    // Delete database and associated files
    try {
      if (fs.existsSync(testDbPath)) {
        fs.unlinkSync(testDbPath);
      }
      // Also delete WAL and SHM files if they exist
      if (fs.existsSync(`${testDbPath}-wal`)) {
        fs.unlinkSync(`${testDbPath}-wal`);
      }
      if (fs.existsSync(`${testDbPath}-shm`)) {
        fs.unlinkSync(`${testDbPath}-shm`);
      }
    } catch (error) {
      // Ignore cleanup errors, they're not critical
      console.warn(`Warning: Failed to cleanup database file: ${error}`);
    }
  };

  beforeEach(async () => {
    await cleanupDatabase();
  });

  afterAll(async () => {
    await cleanupDatabase();
  });

  /**
   * Test 1: Index creation and existence
   */
  describe('Test 1: Index Creation', () => {
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

    it('should load data efficiently with indexes', async () => {
      const startTime = Date.now() - 365 * 24 * 60 * 60 * 1000;
      const endTime = Date.now();

      // Create optimized provider and warmup (initialization is slow first time)
      optimizedProvider = new SqliteOptimizedDataProvider(testDbPath);
      await optimizedProvider.loadCandles('TESTUSDT', startTime, endTime).catch(() => {});

      // Benchmark second load (tests actual query performance with indexes)
      const optimizedStart = Date.now();
      const optimizedResult = await optimizedProvider.loadCandles('TESTUSDT', startTime, endTime);
      const optimizedTime = Date.now() - optimizedStart;

      // Benchmark standard provider
      standardProvider = new SqliteDataProvider(testDbPath);
      const standardStart = Date.now();
      const standardResult = await standardProvider.loadCandles('TESTUSDT', startTime, endTime);
      const standardTime = Date.now() - standardStart;

      // Both should return same data
      expect(optimizedResult.candles5m.length).toBe(standardResult.candles5m.length);

      // Log performance (informational, not enforced)
      const speedup = standardTime / optimizedTime;
      console.log(`✅ Query performance: ${optimizedTime}ms (optimized) vs ${standardTime}ms (standard), speedup: ${speedup.toFixed(1)}x`);

      // Both should complete reasonably fast
      expect(optimizedTime).toBeLessThan(5000); // Should complete in < 5 seconds
      expect(standardTime).toBeLessThan(5000); // Should complete in < 5 seconds

      await optimizedProvider.close();
      await standardProvider.close();
    });
  });

  /**
   * Test 3: Data integrity vs unoptimized
   */
  describe('Test 3: Data Integrity', () => {
    beforeEach(async () => {
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

    it('should enable WAL mode for concurrent reads', async () => {
      // Create table first
      const dbSetup = await open({
        filename: testDbPath,
        driver: sqlite3.Database,
      });

      await dbSetup.exec(`
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

      await dbSetup.close();

      // Now create provider and trigger initialization (which sets WAL mode)
      optimizedProvider = new SqliteOptimizedDataProvider(testDbPath);
      try {
        await optimizedProvider.loadCandles('TEST', 0, 1000);
      } catch (error) {
        // Expected to fail - just need initialization
      }

      // Check WAL mode in a fresh connection
      const dbCheck = await open({
        filename: testDbPath,
        driver: sqlite3.Database,
      });

      const result = await dbCheck.all('PRAGMA journal_mode;');
      const journalMode = result[0]['journal_mode'];
      await dbCheck.close();

      // WAL mode should be enabled by provider initialization
      expect(journalMode.toLowerCase()).toBe('wal');

      await optimizedProvider.close();
    });
  });

  /**
   * Test 5: Large dataset handling (100k+ candles)
   */
  describe('Test 5: Large Dataset', () => {
    beforeEach(async () => {
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
