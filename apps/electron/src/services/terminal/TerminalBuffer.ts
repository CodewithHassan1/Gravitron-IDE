export interface TerminalBufferPolicy {
  flushIntervalMs: number;
  maxHistoryBytes: number;
  maxChunkBytes: number;
  maxPendingFlushBytes: number;
}

export const DefaultBufferPolicy: TerminalBufferPolicy = {
  flushIntervalMs: 16, // ~60fps
  maxHistoryBytes: 1024 * 1024, // 1 MB ring buffer per session
  maxChunkBytes: 64 * 1024, // 64 KB max payload per flush
  maxPendingFlushBytes: 5 * 1024 * 1024 // 5 MB max pending flush before dropping
};

export class TerminalBuffer {
  private history: Uint8Array;
  private historyPos = 0;
  private historyLength = 0;
  
  private pendingQueue: Uint8Array[] = [];
  private pendingBytes = 0;
  
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(
    private policy: TerminalBufferPolicy,
    private onFlush: (data: Uint8Array) => void,
    private onWarning: (msg: string) => void
  ) {
    this.history = new Uint8Array(this.policy.maxHistoryBytes);
  }

  public push(data: Uint8Array): void {
    // 1. Add to history ring buffer
    this.pushHistory(data);

    // 2. Add to live pending queue
    if (this.pendingBytes + data.length > this.policy.maxPendingFlushBytes) {
      // Drop policy: renderer is overwhelmed or IPC is blocking, drop live flush chunk
      this.pendingQueue = [];
      this.pendingBytes = 0;
      this.onWarning('Live buffer overflow, dropped pending chunks');
    }

    this.pendingQueue.push(data);
    this.pendingBytes += data.length;

    this.scheduleFlush();
  }

  private pushHistory(data: Uint8Array): void {
    const size = this.policy.maxHistoryBytes;
    if (data.length >= size) {
      // The incoming data is larger than history buffer itself. Take the tail.
      const tail = data.subarray(data.length - size);
      this.history.set(tail, 0);
      this.historyPos = 0;
      this.historyLength = size;
      return;
    }

    const availableAtEnd = size - this.historyPos;
    if (data.length <= availableAtEnd) {
      this.history.set(data, this.historyPos);
      this.historyPos = (this.historyPos + data.length) % size;
    } else {
      this.history.set(data.subarray(0, availableAtEnd), this.historyPos);
      this.history.set(data.subarray(availableAtEnd), 0);
      this.historyPos = data.length - availableAtEnd;
    }
    
    this.historyLength = Math.min(this.historyLength + data.length, size);
  }

  public getHistory(): Uint8Array {
    if (this.historyLength === 0) return new Uint8Array();
    const result = new Uint8Array(this.historyLength);
    const size = this.policy.maxHistoryBytes;
    
    if (this.historyLength < size) {
      result.set(this.history.subarray(0, this.historyLength), 0);
    } else {
      const firstPartLength = size - this.historyPos;
      result.set(this.history.subarray(this.historyPos, size), 0);
      result.set(this.history.subarray(0, this.historyPos), firstPartLength);
    }
    return result;
  }

  private scheduleFlush(): void {
    if (this.flushTimer !== null) return;
    this.flushTimer = setTimeout(() => this.flush(), this.policy.flushIntervalMs);
  }

  private flush(): void {
    this.flushTimer = null;
    if (this.pendingQueue.length === 0) return;

    const chunk = this.pendingQueue.length === 1 ? this.pendingQueue[0] : Buffer.concat(this.pendingQueue);
    this.pendingQueue = [];
    this.pendingBytes = 0;

    // Chunking to maxChunkBytes
    let offset = 0;
    while (offset < chunk.length) {
      const end = Math.min(offset + this.policy.maxChunkBytes, chunk.length);
      this.onFlush(chunk.subarray(offset, end));
      offset = end;
    }
  }

  public dispose(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.pendingQueue = [];
    this.pendingBytes = 0;
    this.historyLength = 0;
  }
}
