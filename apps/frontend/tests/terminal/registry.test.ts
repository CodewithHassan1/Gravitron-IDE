import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
// tests/terminal/registry.test.ts

import { TerminalRegistryImpl } from '../../src/services/terminal/registry/TerminalRegistryImpl';
import { TerminalSessionImpl } from '../../src/services/terminal/session/TerminalSessionImpl';
import { AbstractTerminalProvider } from '../../src/services/terminal/providers/terminal/AbstractTerminalProvider';
import { MemoryTerminalStream } from '../../src/services/terminal/providers/stream/MemoryTerminalStream';

import { MockTransport } from '../../src/services/terminal/providers/transport/MockTransport';
class TestProvider extends AbstractTerminalProvider {
  constructor() { super(new MockTransport()); }
  public id = 'test';
  public async createStream() { return new MemoryTerminalStream(); }
}

describe('TerminalRegistryImpl', () => {
  it('manages active session and ordering', () => {
    const registry = new TerminalRegistryImpl();
    const provider = new TestProvider();
    
    const session1 = new TerminalSessionImpl({ id: '1', name: '1', cwd: '/', executable: 'sh', args: [], env: {} }, provider);
    const session2 = new TerminalSessionImpl({ id: '2', name: '2', cwd: '/', executable: 'sh', args: [], env: {} }, provider);

    registry.addSession(session1);
    expect(registry.getActiveSession()?.id).toBe('1');
    expect(registry.getSessions().length).toBe(1);

    registry.addSession(session2);
    expect(registry.getSessions().length).toBe(2);
    // Active should still be 1 until changed
    expect(registry.getActiveSession()?.id).toBe('1');

    registry.setActiveSession('2');
    expect(registry.getActiveSession()?.id).toBe('2');

    registry.removeSession('2');
    // Should fallback to 1
    expect(registry.getActiveSession()?.id).toBe('1');
    expect(registry.getSessions().length).toBe(1);
  });

  it('guarantees UUID uniqueness', () => {
    const registry = new TerminalRegistryImpl();
    const provider = new TestProvider();
    const session1 = new TerminalSessionImpl({ id: '1', name: '1', cwd: '/', executable: 'sh', args: [], env: {} }, provider);
    registry.addSession(session1);
    
    expect(() => {
      registry.addSession(session1);
    }).toThrow('already exists in registry');
  });

  it('returns frozen readonly arrays', () => {
    const registry = new TerminalRegistryImpl();
    const arr = registry.getSessions();
    expect(Object.isFrozen(arr)).toBe(true);
  });
});
