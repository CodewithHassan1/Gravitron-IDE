import { ExecutionRequest, ExecutionProfile } from '@ag/protocol';
import { IEnvironmentResolver } from '../IResolvers';

export class DefaultEnvironmentResolver implements IEnvironmentResolver {
  public async resolve(
    request: ExecutionRequest,
    profile: ExecutionProfile
  ): Promise<Readonly<Record<string, string>>> {
    const env: Record<string, string> = { ...process.env } as Record<string, string>;

    // Merge Precedence:
    // 5. System Variables (handled above)
    // 4. User Variables (handled above if part of process.env)
    // 3. Workspace Variables (could be injected here)
    // 2. Execution Profile
    if (profile.env) {
      Object.assign(env, profile.env);
    }
    // 1. Temporary Overrides
    if (request.environmentOverride) {
      Object.assign(env, request.environmentOverride);
    }

    return Object.freeze(env);
  }
}
