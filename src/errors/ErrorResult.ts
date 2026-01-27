/**
 * Result<T> type for type-safe error handling
 *
 * Enables functional error handling without relying on exceptions for control flow:
 * - Ok<T> represents successful result
 * - Err<T> represents error result with TradingError
 *
 * Usage:
 * ```
 * const result: Result<Position> = await service.openPosition(signal);
 *
 * // Pattern matching
 * result.match(
 *   position => console.log('Opened:', position),
 *   error => console.error('Failed:', error.message)
 * );
 *
 * // Chaining transformations
 * const newResult = result
 *   .map(pos => pos.size)
 *   .mapErr(err => new CustomError(...));
 *
 * // Safe unwrap with default
 * const position = result.unwrapOr(defaultPosition);
 * ```
 */

import { TradingError, UnknownTradingError } from './BaseError';

/**
 * Result type: either success (Ok) or failure (Err)
 */
export type Result<T> = Ok<T> | Err<T>;

/**
 * Success result containing a value
 */
export class Ok<T> {
  readonly ok = true as const;
  readonly err = false as const;

  /**
   * Create a successful result
   */
  constructor(readonly value: T) {}

  /**
   * Create a successful result from a value
   */
  static of<U>(value: U): Ok<U> {
    return new Ok(value);
  }

  /**
   * Transform the value if successful
   */
  map<U>(fn: (value: T) => U): Result<U> {
    try {
      return Ok.of(fn(this.value));
    } catch (error) {
      return Err.of(
        error instanceof TradingError
          ? error
          : new UnknownTradingError('Transformation failed', error as Error),
      );
    }
  }

  /**
   * Transform the error (no-op for Ok)
   */
  mapErr<E>(fn: (error: TradingError) => TradingError): Result<T> {
    return this;
  }

  /**
   * Chain multiple operations that return Result
   */
  flatMap<U>(fn: (value: T) => Result<U>): Result<U> {
    try {
      return fn(this.value);
    } catch (error) {
      return Err.of(
        error instanceof TradingError
          ? error
          : new UnknownTradingError('FlatMap failed', error as Error),
      );
    }
  }

  /**
   * Pattern match on the result
   */
  match<U>(okFn: (value: T) => U, errFn?: (error: TradingError) => U): U {
    return okFn(this.value);
  }

  /**
   * Get the value, throwing if it's an error
   */
  unwrap(): T {
    return this.value;
  }

  /**
   * Get the value, or return a default
   */
  unwrapOr(defaultValue: T): T {
    return this.value;
  }

  /**
   * Get the value, or throw if it's an error
   */
  expect(message: string): T {
    return this.value;
  }

  /**
   * Check if result is Ok
   */
  isOk(): boolean {
    return true;
  }

  /**
   * Check if result is Err
   */
  isErr(): boolean {
    return false;
  }

  /**
   * Convert to JSON for logging
   */
  toJSON() {
    return { ok: true, value: this.value };
  }
}

/**
 * Failure result containing an error
 */
export class Err<T> {
  readonly ok = false as const;
  readonly err = true as const;

  /**
   * Create a failure result
   */
  constructor(readonly error: TradingError) {}

  /**
   * Create a failure result from an error
   */
  static of<U>(error: TradingError): Err<U> {
    return new Err(error);
  }

  /**
   * Transform the value (no-op for Err)
   */
  map<U>(fn: (value: T) => U): Result<U> {
    return Err.of(this.error);
  }

  /**
   * Transform the error if failed
   */
  mapErr<E>(fn: (error: TradingError) => TradingError): Result<T> {
    try {
      return Err.of(fn(this.error));
    } catch (error) {
      return Err.of(
        error instanceof TradingError
          ? error
          : new UnknownTradingError('MapErr failed', error as Error),
      );
    }
  }

  /**
   * Chain multiple operations that return Result (no-op for Err)
   */
  flatMap<U>(fn: (value: T) => Result<U>): Result<U> {
    return Err.of(this.error);
  }

  /**
   * Pattern match on the result
   */
  match<U>(okFn: (value: T) => U, errFn?: (error: TradingError) => U): U {
    if (!errFn) {
      throw this.error;
    }
    return errFn(this.error);
  }

  /**
   * Get the value, throwing the error
   */
  unwrap(): T {
    throw this.error;
  }

  /**
   * Get the value, or return a default
   */
  unwrapOr(defaultValue: T): T {
    return defaultValue;
  }

  /**
   * Get the value, or throw with message
   */
  expect(message: string): T {
    throw new UnknownTradingError(message, this.error);
  }

  /**
   * Check if result is Ok
   */
  isOk(): boolean {
    return false;
  }

  /**
   * Check if result is Err
   */
  isErr(): boolean {
    return true;
  }

  /**
   * Convert to JSON for logging
   */
  toJSON() {
    return { ok: false, error: this.error.toJSON() };
  }
}

/**
 * Helper function to create an Ok result
 */
export function ok<T>(value: T): Result<T> {
  return Ok.of(value);
}

/**
 * Helper function to create an Err result
 */
export function err<T>(error: TradingError): Result<T> {
  return Err.of(error);
}

/**
 * Try to execute a function and wrap result
 */
export async function tryAsync<T>(
  fn: () => Promise<T>,
): Promise<Result<T>> {
  try {
    const value = await fn();
    return Ok.of(value);
  } catch (error) {
    return Err.of(
      error instanceof TradingError
        ? error
        : new UnknownTradingError('Async operation failed', error as Error),
    );
  }
}

/**
 * Try to execute a synchronous function and wrap result
 */
export function trySync<T>(fn: () => T): Result<T> {
  try {
    const value = fn();
    return Ok.of(value);
  } catch (error) {
    return Err.of(
      error instanceof TradingError
        ? error
        : new UnknownTradingError('Sync operation failed', error as Error),
    );
  }
}

/**
 * Combine multiple results into one
 * Returns Ok if all are Ok, first Err otherwise
 */
export function combine<T>(results: Result<T>[]): Result<T[]> {
  const values: T[] = [];
  for (const result of results) {
    if (result.isErr()) {
      return Err.of((result as Err<T>).error);
    }
    values.push((result as Ok<T>).unwrap());
  }
  return Ok.of(values);
}

/**
 * Combine multiple results, collecting all errors
 * Returns Ok if all are Ok, Err with all errors otherwise
 */
export function combineAll<T>(results: Result<T>[]): Result<T[]> {
  const values: T[] = [];
  const errors: TradingError[] = [];

  for (const result of results) {
    if (result.isErr()) {
      errors.push((result as Err<T>).error);
    } else {
      values.push((result as Ok<T>).unwrap());
    }
  }

  if (errors.length > 0) {
    return Err.of(
      new UnknownTradingError(
        `${errors.length} operations failed`,
        undefined,
        { errors: errors.map(e => e.metadata.code), count: errors.length },
      ),
    );
  }

  return Ok.of(values);
}
