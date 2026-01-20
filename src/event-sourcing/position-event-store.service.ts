/**
 * PositionEventStore Service
 * Implements append-only immutable event log for positions
 *
 * Features:
 * - Append-only semantics (no modifications)
 * - Persistent JSONL storage
 * - In-memory cache for performance
 * - Full event history retrieval
 */

import * as fs from 'fs';
import * as path from 'path';
import { AnyPositionEvent, PositionEventRecord } from './position.events';
import { IPositionEventStore } from './position-event-store.interface';

export class PositionEventStore implements IPositionEventStore {
  private events: PositionEventRecord[] = [];
  private eventsByPosition: Map<string, PositionEventRecord[]> = new Map();
  private eventsBySymbol: Map<string, PositionEventRecord[]> = new Map();

  private storagePath: string;
  private isInitialized = false;

  constructor(storagePath: string = './data/position-events.jsonl') {
    this.storagePath = storagePath;
  }

  /**
   * Initialize event store - load existing events from disk
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    // Ensure directory exists
    const dir = path.dirname(this.storagePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Load existing events if file exists
    if (fs.existsSync(this.storagePath)) {
      await this.loadEventsFromDisk();
    }

    this.isInitialized = true;
  }

  /**
   * Load events from JSONL file
   */
  private async loadEventsFromDisk(): Promise<void> {
    try {
      const content = fs.readFileSync(this.storagePath, 'utf-8');
      const lines = content.split('\n').filter((line) => line.trim());

      for (const line of lines) {
        try {
          const record: PositionEventRecord = JSON.parse(line);
          this.registerEventRecord(record);
        } catch (e) {
          // Skip malformed lines
          console.warn('Skipping malformed event record:', e);
        }
      }

      console.log(`Loaded ${this.events.length} events from ${this.storagePath}`);
    } catch (e) {
      console.error('Error loading event store:', e);
      throw e;
    }
  }

  /**
   * Register event in all indexes
   */
  private registerEventRecord(record: PositionEventRecord): void {
    const { event } = record;

    // Add to main list
    this.events.push(record);

    // Index by position ID
    if (!this.eventsByPosition.has(event.positionId)) {
      this.eventsByPosition.set(event.positionId, []);
    }
    this.eventsByPosition.get(event.positionId)!.push(record);

    // Index by symbol
    if (!this.eventsBySymbol.has(event.symbol)) {
      this.eventsBySymbol.set(event.symbol, []);
    }
    this.eventsBySymbol.get(event.symbol)!.push(record);
  }

  /**
   * Append event to store
   */
  async appendEvent(event: AnyPositionEvent): Promise<PositionEventRecord> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    // Create record with unique ID
    const record: PositionEventRecord = {
      id: `${event.timestamp}-${Math.random().toString(36).slice(2, 11)}`,
      event,
      storedAt: Date.now(),
      version: 1,
    };

    // Register in memory
    this.registerEventRecord(record);

    // Persist to disk
    await this.persistEventToDisk(record);

    return record;
  }

  /**
   * Persist event record to JSONL file
   */
  private async persistEventToDisk(record: PositionEventRecord): Promise<void> {
    try {
      const line = JSON.stringify(record) + '\n';
      fs.appendFileSync(this.storagePath, line, 'utf-8');
    } catch (e) {
      console.error('Error persisting event to disk:', e);
      throw e;
    }
  }

  /**
   * Get all events for a position
   */
  async getPositionEvents(positionId: string): Promise<AnyPositionEvent[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const records = this.eventsByPosition.get(positionId) || [];
    return records.map((r) => r.event);
  }

  /**
   * Get all events for a symbol
   */
  async getSymbolEvents(symbol: string): Promise<AnyPositionEvent[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const records = this.eventsBySymbol.get(symbol) || [];
    return records.map((r) => r.event);
  }

  /**
   * Get all events
   */
  async getAllEvents(): Promise<AnyPositionEvent[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    return this.events.map((r) => r.event);
  }

  /**
   * Get events in time range
   */
  async getEventsByTimeRange(
    startTime: number,
    endTime: number
  ): Promise<AnyPositionEvent[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    return this.events
      .filter((r) => r.event.timestamp >= startTime && r.event.timestamp <= endTime)
      .map((r) => r.event);
  }

  /**
   * Check if position exists
   */
  async positionExists(positionId: string): Promise<boolean> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    return this.eventsByPosition.has(positionId);
  }

  /**
   * Get event count for position
   */
  async getEventCount(positionId: string): Promise<number> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    return (this.eventsByPosition.get(positionId) || []).length;
  }

  /**
   * Clear all events (testing only)
   */
  async clear(): Promise<void> {
    this.events = [];
    this.eventsByPosition.clear();
    this.eventsBySymbol.clear();

    if (fs.existsSync(this.storagePath)) {
      fs.unlinkSync(this.storagePath);
    }
  }

  /**
   * Get statistics about stored events
   */
  async getStatistics(): Promise<{
    totalEvents: number;
    uniquePositions: number;
    uniqueSymbols: number;
    timeRange: { from: number; to: number } | null;
  }> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const timeRange =
      this.events.length > 0
        ? {
            from: Math.min(...this.events.map((r) => r.event.timestamp)),
            to: Math.max(...this.events.map((r) => r.event.timestamp)),
          }
        : null;

    return {
      totalEvents: this.events.length,
      uniquePositions: this.eventsByPosition.size,
      uniqueSymbols: this.eventsBySymbol.size,
      timeRange,
    };
  }
}
