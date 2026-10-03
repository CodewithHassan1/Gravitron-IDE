import { describe, it, expect } from 'vitest';
import { LocalBackend } from '../../src/services/terminal/pty/LocalBackend';
import { randomUUID } from 'crypto';
import { ExecutionContext } from '@ag/protocol';
import os from 'os';

describe('Native PTY Stress Tests', () => {
  it('creates and destroys 100 terminal instances without leaking', async () => {
    const backend = new LocalBackend();

    const context: ExecutionContext = {
      target: { kind: 'local' },
      cwd: os.homedir(),
      environment: { ...process.env, NODE_ENV: 'test' } as Record<string, string>,
      shell: {
        executable: process.platform === 'win32' ? 'cmd.exe' : 'sh',
        args: []
      },
      cols: 80,
      rows: 24,
      profiles: [],
      policies: []
    };

    for (let i = 0; i < 100; i++) {
      const sessionId = randomUUID();
      const nativeProcessId = await backend.createProcess(sessionId, context);
      const ptyProcess = backend.getProcess(nativeProcessId);
      expect(ptyProcess).toBeDefined();

      const exitPromise = new Promise<void>(resolve => {
        ptyProcess!.onExit(() => resolve());
      });

      // Write a simple command to ensure process is active
      ptyProcess!.write('echo ' + i + '\n');
      
      // Kill
      ptyProcess!.kill();
      
      // Ensure it cleans up locally in backend on exit callback
      await exitPromise;

      expect(backend.getProcess(nativeProcessId)).toBeUndefined();
    }
    
    backend.dispose();
  }, 30000); // 30 second timeout for 100 cycles
});
