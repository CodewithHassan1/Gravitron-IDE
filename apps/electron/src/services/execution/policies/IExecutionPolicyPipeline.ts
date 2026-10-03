import { ExecutionContext } from '@ag/protocol';

export interface IExecutionPolicy {
  validate(context: ExecutionContext): void | Promise<void>;
}

export interface IExecutionPolicyPipeline {
  addPolicy(policy: IExecutionPolicy): void;
  validate(context: ExecutionContext): Promise<void>;
}

export class ExecutionPolicyPipeline implements IExecutionPolicyPipeline {
  private policies: IExecutionPolicy[] = [];

  public addPolicy(policy: IExecutionPolicy): void {
    this.policies.push(policy);
  }

  public async validate(context: ExecutionContext): Promise<void> {
    for (const policy of this.policies) {
      await policy.validate(context);
    }
  }
}
