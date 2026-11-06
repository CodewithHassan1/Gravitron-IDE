# Terminal Dependency Rules

The Terminal Architecture enforces strict, downward unidirectional dependency structures. Circular dependencies are explicitly prohibited.

## Dependency Direction

Outer layers may depend on inner layers, but inner layers must remain completely unaware of the layers above them.

`React UI`
↓
`TerminalManager`
↓
`TerminalRegistry`
↓
`TerminalSession`
↓
`TerminalProvider`
↓
`PTYProvider`
↓
`RuntimeProvider`
↓
`Execution Environment`

### Specific Invariants

1. **React UI Boundary:**
   - React components must only import `TerminalManager` and `TerminalRegistry`.
   - React components must NOT import `TerminalProvider`, `PTYProvider`, or `RuntimeProvider`.

2. **TerminalManager Boundary:**
   - `TerminalManager` must NOT import or reference React, DOM elements, or `xterm.js`.
   - `TerminalManager` must NOT import concrete providers like `DockerProvider` or `LocalPTYProvider`. It communicates purely via the abstract `TerminalProvider` interface.

3. **Transport Agnosticism:**
   - `TerminalSession` must NEVER import WebSocket, Socket.io, gRPC, or IPC libraries. Data streams use `ITerminalStream`.

4. **DTO Immutability:**
   - All events moving upward via `TerminalEvents` must be plain, readonly DTOs (`contracts.md`). They cannot contain callback functions or mutable references.

5. **TerminalRegistry Segregation:**
   - The `TerminalRegistry` holds state but executes NO IO logic. It knows about `TerminalSession` but has zero visibility into the providers underneath the session.
