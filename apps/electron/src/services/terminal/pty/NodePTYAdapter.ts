import { IProcess } from './types';
import * as pty from 'node-pty';

export class NodePTYAdapter implements IProcess {
  private dataListeners: Set<(data: Uint8Array) => void> = new Set();
  private exitListeners: Set<(code: number) => void> = new Set();
  private ptyProcess: pty.IPty;
  private disposed = false;

  public get pid(): number {
    return this.ptyProcess.pid;
  }

  constructor(ptyProcess: pty.IPty) {
    this.ptyProcess = ptyProcess;

    this.ptyProcess.onData((data) => {
      if (this.disposed) return;
      const buf = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data;
      
      const uint8 = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
      this.dataListeners.forEach(cb => cb(uint8));
    });

    this.ptyProcess.onExit((e) => {
      if (this.disposed) return;
      this.exitListeners.forEach(cb => cb(e.exitCode));
      this.dispose();
    });
  }

  public write(data: string | Uint8Array): void {
    if (this.disposed) return;
    if (data instanceof Uint8Array) {
      this.ptyProcess.write(Buffer.from(data).toString('utf-8')); // pty write accepts string. Note: binary writes are tricky in node-pty, we'll toString utf-8 for now
    } else {
      this.ptyProcess.write(data);
    }
  }

  public resize(cols: number, rows: number): void {
    if (this.disposed) return;
    try {
      this.ptyProcess.resize(cols, rows);
    } catch (err) {
      // Ignore OS errors if the process has died just as we resize
    }
  }

  public kill(signal?: string): void {
    if (this.disposed) return;
    try {
      this.ptyProcess.kill(signal);
    } catch (err) {
      // Ignore
    }
    // Manually trigger exit to guarantee cleanup, as node-pty may swallow the event when killed on Windows
    this.exitListeners.forEach(cb => cb(0));
    this.dispose();
  }

  public onData(callback: (data: Uint8Array) => void): { dispose: () => void } {
    this.dataListeners.add(callback);
    return { dispose: () => this.dataListeners.delete(callback) };
  }

  public onExit(callback: (exitCode: number) => void): { dispose: () => void } {
    this.exitListeners.add(callback);
    return { dispose: () => this.exitListeners.delete(callback) };
  }

  private dispose(): void {
    this.disposed = true;
    this.dataListeners.clear();
    this.exitListeners.clear();
  }
}
