# ADR-0012: Terminal Transport Agnostic Streaming

## Status

Accepted

## Context

Data must flow from the frontend UI rendering layer to the backend PTY and vice-versa. Coupling the IDE to a specific network protocol (e.g., WebSocket) breaks local desktop deployments (e.g., Electron) where IPC or SharedArrayBuffers are far superior.

## Decision

All terminal IO must transit exclusively through an abstract `ITerminalStream` interface:

```typescript
interface ITerminalStream {
  write(data: Uint8Array): Promise<void>;
  onData(listener: (data: Uint8Array) => void): void;
  onClose(listener: () => void): void;
  onError(listener: (error: Error) => void): void;
  dispose(): void;
}
```

The architecture dictates that the `TerminalManager` must never possess knowledge of the transport implementation (e.g., WebSocket, gRPC, Node streams, WebTransport).

## Consequences

- **Positive:** Enables seamless pivoting from web-based WebSocket clients to Electron-based desktop IPC without modifying a single line of business logic.
- **Positive:** Guarantees standard 100 MB/s throughput abstractions natively via TypedArrays.
- **Negative:** Requires creating adapter classes for every transport protocol deployed.
