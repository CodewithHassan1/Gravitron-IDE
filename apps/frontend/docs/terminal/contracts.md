# Terminal Data Transfer Objects (Contracts)

This document centralizes all immutable DTOs and Data Structures utilized within the Terminal Subsystem. These contracts guarantee type safety without attaching implementation behaviors.

## Core Models

### `TerminalMetadata`

Immutable parameters driving the creation of a terminal session.

```typescript
interface TerminalMetadata {
  readonly id: string;
  readonly name: string;
  readonly cwd: string;
  readonly executable: string;
  readonly args: ReadonlyArray<string>;
  readonly env: Readonly<Record<string, string>>;
}
```

### `TerminalDescriptor`

A resolved footprint of the terminal environment constraints to execute.

```typescript
interface TerminalDescriptor {
  readonly metadata: TerminalMetadata;
  readonly cols: number;
  readonly rows: number;
  readonly limits?: ResourceLimits;
}
```

### `TerminalSessionState`

The exact point within the `state-machine` for a given terminal.

```typescript
enum TerminalSessionState {
  Created = 'Created',
  Initializing = 'Initializing',
  Connecting = 'Connecting',
  Running = 'Running',
  Suspended = 'Suspended',
  Closing = 'Closing',
  Closed = 'Closed',
  Disposed = 'Disposed',
}
```

### `RuntimeStatus`

The operational health of the isolated execution environment.

```typescript
interface RuntimeStatus {
  readonly isConnected: boolean;
  readonly latencyMs: number;
  readonly lastHeartbeat: number;
}
```

### `ResourceUsage`

Hardware telemetry collected by `ResourceMonitor`.

```typescript
interface ResourceUsage {
  readonly cpuPercent: number;
  readonly memoryBytes: number;
  readonly diskReadBytes: number;
  readonly diskWriteBytes: number;
}
```

### `ResourceLimits`

Maximum quotas allowable before halting or pausing the execution stream.

```typescript
interface ResourceLimits {
  readonly maxMemoryBytes: number;
  readonly maxCpuCores: number;
  readonly timeoutMs?: number;
}
```

### `TerminalCapabilities`

The confirmed abilities of a given terminal or provider.

```typescript
interface TerminalCapabilities {
  readonly supportsResize: boolean;
  readonly supportsColor: boolean;
  readonly supportsTitle: boolean;
  readonly supportsMouse: boolean;
}
```

### `ResizeRequest`

```typescript
interface ResizeRequest {
  readonly cols: number;
  readonly rows: number;
}
```

### `TerminalSnapshot`

The serializable footprint necessary to restore the session upon next load. Optional state (like scrollback) is segregated.

```typescript
interface TerminalSnapshot {
  readonly version: number;
  readonly sessions: ReadonlyArray<TerminalMetadata>;
  readonly activeSessionId: string | null;
  readonly layout: Readonly<Record<string, any>>;
  readonly optional?: Readonly<{
    scrollbackBuffers?: Record<string, string>;
    viewports?: Record<string, any>;
  }>;
}
```
