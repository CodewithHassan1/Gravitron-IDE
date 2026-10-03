import { ITerminalService } from './ITerminalService';
import { ServiceId, ServiceIds } from './ServiceIds';
import { IpcHandlerRegistration } from './IService';
import { Channels, TerminalProtocol, ExecutionRequest } from '@ag/protocol';
import { ExecutionBackendCapabilities } from './terminal/pty/IExecutionBackend';
import { IWindowService } from './WindowService';
import { TerminalBuffer, DefaultBufferPolicy } from './terminal/TerminalBuffer';
import { TerminalMetricsTracker } from './terminal/TerminalMetricsTracker';
import { IWorkspaceExecutionService } from './execution/IWorkspaceExecutionService';
import { ExecutionSession } from './execution/ExecutionSession';
import { DefaultShellResolver } from './execution/resolvers/ShellResolver';

interface SessionState {
  terminalId?: string;
  session: ExecutionSession;
  capabilities: ExecutionBackendCapabilities;
  state: 'starting' | 'running' | 'exited' | 'killed';
}

export class TerminalService implements ITerminalService {
  public readonly id = ServiceIds.Terminal;
  public readonly dependencies: readonly ServiceId[] = [ServiceIds.Window, ServiceIds.WorkspaceExecution];

  private sessionMap = new Map<string, SessionState>();

  private buffers = new Map<string, TerminalBuffer>();
  private metrics = new Map<string, TerminalMetricsTracker>();

  constructor(
    private windowServiceFactory?: () => IWindowService,
    private executionServiceFactory?: () => IWorkspaceExecutionService
  ) { }

  public async initialize(): Promise<void> { }

  public async start(): Promise<void> { }

  public async stop(): Promise<void> { }

  public async dispose(): Promise<void> { }

  public async health(): Promise<boolean> { return true; }

  private get windowService(): IWindowService {
    if (!this.windowServiceFactory) throw new Error('WindowService not injected');
    return this.windowServiceFactory();
  }

  private get executionService(): IWorkspaceExecutionService {
    if (!this.executionServiceFactory) throw new Error('WorkspaceExecutionService not injected');
    return this.executionServiceFactory();
  }

  public async createTerminal(options: TerminalProtocol.TerminalCreateRequestOptions): Promise<string> {
    const target = options.target || { kind: 'local' };

    const request: ExecutionRequest = {
      workspaceId: (options as any).workspaceId || (target.kind === 'remote' ? target.workspaceId : 'local-workspace'),
      target,
      profileId: options.profileId,
      cwdOverride: options.cwd,
      environmentOverride: options.env,
      shellOverride: options.executable ? { executable: options.executable, args: options.args || [] } : undefined,
      terminalOptions: {
        cols: 80,
        rows: 24,
      }
    };

    const session = await this.executionService.execute(request);
    const sessionId = session.id;

    // The ExecutionSession uses process which might not have capabilities exposed directly,
    // wait, where do we get capabilities from now? We need capabilities for resize/etc.
    // ExecutionBackendCapabilities can be fetched if we expose it on ExecutionSession or we can fetch it.
    // Actually we need to add capabilities to ExecutionSession, but let's query the registry in WorkspaceExecutionService?
    // Wait, the backend has capabilities. Let's add it to ExecutionSession or expose backend.
    // Let's assume session.backendKind gives us enough info or we can augment ExecutionSession.
    // For now we'll mock capabilities or add it later.
    // Actually I can add `capabilities: ExecutionBackendCapabilities` to `ExecutionSession`.

    const process = session.process;

    this.sessionMap.set(sessionId, {
      terminalId: options.id,
      session: session,
      capabilities: session.capabilities,
      state: 'running'
    });

    const metricsTracker = new TerminalMetricsTracker();
    this.metrics.set(sessionId, metricsTracker);

    const buffer = new TerminalBuffer(DefaultBufferPolicy, (chunk) => {
      metricsTracker.recordFlush(chunk.length);
      metricsTracker.recordBytesSent(chunk.length);
      this.windowService.broadcast(Channels.Terminal.OnEvent, {
        category: 'data',
        kind: 'output',
        sessionId: sessionId,
        data: chunk
      } as TerminalProtocol.TerminalEvent);
    }, (warning) => {
      metricsTracker.recordDrop();
      this.windowService.broadcast(Channels.Terminal.OnEvent, {
        category: 'diagnostic',
        kind: 'warning',
        sessionId: sessionId,
        warning
      } as TerminalProtocol.TerminalEvent);
    });
    this.buffers.set(sessionId, buffer);

    if (process) {
      process.onData((data: Uint8Array) => {
        buffer.push(data);
      });

      process.onExit((exitCode: number) => {
        const stateEntry = this.sessionMap.get(sessionId);
        if (stateEntry) stateEntry.state = 'exited';
        this.windowService.broadcast(Channels.Terminal.OnEvent, {
          category: 'lifecycle',
          kind: 'exit',
          sessionId: sessionId,
          exitCode
        } as TerminalProtocol.TerminalEvent);
      });
    }

    return sessionId;
  }

