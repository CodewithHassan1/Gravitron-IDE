# Terminal Subsystem Architecture

## Overview

The Terminal Subsystem is designed as a rigorous, single-responsibility, multi-layered architecture. It completely decouples the React UI from terminal transport, PTY execution, and underlying container environments.

## Dependency Rules

Dependencies must exclusively flow **downward**. Outer layers may depend on inner layers, but inner layers must remain completely unaware of the layers above them.

## Core Architectural Layers

The architecture consists of the following isolated layers:

### 1. React UI

- **Responsibility:** Exclusively handles rendering the terminal emulator view (e.g., drawing DOM/WebGL) and capturing user inputs.
- **Constraints:** Knows nothing about processes, network transport, or containers. It only speaks to the `TerminalManager`.

### 2. TerminalManager

- **Responsibility:** The primary entry point for terminal lifecycles. It orchestrates the creation, connection, and destruction of terminals.
- **Constraints:** Must not execute PTY commands. Must never know how bytes travel (e.g., WebSocket vs IPC). Communicates strictly with the `TerminalRegistry` and `TerminalProvider`.

### 3. TerminalRegistry

- **Responsibility:** Manages the collection of active and suspended sessions. Handles session lookup, active terminal switching, terminal ordering, and lifecycle ownership.
- **Constraints:** It holds state but does not execute terminal operations or manage streams. Essential for scaling to dozens of simultaneous terminals.

### 4. TerminalSession

- **Responsibility:** Encapsulates the state machine, metadata, and lifecycle of a single terminal instance (e.g., connecting, running, suspended).
- **Constraints:** Agnostic to the runtime implementation. Defers transport streaming and PTY management to the `TerminalProvider`.

### 5. TerminalProvider

- **Responsibility:** Acts as the abstraction boundary hiding specific implementations (e.g., SSH, Local, Docker). It exposes a generic `ITerminalStream` interface to the session.
- **Constraints:** Abstract. It communicates exclusively with `PTYProvider` or `RuntimeProvider` to fulfill streams.

### 6. PTYProvider

- **Responsibility:** Manages the pseudoterminal lifecycle (e.g., resize, spawn, kill) without tying it to the execution environment.
- **Constraints:** Interacts with the `RuntimeProvider` to execute processes inside the target boundary.

### 7. RuntimeProvider

- **Responsibility:** The bridge to the isolated execution environment. Manages limits, quotas, working directory translation, and process starting.
- **Constraints:** Agnostic to whether it is running locally or in the cloud. Exposes environment capabilities upward.

### 8. Execution Environment

- **Responsibility:** The raw compute layer (Docker, Podman, Local Machine, Kubernetes, Cloud Runtime).
- **Constraints:** Zero knowledge of the IDE. Strictly confined by OS-level or container-level resource limits.

## Abstract Stream Interface (Transport Agnostic)

The architecture prohibits defining concrete transports (WebSocket, gRPC) in the core layer. All data transit occurs over an abstract interface:

```typescript
interface ITerminalStream {
  write(data: Uint8Array): Promise<void>;
  onData(listener: (data: Uint8Array) => void): void;
  onClose(listener: () => void): void;
  onError(listener: (error: Error) => void): void;
  dispose(): void;
}
```
