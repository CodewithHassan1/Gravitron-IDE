# Terminal Events

The Terminal Subsystem utilizes strict, immutable, DTO-based event contracts. No mutable objects or active classes are passed in event payloads.

## System Events Catalog

### `TerminalCreated`
Dispatched when `TerminalManager` successfully mints a new `TerminalSession`.
```typescript
interface TerminalCreated {
  readonly terminalId: string;
  readonly timestamp: number;
  readonly metadata: TerminalMetadata;
}
```

### `TerminalClosed`
Dispatched when a session is fully destroyed and resource cleanup concludes.
```typescript
interface TerminalClosed {
  readonly terminalId: string;
  readonly timestamp: number;
}
```

### `TerminalFocused`
Dispatched when a specific terminal becomes the active viewport.
```typescript
interface TerminalFocused {
  readonly terminalId: string;
  readonly timestamp: number;
}
```

### `TerminalResized`
Dispatched when a terminal footprint changes dimensions.
```typescript
interface TerminalResized {
  readonly terminalId: string;
  readonly timestamp: number;
  readonly cols: number;
  readonly rows: number;
}
```

### `TerminalInput`
Dispatched for tracking keystrokes/data piped into the `TerminalSession` input buffer.
```typescript
interface TerminalInput {
  readonly terminalId: string;
  readonly timestamp: number;
  readonly payloadLength: number; // Avoid exposing raw byte payloads globally unless necessary
}
```

### `TerminalOutput`
Dispatched when standard output or standard error data is yielded by the PTY.
```typescript
interface TerminalOutput {
  readonly terminalId: string;
  readonly timestamp: number;
  readonly payloadLength: number; 
}
```

### `TerminalExit`
Dispatched when the underlying shell or execution environment exits.
```typescript
interface TerminalExit {
  readonly terminalId: string;
  readonly timestamp: number;
  readonly exitCode: number;
  readonly signal?: string;
}
```

### `TerminalError`
Dispatched on critical subsystem crashes or irrecoverable failures.
```typescript
interface TerminalError {
  readonly terminalId: string;
  readonly timestamp: number;
  readonly errorType: string;
  readonly message: string;
}
```

### `ProcessStarted`
Dispatched when the isolated `ProcessManager` successfully secures the PID.
```typescript
interface ProcessStarted {
  readonly terminalId: string;
  readonly timestamp: number;
  readonly pid: number;
}
```

### `ProcessExited`
Dispatched when the tracked PID drops from the process table.
```typescript
interface ProcessExited {
  readonly terminalId: string;
  readonly timestamp: number;
  readonly pid: number;
  readonly exitCode: number;
}
```

### `RuntimeConnected`
Dispatched when the bridge to Docker/Remote Runtime is successfully established.
```typescript
interface RuntimeConnected {
  readonly runtimeType: string;
  readonly timestamp: number;
}
```

### `RuntimeDisconnected`
Dispatched when the bridge to Docker/Remote Runtime drops.
```typescript
interface RuntimeDisconnected {
  readonly runtimeType: string;
  readonly timestamp: number;
  readonly reason: string;
}
```

### `ResourceLimitExceeded`
Dispatched when the container or process hits maximum predefined allocations.
```typescript
interface ResourceLimitExceeded {
  readonly terminalId: string;
  readonly timestamp: number;
  readonly resource: 'CPU' | 'Memory' | 'Disk';
  readonly currentUsage: number;
  readonly maxLimit: number;
}
```
