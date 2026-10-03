import { TaskEvent } from '@ag/protocol';

export class TaskOutputBuffer {
  private buffer = '';

  constructor(
    private readonly executionId: string,
    private readonly onLine: (line: string) => void,
    private readonly onEvent: (event: TaskEvent) => void
  ) {}

  public push(chunk: Uint8Array | string): void {
    const text = typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
    this.buffer += text;

    let newlineIndex: number;
    while ((newlineIndex = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, newlineIndex);
      this.buffer = this.buffer.slice(newlineIndex + 1);
      
      const cleanLine = line.endsWith('\r') ? line.slice(0, -1) : line;
      
      // Emit line to problem matchers
      this.onLine(cleanLine);
      
      // Emit full output event for the renderer
      this.onEvent({
        category: 'output',
        kind: 'stdout',
        executionId: this.executionId,
        data: cleanLine + '\n'
      });
    }
  }

  public flush(): void {
    if (this.buffer.length > 0) {
      const cleanLine = this.buffer.endsWith('\r') ? this.buffer.slice(0, -1) : this.buffer;
      this.onLine(cleanLine);
      this.onEvent({
        category: 'output',
        kind: 'stdout',
        executionId: this.executionId,
        data: cleanLine
      });
      this.buffer = '';
    }
  }

  public dispose(): void {
    this.flush();
  }
}
