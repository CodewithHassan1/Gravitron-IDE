import { ExecutionTarget } from '@ag/protocol';
import { ICapabilityResolver } from '../IResolvers';
import { ExecutionBackendRegistry } from '../../terminal/pty/types';
import { ExecutionBackendCapabilities } from '../../terminal/pty/IExecutionBackend';

export class RegistryCapabilityResolver implements ICapabilityResolver {
  constructor(private readonly backendRegistry: ExecutionBackendRegistry) {}

  public async resolve(target: ExecutionTarget): Promise<ExecutionBackendCapabilities> {
    const backend = this.backendRegistry.resolve(target);
    return backend.capabilities;
  }
}