  public async closeTerminal(sessionId: string): Promise<void> {
    const stateEntry = this.sessionMap.get(sessionId);
    if (!stateEntry) throw new TerminalProtocol.TerminalNotFoundError(sessionId);
    await this.executionService.terminateSession(sessionId);
    this.sessionMap.delete(sessionId);
    this.buffers.get(sessionId)?.dispose();
    this.buffers.delete(sessionId);
    this.metrics.delete(sessionId);
    console.log(`[TerminalService] Closed session ${sessionId}`);
  }

  public async resizeTerminal(sessionId: string, cols: number, rows: number): Promise<void> {
    const stateEntry = this.sessionMap.get(sessionId);
    if (!stateEntry) throw new TerminalProtocol.TerminalNotFoundError(sessionId);
    if (!stateEntry.capabilities.supportsResize) return;

    const process = stateEntry.session.process;
    if (!process) throw new TerminalProtocol.TerminalNotFoundError(sessionId);
    process.resize(cols, rows);

    this.windowService.broadcast(Channels.Terminal.OnEvent, {
      category: 'data',
      kind: 'resizeAck',
      sessionId,
      cols,
      rows
    } as TerminalProtocol.TerminalEvent);

    console.log(`[TerminalService] Resized session ${sessionId} to ${cols}x${rows}`);
  }

  public async writeTerminal(sessionId: string, data: string | Uint8Array): Promise<void> {
    const stateEntry = this.sessionMap.get(sessionId);
    if (!stateEntry) throw new TerminalProtocol.TerminalNotFoundError(sessionId);
    const process = stateEntry.session.process;
    if (!process) throw new TerminalProtocol.TerminalNotFoundError(sessionId);

    const metricsTracker = this.metrics.get(sessionId);
    if (metricsTracker) metricsTracker.recordBytesReceived(data.length);
    process.write(data);
  }

  public listSessions(): string[] {
    return Array.from(this.sessionMap.keys());
  }

  public async getProfiles(): Promise<TerminalProtocol.TerminalProfile[]> {
    const resolver = new DefaultShellResolver();
    return resolver.discoverProfiles();
  }

  public async attachSession(sessionId: string): Promise<Uint8Array> {
    const session = this.sessionMap.get(sessionId);
    if (!session) throw new TerminalProtocol.TerminalNotFoundError(sessionId);
    this.metrics.get(sessionId)?.recordReconnect();
    const buffer = this.buffers.get(sessionId);
    return buffer ? buffer.getHistory() : new Uint8Array();
  }

  public async detachSession(_sessionId: string): Promise<void> {
    void _sessionId;
    // Detach simply means we don't send events to the specific window if we track window subscriptions.
    // For now, since broadcast is global to renderer, detach doesn't do much at the process level.
  }

  public registerHandlers(): IpcHandlerRegistration[] {
    return [
      {
        channel: Channels.Terminal.CreateRequest,
        handler: async (payload: TerminalProtocol.TerminalCreateRequestOptions) => {
          const sessionId = await this.createTerminal(payload);
          const stateEntry = this.sessionMap.get(sessionId)!;
          return {
            sessionId,
            capabilities: stateEntry.capabilities
          } as TerminalProtocol.TerminalCreateResponse;
        }
      },
      {
        channel: Channels.Terminal.DestroyRequest,
        handler: async (payload: string) => {
          await this.closeTerminal(payload);
        }
      },
      {
        channel: Channels.Terminal.ResizeRequest,
        handler: async (payload: { sessionId: string; cols: number; rows: number }) => {
          await this.resizeTerminal(payload.sessionId, payload.cols, payload.rows);
        }
      },
      {
        channel: Channels.Terminal.WriteRequest,
        handler: async (payload: { sessionId: string; data: Uint8Array | string }) => {
          let data = payload.data;
          if (typeof data === 'string') {
            data = new TextEncoder().encode(data);
          } else if (Buffer.isBuffer(data)) {
            data = new Uint8Array(data);
          } else if (data instanceof Array) {
            data = new Uint8Array(data);
          }
          await this.writeTerminal(payload.sessionId, data);
        }
      },
      {
        channel: Channels.Terminal.ListSessionsRequest,
        handler: async () => {
          const sessions = Array.from(this.sessionMap.entries()).map(([sessionId, stateEntry]) => ({
            sessionId,
            terminalId: stateEntry.terminalId,
            state: stateEntry.state,
            capabilities: stateEntry.capabilities
          }));
          return { sessions } as TerminalProtocol.TerminalListResponse;
        }
      },
      {
        channel: Channels.Terminal.AttachSessionRequest,
        handler: async (payload: string) => {
          const history = await this.attachSession(payload);
          return { history };
        }
      },
      {
        channel: Channels.Terminal.DetachSessionRequest,
        handler: async (payload: string) => {
          await this.detachSession(payload);
        }
      },
      {
        channel: Channels.Terminal.GetProfilesRequest,
        handler: async () => {
          return this.getProfiles();
        }
      }
    ];
  }
}
