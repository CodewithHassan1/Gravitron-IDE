import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
// tests/terminal/manager.test.ts

import { TerminalManagerImpl } from '../../src/services/terminal/manager/TerminalManagerImpl';
import { AbstractTerminalProvider } from '../../src/services/terminal/providers/terminal/AbstractTerminalProvider';
import { MemoryTerminalStream } from '../../src/services/terminal/providers/stream/MemoryTerminalStream';
import { IndexedDBSessionPersistence } from '../../src/services/terminal/persistence/IndexedDBSessionPersistence';
import { TerminalScheduler } from '../../src/services/terminal/scheduler/TerminalScheduler';
import { TerminalSessionState } from '../../src/services/terminal/types';

import { MockTransport } from '../../src/services/terminal/providers/transport/MockTransport';
class TestProvider extends AbstractTerminalProvider {
  constructor() { super(new MockTransport()); }
  public id = 'test';
  public async createStream() { return new MemoryTerminalStream(); }
}

describe('TerminalManagerImpl', () => {
  let manager: TerminalManagerImpl;

  beforeEach(() => {
    // Suppress IDB warnings from fake env
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    manager = new TerminalManagerImpl(
      new TestProvider(),
      new IndexedDBSessionPersistence(),
      new TerminalScheduler()
    );
  });

  afterEach(() => {
    manager.dispose();
    vi.restoreAllMocks();
  });

  it('creates sessions with UUIDs', async () => {
    const session = await manager.createTerminal({ name: 'test' });
    expect(session.id).toBeDefined();
    expect(session.id.length).toBe(36); // UUID length
    expect(session.metadata.name).toBe('test');
    expect(session.metadata.debugLabel).toBe('Terminal 1');
  });

  it('adds session to registry on creation', async () => {
    const session = await manager.createTerminal();
    const registry = manager.getRegistry();
    expect(registry.getSessions().length).toBe(1);
    expect(registry.getActiveSession()?.id).toBe(session.id);
  });

  it('destroys terminals properly', async () => {
    const session = await manager.createTerminal();
    expect(manager.getRegistry().getSessions().length).toBe(1);
    
    await manager.destroyTerminal(session.id);
    expect(manager.getRegistry().getSessions().length).toBe(0);
    expect(session.state).toBe(TerminalSessionState.Disposed);
  });

  it('is completely cleaned up on dispose', async () => {
    await manager.createTerminal();
    manager.dispose();
    
    expect(manager.getRegistry().getSessions().length).toBe(0);
    await expect(manager.createTerminal()).rejects.toThrow('TerminalManager is disposed');
  });
});
