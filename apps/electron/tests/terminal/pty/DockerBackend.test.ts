import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DockerBackend } from '../../../src/services/terminal/pty/DockerBackend';
import { ExecutionContext } from '@ag/protocol';
import * as child_process from 'child_process';
import * as pty from 'node-pty';

vi.mock('child_process', () => ({
  execFile: vi.fn()
}));

vi.mock('node-pty', () => ({
  spawn: vi.fn()
}));

describe('DockerBackend', () => {
  let backend: DockerBackend;
  let mockExecFile: any;
  let mockPtySpawn: any;

  const mockContext: ExecutionContext = {
    target: { kind: 'docker', containerId: 'test-container' },
    shell: { executable: 'bash', args: [] },
    cwd: '/workspace',
    cols: 80,
    rows: 24
  };

  beforeEach(() => {
    backend = new DockerBackend();
    mockExecFile = vi.mocked(child_process.execFile);
    mockPtySpawn = vi.mocked(pty.spawn);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('TEST A — rejects if Docker CLI missing', async () => {
    mockExecFile.mockImplementation((cmd: string, args: string[], callback: any) => {
      callback(new Error('ENOENT'), '', '');
    });

    await expect(backend.createProcess('session-1', mockContext)).rejects.toThrow('Docker executable not found in PATH or unavailable.');
    expect(mockPtySpawn).not.toHaveBeenCalled();
  });

  it('TEST B — rejects if Docker daemon unavailable', async () => {
    mockExecFile.mockImplementation((cmd: string, args: string[], callback: any) => {
      if (args[0] === '--version') return callback(null, 'Docker version...', '');
      if (args[0] === 'info') return callback(new Error('Daemon down'), '', '');
      callback(new Error('Unexpected command'), '', '');
    });

    await expect(backend.createProcess('session-1', mockContext)).rejects.toThrow('Docker daemon is unavailable or not running.');
    expect(mockPtySpawn).not.toHaveBeenCalled();
  });

  it('TEST C — rejects if Container unavailable', async () => {
    mockExecFile.mockImplementation((cmd: string, args: string[], callback: any) => {
      if (args[0] === '--version') return callback(null, 'Docker version...', '');
      if (args[0] === 'info') return callback(null, 'Server Version: ...', '');
      if (args[0] === 'inspect') return callback(new Error('No such container'), '', '');
      callback(new Error('Unexpected command'), '', '');
    });

    await expect(backend.createProcess('session-1', mockContext)).rejects.toThrow("Target container 'test-container' does not exist or is unavailable.");
    expect(mockPtySpawn).not.toHaveBeenCalled();
  });

  it('TEST D — creates PTY when Docker is fully available', async () => {
    mockExecFile.mockImplementation((cmd: string, args: string[], callback: any) => {
      callback(null, 'Success', '');
    });

    let exitCb: () => void = () => {};
    const mockProcess = {
      pid: 1234,
      onExit: vi.fn((cb) => { exitCb = cb; }),
      onData: vi.fn(),
      write: vi.fn(),
      resize: vi.fn(),
      kill: vi.fn()
    };
    mockPtySpawn.mockReturnValue(mockProcess);

    const pid = await backend.createProcess('session-1', mockContext);
    
    expect(pid).toBe('1234');
    expect(mockPtySpawn).toHaveBeenCalledWith('docker', [
      'exec', '-it',
      '--workdir', '/workspace',
      'test-container',
      'bash'
    ], expect.any(Object));
  });

  it('TEST E — cleans up internal processes map on exit', async () => {
    mockExecFile.mockImplementation((cmd: string, args: string[], callback: any) => {
      callback(null, 'Success', '');
    });

    let exitCb: () => void = () => {};
    const mockProcess = {
      pid: 1234,
      onExit: vi.fn((cb) => { exitCb = cb; }),
      onData: vi.fn(),
      write: vi.fn(),
      resize: vi.fn(),
      kill: vi.fn()
    };
    mockPtySpawn.mockReturnValue(mockProcess);

    const pid = await backend.createProcess('session-1', mockContext);
    expect(backend.getProcess(pid)).toBeDefined();

    // Trigger exit
    exitCb({ exitCode: 0 });

    expect(backend.getProcess(pid)).toBeUndefined();
  });

  it('TEST F — executes preflight commands in strict order and aborts early', async () => {
    const executedArgs: string[] = [];
    mockExecFile.mockImplementation((cmd: string, args: string[], callback: any) => {
      executedArgs.push(args[0]);
      if (args[0] === 'info') return callback(new Error('Daemon down'), '', '');
      callback(null, 'Success', '');
    });

    await expect(backend.createProcess('session-1', mockContext)).rejects.toThrow();

    expect(executedArgs).toEqual(['--version', 'info']);
    expect(executedArgs).not.toContain('inspect');
    expect(mockPtySpawn).not.toHaveBeenCalled();
  });
});
