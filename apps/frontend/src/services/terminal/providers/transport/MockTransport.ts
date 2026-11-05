import { ITerminalTransport, TerminalDescriptor, ITerminalStream } from '../../types';
import { MemoryTerminalStream } from '../stream/MemoryTerminalStream';

export class MockTransport implements ITerminalTransport {
  public readonly name = 'MockTransport';
  private streams: Map<string, MemoryTerminalStream> = new Map();

  public async connect(): Promise<void> {
    // No-op for mock
  }

  public async createStream(config: TerminalDescriptor): Promise<ITerminalStream> {
    const stream = new MemoryTerminalStream();
    this.streams.set(config.metadata.id, stream);

    // No fake prompt generation, rely on backend

    return stream;
  }

  public async resize(terminalId: string, cols: number, rows: number): Promise<void> {
    // No-op for mock, but could log or validate
  }

  public async kill(terminalId: string, signal?: string): Promise<void> {
    const stream = this.streams.get(terminalId);
    if (stream) {
      stream.simulateClose();
      this.streams.delete(terminalId);
    }
  }

  public async attachStream(
    terminalId: string,
    sessionId: string
  ): Promise<{ stream: ITerminalStream; history: Uint8Array }> {
    let stream = this.streams.get(terminalId);
    if (!stream) {
      stream = new MemoryTerminalStream();
      this.streams.set(terminalId, stream);
    }
    return { stream, history: new Uint8Array() };
  }

  public async detach(terminalId: string): Promise<void> {
    // No-op for mock
  }

  public async listSessions(): Promise<{ sessionId: string; state: string }[]> {
    return Array.from(this.streams.keys()).map((id) => ({ sessionId: id, state: 'running' }));
  }

  public async getProfiles(): Promise<any[]> {
    return [];
  }

  public dispose(): void {
    Array.from(this.streams.values()).forEach((stream) => stream.dispose());
    this.streams.clear();
  }
}
