export interface ShellLaunchConfiguration {
  executable: string;
  args: string[];
  env?: Record<string, string>;
  cwd?: string;
  loginShell?: boolean;
  interactive?: boolean;
}

export interface IShellResolver {
  resolveLocal(): ShellLaunchConfiguration;
  resolveDocker(containerId: string): ShellLaunchConfiguration;
  resolveSSH(host: string): ShellLaunchConfiguration;
}

export interface IProcess {
  readonly pid: number;
  write(data: string | Uint8Array): void; // We can use either, but prefer Uint8Array later
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;

  onData(callback: (data: Uint8Array) => void): { dispose: () => void };
  onExit(callback: (exitCode: number) => void): { dispose: () => void };
}

export * from './IExecutionBackend';
export * from './ExecutionBackendRegistry';
