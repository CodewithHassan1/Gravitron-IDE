import { IExecutionBackend } from './IExecutionBackend';
import { ExecutionBackendKind, ExecutionTarget } from '@ag/protocol';

export class ExecutionBackendRegistry {
  private backends = new Map<ExecutionBackendKind, IExecutionBackend>();

  public register(backend: IExecutionBackend): void {
    if (this.backends.has(backend.kind)) {
      throw new Error(`Backend for kind ${backend.kind} is already registered.`);
    }
    this.backends.set(backend.kind, backend);
  }

  public resolve(target: ExecutionTarget): IExecutionBackend {
    const backend = this.backends.get(target.kind);
    if (!backend) {
      throw new Error(`No execution backend registered for kind: ${target.kind}`);
    }
    return backend;
  }

  public dispose(): void {
    for (const backend of this.backends.values()) {
      backend.dispose();
    }
    this.backends.clear();
  }
}
