import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
// tests/terminal/lifecycle.test.ts

import { TerminalManagerImpl } from '../../src/services/terminal/manager/TerminalManagerImpl';
import { AbstractTerminalProvider } from '../../src/services/terminal/providers/terminal/AbstractTerminalProvider';
import { MemoryTerminalStream } from '../../src/services/terminal/providers/stream/MemoryTerminalStream';
import { IndexedDBSessionPersistence } from '../../src/services/terminal/persistence/IndexedDBSessionPersistence';
import { TerminalScheduler } from '../../src/services/terminal/scheduler/TerminalScheduler';
import { TerminalSessionState } from '../../src/services/terminal/types';
import { TerminalEvents } from '../../src/services/terminal/events/TerminalEvents';

import { MockTransport } from '../../src/services/terminal/providers/transport/MockTransport';
class TestProvider extends AbstractTerminalProvider {
  constructor() {
    super(new MockTransport());
  }
  public id = 'test';
  public stream: MemoryTerminalStream | null = null;
  public async createStream() {
    this.stream = new MemoryTerminalStream();
    return this.stream;
  }
}

describe('Terminal E2E Lifecycle', () => {
  let manager: TerminalManagerImpl;
  let provider: TestProvider;

  beforeEach(() => {
    provider = new TestProvider();
    manager = new TerminalManagerImpl(
      provider,
      new IndexedDBSessionPersistence(),
      new TerminalScheduler()
    );
  });

  afterEach(() => {
    manager.dispose();
  });

  it('completes full lifecycle gracefully', async () => {
    const session = await manager.createTerminal();
    expect(session.state).toBe(TerminalSessionState.Created);

    await session.connect();
    expect(session.state).toBe(TerminalSessionState.Running);

    const received: string[] = [];
    session.onData((data) => received.push(new TextDecoder().decode(data)));

    await session.write('hello');

    // In-memory echoes immediately
    expect(received.length).toBe(1);
    expect(received[0]).toBe('hello');

    // Simulate connection drop
    provider.stream?.simulateClose();
    // session should transition to Suspended
    expect(session.state).toBe(TerminalSessionState.Suspended);

    // Destroy
    await manager.destroyTerminal(session.id);
    expect(session.state).toBe(TerminalSessionState.Disposed);
    expect(manager.getRegistry().getSessions().length).toBe(0);
  });
});
