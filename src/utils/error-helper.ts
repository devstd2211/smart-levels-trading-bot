/**
 * Error Helper Utilities
 *
 * Standardized error handling patterns for unknown error types.
 * Replaces repeated boilerplate code across services.
 */

import { ErrorContext } from '../types';

/**
 * Extract error message from unknown error type
 * Handles Error objects, strings, and other types safely
 */
export function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  if (typeof error === 'object' && error !== null) {
    const err = error as Record<string, unknown>;
    if (typeof err.message === 'string') {
      return err.message;
    }
  }

  return String(error);
}

/**
 * Extract error stack trace if available
 */
export function extractErrorStack(error: unknown): string | undefined {
  if (error instanceof Error && error.stack) {
    return error.stack;
  }

  return undefined;
}

/**
 * Create standardized error context for logging
 */
export function createErrorContext(
  error: unknown,
  context?: Record<string, unknown>,
): ErrorContext {
  return {
    message: extractErrorMessage(error),
    timestamp: Date.now(),
    context,
  };
}

/**
 * Extract error code/name if available
 */
export function extractErrorCode(error: unknown): string | undefined {
  if (error instanceof Error) {
    return error.name;
  }

  if (typeof error === 'object' && error !== null) {
    const err = error as Record<string, unknown>;
    if (typeof err.code === 'string') {
      return err.code;
    }
    if (typeof err.name === 'string') {
      return err.name;
    }
  }

  return undefined;
}

/**
 * Type guard: check if value is Error instance
 */
export function isError(value: unknown): value is Error {
  return value instanceof Error;
}

/**
 * Type guard: check if value is ErrorContext
 */
export function isErrorContext(value: unknown): value is ErrorContext {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const ctx = value as Record<string, unknown>;
  return (
    typeof ctx.message === 'string' &&
    typeof ctx.timestamp === 'number'
  );
}

/**
 * Check if error is a critical API error that requires immediate shutdown
 * Critical errors include:
 * - API key expired or invalid (code 33004, 30001, 10002, 11000)
 * - Unauthorized/forbidden access (401, 403)
 * - Rate limit exceeded repeatedly
 * - Connection refused or unreachable
 *
 * @param error - Unknown error type
 * @returns true if error is critical and requires shutdown
 */
export function isCriticalApiError(error: unknown): boolean {
  const message = extractErrorMessage(error);
  const code = extractErrorCode(error);

  // Check message for critical keywords
  const criticalPatterns = [
    /api key.*expired/i,
    /expired api key/i,
    /invalid api key/i,
    /api key invalid/i,
    /unauthorized/i,
    /forbidden/i,
    /authentication.*failed/i,
    /permission.*denied/i,
  ];

  if (criticalPatterns.some(pattern => pattern.test(message))) {
    return true;
  }

  // Check for critical Bybit API error codes
  const criticalBybitCodes = [
    33004, // API key has expired
    30001, // Unauthorized
    10002, // Invalid API key
    11000, // Invalid request
    9000,  // Access Denied
  ];

  if (typeof error === 'object' && error !== null) {
    const err = error as Record<string, unknown>;
    const errorCode = err.code as unknown;
    if (typeof errorCode === 'number' && criticalBybitCodes.includes(errorCode)) {
      return true;
    }
    // Also check for error code in the message (e.g., "code: 33004")
    const codeMatch = message.match(/code:\s*(\d+)/i);
    if (codeMatch) {
      const parsedCode = parseInt(codeMatch[1], 10);
      if (criticalBybitCodes.includes(parsedCode)) {
        return true;
      }
    }
  }

  return false;
}
