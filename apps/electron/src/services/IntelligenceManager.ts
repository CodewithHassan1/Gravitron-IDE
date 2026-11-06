import { IService } from './IService';
import { ServiceIds } from './ServiceIds';
import { ChildProcess, fork } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { IntelligenceProtocol } from '@ag/protocol';
import { randomUUID } from 'crypto';
import { AGLogger } from '@ag/logger';

const logger = new AGLogger('IntelligenceManager', '1.0.0');
const logCtx = { trace_id: 'init', span_id: 'init', request_id: 'init' };

export class IntelligenceManager implements IService {
  public readonly id = ServiceIds.Intelligence;
  public readonly dependencies: any[] = [];

  private workerProcess: ChildProcess | null = null;
  private pendingRequests = new Map<
    string,
    { resolve: (value: any) => void; reject: (reason: any) => void; workspaceId?: string }
  >();
  private activeWorkspaces = new Map<string, string>(); // workspaceId -> workspacePath
  private isShuttingDown = false;
  private restartTimeout: NodeJS.Timeout | null = null;

  constructor() {}

  public async initialize(): Promise<void> {
    this.spawnWorker();
  }

  public async start(): Promise<void> {
    try {
      // Handshake to verify worker is alive
      await this.handshake();
    } catch (e) {
      logger.warn(
        logCtx,
        `Failed to handshake with worker-intelligence: ${e}. Intelligence features will be disabled.`
      );
    }
  }

  public async stop(): Promise<void> {
    this.isShuttingDown = true;
    if (this.workerProcess) {
      this.workerProcess.kill('SIGTERM');
      this.workerProcess = null;
    }
  }

  public async dispose(): Promise<void> {
    await this.stop();
  }

  public async health(): Promise<boolean> {
    return this.workerProcess !== null && this.workerProcess.connected;
  }

  private spawnWorker(): void {
    if (this.isShuttingDown) return;

    // Use absolute path relative to the electron dist or monorepo.
    // In dev, we can point to `services/worker-intelligence/dist/index.js`
    const workerPath = path.resolve(
      __dirname,
      '../../../../services/worker-intelligence/dist/index.js'
    );

    if (!fs.existsSync(workerPath)) {
      logger.warn(
        logCtx,
        `worker-intelligence not found at ${workerPath}. Intelligence features will be disabled.`
      );
      return;
    }

    logger.info(logCtx, `Spawning worker-intelligence at ${workerPath}`);
    this.workerProcess = fork(workerPath, [], {
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    });

    this.workerProcess.on('message', (message: IntelligenceProtocol.AnyIntelligenceResponse) => {
      this.handleMessage(message);
    });

    this.workerProcess.on('exit', (code, signal) => {
      logger.warn(logCtx, `worker-intelligence exited with code ${code}, signal ${signal}`);
      this.workerProcess = null;

      // Reject all pending requests
      const error = new Error(`Worker exited with code ${code}`);
      for (const { reject } of this.pendingRequests.values()) {
        reject(error);
      }
      this.pendingRequests.clear();

      if (!this.isShuttingDown) {
        logger.info(logCtx, 'Restarting worker-intelligence in 2 seconds...');
        if (this.restartTimeout) clearTimeout(this.restartTimeout);
        this.restartTimeout = setTimeout(() => {
          this.spawnWorker();
          this.handshake()
            .then(() => {
              for (const [wsId, wsPath] of this.activeWorkspaces.entries()) {
                this.sendRequest(IntelligenceProtocol.IntelligenceRequestType.WorkspaceOpen, wsId, {
                  workspaceId: wsId,
                  workspacePath: wsPath,
                }).catch((err) => logger.error(logCtx, err as any));
              }
            })
            .catch((err) => logger.error(logCtx, err as any));
        }, 2000);
      }
    });

    this.workerProcess.on('error', (err) => {
      logger.error(logCtx, err as any);
    });
  }

  private handleMessage(message: IntelligenceProtocol.AnyIntelligenceResponse): void {
    const { requestId } = message;
    const pending = this.pendingRequests.get(requestId);

    if (pending) {
      this.pendingRequests.delete(requestId);

      // Enforce cross-workspace isolation on responses
      if (
        'workspaceId' in message &&
        pending.workspaceId &&
        message.workspaceId !== pending.workspaceId
      ) {
        pending.reject(
          new Error(
            `Security Error: Response workspaceId mismatch. Expected ${pending.workspaceId}, got ${message.workspaceId}`
          )
        );
        return;
      }

      if (message.success) {
        pending.resolve(message.payload);
      } else {
        pending.reject(new Error(message.error?.message || 'Unknown error'));
      }
    } else {
      logger.warn(logCtx, `Received response for unknown requestId: ${requestId}`);
    }
  }

  public async sendRequest<T = any>(
    type: IntelligenceProtocol.IntelligenceRequestType,
    workspaceId: string,
    payload: any
  ): Promise<T> {
    if (!this.workerProcess || !this.workerProcess.connected) {
      throw new Error('worker-intelligence is not connected');
    }

    const requestId = randomUUID();
    const envelope: IntelligenceProtocol.AnyIntelligenceRequest = {
      requestId,
      type: type as Exclude<
        IntelligenceProtocol.IntelligenceRequestType,
        IntelligenceProtocol.IntelligenceRequestType.Handshake
      >,
      workspaceId,
      payload,
    };

    if (type === IntelligenceProtocol.IntelligenceRequestType.WorkspaceOpen) {
      this.activeWorkspaces.set(workspaceId, payload.workspacePath);
    } else if (type === IntelligenceProtocol.IntelligenceRequestType.WorkspaceClose) {
      this.activeWorkspaces.delete(workspaceId);
    }

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(requestId, { resolve, reject, workspaceId });
      this.workerProcess!.send(envelope, (err) => {
        if (err) {
          this.pendingRequests.delete(requestId);
          reject(err);
        }
      });
    });
  }

  public async handshake(): Promise<void> {
    if (!this.workerProcess || !this.workerProcess.connected) {
      throw new Error('worker-intelligence is not connected');
    }

    const payload: IntelligenceProtocol.HandshakePayload = { version: '1.0.0' };
    const requestId = randomUUID();
    const envelope: IntelligenceProtocol.HandshakeRequestEnvelope = {
      requestId,
      type: IntelligenceProtocol.IntelligenceRequestType.Handshake,
      payload,
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(requestId, { resolve: () => resolve(), reject });
      this.workerProcess!.send(envelope, (err) => {
        if (err) {
          this.pendingRequests.delete(requestId);
          reject(err);
        }
      });
    });
  }

  public async workspaceOpened(workspaceId: string, workspacePath: string): Promise<void> {
    const payload: IntelligenceProtocol.WorkspaceOpenPayload = { workspaceId, workspacePath };
    await this.sendRequest(
      IntelligenceProtocol.IntelligenceRequestType.WorkspaceOpen,
      workspaceId,
      payload
    );
  }

  public async workspaceClosed(workspaceId: string): Promise<void> {
    const payload: IntelligenceProtocol.WorkspaceClosePayload = { workspaceId };
    await this.sendRequest(
      IntelligenceProtocol.IntelligenceRequestType.WorkspaceClose,
      workspaceId,
      payload
    );
  }
}
