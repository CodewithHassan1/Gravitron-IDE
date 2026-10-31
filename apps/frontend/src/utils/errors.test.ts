import { describe, it, expect } from 'vitest';
import { getErrorMessage } from './errors';

describe('Frontend Error Formatter', () => {
  it('should format a basic string', () => {
    expect(getErrorMessage('Simple error')).toBe('Simple error');
  });

  it('should strip ConnectRPC error codes from the message', () => {
    const err = new Error('[invalid_argument] Email and password required');
    expect(getErrorMessage(err)).toBe('Email and password required');
  });

  it('should handle ConnectRPC errors with different codes', () => {
    const err = new Error('[unauthenticated] The email or password is incorrect.');
    expect(getErrorMessage(err)).toBe('The email or password is incorrect.');
  });

  it('should map network failures to user-friendly messages', () => {
    const err1 = new Error('fetch failed');
    const err2 = new Error('NetworkError when attempting to fetch resource.');
    const err3 = new Error('Failed to fetch');

    const expected = 'Authentication service unavailable or network failure. Please try again.';
    expect(getErrorMessage(err1)).toBe(expected);
    expect(getErrorMessage(err2)).toBe(expected);
    expect(getErrorMessage(err3)).toBe(expected);
  });

  it('should provide a generic fallback for unknown objects', () => {
    expect(getErrorMessage({ code: 500 })).toBe('An unexpected error occurred. Please try again.');
  });
});
