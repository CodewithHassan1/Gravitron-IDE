import { IProcess } from '../terminal/pty/types';
import { ExecutionContext, ExecutionBackendKind } from '@ag/protocol';
import { ExecutionBackendCapabilities } from '../terminal/pty/IExecutionBackend';

export interface ExecutionSession {
  readonly id: string;
  readonly context: ExecutionContext;
  readonly backendKind: ExecutionBackendKind;
  readonly capabilities: ExecutionBackendCapabilities;
  readonly process: IProcess;
  readonly createdAt: number;
  readonly state: 'starting' | 'running' | 'exited' | 'killed';

  dispose(): void;
}

export class ExecutionSessionImpl implements ExecutionSession {
  public state: 'starting' | 'running' | 'exited' | 'killed' = 'starting';

  constructor(
    public readonly id: string,
    public readonly context: ExecutionContext,
    public readonly backendKind: ExecutionBackendKind,
    public readonly capabilities: ExecutionBackendCapabilities,
    public readonly process: IProcess,
    public readonly createdAt: number
  ) {
    this.process.onExit(() => {
      if (this.state !== 'killed') {
        this.state = 'exited';
      }
    });
  }

  public dispose(): void {
    if (this.state === 'running' || this.state === 'starting') {
      this.state = 'killed';
      this.process.kill();
    }
  }
}
