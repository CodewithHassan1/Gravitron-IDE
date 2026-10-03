import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TerminalManagerImpl } from './TerminalManagerImpl';
import { AbstractTerminalProvider } from '../providers/terminal/AbstractTerminalProvider';
import { ITerminalTransport, TerminalDescriptor, ITerminalStream } from '../types';
import { TerminalScheduler } from '../scheduler/TerminalScheduler';
import { SessionPersistence } from '../persistence/SessionPersistence';
import { TerminalSnapshot } from '../types';

class MockTransport implements ITerminalTransport {
  name = 'MockTransport';
  async connect() {}
  async createStream(config: TerminalDescriptor): Promise<ITerminalStream> {
    return {
      onData: () => ({ dispose: () => {} }),
      onError: () => ({ dispose: () => {} }),
      onClose: () => ({ dispose: () => {} }),
      write: async () => {},
      dispose: () => {}
    };
  }
  async attachStream(): Promise<any> {
    return { stream: await this.createStream({} as any), history: new Uint8Array() };
  }
  async destroy() {}
  async resize() {}
  async kill() {}
  async detach() {}
  async listSessions() { return []; }
  async getProfiles() { return []; }
  dispose() {}
}

class MockProvider extends AbstractTerminalProvider {
  id = 'mock-provider';
  async validateEnvironment() { return true; }
}

class MockPersistence implements SessionPersistence {
  private store = new Map<string, TerminalSnapshot>();
  async load(workspaceId: string) { return this.store.get(workspaceId) || null; }
  async save(workspaceId: string, snapshot: TerminalSnapshot) { this.store.set(workspaceId, snapshot); }
  async clear(workspaceId: string) { this.store.delete(workspaceId); }
}

describe('TerminalManager', () => {
  let manager: TerminalManagerImpl;
  
  beforeEach(() => {
    const transport = new MockTransport();
    const provider = new MockProvider(transport);
    const persistence = new MockPersistence();
    const scheduler = new TerminalScheduler();
    
    manager = new TerminalManagerImpl(provider, persistence, scheduler);
  });

  it('should create and track a terminal', async () => {
    const session = await manager.createTerminal({ cwd: '/test' });
    expect(session).toBeDefined();
    expect(manager.getTerminal(session.id)).toBeDefined();
    
    const registry = manager.getRegistry();
    expect(registry.getSessions().length).toBe(1);
  });

  it('should destroy a terminal', async () => {
    const session = await manager.createTerminal({ cwd: '/test' });
    expect(manager.getRegistry().getSessions().length).toBe(1);
    
    await manager.destroyTerminal(session.id);
    expect(manager.getRegistry().getSessions().length).toBe(0);
    expect(manager.getTerminal(session.id)).toBeUndefined();
  });

  it('should isolate terminals', async () => {
    const session1 = await manager.createTerminal({ cwd: '/workspace-a', workspaceId: 'ws-a' });
    const session2 = await manager.createTerminal({ cwd: '/workspace-b', workspaceId: 'ws-b' });
    
    expect(session1.id).not.toBe(session2.id);
    expect(session1.metadata.cwd).toBe('/workspace-a');
    expect(session2.metadata.cwd).toBe('/workspace-b');
  });

  it('should destroy all sessions', async () => {
    await manager.createTerminal();
    await manager.createTerminal();
    await manager.createTerminal();
    
    expect(manager.getRegistry().getSessions().length).toBe(3);
    
    await manager.destroyAllSessions();
    expect(manager.getRegistry().getSessions().length).toBe(0);
  });
});
