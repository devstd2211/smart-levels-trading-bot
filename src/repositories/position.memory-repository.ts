/**
 * Position Memory Repository - Phase 6.1
 *
 * In-memory repository for position management
 * Features:
 * - Fast O(1) current position access
 * - LRU history tracking (max 100 positions)
 * - Type-safe Position management
 * - No persistence (RAM-only)
 */

import { Position } from '../types';
import { IPositionRepository } from './IRepositories';

/**
 * In-memory repository for position management
 * Tracks current position and maintains history
 */
export class PositionMemoryRepository implements IPositionRepository {
  private currentPosition: Position | null = null;
  private history: Position[] = [];
  private readonly maxHistorySize = 100;

  // ============================================================================
  // CURRENT POSITION MANAGEMENT
  // ============================================================================

  /**
   * Get current open position
   * @returns Current position or null if no open position
   */
  getCurrentPosition(): Position | null {
    return this.currentPosition;
  }

  /**
   * Set or clear current position
   * @param position - Position to set, or null to clear
   */
  setCurrentPosition(position: Position | null): void {
    // If we have a current position and it's being replaced
    // (either closed to null or replaced with different position)
    if (this.currentPosition && (!position || this.currentPosition.id !== position?.id)) {
      this.addToHistory(this.currentPosition);
    }

    this.currentPosition = position;
  }

  // ============================================================================
  // HISTORY MANAGEMENT
  // ============================================================================

  /**
   * Add position to history (typically when closing)
   * Maintains LRU: if size exceeds max, removes oldest
   * @param position - Position to add to history
   */
  addToHistory(position: Position): void {
    this.history.push(position);

    // LRU eviction: keep only latest maxHistorySize positions
    if (this.history.length > this.maxHistorySize) {
      this.history = this.history.slice(-this.maxHistorySize);
    }
  }

  /**
   * Get position history (newest first)
   * @param limit - Max number of positions to return (default all)
   * @returns Array of positions, newest first
   */
  getHistory(limit?: number): Position[] {
    const result = [...this.history].reverse(); // Newest first
    return limit ? result.slice(0, limit) : result;
  }

  /**
   * Clear all history
   */
  clearHistory(): void {
    this.history = [];
  }

  // ============================================================================
  // QUERY OPERATIONS
  // ============================================================================

  /**
   * Find position by ID
   * Checks current position first, then history
   * @param id - Position ID
   * @returns Position or null if not found
   */
  findPosition(id: string): Position | null {
    // Check current position
    if (this.currentPosition?.id === id) {
      return this.currentPosition;
    }

    // Check history
    return this.history.find(p => p.id === id) || null;
  }

  /**
   * Get all positions (current + history)
   * @returns Array of all positions
   */
  getAllPositions(): Position[] {
    const all: Position[] = [];

    if (this.currentPosition) {
      all.push(this.currentPosition);
    }

    all.push(...this.history);
    return all;
  }

  // ============================================================================
  // MAINTENANCE
  // ============================================================================

  /**
   * Clear all data
   */
  clear(): void {
    this.currentPosition = null;
    this.history = [];
  }

  /**
   * Get repository size in bytes (approximate)
   * Used for memory management diagnostics
   * @returns Approximate size in bytes
   */
  getSize(): number {
    let size = 0;

    // Current position
    if (this.currentPosition) {
      size += this.estimatePositionSize(this.currentPosition);
    }

    // History
    for (const position of this.history) {
      size += this.estimatePositionSize(position);
    }

    return size;
  }

  /**
   * Estimate size of a position object in bytes
   * @param position - Position to measure
   * @returns Approximate size in bytes
   */
  private estimatePositionSize(position: Position): number {
    // Rough estimation:
    // - id, symbol: ~60 bytes
    // - numbers (entry price, quantity, etc): ~80 bytes
    // - arrays (takeProfits): ~40 bytes
    // - overhead: ~100 bytes
    return 280;
  }

  // ============================================================================
  // DIAGNOSTICS
  // ============================================================================

  /**
   * Get repository statistics
   * @returns Statistics object
   */
  getStats(): {
    currentPosition: boolean;
    historySize: number;
    maxHistorySize: number;
    totalSize: number;
  } {
    return {
      currentPosition: !!this.currentPosition,
      historySize: this.history.length,
      maxHistorySize: this.maxHistorySize,
      totalSize: this.getSize(),
    };
  }
}
