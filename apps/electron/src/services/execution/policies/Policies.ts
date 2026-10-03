import { ExecutionContext } from '@ag/protocol';
import { IExecutionPolicy } from './IExecutionPolicyPipeline';

export class WorkspaceTrustPolicy implements IExecutionPolicy {
  public validate(context: ExecutionContext): void {
    // In a real app, this would check if the workspace is trusted.
    // Throw an error if not trusted and trying to execute something.
  }
}

export class ShellPolicy implements IExecutionPolicy {
  public validate(context: ExecutionContext): void {
    if (!context.shell || !context.shell.executable) {
      throw new Error('Execution policy violation: Missing shell executable');
    }
  }
}

export class ExecutionLimitPolicy implements IExecutionPolicy {
  public validate(context: ExecutionContext): void {
    // Enforce max running processes per workspace if needed.
  }
}
