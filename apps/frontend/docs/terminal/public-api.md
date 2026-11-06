# Terminal Subsystem Public API

This document freezes the public API contracts for the Terminal subsystem. Every interface is strictly minimal, entirely masking the implementation details of streaming, containerization, and PTY handling.

## Interfaces

### `TerminalManager`

Orchestrates terminal sessions without exposing underlying byte streams or runtime environments.

```typescript
interface TerminalManager {
  createTerminal(options?: TerminalOptions): Promise<TerminalSession>;
  getRegistry(): TerminalRegistry;
  dispose(): void;
}
```

### `TerminalRegistry`

Manages the collection and lifecycle ordering of terminal sessions.

```typescript
interface TerminalRegistry {
  getSessions(): ReadonlyArray<TerminalSession>;
  getSession(id: string): TerminalSession | undefined;
  getActiveSession(): TerminalSession | undefined;
  setActiveSession(id: string): void;
  removeSession(id: string): void;
  onRegistryChanged(listener: (sessions: ReadonlyArray<TerminalSession>) => void): IDisposable;
}
```

### `TerminalSession`

Represents a single terminal instance.

```typescript
interface TerminalSession {
  readonly id: string;
  readonly state: TerminalSessionState; // e.g., 'Connecting', 'Running'

  write(data: string | Uint8Array): Promise<void>;
  resize(cols: number, rows: number): Promise<void>;
  focus(): void;
  suspend(): Promise<void>;
  resume(): Promise<void>;
  close(): Promise<void>;

  onData(listener: (data: Uint8Array) => void): IDisposable;
  onStateChanged(listener: (state: TerminalSessionState) => void): IDisposable;
}
```

### `TerminalEvents`

Global event bus for observing system-wide terminal lifecycle events.

```typescript
interface TerminalEvents {
  on(event: 'created', listener: (e: TerminalCreated) => void): IDisposable;
  on(event: 'closed', listener: (e: TerminalClosed) => void): IDisposable;
  on(event: 'error', listener: (e: TerminalError) => void): IDisposable;
  emit<T extends keyof TerminalEventPayloads>(event: T, payload: TerminalEventPayloads[T]): void;
}
```

### `TerminalProvider`

Abstraction for initializing streams from a given execution boundary.

```typescript
interface TerminalProvider {
  readonly id: string;
  createStream(config: TerminalDescriptor): Promise<ITerminalStream>;
  validateEnvironment(): Promise<boolean>;
}
```

### `RuntimeProvider`

Interacts with the execution environment to govern processes.

```typescript
interface RuntimeProvider {
  readonly type: RuntimeType; // e.g., 'local', 'docker'
  getProcessManager(): ProcessManager;
  getResourceMonitor(): ResourceMonitor;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
}
```

### `ProcessManager`

Spawns and kills isolated execution instances.

```typescript
interface ProcessManager {
  spawn(command: string, args: string[], cwd: string, env: Record<string, string>): Promise<number>;
  kill(pid: number, signal?: string): Promise<void>;
  isAlive(pid: number): boolean;
}
```

### `ResourceMonitor`

Tracks container or local limitations to ensure stability.

```typescript
interface ResourceMonitor {
  getUsage(pid?: number): Promise<ResourceUsage>;
  setLimits(limits: ResourceLimits): Promise<void>;
  onLimitExceeded(listener: (event: ResourceLimitExceeded) => void): IDisposable;
}
```

### `SessionPersistence`

Persists core terminal metadata enabling layout restoration.

```typescript
interface SessionPersistence {
  save(snapshot: TerminalSnapshot): Promise<void>;
  load(): Promise<TerminalSnapshot | null>;
  clear(): Promise<void>;
}
```
