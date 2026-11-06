import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProcessManager } from './ProcessManager';
import { ExecutionSessionImpl } from './ExecutionSession';

describe('ProcessManager', () => {
  let manager: ProcessManager;

  beforeEach(() => {
    manager = new ProcessManager();
  });

  const createMockSession = (id: string, workspaceId: string): ExecutionSessionImpl => {
    return {
      id,
      context: { workspaceId },
      process: {
        onExit: vi.fn(),
        kill: vi.fn(),
      },
    } as any;
  };

  it('should register and retrieve a session', () => {
    const session = createMockSession('session-1', 'ws-1');
    manager.reserveSlot('ws-1'); // Must reserve before register
    manager.register(session);

    expect(manager.get('session-1')).toBe(session);
    expect(manager.has('session-1')).toBe(true);
    expect(manager.list().length).toBe(1);
  });

  it('should remove a session', () => {
    const session = createMockSession('session-1', 'ws-1');
    manager.reserveSlot('ws-1');
    manager.register(session);
    manager.remove('session-1');

    expect(manager.has('session-1')).toBe(false);
  });

  it('should enforce resource limits per workspace', () => {
    const wsId = 'ws-limited';

    // Fill up to max
    for (let i = 0; i < ProcessManager.MAX_ACTIVE_TERMINALS_PER_WORKSPACE; i++) {
      manager.reserveSlot(wsId);
      manager.register(createMockSession(`sess-${i}`, wsId));
    }

    // The next one should throw
    expect(() => {
      manager.reserveSlot(wsId);
    }).toThrow(/TERMINAL_RESOURCE_LIMIT_EXCEEDED/);
  });

  it('should allow resource limits in different workspaces', () => {
    const wsA = 'ws-A';
    const wsB = 'ws-B';

    // Fill A
    for (let i = 0; i < ProcessManager.MAX_ACTIVE_TERMINALS_PER_WORKSPACE; i++) {
      manager.reserveSlot(wsA);
      manager.register(createMockSession(`sess-A-${i}`, wsA));
    }

    // Should still allow B
    expect(() => {
      manager.reserveSlot(wsB);
    }).not.toThrow();
  });
});
