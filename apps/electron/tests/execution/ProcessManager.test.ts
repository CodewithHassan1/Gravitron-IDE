import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProcessManager } from '../../src/services/execution/ProcessManager';
import { ExecutionSessionImpl } from '../../src/services/execution/ExecutionSession';
import * as child_process from 'child_process';

// Mock child_process for taskkill
vi.mock('child_process', () => ({
  execFile: vi.fn((file, args, callback) => callback(null, { stdout: '', stderr: '' })),
}));

describe('ProcessManager', () => {
  let processManager: ProcessManager;
  let execFileMock: any;

  beforeEach(() => {
    processManager = new ProcessManager();
    execFileMock = vi.mocked(child_process.execFile);
    execFileMock.mockClear();
  });

  function createMockSession(id: string, workspaceId: string, backendKind: any, pid: number = 100) {
    let exitCallback: (code: number) => void;
    const processMock = {
      pid,
      kill: vi.fn(),
      write: vi.fn(),
      resize: vi.fn(),
      onData: vi.fn(),
      onExit: vi.fn((cb) => {
        exitCallback = cb;
        return { dispose: vi.fn() };
      }),
      triggerExit: (code: number = 0) => {
        if (exitCallback) exitCallback(code);
      },
    };

    const contextMock: any = { workspaceId };
    const session = new ExecutionSessionImpl(
      id,
      contextMock,
      backendKind,
      {} as any,
      processMock as any,
      Date.now()
    );
    return { session, processMock };
  }

  it('registers and retrieves sessions', () => {
    const { session } = createMockSession('s1', 'w1', 'local');
    processManager.register(session);

    expect(processManager.has('s1')).toBe(true);
    expect(processManager.get('s1')).toBe(session);
    expect(processManager.list()).toContain(session);
  });

  it('removes session on normal exit', () => {
    const { session, processMock } = createMockSession('s1', 'w1', 'local');
    processManager.register(session);

    expect(processManager.has('s1')).toBe(true);

    // Simulate normal exit
    processMock.triggerExit();

    expect(processManager.has('s1')).toBe(false);
  });

  it('explicit termination calls taskkill on Windows for local backend', async () => {
    // Override platform for test
    Object.defineProperty(process, 'platform', { value: 'win32' });

    const { session, processMock } = createMockSession('s1', 'w1', 'local', 12345);
    processManager.register(session);

    await processManager.terminateTree('s1');

    expect(execFileMock).toHaveBeenCalledWith(
      'taskkill',
      ['/PID', '12345', '/T', '/F'],
      expect.any(Function)
    );
    expect(processManager.has('s1')).toBe(false);
    expect(session.state).toBe('killed');
  });

  it('does not use shell interpolation in taskkill', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });

    const { session } = createMockSession('s1', 'w1', 'local', 9999);
    processManager.register(session);

    await processManager.terminateTree('s1');

    // ExecFile uses arguments array natively, meaning no shell interpolation
    expect(execFileMock).toHaveBeenCalledWith(
      'taskkill',
      ['/PID', '9999', '/T', '/F'],
      expect.any(Function)
    );
  });

  it('idempotent termination does not double-kill', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    const { session } = createMockSession('s1', 'w1', 'local', 1111);
    processManager.register(session);

    // Call twice concurrently
    await Promise.all([processManager.terminateTree('s1'), processManager.terminateTree('s1')]);

    expect(execFileMock).toHaveBeenCalledTimes(1);

    // Call again after it is removed
    await processManager.terminateTree('s1');
    expect(execFileMock).toHaveBeenCalledTimes(1);
  });

  it('handles terminate/onExit race safely', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    const { session, processMock } = createMockSession('s1', 'w1', 'local', 2222);
    processManager.register(session);

    // Mock taskkill to trigger exit during termination (simulating race)
    execFileMock.mockImplementationOnce((f: any, a: any, cb: any) => {
      processMock.triggerExit();
      cb(null, { stdout: '' });
    });

    await processManager.terminateTree('s1');

    expect(processManager.has('s1')).toBe(false);
  });

  it('cleans up only specific workspace sessions', async () => {
    const s1 = createMockSession('s1', 'w1', 'local', 10);
    const s2 = createMockSession('s2', 'w1', 'local', 20);
    const s3 = createMockSession('s3', 'w2', 'local', 30);

    processManager.register(s1.session);
    processManager.register(s2.session);
    processManager.register(s3.session);

    await processManager.cleanupWorkspace('w1');

    expect(processManager.has('s1')).toBe(false);
    expect(processManager.has('s2')).toBe(false);
    expect(processManager.has('s3')).toBe(true);
  });

  it('terminateAll cleans up everything', async () => {
    const s1 = createMockSession('s1', 'w1', 'local', 10);
    const s2 = createMockSession('s2', 'w2', 'local', 20);

    processManager.register(s1.session);
    processManager.register(s2.session);

    await processManager.terminateAll();

    expect(processManager.has('s1')).toBe(false);
    expect(processManager.has('s2')).toBe(false);
    expect(processManager.list().length).toBe(0);
  });

  it('docker backend skips taskkill and uses normal kill', async () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    const { session, processMock } = createMockSession('s1', 'w1', 'docker', 5555);
    processManager.register(session);

    await processManager.terminateTree('s1');

    expect(execFileMock).not.toHaveBeenCalled();
    expect(processMock.kill).toHaveBeenCalled();
  });

  it('ignores already-exited processes correctly during termination', async () => {
    const { session, processMock } = createMockSession('s1', 'w1', 'local', 7777);
    processManager.register(session);

    processMock.triggerExit();
    expect(processManager.has('s1')).toBe(false);

    // Should not throw or do anything
    await processManager.terminateTree('s1');
  });

  describe('Resource Limits', () => {
    beforeEach(() => {
      // Overwrite the constant for testing purposes (even though it's readonly)
      (ProcessManager as any).MAX_ACTIVE_TERMINALS_PER_WORKSPACE = 2;
    });

    it('allows creation up to limit', () => {
      processManager.reserveSlot('w1');
      processManager.register(createMockSession('s1', 'w1', 'local').session);

      processManager.reserveSlot('w1');
      processManager.register(createMockSession('s2', 'w1', 'local').session);

      expect(processManager.getWorkspaceSessionCount('w1')).toBe(2);
    });

    it('rejects creation beyond limit deterministically', () => {
      processManager.reserveSlot('w1');
      processManager.register(createMockSession('s1', 'w1', 'local').session);

      processManager.reserveSlot('w1');
      processManager.register(createMockSession('s2', 'w1', 'local').session);

      expect(() => {
        processManager.reserveSlot('w1');
      }).toThrow(/TERMINAL_RESOURCE_LIMIT_EXCEEDED/);
    });

    it('does not allow concurrent reservations to bypass the limit', () => {
      // simulate 3 concurrent reservations
      processManager.reserveSlot('w1'); // 1
      processManager.reserveSlot('w1'); // 2

      // third one should fail immediately
      expect(() => {
        processManager.reserveSlot('w1');
      }).toThrow(/TERMINAL_RESOURCE_LIMIT_EXCEEDED/);
    });

    it('releases reservation if creation fails', () => {
      processManager.reserveSlot('w1');

      // simulate failure
      processManager.releaseReservation('w1');

      // I can still create 2
      processManager.reserveSlot('w1');
      processManager.register(createMockSession('s1', 'w1', 'local').session);

      processManager.reserveSlot('w1');
      processManager.register(createMockSession('s2', 'w1', 'local').session);

      expect(processManager.getWorkspaceSessionCount('w1')).toBe(2);
    });

    it('natural process exit frees a slot', () => {
      processManager.reserveSlot('w1');
      const { session, processMock } = createMockSession('s1', 'w1', 'local');
      processManager.register(session);

      processManager.reserveSlot('w1');
      processManager.register(createMockSession('s2', 'w1', 'local').session);

      // Limit reached
      expect(() => processManager.reserveSlot('w1')).toThrow();

      // Simulate exit
      processMock.triggerExit();

      // Now a slot is free
      expect(() => processManager.reserveSlot('w1')).not.toThrow();
    });

    it('workspace scoped limits are isolated', () => {
      processManager.reserveSlot('w1');
      processManager.register(createMockSession('s1', 'w1', 'local').session);

      processManager.reserveSlot('w1');
      processManager.register(createMockSession('s2', 'w1', 'local').session);

      expect(() => processManager.reserveSlot('w1')).toThrow();

      // Workspace 2 has its own limit
      expect(() => {
        processManager.reserveSlot('w2');
        processManager.register(createMockSession('s3', 'w2', 'local').session);
      }).not.toThrow();
    });
  });
});
