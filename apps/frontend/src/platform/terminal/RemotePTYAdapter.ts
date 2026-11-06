import { IPTYAdapter, TerminalCapability } from './IPTYAdapter';
import { ITransport } from './TerminalTransport';

export class RemotePTYAdapter implements IPTYAdapter {
  capabilities: TerminalCapability = {
    supportsResize: true,
    supportsColor: true,
    supportsUnicode: true,
    supportsShellIntegration: false,
    supportsClipboard: true,
    supportsPersistence: true,
    supportsOSC52: true,
  };

  private dataListeners: Set<(data: string) => void> = new Set();
  private exitListeners: Set<(exitCode: number) => void> = new Set();
  private unsubscribeMessage: (() => void) | null = null;
  private unsubscribeClose: (() => void) | null = null;

  constructor(private transport: ITransport) {}

  async spawn(
    executable: string,
    args: string[],
    cwd: string,
    env: Record<string, string>
  ): Promise<void> {
    if (!this.transport.isConnected()) {
      await this.transport.connect();
    }

    this.unsubscribeMessage = this.transport.onMessage((msg) => {
      // In a real implementation, msg would be parsed (e.g. JSON with type: 'data' | 'exit')
      this.dataListeners.forEach((l) => l(msg));
    });

    this.unsubscribeClose = this.transport.onClose(() => {
      this.exitListeners.forEach((l) => l(0)); // Propagate exit
    });

    // Send spawn command
    this.transport.send(JSON.stringify({ type: 'spawn', executable, args, cwd, env }));
  }

  write(data: string): void {
    if (!this.transport.isConnected()) throw new Error('RemotePTYAdapter not connected');
    this.transport.send(JSON.stringify({ type: 'write', data }));
  }

  resize(cols: number, rows: number): void {
    if (this.transport.isConnected()) {
      this.transport.send(JSON.stringify({ type: 'resize', cols, rows }));
    }
  }

  kill(): void {
    if (this.transport.isConnected()) {
      this.transport.send(JSON.stringify({ type: 'kill' }));
    }
  }

  onData(listener: (data: string) => void): () => void {
    this.dataListeners.add(listener);
    return () => this.dataListeners.delete(listener);
  }

  onExit(listener: (exitCode: number) => void): () => void {
    this.exitListeners.add(listener);
    return () => this.exitListeners.delete(listener);
  }
}
