export type ExecutionBackendKind =
  | 'local'
  | 'docker'
  | 'ssh'
  | 'remote'
  | 'cloud';

export type ExecutionTarget = 
  | { kind: 'local'; cwd?: string }
  | { kind: 'docker'; containerId: string; execCommand?: string; workingDirectory?: string; environment?: Record<string, string>; user?: string }
  | { kind: 'ssh'; host: string; user?: string }
  | { kind: 'remote'; workspaceId: string }
  | { kind: 'cloud'; sessionId: string };

export interface ShellDescriptor {
  readonly executable: string;
  readonly args: readonly string[];
}

export interface ExecutionProfile {
  readonly id: string;
  readonly name: string;
  readonly shell?: ShellDescriptor;
  readonly env?: Readonly<Record<string, string>>;
}

export interface ExecutionRequest {
  readonly workspaceId: string;
  readonly target: ExecutionTarget;
  readonly profileId?: string;
  readonly cwdOverride?: string;
  readonly environmentOverride?: Readonly<Record<string, string>>;
  readonly shellOverride?: ShellDescriptor;
  // Any extra consumer options, like specific rows/cols for Terminal
  readonly terminalOptions?: {
    readonly cols?: number;
    readonly rows?: number;
  };
}

export interface ExecutionContext {
  readonly workspaceId: string;
  readonly target: ExecutionTarget;
  readonly cwd: string;
  readonly environment: Readonly<Record<string, string>>;
  readonly shell: ShellDescriptor;
  readonly profile: ExecutionProfile;
  readonly cols: number;
  readonly rows: number;
}
