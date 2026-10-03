# Terminal Error Model

The Terminal Subsystem anticipates failures gracefully. Every class of terminal failure must explicitly dictate the cause, recovery mechanism, and telemetry expectations.

## Expected Failures

### `RuntimeUnavailable`
- **Cause:** Docker daemon is not running, cloud VM is unreachable, or local WSL engine is powered down.
- **Recovery Strategy:** Terminate instantiation immediately. Do not retry automatically.
- **User Message:** "Execution environment unavailable. Ensure Docker is running."
- **Telemetry:** `fatal_initialization`

### `PTYUnavailable`
- **Cause:** Maximum PTY allocations exceeded on the host OS, or node-pty failed to spawn the binary.
- **Recovery Strategy:** Exponential backoff retry (up to 3 times) before terminating session.
- **User Message:** "Failed to spawn shell process. OS resource limit reached."
- **Telemetry:** `pty_failure`

### `SessionLost`
- **Cause:** Network drop or connection closure abruptly killed the `ITerminalStream`.
- **Recovery Strategy:** Transition state to `Suspended`. Engage automatic reconnection loops.
- **User Message:** "Connection lost. Reconnecting..."
- **Telemetry:** `network_disconnect`

### `StreamClosed`
- **Cause:** The underlying shell exited normally (`exit 0`), terminating the stream.
- **Recovery Strategy:** Transition to `Closing` -> `Closed`. No retry.
- **User Message:** "Terminal session ended."
- **Telemetry:** `normal_exit`

### `ResourceExceeded`
- **Cause:** The container or local process violated predefined memory, CPU, or disk constraints.
- **Recovery Strategy:** Forcefully kill the process (`SIGKILL`). Transition to `Closed`.
- **User Message:** "Terminal forcefully terminated due to excessive memory consumption."
- **Telemetry:** `resource_violation`

### `PermissionDenied`
- **Cause:** Lack of OS privileges to mount the requested working directory or spawn the requested executable.
- **Recovery Strategy:** Immediate abort. No retry.
- **User Message:** "Permission denied accessing workspace directory."
- **Telemetry:** `security_violation`

### `StartupTimeout`
- **Cause:** Cloud environment or heavy container takes too long to respond to the connection request.
- **Recovery Strategy:** Cancel the pending promise. Prompt the user to manually retry.
- **User Message:** "Terminal environment took too long to start. Try again."
- **Telemetry:** `timeout_startup`

### `RuntimeDisconnected`
- **Cause:** The runtime daemon itself crashed, taking all instances down simultaneously.
- **Recovery Strategy:** Transition all dependent `TerminalSession` instances to `Suspended`.
- **User Message:** "Docker daemon crashed. Reconnecting to runtime..."
- **Telemetry:** `daemon_crash`

### `ContainerCrashed`
- **Cause:** The isolated sandbox encountered a Kernel Panic or fatal crash.
- **Recovery Strategy:** Abandon the PID. Transition session to `Closed`.
- **User Message:** "The execution container crashed unexpectedly."
- **Telemetry:** `container_crash`
