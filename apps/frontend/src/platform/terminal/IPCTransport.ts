import { ITransport } from './TerminalTransport';

export class IPCTransport implements ITransport {
  async connect(): Promise<void> {
    // Scaffolded for future Electron Main Process IPC
    throw new Error('IPCTransport not implemented yet');
  }

  disconnect(): void {}

  isConnected(): boolean {
    return false;
  }

  send(message: string): void {}

  onMessage(listener: (message: string) => void): () => void {
    return () => {};
  }

  onClose(listener: () => void): () => void {
    return () => {};
  }

  onError(listener: (error: Error) => void): () => void {
    return () => {};
  }
}
