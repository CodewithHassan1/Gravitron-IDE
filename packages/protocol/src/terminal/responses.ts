export interface TerminalCapabilities {
  supportsResize: boolean;
  supportsSignals: boolean;
  supportsReconnect: boolean;
  supportsPersistentSessions: boolean;
  supportsEnvironmentVariables: boolean;
  supportsWorkingDirectory: boolean;
  supportsHistory: boolean;
  supportsBinaryStreams: boolean;
  supportsDetach: boolean;
  supportsAttach: boolean;
  supportsTitleEvents: boolean;
}

export interface TerminalCreateResponse {
  sessionId: string;
  capabilities: TerminalCapabilities;
}

export interface TerminalSessionInfo {
  sessionId: string;
  terminalId?: string; // frontend terminal ID
  cwd?: string;
  executable?: string;
  capabilities: TerminalCapabilities;
  state: 'starting' | 'running' | 'exited' | 'killed';
}

export interface TerminalListResponse {
  sessions: TerminalSessionInfo[];
}

export interface TerminalOperationalMetrics {
  readonly capturedAt: number;
  readonly uptime: number;
  readonly bytesSent: number;
  readonly bytesReceived: number;
  readonly flushCount: number;
  readonly bufferDrops: number;
  readonly avgLatency: number;
  readonly peakQueue: number;
}

export interface TerminalDiagnosticMetrics {
  readonly capturedAt: number;
  readonly uptime: number;
  readonly reconnectCount: number;
  readonly attachFailures: number;
  readonly cancelCount: number;
  readonly spawnFailures: number;
}
