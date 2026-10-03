// src/services/terminal/providers/stream/MemoryTerminalStream.ts

import { ITerminalStream, IDisposable } from '../../types';

export class MemoryTerminalStream implements ITerminalStream {
  private dataListeners: Set<(data: Uint8Array) => void> = new Set();
  private closeListeners: Set<() => void> = new Set();
  private errorListeners: Set<(err: Error) => void> = new Set();
  private disposed = false;

  public async write(data: Uint8Array): Promise<void> {
    if (this.disposed) return;
    // In memory stream echoes or processes data.
    // For infrastructure testing, it just echoes back.
    const copy = new Uint8Array(data);
    for (const listener of Array.from(this.dataListeners)) {
      listener(copy);
    }
  }

  public onData(listener: (data: Uint8Array) => void): IDisposable {
    this.dataListeners.add(listener);
    return {
      dispose: () => this.dataListeners.delete(listener)
    };
  }

  public onClose(listener: () => void): IDisposable {
    this.closeListeners.add(listener);
    return {
      dispose: () => this.closeListeners.delete(listener)
    };
  }

  public onError(listener: (error: Error) => void): IDisposable {
    this.errorListeners.add(listener);
    return {
      dispose: () => this.errorListeners.delete(listener)
    };
  }

  public simulateClose(): void {
    if (this.disposed) return;
    for (const listener of Array.from(this.closeListeners)) {
      listener();
    }
    this.dispose();
  }

  public simulateError(error: Error): void {
    if (this.disposed) return;
    for (const listener of Array.from(this.errorListeners)) {
      listener(error);
    }
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.dataListeners.clear();
    this.closeListeners.clear();
    this.errorListeners.clear();
  }
}
