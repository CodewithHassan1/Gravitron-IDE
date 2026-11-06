// src/services/terminal/types/index.ts

export interface TerminalMetadata {
  readonly id: string; // UUID
  readonly debugLabel?: string;
  readonly name: string;
  readonly cwd?: string;
  readonly executable?: string;
  readonly args?: ReadonlyArray<string>;
  readonly env?: Readonly<Record<string, string>>;
  readonly profileId?: string;
  readonly workspaceId?: string; // workspace identity for local terminals
}

export interface ResourceLimits {
  readonly maxMemoryBytes: number;
  readonly maxCpuCores: number;
  readonly timeoutMs?: number;
}

export interface TerminalDescriptor {
  readonly metadata: TerminalMetadata;
  readonly cols: number;
  readonly rows: number;
  readonly limits?: ResourceLimits;
}

export enum TerminalSessionState {
  Created = 'Created',
  Initializing = 'Initializing',
  Connecting = 'Connecting',
  Running = 'Running',
  Suspended = 'Suspended',
  Closing = 'Closing',
  Closed = 'Closed',
  Disposed = 'Disposed',
}

export interface RuntimeStatus {
  readonly isConnected: boolean;
  readonly latencyMs: number;
  readonly lastHeartbeat: number;
}

export interface ResourceUsage {
  readonly cpuPercent: number;
  readonly memoryBytes: number;
  readonly diskReadBytes: number;
  readonly diskWriteBytes: number;
}

export interface TerminalCapabilities {
  readonly supportsResize: boolean;
  readonly supportsColor: boolean;
  readonly supportsTitle: boolean;
  readonly supportsMouse: boolean;
}

export interface ResizeRequest {
  readonly cols: number;
  readonly rows: number;
}

export interface TerminalSnapshot {
  readonly version: number;
  readonly sessions: ReadonlyArray<TerminalMetadata>;
  readonly activeSessionId: string | null;
  readonly layout: Readonly<Record<string, any>>;
  readonly optional?: Readonly<{
    scrollbackBuffers?: Record<string, string>;
    viewports?: Record<string, any>;
  }>;
}

export interface IDisposable {
  dispose(): void;
}

export interface ITerminalStream extends IDisposable {
  write(data: Uint8Array): Promise<void>;
  onData(listener: (data: Uint8Array) => void): IDisposable;
  onClose(listener: () => void): IDisposable;
  onError(listener: (error: Error) => void): IDisposable;
}

export interface ITerminalTransport extends IDisposable {
  readonly name: string;
  connect(): Promise<void>;
  createStream(config: TerminalDescriptor): Promise<ITerminalStream>;
  attachStream(
    terminalId: string,
    sessionId: string
  ): Promise<{ stream: ITerminalStream; history: Uint8Array }>;
  resize(terminalId: string, cols: number, rows: number): Promise<void>;
  kill(terminalId: string, signal?: string): Promise<void>;
  detach(terminalId: string): Promise<void>;
  listSessions(): Promise<{ sessionId: string; state: string }[]>;
  getProfiles(): Promise<any[]>;
}
