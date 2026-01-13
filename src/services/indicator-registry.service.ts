import { IndicatorType } from '../types/indicator-type.enum';

/**
 * Indicator Registry Service
 *
 * Responsibility:
 * - Register all available indicator types
 * - Provide metadata about registered indicators
 * - NO dependencies on actual indicator implementations
 *
 * Design:
 * - Pure registry (only IIndicatorMetadata)
 * - IndicatorLoader handles actual loading
 * - Analyzers only need to know about IIndicator interface
 *
 * SOLID:
 * - This service depends ONLY on types, not on implementations
 * - Follows Interface Segregation Principle
 * - Open/Closed: new indicator? Just add registration, no code change
 */

export interface IIndicatorMetadata {
  type: IndicatorType; // Using enum, not string!
  name: string; // 'Exponential Moving Average'
  description: string;
  enabled: boolean;
}

export class IndicatorRegistry {
  private registered = new Map<IndicatorType, IIndicatorMetadata>();

  /**
   * Register an indicator type
   * Called during bot initialization
   *
   * @param type Indicator type (IndicatorType enum)
   * @param metadata Indicator metadata
   */
  register(type: IndicatorType, metadata: IIndicatorMetadata): void {
    this.registered.set(type, metadata);
  }

  /**
   * Check if indicator type is registered
   *
   * @param type Indicator type
   * @returns true if registered, false otherwise
   */
  isRegistered(type: IndicatorType): boolean {
    return this.registered.has(type);
  }

  /**
   * Get metadata for indicator type
   *
   * @param type Indicator type
   * @returns Metadata or null if not registered
   */
  getMetadata(type: IndicatorType): IIndicatorMetadata | null {
    return this.registered.get(type) || null;
  }

  /**
   * Get all registered indicator types
   *
   * @returns Array of type names (IndicatorType enum values)
   */
  getAll(): IndicatorType[] {
    return Array.from(this.registered.keys());
  }

  /**
   * Get only enabled indicators
   *
   * @returns Array of enabled type names
   */
  getEnabled(): IndicatorType[] {
    return Array.from(this.registered.values())
      .filter(meta => meta.enabled)
      .map(meta => meta.type);
  }

  /**
   * Get indicator count
   *
   * @returns Total registered count
   */
  getCount(): number {
    return this.registered.size;
  }

  /**
   * Clear all registrations (for testing)
   */
  clear(): void {
    this.registered.clear();
  }
}
