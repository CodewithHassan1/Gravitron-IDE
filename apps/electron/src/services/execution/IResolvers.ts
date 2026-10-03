import { ExecutionRequest, ExecutionContext, ExecutionProfile, ExecutionTarget, ShellDescriptor, TerminalProtocol } from '@ag/protocol';
import { ExecutionBackendCapabilities } from '../terminal/pty/IExecutionBackend';

export interface IContextResolver {
  resolve(request: ExecutionRequest): Promise<ExecutionContext>;
}

export interface IProfileResolver {
  resolve(request: ExecutionRequest): Promise<ExecutionProfile>;
}

export interface IEnvironmentResolver {
  resolve(request: ExecutionRequest, profile: ExecutionProfile): Promise<Readonly<Record<string, string>>>;
}

export interface IWorkingDirectoryResolver {
  resolve(request: ExecutionRequest, profile: ExecutionProfile): Promise<string>;
}

export interface IShellResolver {
  resolve(request: ExecutionRequest, profile: ExecutionProfile): Promise<ShellDescriptor>;
  discoverProfiles(): Promise<TerminalProtocol.TerminalProfile[]>;
}

export interface ICapabilityResolver {
  resolve(target: ExecutionTarget): Promise<ExecutionBackendCapabilities>;
}
