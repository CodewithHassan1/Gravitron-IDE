import { ExecutionRequest, ExecutionContext } from '@ag/protocol';
import { ExecutionSession, ExecutionSessionImpl } from './ExecutionSession';
import { IWorkspaceExecutionService } from './IWorkspaceExecutionService';
import { IContextResolver } from './IResolvers';
import { IExecutionPolicyPipeline } from './policies/IExecutionPolicyPipeline';
import { ExecutionBackendRegistry } from '../terminal/pty/types';
import { randomUUID } from 'crypto';
import { ProcessManager } from './ProcessManager';

import { ServiceId, ServiceIds } from '../ServiceIds';

export class WorkspaceExecutionService implements IWorkspaceExecutionService {
  public readonly id = ServiceIds.WorkspaceExecution;
  public readonly dependencies: readonly ServiceId[] = [];

  private processManager = new ProcessManager();

  constructor(
    private readonly contextResolver: IContextResolver,
    private readonly policyPipeline: IExecutionPolicyPipeline,
    private readonly backendRegistry: ExecutionBackendRegistry
  ) {}

  public async initialize(): Promise<void> {}
  public async start(): Promise<void> {}
  public async stop(): Promise<void> {
    await this.processManager.terminateAll();
  }
  public async health(): Promise<boolean> {
    return true;
  }

  public async execute(request: ExecutionRequest): Promise<ExecutionSession> {
    // 1. Resolve context
    const context = await this.contextResolver.resolve(request);

    // 2. Reserve slot BEFORE async operations to prevent race conditions
    this.processManager.reserveSlot(context.workspaceId);

    try {
      // 3. Validate policies
      await this.policyPipeline.validate(context);

      // 4. Resolve backend
      const backend = this.backendRegistry.resolve(context.target);

      // 5. Create native process
      const sessionId = randomUUID();

      // We pass context.environment as Record<string, string> since the backend might expect mutable records,
      // though the contract now can accept Readonly.
      const nativeProcessId = await backend.createProcess(sessionId, context);

      const process = backend.getProcess(nativeProcessId);
      if (!process) {
        throw new Error(`Failed to retrieve native process ${nativeProcessId}`);
      }

      // 6. Wrap in ExecutionSession
      const session = new ExecutionSessionImpl(
        sessionId,
        context,
        backend.kind,
        backend.capabilities,
        process,
        Date.now()
      );

      session.state = 'running';

      // 7. Commit reservation and register
      this.processManager.register(session);

      return session;
    } catch (error) {
      // Guaranteed release on any failure
      this.processManager.releaseReservation(context.workspaceId);
      throw error;
    }
  }

  public async terminateSession(sessionId: string): Promise<void> {
    await this.processManager.terminateTree(sessionId);
  }

  public async cleanupWorkspace(workspaceId: string): Promise<void> {
    await this.processManager.cleanupWorkspace(workspaceId);
  }

  public dispose(): void {
    // ProcessManager handles cleanup during stop(), but we can add a synchronous fallback here if needed,
    // though async termination is preferred via stop().
  }
}
