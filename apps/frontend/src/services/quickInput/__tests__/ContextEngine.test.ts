import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ContextEngineImpl, ContextEngine } from '../ContextEngine';

describe('ContextEngine Environment & Platform Detection (Regression Gate C.4)', () => {
  let originalNavigator: any;
  let navigatorDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    originalNavigator = (globalThis as any).navigator;
  });

  afterEach(() => {
    if (navigatorDescriptor) {
      Object.defineProperty(globalThis, 'navigator', navigatorDescriptor);
    } else if (originalNavigator !== undefined) {
      (globalThis as any).navigator = originalNavigator;
    } else {
      delete (globalThis as any).navigator;
    }
  });

  it('constructs without throwing when navigator is undefined (Node 20 runtime compatibility)', () => {
    // Delete navigator to simulate Node 20 where navigator is not defined globally
    delete (globalThis as any).navigator;

    expect(() => new ContextEngineImpl()).not.toThrow();

    const engine = new ContextEngineImpl();
    // Should safely resolve to boolean values without throwing ReferenceError
    expect(typeof engine.getContext('isMac')).toBe('boolean');
    expect(typeof engine.getContext('isWindows')).toBe('boolean');
    expect(typeof engine.getContext('isLinux')).toBe('boolean');
  });

  it('correctly detects macOS when browser navigator userAgent indicates Mac', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
      configurable: true,
      writable: true,
    });

    const engine = new ContextEngineImpl();
    expect(engine.getContext('isMac')).toBe(true);
    expect(engine.getContext('isWindows')).toBe(false);
    expect(engine.getContext('isLinux')).toBe(false);
  });

  it('correctly detects Windows when browser navigator userAgent indicates Win', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      configurable: true,
      writable: true,
    });

    const engine = new ContextEngineImpl();
    expect(engine.getContext('isMac')).toBe(false);
    expect(engine.getContext('isWindows')).toBe(true);
    expect(engine.getContext('isLinux')).toBe(false);
  });

  it('correctly detects Linux when browser navigator userAgent indicates Linux', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' },
      configurable: true,
      writable: true,
    });

    const engine = new ContextEngineImpl();
    expect(engine.getContext('isMac')).toBe(false);
    expect(engine.getContext('isWindows')).toBe(false);
    expect(engine.getContext('isLinux')).toBe(true);
  });

  it('evaluates context keys and expressions correctly', () => {
    const engine = new ContextEngineImpl();
    engine.setContext('customKey', 'active');
    expect(engine.getContext('customKey')).toBe('active');

    expect(engine.evaluate('')).toBe(true);
    expect(engine.evaluate(undefined)).toBe(true);
    expect(engine.evaluate('customKey == "active"')).toBe(true);
    expect(engine.evaluate('customKey == "inactive"')).toBe(false);
  });

  it('exports singleton ContextEngine instance safely', () => {
    expect(ContextEngine).toBeDefined();
    expect(typeof ContextEngine.setContext).toBe('function');
    expect(typeof ContextEngine.getContext).toBe('function');
    expect(typeof ContextEngine.evaluate).toBe('function');
  });
});
