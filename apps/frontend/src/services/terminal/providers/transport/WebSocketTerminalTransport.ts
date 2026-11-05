import { ITerminalTransport, TerminalDescriptor, ITerminalStream } from '../../types';

class WebSocketTerminalStream implements ITerminalStream {
  private dataListeners: Set<(data: Uint8Array) => void> = new Set();
  private closeListeners: Set<() => void> = new Set();
  private errorListeners: Set<(err: Error) => void> = new Set();
  private _isClosed = false;

  constructor(
    private ws: WebSocket,
    private sessionId: string
  ) {
    // The transport manages the single WebSocket connection
    // But we need to listen for messages targeting this specific sessionId
    const onMessage = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.sessionId !== this.sessionId) return;

        if (payload.type === 'output') {
          // Convert array back to Uint8Array
          const data = new Uint8Array(payload.data);
          this.dataListeners.forEach((cb) => cb(data));
        } else if (payload.type === 'exit') {
          this.closeListeners.forEach((cb) => cb());
        } else if (payload.type === 'error') {
          const err = new Error(payload.error);
          this.errorListeners.forEach((cb) => cb(err));
          this.closeListeners.forEach((cb) => cb());
        }
      } catch (e) {
        console.error('Failed to parse WS message in Stream', e);
      }
    };

    this.ws.addEventListener('message', onMessage);

    // Cleanup listener on stream disposal
    this.dispose = () => {
      if (this._isClosed) return;
      this._isClosed = true;
      this.ws.removeEventListener('message', onMessage);
      this.dataListeners.clear();
      this.closeListeners.forEach((cb) => cb());
      this.closeListeners.clear();
    };
  }

  public onData(callback: (data: Uint8Array) => void): { dispose: () => void } {
    this.dataListeners.add(callback);
    return {
      dispose: () => this.dataListeners.delete(callback),
    };
  }

  public async write(data: Uint8Array): Promise<void> {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: 'write',
          sessionId: this.sessionId,
          data: Array.from(data),
        })
      );
    }
  }

  public onError(callback: (err: Error) => void): { dispose: () => void } {
    this.errorListeners.add(callback);
    return { dispose: () => this.errorListeners.delete(callback) };
  }

  public onClose(callback: () => void): { dispose: () => void } {
    this.closeListeners.add(callback);
    return {
      dispose: () => this.closeListeners.delete(callback),
    };
  }

  public dispose(): void {
    // defined in constructor
  }
}

export class WebSocketTerminalTransport implements ITerminalTransport {
  public readonly name = 'WebSocketTransport';
  private ws: WebSocket | null = null;
  private pendingRequests = new Map<
    string,
    { resolve: (val: any) => void; reject: (err: any) => void }
  >();
  private sessionMap = new Map<string, string>(); // terminalId -> sessionId
  private url: string;

  constructor(url: string = 'ws://localhost:8081') {
    this.url = url;
  }

  public async connect(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => resolve();

      this.ws.onerror = (e) => {
        reject(new Error('WebSocket connection failed'));
      };

      this.ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);

          if (payload.type === 'created') {
            const req = this.pendingRequests.get(payload.terminalId);
            if (req) {
              req.resolve(payload);
              this.pendingRequests.delete(payload.terminalId);
            }
          } else if (payload.type === 'error' && payload.terminalId) {
            const req = this.pendingRequests.get(payload.terminalId);
            if (req) {
              req.reject(new Error(payload.error));
              this.pendingRequests.delete(payload.terminalId);
            }
          }
        } catch (e) {
          console.error('Failed to parse transport WS message', e);
        }
      };
    });
  }

  public async createStream(config: TerminalDescriptor): Promise<ITerminalStream> {
    await this.connect();

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(config.metadata.id, {
        resolve: (payload: any) => {
          this.sessionMap.set(config.metadata.id, payload.sessionId);
          resolve(new WebSocketTerminalStream(this.ws!, payload.sessionId));
        },
        reject,
      });

      this.ws!.send(
        JSON.stringify({
          type: 'create',
          terminalId: config.metadata.id,
          workspaceId: config.metadata.workspaceId,
          profileId: config.metadata.profileId,
          executable: config.metadata.executable,
          args: config.metadata.args ? [...config.metadata.args] : undefined,
          env: config.metadata.env,
        })
      );
    });
  }

  public async attachStream(
    terminalId: string,
    backendSessionId: string
  ): Promise<{ stream: ITerminalStream; history: Uint8Array }> {
    await this.connect();
    // In a real implementation, we would request history here via WebSocket.
    // For now, return empty history.
    const stream = new WebSocketTerminalStream(this.ws!, backendSessionId);
    return { stream, history: new Uint8Array() };
  }

  public async destroy(terminalId: string): Promise<void> {
    const sessionId = this.sessionMap.get(terminalId);
    if (!sessionId || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    this.ws.send(
      JSON.stringify({
        type: 'destroy',
        sessionId,
      })
    );
    this.sessionMap.delete(terminalId);
  }

  public async resize(terminalId: string, cols: number, rows: number): Promise<void> {
    const sessionId = this.sessionMap.get(terminalId);
    if (!sessionId || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    this.ws.send(
      JSON.stringify({
        type: 'resize',
        sessionId,
        cols,
        rows,
      })
    );
  }

  public async kill(terminalId: string, signal?: string): Promise<void> {
    await this.destroy(terminalId);
  }

  public async detach(terminalId: string): Promise<void> {}

  public async listSessions(): Promise<{ sessionId: string; state: string }[]> {
    return [];
  }

  public async getProfiles(): Promise<any[]> {
    return [];
  }

  public dispose(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
