/**
 * Unit tests for Result<T> type for type-safe error handling
 */

import { describe, it, expect } from '@jest/globals';
import {
  Ok,
  Err,
  ok,
  err,
  tryAsync,
  trySync,
  combine,
  combineAll,
  Result,
} from '../../errors/ErrorResult';
import {
  OrderTimeoutError,
  EntryValidationError,
  ExchangeConnectionError,
} from '../../errors/DomainErrors';

describe('Result<T> Type - Type-Safe Error Handling', () => {
  describe('Ok<T> Creation and Methods', () => {
    it('should create Ok result with value', () => {
      const result = Ok.of(42);

      expect(result.ok).toBe(true);
      expect(result.err).toBe(false);
      expect(result.value).toBe(42);
      expect(result.isOk()).toBe(true);
      expect(result.isErr()).toBe(false);
    });

    it('should use ok() helper function', () => {
      const result = ok({ id: '123', size: 10 });

      expect(result.ok).toBe(true);
      expect((result as any).value.id).toBe('123');
    });

    it('should unwrap value', () => {
      const result = ok(100);
      expect(result.unwrap()).toBe(100);
    });

    it('should return value in unwrapOr', () => {
      const result = ok(100);
      expect(result.unwrapOr(0)).toBe(100);
    });

    it('should throw when unwrap called on Err', () => {
      const error = new OrderTimeoutError('timeout', {
        orderId: 'O1',
        symbol: 'BTC',
        timeoutMs: 1000,
      });
      const result = err(error);

      expect(() => result.unwrap()).toThrow();
    });

    it('should support expect() method', () => {
      const result = ok(42);
      expect(result.expect('Should have value')).toBe(42);
    });
  });

  describe('Err<T> Creation and Methods', () => {
    it('should create Err result with error', () => {
      const error = new OrderTimeoutError('timeout', {
        orderId: 'O1',
        symbol: 'BTC',
        timeoutMs: 1000,
      });
      const result = Err.of(error);

      expect(result.ok).toBe(false);
      expect(result.err).toBe(true);
      expect((result as any).error).toBe(error);
      expect(result.isOk()).toBe(false);
      expect(result.isErr()).toBe(true);
    });

    it('should use err() helper function', () => {
      const error = new OrderTimeoutError('timeout', {
        orderId: 'O1',
        symbol: 'BTC',
        timeoutMs: 1000,
      });
      const result = err(error);

      expect(result.isErr()).toBe(true);
      expect((result as any).error).toBe(error);
    });

    it('should return default in unwrapOr', () => {
      const error = new OrderTimeoutError('timeout', {
        orderId: 'O1',
        symbol: 'BTC',
        timeoutMs: 1000,
      });
      const result = err(error);

      expect(result.unwrapOr(0)).toBe(0);
    });

    it('should throw on unwrap', () => {
      const error = new OrderTimeoutError('timeout', {
        orderId: 'O1',
        symbol: 'BTC',
        timeoutMs: 1000,
      });
      const result = err(error);

      expect(() => result.unwrap()).toThrow();
    });

    it('should throw with custom message in expect', () => {
      const error = new OrderTimeoutError('timeout', {
        orderId: 'O1',
        symbol: 'BTC',
        timeoutMs: 1000,
      });
      const result = err(error);

      expect(() => result.expect('Expected a value')).toThrow(
        'Expected a value',
      );
    });
  });

  describe('map() Transformations', () => {
    it('should transform Ok value', () => {
      const result: Result<number> = ok(10);
      const transformed = result.map(n => n * 2);

      expect(transformed.isOk()).toBe(true);
      expect(transformed.unwrap()).toBe(20);
    });

    it('should not apply map on Err', () => {
      const error = new OrderTimeoutError('timeout', {
        orderId: 'O1',
        symbol: 'BTC',
        timeoutMs: 1000,
      });
      const result: Result<number> = err(error);
      const transformed = result.map(n => n * 2);

      expect(transformed.isErr()).toBe(true);
      expect((transformed as any).error).toBe(error);
    });

    it('should catch errors in map transformation', () => {
      const result: Result<number> = ok(10);
      const transformed = result.map(() => {
        throw new Error('Transformation failed');
      });

      expect(transformed.isErr()).toBe(true);
      expect((transformed as any).error.message).toContain('Transformation failed');
    });

    it('should allow chaining maps', () => {
      const result: Result<number> = ok(5);
      const transformed = result
        .map(n => n * 2)
        .map(n => n + 3)
        .map(n => n.toString());

      expect(transformed.isOk()).toBe(true);
      expect(transformed.unwrap()).toBe('13');
    });
  });

  describe('mapErr() Error Transformations', () => {
    it('should transform error in Err result', () => {
      const originalError = new OrderTimeoutError('timeout', {
        orderId: 'O1',
        symbol: 'BTC',
        timeoutMs: 1000,
      });
      const result: Result<number> = err(originalError);

      const newError = new EntryValidationError('Validation failed', {
        reason: 'test',
      });
      const transformed = result.mapErr(() => newError);

      expect(transformed.isErr()).toBe(true);
      expect((transformed as any).error).toBe(newError);
    });

    it('should not apply mapErr on Ok', () => {
      const result: Result<number> = ok(42);
      const newError = new EntryValidationError('Validation failed', {
        reason: 'test',
      });
      const transformed = result.mapErr(() => newError);

      expect(transformed.isOk()).toBe(true);
      expect(transformed.unwrap()).toBe(42);
    });
  });

  describe('flatMap() Chaining', () => {
    it('should chain operations returning Result', () => {
      const result: Result<number> = ok(10);
      const chained = result.flatMap(n => ok(n * 2));

      expect(chained.isOk()).toBe(true);
      expect(chained.unwrap()).toBe(20);
    });

    it('should short-circuit on error', () => {
      const error = new OrderTimeoutError('timeout', {
        orderId: 'O1',
        symbol: 'BTC',
        timeoutMs: 1000,
      });
      const result: Result<number> = err(error);
      const chained = result.flatMap(n => ok(n * 2));

      expect(chained.isErr()).toBe(true);
    });

    it('should propagate error from operation', () => {
      const error = new EntryValidationError('Validation failed', {
        reason: 'test',
      });
      const result: Result<number> = ok(10);
      const chained = result.flatMap(() => err(error));

      expect(chained.isErr()).toBe(true);
      expect((chained as any).error).toBe(error);
    });

    it('should catch errors in flatMap operation', () => {
      const result: Result<number> = ok(10);
      const chained = result.flatMap(() => {
        throw new Error('Operation failed');
      });

      expect(chained.isErr()).toBe(true);
    });
  });

  describe('match() Pattern Matching', () => {
    it('should execute ok function for Ok result', () => {
      const result: Result<number> = ok(42);
      const value = result.match(
        n => n * 2,
        err => 0,
      );

      expect(value).toBe(84);
    });

    it('should execute error function for Err result', () => {
      const error = new OrderTimeoutError('timeout', {
        orderId: 'O1',
        symbol: 'BTC',
        timeoutMs: 1000,
      });
      const result: Result<number> = err(error);
      const value = result.match(
        n => n * 2,
        err => -1,
      );

      expect(value).toBe(-1);
    });

    it('should throw if error function not provided for Err', () => {
      const error = new OrderTimeoutError('timeout', {
        orderId: 'O1',
        symbol: 'BTC',
        timeoutMs: 1000,
      });
      const result: Result<number> = err(error);

      expect(() => result.match(n => n * 2)).toThrow();
    });

    it('should support side effects in match', () => {
      const sideEffects: string[] = [];
      const result: Result<string> = ok('success');

      result.match(
        value => {
          sideEffects.push(`Success: ${value}`);
          return value;
        },
        error => {
          sideEffects.push(`Error: ${error.message}`);
          return 'error';
        },
      );

      expect(sideEffects).toContain('Success: success');
    });
  });

  describe('JSON Serialization', () => {
    it('should serialize Ok to JSON', () => {
      const result: Result<{ id: number }> = ok({ id: 123 });
      const json = result.toJSON();

      expect((json as any).ok).toBe(true);
      expect((json as any).value.id).toBe(123);
    });

    it('should serialize Err to JSON', () => {
      const error = new OrderTimeoutError('timeout', {
        orderId: 'O1',
        symbol: 'BTC',
        timeoutMs: 1000,
      });
      const result: Result<number> = err(error);
      const json = result.toJSON();

      expect((json as any).ok).toBe(false);
      expect((json as any).error).toBeDefined();
      expect((json as any).error.metadata.code).toBe('ORDER_TIMEOUT');
    });
  });

  describe('tryAsync() Helper', () => {
    it('should wrap successful async operation', async () => {
      const result = await tryAsync(async () => {
        return 42;
      });

      expect(result.isOk()).toBe(true);
      expect(result.unwrap()).toBe(42);
    });

    it('should catch async errors', async () => {
      const result = await tryAsync(async () => {
        throw new Error('Async failed');
      });

      expect(result.isErr()).toBe(true);
      expect((result as any).error.message).toContain('Async operation failed');
    });

    it('should handle trading errors in async', async () => {
      const error = new OrderTimeoutError('timeout', {
        orderId: 'O1',
        symbol: 'BTC',
        timeoutMs: 1000,
      });
      const result = await tryAsync(async () => {
        throw error;
      });

      expect(result.isErr()).toBe(true);
      expect((result as any).error).toBe(error);
    });
  });

  describe('trySync() Helper', () => {
    it('should wrap successful sync operation', () => {
      const result = trySync(() => {
        return 42;
      });

      expect(result.isOk()).toBe(true);
      expect(result.unwrap()).toBe(42);
    });

    it('should catch sync errors', () => {
      const result = trySync(() => {
        throw new Error('Sync failed');
      });

      expect(result.isErr()).toBe(true);
      expect((result as any).error.message).toContain('Sync operation failed');
    });
  });

  describe('combine() Helper', () => {
    it('should combine multiple Ok results', () => {
      const results = [ok(1), ok(2), ok(3)];
      const combined = combine(results);

      expect(combined.isOk()).toBe(true);
      expect(combined.unwrap()).toEqual([1, 2, 3]);
    });

    it('should return first error', () => {
      const error = new OrderTimeoutError('timeout', {
        orderId: 'O1',
        symbol: 'BTC',
        timeoutMs: 1000,
      });
      const results: Result<number>[] = [ok(1), err(error), ok(3)];
      const combined = combine(results);

      expect(combined.isErr()).toBe(true);
      expect((combined as any).error).toBe(error);
    });
  });

  describe('combineAll() Helper', () => {
    it('should combine all Ok results', () => {
      const results = [ok(1), ok(2), ok(3)];
      const combined = combineAll(results);

      expect(combined.isOk()).toBe(true);
      expect(combined.unwrap()).toEqual([1, 2, 3]);
    });

    it('should collect all errors', () => {
      const error1 = new OrderTimeoutError('timeout', {
        orderId: 'O1',
        symbol: 'BTC',
        timeoutMs: 1000,
      });
      const error2 = new EntryValidationError('Validation failed', {
        reason: 'test',
      });
      const results: Result<number>[] = [
        ok(1),
        err(error1),
        ok(3),
        err(error2),
      ];
      const combined = combineAll(results);

      expect(combined.isErr()).toBe(true);
    });

    it('should include collected errors in context', () => {
      const error1 = new OrderTimeoutError('timeout', {
        orderId: 'O1',
        symbol: 'BTC',
        timeoutMs: 1000,
      });
      const results: Result<number>[] = [ok(1), err(error1)];
      const combined = combineAll(results);

      expect(combined.isErr()).toBe(true);
      const ctx = (combined as any).error.metadata.context as any;
      expect(ctx.count).toBe(1);
    });
  });

  describe('Type Safety', () => {
    it('should maintain type information through transformations', () => {
      const result: Result<number> = ok(42);
      const stringResult: Result<string> = result.map(n => `Number: ${n}`);

      expect(stringResult.isOk()).toBe(true);
      expect(stringResult.unwrap()).toBe('Number: 42');
    });

    it('should handle generic types correctly', () => {
      interface User {
        id: string;
        name: string;
      }

      const result: Result<User> = ok({ id: '1', name: 'John' });
      const nameResult = result.map(user => user.name);

      expect(nameResult.isOk()).toBe(true);
      expect(nameResult.unwrap()).toBe('John');
    });
  });
});
