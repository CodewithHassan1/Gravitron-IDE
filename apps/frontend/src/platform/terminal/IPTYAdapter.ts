export interface TerminalCapability {
  supportsResize: boolean;
  supportsColor: boolean;
  supportsUnicode: boolean;
  supportsShellIntegration: boolean;
  supportsClipboard: boolean;
  supportsPersistence: boolean;
  supportsOSC52: boolean;
}

export interface IPTYAdapter {
  capabilities: TerminalCapability;

  spawn(
    executable: string,
    args: string[],
    cwd: string,
    env: Record<string, string>
  ): Promise<void>;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(): void;

  onData(listener: (data: string) => void): () => void;
  onExit(listener: (exitCode: number) => void): () => void;
}
