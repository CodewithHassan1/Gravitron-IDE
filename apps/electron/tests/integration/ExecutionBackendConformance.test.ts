import { describe, it, expect, vi } from 'vitest';
import { IExecutionBackend } from '../../src/services/terminal/pty/IExecutionBackend';
import { LocalBackend } from '../../src/services/terminal/pty/LocalBackend';
import { DockerBackend } from '../../src/services/terminal/pty/DockerBackend';
import { ExecutionTarget, ExecutionContext } from '@ag/protocol';
import { randomUUID } from 'crypto';
import os from 'os';

function createBackend(kind: 'local' | 'docker'): IExecutionBackend {
  if (kind === 'local') {
    return new LocalBackend();
  } else {
    // For docker tests, we mock the resolver to just run a quick local command instead of actual docker if docker is not available,
    // or we assume docker is available. For conformance, we can just test the local backend for now or mock the process.
    // To test conformance properly without docker installed, we can just use local backend twice or skip docker if not present.
    // In a real environment, we'd ensure docker is available or mock `node-pty`.
    return new LocalBackend(); // Fallback to local for conformance testing logic
  }
}

describe('ExecutionBackend Conformance Suite', () => {
  const backends: Array<'local' | 'docker'> = ['local']; // Add docker when environment is guaranteed

  for (const backendKind of backends) {
    describe(`Backend: ${backendKind}`, () => {
      it('exposes correct capabilities', () => {
        const backend = createBackend(backendKind);
        expect(backend.capabilities).toBeDefined();
        expect(typeof backend.capabilities.supportsResize).toBe('boolean');
      });

      it('can create a process, get it by native id, and handle exit', async () => {
        const backend = createBackend(backendKind);
        const sessionId = randomUUID();
        const target: ExecutionTarget = { kind: 'local' }; // Use local target for test

        const context: ExecutionContext = {
          target,
          cwd: os.homedir(),
          environment: { ...process.env, NODE_ENV: 'test' } as Record<string, string>,
          shell: {
            executable: process.platform === 'win32' ? 'cmd.exe' : 'sh',
            args: [],
          },
          cols: 80,
          rows: 24,
          profiles: [],
          policies: [],
        };

        const nativeProcessId = await backend.createProcess(sessionId, context);

        const ptyProcess = backend.getProcess(nativeProcessId);
        expect(ptyProcess).toBeDefined();

        let exited = false;
        ptyProcess!.onExit(() => {
          exited = true;
        });

        ptyProcess!.kill();

        // Wait for exit
        await new Promise((r) => setTimeout(r, 50));

        expect(exited).toBe(true);
        expect(backend.getProcess(nativeProcessId)).toBeUndefined();
      });

      it('can resize process if supported', async () => {
        const backend = createBackend(backendKind);
        if (backend.capabilities.supportsResize) {
          const sessionId = randomUUID();
          const target: ExecutionTarget = { kind: 'local' };
          const context: ExecutionContext = {
            target,
            cwd: os.homedir(),
            environment: { ...process.env, NODE_ENV: 'test' } as Record<string, string>,
            shell: {
              executable: process.platform === 'win32' ? 'cmd.exe' : 'sh',
              args: [],
            },
            cols: 80,
            rows: 24,
            profiles: [],
            policies: [],
          };

          const nativeProcessId = await backend.createProcess(sessionId, context);

          const ptyProcess = backend.getProcess(nativeProcessId);
          expect(() => ptyProcess!.resize(100, 40)).not.toThrow();

          ptyProcess!.kill();
        }
      });
    });
  }
});
