import { ExecutionRequest, ExecutionProfile } from '@ag/protocol';
import { IProfileResolver } from '../IResolvers';

export class DefaultProfileResolver implements IProfileResolver {
  public async resolve(request: ExecutionRequest): Promise<ExecutionProfile> {
    // If a profileId was given, we would normally look it up in an ExecutionProfileRegistry
    // For now we'll just return a default basic profile if none is requested.
    return {
      id: request.profileId || 'default',
      name: request.profileId || 'Default Profile',
    };
  }
}
