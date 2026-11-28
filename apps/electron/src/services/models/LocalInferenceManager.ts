import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as net from 'net';
import * as os from 'os';
import * as crypto from 'crypto';
import { ChildProcess, spawn, execFile } from 'child_process';
import { promisify } from 'util';
import type { LocalRuntimeStatus } from '@ag/protocol';

const execFileAsync = promisify(execFile);

async function findFreeLoopbackPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      server.close(() => {
        if (port > 0) resolve(port);
        else reject(new Error('Failed to allocate loopback port for llama-server'));
      });
    });
  });
}

export class LocalInferenceManager {
  private proc: ChildProcess | null = null;
  private status: LocalRuntimeStatus = {
    status: 'stopped',
    backend: 'cpu',
    binaryAvailable: false,
  };
  private apiKey: string = '';
  private loadingPromise: Promise<LocalRuntimeStatus> | null = null;
  private listeners = new Set<(status: LocalRuntimeStatus) => void>();

  constructor() {
    this.status.binaryAvailable = Boolean(this.resolveServerBinaryPath());
  }

  public onStatusChanged(listener: (status: LocalRuntimeStatus) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emitStatus(): void {
    const snap = this.getStatus();
    for (const listener of this.listeners) {
      try {
        listener(snap);
      } catch {
        // ignore listener errors
      }
    }
  }

  public resolveServerBinaryPath(): string | null {
    const exeName = process.platform === 'win32' ? 'llama-server.exe' : 'llama-server';
    const candidates = [
      app?.isPackaged ? path.join(process.resourcesPath, 'llama-runtime', exeName) : '',
      path.resolve(app?.getAppPath ? app.getAppPath() : process.cwd(), 'resources', 'llama-runtime', exeName),
      path.resolve(__dirname, '..', '..', 'resources', 'llama-runtime', exeName),
      path.resolve(process.cwd(), 'apps', 'electron', 'resources', 'llama-runtime', exeName),
    ].filter(Boolean);

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
    return null;
  }

  public getStatus(): LocalRuntimeStatus {
    return {
      ...this.status,
      binaryAvailable: Boolean(this.resolveServerBinaryPath()),
    };
  }

  public getActiveEndpoint(): { baseURL: string; apiKey: string; modelId: string } | null {
    if (this.status.status !== 'running' || !this.status.port || !this.status.loadedModelId) {
      return null;
    }
    return {
      baseURL: `http://127.0.0.1:${this.status.port}`,
      apiKey: this.apiKey,
      modelId: this.status.loadedModelId,
    };
  }

  public async loadModel(
    modelId: string,
    ggufPath: string,
    contextSize: number = 4096
  ): Promise<LocalRuntimeStatus> {
    if (
      this.status.status === 'running' &&
      this.status.loadedModelId === modelId &&
      this.proc &&
      !this.proc.killed
    ) {
      return this.getStatus();
    }

    if (this.loadingPromise) {
      await this.loadingPromise.catch(() => {});
    }

    this.loadingPromise = this.startInternal(modelId, ggufPath, contextSize);
    try {
      return await this.loadingPromise;
    } finally {
      this.loadingPromise = null;
    }
  }

  private async startInternal(
    modelId: string,
    ggufPath: string,
    contextSize: number
  ): Promise<LocalRuntimeStatus> {
    await this.unload();

    const binaryPath = this.resolveServerBinaryPath();
    if (!binaryPath) {
      this.status = {
        status: 'error',
        backend: 'cpu',
        binaryAvailable: false,
        error: 'Bundled llama-server runtime binary was not found.',
      };
      this.emitStatus();
      throw new Error(this.status.error);
    }

    if (!fs.existsSync(ggufPath)) {
      this.status = {
        status: 'error',
        backend: 'cpu',
        binaryAvailable: true,
        error: `Model file not found on disk: ${ggufPath}`,
      };
      this.emitStatus();
      throw new Error(this.status.error);
    }

    const port = await findFreeLoopbackPort();
    this.apiKey = crypto.randomBytes(24).toString('hex');
    const threads = Math.max(1, Math.min(os.cpus().length || 4, 8));

    this.status = {
      status: 'starting',
      loadedModelId: modelId,
      port,
      backend: 'cpu',
      binaryAvailable: true,
    };
    this.emitStatus();

    const args = [
      '--model',
      ggufPath,
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
      '--api-key',
      this.apiKey,
      '--ctx-size',
      String(contextSize),
      '--threads',
      String(threads),
      '--jinja',
    ];

    const stderrTail: string[] = [];
    const child = spawn(binaryPath, args, {
      cwd: path.dirname(binaryPath),
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    this.proc = child;
    this.status.pid = child.pid;

    child.stderr?.on('data', (chunk) => {
      const text = chunk.toString();
      stderrTail.push(text);
      if (stderrTail.length > 30) stderrTail.shift();
    });

    child.on('exit', (code, signal) => {
      if (this.proc === child) {
        const wasRunning = this.status.status === 'running';
        this.proc = null;
        this.status = {
          status: wasRunning || code === 0 ? 'stopped' : 'error',
          backend: 'cpu',
          binaryAvailable: true,
          ...(code && code !== 0
            ? { error: `llama-server exited (${code}/${signal || 'none'}): ${stderrTail.slice(-3).join('').trim().slice(0, 220)}` }
            : {}),
        };
        this.emitStatus();
      }
    });

    // Poll /health on 127.0.0.1:<port> up to 120s while process stays alive
    const deadline = Date.now() + 120000;
    let lastHealthStatus = 0;
    while (Date.now() < deadline) {
      if (!this.proc || this.proc !== child) {
        throw new Error(this.status.error || 'llama-server exited before becoming ready.');
      }
      try {
        const res = await fetch(`http://127.0.0.1:${port}/health`, {
          headers: { Authorization: `Bearer ${this.apiKey}` },
        });
        lastHealthStatus = res.status;
        if (res.ok) {
          this.status = {
            status: 'running',
            loadedModelId: modelId,
            port,
            pid: child.pid,
            backend: 'cpu',
            binaryAvailable: true,
          };
          this.emitStatus();
          return this.getStatus();
        }
      } catch {
        // still loading weights into memory
      }
      await new Promise((r) => setTimeout(r, 400));
    }

    const tail = stderrTail.slice(-5).join('').trim().slice(0, 240);
    await this.unload();
    throw new Error(
      `Timed out waiting for local inference runtime to load model weights (last HTTP ${lastHealthStatus}${tail ? `: ${tail}` : ''}).`
    );
  }

  public async unload(): Promise<void> {
    const child = this.proc;
    this.proc = null;
    if (child && child.pid) {
      try {
        if (process.platform === 'win32') {
          await execFileAsync('taskkill', ['/PID', String(child.pid), '/T', '/F']).catch(() => {
            child.kill('SIGKILL');
          });
        } else {
          child.kill('SIGTERM');
        }
      } catch {
        // ignore cleanup failure
      }
    }
    this.apiKey = '';
    this.status = {
      status: 'stopped',
      backend: 'cpu',
      binaryAvailable: Boolean(this.resolveServerBinaryPath()),
    };
    this.emitStatus();
  }
}
