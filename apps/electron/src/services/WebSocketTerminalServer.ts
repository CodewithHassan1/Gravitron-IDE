import { WebSocketServer, WebSocket } from 'ws';
import { IWorkspaceExecutionService } from './execution/IWorkspaceExecutionService';
import { IService } from './IService';
import { ServiceId, ServiceIds } from './ServiceIds';
import { ExecutionRequest } from '@ag/protocol';

interface WsSessionState {
  terminalId: string;
  sessionId: string;
  socket: WebSocket;
  bufferOnData?: { dispose: () => void };
  bufferOnExit?: { dispose: () => void };
}

export class WebSocketTerminalServer implements IService {
  public readonly id = ServiceIds.WebSocketTerminal;
  public readonly dependencies: readonly ServiceId[] = [];
  
  private wss: WebSocketServer | null = null;
  private sessions = new Map<string, WsSessionState>();

  constructor(private readonly executionServiceFactory: () => IWorkspaceExecutionService, private port: number = 8081) {}

  public async initialize(): Promise<void> {}
  
  public async start(): Promise<void> {
    const MAX_RETRIES = 10;
    let attempts = 0;

    const tryBind = (port: number): Promise<void> => {
      return new Promise((resolve, reject) => {
        const wss = new WebSocketServer({ port });

        wss.on('listening', () => {
          this.wss = wss;
          this.port = port;
          console.log(`[WebSocketTerminalServer] Listening on ws://localhost:${port}`);
          resolve();
        });

        wss.on('error', (err: NodeJS.ErrnoException) => {
          if (err.code === 'EADDRINUSE') {
            wss.close();
            attempts++;
            if (attempts >= MAX_RETRIES) {
              reject(new Error(`[WebSocketTerminalServer] Could not bind to any port after ${MAX_RETRIES} attempts (starting at ${this.port})`));
            } else {
              console.warn(`[WebSocketTerminalServer] Port ${port} in use, trying ${port + 1}...`);
              tryBind(port + 1).then(resolve).catch(reject);
            }
          } else {
            reject(err);
          }
        });
      });
    };

    await tryBind(this.port);

    this.wss!.on('connection', (ws: WebSocket) => {
      ws.on('message', async (message: Buffer) => {
        try {
          const payload = JSON.parse(message.toString('utf-8'));
          await this.handleMessage(ws, payload);
        } catch (e) {
          console.error('[WebSocketTerminalServer] Malformed message', e);
          ws.send(JSON.stringify({ type: 'error', error: 'Malformed message' }));
        }
      });

      ws.on('close', () => {
        this.cleanupSocket(ws);
      });
      
      ws.on('error', (err: any) => {
        console.error('[WebSocketTerminalServer] Socket error', err);
        this.cleanupSocket(ws);
      });
    });
  }


  private async handleMessage(ws: WebSocket, payload: any) {
    const execService = this.executionServiceFactory();
    
    switch (payload.type) {
      case 'create': {
        const { terminalId, workspaceId, profileId, executable, args, env, cols, rows } = payload;
        
        if (!workspaceId) {
          ws.send(JSON.stringify({ type: 'error', terminalId, error: 'workspaceId is required' }));
          return;
        }

        const request: ExecutionRequest = {
          workspaceId,
          target: { kind: 'local' },
          profileId,
          shellOverride: executable ? { executable, args: args || [] } : undefined,
          environmentOverride: env,
          terminalOptions: {
            cols: cols || 80,
            rows: rows || 24,
          }
        };

        try {
          const session = await execService.execute(request);
          const process = session.process;
          
          if (!process) {
            throw new Error('Failed to create native process');
          }

          const state: WsSessionState = {
            terminalId,
            sessionId: session.id,
            socket: ws
          };

          state.bufferOnData = process.onData((data: Uint8Array) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: 'output',
                sessionId: session.id,
                data: Array.from(data)
              }));
            }
          });

          state.bufferOnExit = process.onExit((exitCode: number) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: 'exit',
                sessionId: session.id,
                exitCode
              }));
            }
            this.cleanupSession(session.id);
          });

          this.sessions.set(session.id, state);

          ws.send(JSON.stringify({
            type: 'created',
            terminalId,
            sessionId: session.id,
            capabilities: session.capabilities
          }));
        } catch (error: any) {
          ws.send(JSON.stringify({ type: 'error', terminalId, error: error.message }));
        }
        break;
      }
      
      case 'write': {
        const { sessionId, data } = payload;
        const state = this.sessions.get(sessionId);
        if (!state) return;
        
        if (state.socket !== ws) {
          ws.send(JSON.stringify({ type: 'error', sessionId, error: 'Unauthorized session access' }));
          return;
        }

        // We can cast the service safely because we know it's a WorkspaceExecutionService with processManager
        const processManager = (execService as any).processManager;
        const session = processManager?.get(sessionId);
        
        if (session && session.process) {
          const buffer = new Uint8Array(data);
          session.process.write(buffer);
        }
        break;
      }

      case 'resize': {
        const { sessionId, cols, rows } = payload;
        const state = this.sessions.get(sessionId);
        if (!state || state.socket !== ws) return;

        const processManager = (execService as any).processManager;
        const session = processManager?.get(sessionId);
        if (session && session.process) {
          session.process.resize(cols, rows);
        }
        break;
      }

      case 'destroy': {
        const { sessionId } = payload;
        const state = this.sessions.get(sessionId);
        if (!state || state.socket !== ws) return;

        await execService.terminateSession(sessionId);
        this.cleanupSession(sessionId);
        break;
      }
    }
  }

  private cleanupSession(sessionId: string) {
    const state = this.sessions.get(sessionId);
    if (state) {
      if (state.bufferOnData) state.bufferOnData.dispose();
      if (state.bufferOnExit) state.bufferOnExit.dispose();
      this.sessions.delete(sessionId);
    }
  }

  private cleanupSocket(ws: WebSocket) {
    const sessionsToKill: string[] = [];
    for (const [sessionId, state] of this.sessions.entries()) {
      if (state.socket === ws) {
        sessionsToKill.push(sessionId);
      }
    }

    const execService = this.executionServiceFactory();
    for (const sessionId of sessionsToKill) {
      execService.terminateSession(sessionId).catch(console.error);
      this.cleanupSession(sessionId);
    }
  }

  public async stop(): Promise<void> {
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
    
    const execService = this.executionServiceFactory();
    for (const sessionId of this.sessions.keys()) {
      execService.terminateSession(sessionId).catch(console.error);
      this.cleanupSession(sessionId);
    }
  }

  public async health(): Promise<boolean> {
    return this.wss !== null;
  }
  
  public async dispose(): Promise<void> {
    await this.stop();
  }
}
