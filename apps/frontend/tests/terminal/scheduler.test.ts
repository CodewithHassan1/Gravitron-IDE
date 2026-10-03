import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
// tests/terminal/scheduler.test.ts

import { TerminalScheduler } from '../../src/services/terminal/scheduler/TerminalScheduler';

describe('TerminalScheduler', () => {
  beforeAll(() => {
    vi.useFakeTimers();
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it('debounces multiple calls into one', () => {
    const scheduler = new TerminalScheduler();
    const fn = vi.fn();

    scheduler.debounce('test', fn, 100);
    scheduler.debounce('test', fn, 100);
    scheduler.debounce('test', fn, 100);

    vi.advanceTimersByTime(50);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledTimes(1);

    scheduler.dispose();
  });

  it('cleans up timers on dispose', () => {
    const scheduler = new TerminalScheduler();
    const fn = vi.fn();

    scheduler.debounce('test', fn, 100);
    scheduler.dispose();

    vi.advanceTimersByTime(150);
    expect(fn).not.toHaveBeenCalled();
  });
});
