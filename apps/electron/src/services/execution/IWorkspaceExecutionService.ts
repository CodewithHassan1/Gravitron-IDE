import { ExecutionRequest } from '@ag/protocol';
import { ExecutionSession } from './ExecutionSession';
import { IService } from '../IService';

export interface IWorkspaceExecutionService extends IService {
  execute(request: ExecutionRequest): Promise<ExecutionSession>;
  terminateSession(sessionId: string): Promise<void>;
  terminateSessionSafely?(
    sessionId: string,
    gracePeriodMs?: number
  ): Promise<{ exitedGracefully: boolean; pid?: number; terminationResult: string }>;
  cleanupWorkspace(workspaceId: string): Promise<void>;
}
