// src/services/terminal/scheduler/TerminalScheduler.ts

import { IDisposable } from '../types';

export class TerminalScheduler implements IDisposable {
  private debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private retryTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  public debounce(key: string, fn: () => void, delayMs: number): void {
    if (this.debounceTimers.has(key)) {
      clearTimeout(this.debounceTimers.get(key));
    }
    const timer = setTimeout(() => {
      this.debounceTimers.delete(key);
      try {
        fn();
      } catch (e) {
        console.error(`TerminalScheduler debounce error for ${key}:`, e);
      }
    }, delayMs);
    this.debounceTimers.set(key, timer);
  }

  public scheduleRetry(key: string, fn: () => void, delayMs: number): void {
    this.clearRetry(key);
    const timer = setTimeout(() => {
      this.retryTimers.delete(key);
      try {
        fn();
      } catch (e) {
        console.error(`TerminalScheduler retry error for ${key}:`, e);
      }
    }, delayMs);
    this.retryTimers.set(key, timer);
  }

  public clearRetry(key: string): void {
    if (this.retryTimers.has(key)) {
      clearTimeout(this.retryTimers.get(key));
      this.retryTimers.delete(key);
    }
  }

  public clearDebounce(key: string): void {
    if (this.debounceTimers.has(key)) {
      clearTimeout(this.debounceTimers.get(key));
      this.debounceTimers.delete(key);
    }
  }

  public dispose(): void {
    for (const timer of Array.from(this.debounceTimers.values())) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();

    for (const timer of Array.from(this.retryTimers.values())) {
      clearTimeout(timer);
    }
    this.retryTimers.clear();
  }
}
