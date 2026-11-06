import {
  ExecutionRequest,
  ExecutionContext,
  ExecutionProfile,
  ShellDescriptor,
} from '@ag/protocol';
import {
  IContextResolver,
  IProfileResolver,
  IEnvironmentResolver,
  IWorkingDirectoryResolver,
  IShellResolver,
  ICapabilityResolver,
} from './IResolvers';

export class ExecutionContextResolver implements IContextResolver {
  constructor(
    private readonly profileResolver: IProfileResolver,
    private readonly envResolver: IEnvironmentResolver,
    private readonly cwdResolver: IWorkingDirectoryResolver,
    private readonly shellResolver: IShellResolver,
    private readonly capabilityResolver: ICapabilityResolver
  ) {}

  public async resolve(request: ExecutionRequest): Promise<ExecutionContext> {
    const profile = await this.profileResolver.resolve(request);
    const environment = await this.envResolver.resolve(request, profile);
    const cwd = await this.cwdResolver.resolve(request, profile);
    const shell = await this.shellResolver.resolve(request, profile);
    const capabilities = await this.capabilityResolver.resolve(request.target);

    // If backend doesn't support CWD, we might need to fallback to root, but the policy could reject it later.
    // For now we just return the resolved CWD.

    return {
      workspaceId: request.workspaceId,
      target: request.target,
      cwd,
      environment,
      shell,
      profile,
      cols: request.terminalOptions?.cols || 80,
      rows: request.terminalOptions?.rows || 24,
    };
  }
}
