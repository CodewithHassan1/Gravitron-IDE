# Terminal Extension Points

The Terminal Subsystem is architecturally designed to support limitless runtime environments and deeply integrated AI capabilities without requiring modification to the core `TerminalManager`.

## 1. Runtime Extension Points

Implementers can plug new backend execution targets by conforming to `TerminalProvider` and `RuntimeProvider`. The architecture automatically handles streaming, reconnection, and UI rendering.

Future targets natively supported by this boundary:

- **Docker / Podman Containers**
- **Kubernetes Pods**
- **Remote SSH Sessions**
- **Remote Linux Workspaces**
- **Windows Subsystem for Linux (WSL)**
- **Cloud VM Runtimes**
- **Local Machine PTY (Node-pty)**

## 2. Future AI Integration (Milestone 5)

We reserve explicit extension hooks within the Terminal Subsystem to grant the future AI Agent safe, observable, and controllable access to the terminal environments.

**Note: These are architectural reservations only. No AI runtime logic exists in Phase 4.**

### AI Terminal Observation

- **Capability:** The AI can attach an invisible `ITerminalStream` listener to any `TerminalSession`.
- **Purpose:** Allows the AI to read stdout/stderr in real-time, detecting errors, prompts, or long-running output without polling.

### AI Command Execution

- **Capability:** The AI can invoke `TerminalSession.write(data)` directly.
- **Purpose:** Allows the AI to issue shell commands autonomously on behalf of the user to fix bugs, install dependencies, or run tests.

### AI Command Approval

- **Capability:** The `TerminalProvider` stream interception.
- **Purpose:** Allows a security interceptor to pause the stream when the AI attempts to write to `stdin`. The UI prompts the user for approval before the bytes are piped to the execution environment.

### AI Terminal Snapshots

- **Capability:** Calling `TerminalSession.getSnapshot()` (which will include scrollback lines).
- **Purpose:** Grants the AI immediate context of the last N lines of execution history to debug an issue without having been actively observing.

### AI Terminal Replay

- **Capability:** Injecting deterministic streams into `TerminalSession` without a real backend.
- **Purpose:** Simulating terminal states for AI training, validation, or reproducing bugs for the AI to fix in isolated "what-if" scenarios.
