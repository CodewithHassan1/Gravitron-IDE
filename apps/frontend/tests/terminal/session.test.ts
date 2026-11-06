import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
// tests/terminal/session.test.ts

import { TerminalSessionImpl } from '../../src/services/terminal/session/TerminalSessionImpl';
import { TerminalSessionState } from '../../src/services/terminal/types';
import { AbstractTerminalProvider } from '../../src/services/terminal/providers/terminal/AbstractTerminalProvider';
import { MemoryTerminalStream } from '../../src/services/terminal/providers/stream/MemoryTerminalStream';

import { MockTransport } from '../../src/services/terminal/providers/transport/MockTransport';
class TestProvider extends AbstractTerminalProvider {
  constructor() {
    super(new MockTransport());
  }
  public id = 'test';
  public async createStream() {
    return new MemoryTerminalStream();
  }
}

describe('TerminalSessionImpl', () => {
  const metadata = {
    id: '123',
    name: 'test',
    cwd: '/',
    executable: 'sh',
    args: [],
    env: {},
  };

  it('enforces strict state transitions', async () => {
    const provider = new TestProvider();
    const session = new TerminalSessionImpl(metadata, provider);

    expect(session.state).toBe(TerminalSessionState.Created);

    await session.connect();
    expect(session.state).toBe(TerminalSessionState.Running);

    await session.suspend();
    expect(session.state).toBe(TerminalSessionState.Suspended);

    await session.resume();
    expect(session.state).toBe(TerminalSessionState.Running);

    await session.close();
    expect(session.state).toBe(TerminalSessionState.Closed);

    session.dispose();
    expect(session.state).toBe(TerminalSessionState.Disposed);
  });

  it('throws deterministic error on illegal transitions', async () => {
    const provider = new TestProvider();
    const session = new TerminalSessionImpl(metadata, provider);

    // Cannot write in Created state
    await expect(session.write('test')).rejects.toThrow('Cannot write data in state Created');
  });
});
