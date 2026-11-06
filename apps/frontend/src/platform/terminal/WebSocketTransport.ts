import { ITransport } from './TerminalTransport';

export class WebSocketTransport implements ITransport {
  private socket: WebSocket | null = null;
  private messageListeners: Set<(message: string) => void> = new Set();
  private closeListeners: Set<() => void> = new Set();
  private errorListeners: Set<(error: Error) => void> = new Set();

  constructor(private url: string) {}

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.socket = new WebSocket(this.url);

        this.socket.onopen = () => resolve();
        this.socket.onerror = (e) => reject(new Error('WebSocket connection failed'));

        this.socket.onmessage = (e) => {
          this.messageListeners.forEach((l) => l(e.data));
        };

        this.socket.onclose = () => {
          this.closeListeners.forEach((l) => l());
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }

  isConnected(): boolean {
    return this.socket !== null && this.socket.readyState === WebSocket.OPEN;
  }

  send(message: string): void {
    if (this.isConnected()) {
      this.socket!.send(message);
    } else {
      throw new Error('WebSocketTransport not connected');
    }
  }

  onMessage(listener: (message: string) => void): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  onClose(listener: () => void): () => void {
    this.closeListeners.add(listener);
    return () => this.closeListeners.delete(listener);
  }

  onError(listener: (error: Error) => void): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }
}
