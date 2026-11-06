import { IProcess } from './types';
import { IExecutionBackend, ExecutionBackendCapabilities } from './IExecutionBackend';
import { NodePTYAdapter } from './NodePTYAdapter';
import * as pty from 'node-pty';
import { ExecutionBackendKind, ExecutionContext } from '@ag/protocol';
import * as child_process from 'child_process';
import * as util from 'util';
export class DockerBackend implements IExecutionBackend {
  public readonly kind: ExecutionBackendKind = 'docker';

  public readonly capabilities: ExecutionBackendCapabilities = {
    supportsResize: true,
    supportsSignals: false,
    supportsReconnect: true,
    supportsPersistentSessions: false,
    supportsEnvironmentVariables: true,
    supportsWorkingDirectory: true,
    supportsHistory: true,
    supportsBinaryStreams: true,
    supportsDetach: true,
    supportsAttach: true,
    supportsTitleEvents: false,
  };

  private processes = new Map<string, IProcess>();

  constructor() {}

  public async createProcess(sessionId: string, context: ExecutionContext): Promise<string> {
    if (context.target.kind !== 'docker') {
      throw new Error(`DockerBackend cannot execute target of kind ${context.target.kind}`);
    }

    // Phase 1: Pre-flight Capability Checks
    const execFileAsync = util.promisify(child_process.execFile);

    // 1. Check Docker CLI
    try {
      await execFileAsync('docker', ['--version']);
    } catch (e: any) {
      throw new Error('Docker executable not found in PATH or unavailable.');
    }

    // 2. Check Docker daemon
    try {
      await execFileAsync('docker', ['info']);
    } catch (e: any) {
      throw new Error('Docker daemon is unavailable or not running.');
    }

    // 3. Check container existence
    try {
      await execFileAsync('docker', ['inspect', context.target.containerId]);
    } catch (e: any) {
      throw new Error(
        `Target container '${context.target.containerId}' does not exist or is unavailable.`
      );
    }

    const args: string[] = ['exec', '-it'];

    if (context.target.user) {
      args.push('--user', context.target.user);
    }

    // We use context.cwd instead of target.workingDirectory, because context.cwd is the resolved directory
    if (context.cwd && context.cwd !== '/') {
      args.push('--workdir', context.cwd);
    }

    if (context.environment) {
      for (const [k, v] of Object.entries(context.environment)) {
        args.push('--env', `${k}=${v}`);
      }
    }

    args.push(context.target.containerId);
    args.push(context.shell.executable);
    args.push(...context.shell.args);

    const ptyProcess = pty.spawn('docker', args, {
      name: 'xterm-256color',
      cols: context.cols,
      rows: context.rows,
      env: process.env as any, // local environment for docker CLI
      useConpty: process.env.NODE_ENV !== 'test',
    });

    const nativeProcessId = ptyProcess.pid.toString();
    const adapter = new NodePTYAdapter(ptyProcess);

    this.processes.set(nativeProcessId, adapter);

    adapter.onExit(() => {
      this.processes.delete(nativeProcessId);
    });

    return nativeProcessId;
  }

  public getProcess(nativeProcessId: string): IProcess | undefined {
    return this.processes.get(nativeProcessId);
  }

  public dispose(): void {
    for (const p of this.processes.values()) {
      p.kill();
    }
    this.processes.clear();
  }
}
