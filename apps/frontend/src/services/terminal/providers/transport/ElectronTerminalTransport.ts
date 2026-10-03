import { ITerminalTransport, TerminalDescriptor, ITerminalStream } from '../../types';
import { IMessageChannel } from '@ag/platform';
import { TerminalProtocol } from '@ag/protocol';
type TerminalEvent = TerminalProtocol.TerminalEvent;

class ElectronTerminalStream implements ITerminalStream {
  private dataListeners: Set<(data: Uint8Array) => void> = new Set();
  private closeListeners: Set<() => void> = new Set();
  private errorListeners: Set<(err: Error) => void> = new Set();
  private channelSubscription: { dispose: () => void };

  constructor(private channel: IMessageChannel<Uint8Array, TerminalEvent>) {
    this.channelSubscription = this.channel.subscribe((event) => {
      if (event.category === 'data' && event.kind === 'output') {
        this.dataListeners.forEach(cb => cb(event.data));
      } else if (event.category === 'lifecycle' && event.kind === 'exit') {
        this.closeListeners.forEach(cb => cb());
      } else if (event.category === 'diagnostic' && event.kind === 'error') {
        const err = new Error(event.error);
        this.errorListeners.forEach(cb => cb(err));
        this.closeListeners.forEach(cb => cb());
      } else if (event.category === 'diagnostic' && event.kind === 'warning') {
        console.warn(`[Terminal ${event.sessionId}] ${event.warning}`);
      }
    });
  }

  public onData(callback: (data: Uint8Array) => void): { dispose: () => void } {
    this.dataListeners.add(callback);
    return {
      dispose: () => this.dataListeners.delete(callback)
    };
  }

  public async write(data: Uint8Array): Promise<void> {
    this.channel.send(data);
  }

  public onError(callback: (err: Error) => void): { dispose: () => void } {
    this.errorListeners.add(callback);
    return { dispose: () => this.errorListeners.delete(callback) };
  }

  public onClose(callback: () => void): { dispose: () => void } {
    this.closeListeners.add(callback);
    return {
      dispose: () => this.closeListeners.delete(callback)
    };
  }

  public dispose(): void {
    this.channelSubscription.dispose();
    this.channel.dispose();
    this.dataListeners.clear();
    this.closeListeners.forEach(cb => cb());
    this.closeListeners.clear();
  }
}

export class ElectronTerminalTransport implements ITerminalTransport {
  public readonly name = 'ElectronTransport';
  private sessionMap = new Map<string, string>(); // maps terminalId -> sessionId

  // Injected window.agApi.terminal
  constructor(private api: any) { }

  public async connect(): Promise<void> { }

  public async createStream(config: TerminalDescriptor): Promise<ITerminalStream> {
    const sessionId = await this.api.create({
      cwd: config.metadata.cwd,
      profileId: config.metadata.profileId,
      executable: config.metadata.executable,
      args: config.metadata.args ? [...config.metadata.args] : undefined,
      env: config.metadata.env,
      workspaceId: config.metadata.workspaceId
    });

    this.sessionMap.set(config.metadata.id, sessionId);

    // FIX: use attach instead of non-existent connect
    const result = await this.api.attach(sessionId);
    
    // Explicitly construct IMessageChannel to avoid dangerous casts and map detach semantics
    const channel: IMessageChannel<Uint8Array, TerminalEvent> = {
      send: result.send,
      subscribe: result.subscribe,
      dispose: () => {
        // Disconnecting the stream shouldn't unilaterally kill the backend process
        // It should detach so F5 reload doesn't wipe out the session.
        if (result.detach) {
          result.detach();
        }
      }
    };

    return new ElectronTerminalStream(channel);
  }

  public async attachStream(terminalId: string, backendSessionId: string): Promise<{ stream: ITerminalStream; history: Uint8Array }> {
    this.sessionMap.set(terminalId, backendSessionId);
    
    const result = await this.api.attach(backendSessionId);
    
    const channel: IMessageChannel<Uint8Array, TerminalEvent> = {
      send: result.send,
      subscribe: result.subscribe,
      dispose: () => {
        if (result.detach) {
          result.detach();
        }
      }
    };

    return {
      stream: new ElectronTerminalStream(channel),
      history: result.history
    };
  }

  public async resize(terminalId: string, cols: number, rows: number): Promise<void> {
    const sessionId = this.sessionMap.get(terminalId);
    if (!sessionId) return;
    await this.api.resize(sessionId, cols, rows);
  }

  public async kill(terminalId: string, signal?: string): Promise<void> {
    const sessionId = this.sessionMap.get(terminalId);
    if (!sessionId) return;
    await this.api.kill(sessionId);
    this.sessionMap.delete(terminalId);
  }

  public async detach(terminalId: string): Promise<void> {
    const sessionId = this.sessionMap.get(terminalId);
    if (!sessionId) return;
    if (this.api.detach) {
      await this.api.detach(sessionId);
    }
    this.sessionMap.delete(terminalId);
  }

  public async listSessions(): Promise<{ sessionId: string; state: string }[]> {
    if (!this.api.list) return [];
    return this.api.list();
  }

  public async createTerminal(options: TerminalProtocol.TerminalCreateRequestOptions): Promise<TerminalProtocol.TerminalCreateResponse> {
    return this.api.createTerminal(options);
  }

  public async getProfiles(): Promise<TerminalProtocol.TerminalProfile[]> {
    if (!this.api.getProfiles) return [];
    return this.api.getProfiles();
  }

  public dispose(): void {
    this.sessionMap.clear();
  }
}
