# Terminal State Machine

The Terminal Lifecycle is strictly deterministic. A terminal MUST reside in exactly one of the eight defined states. Valid transitions must strictly adhere to the arrows documented below.

## Valid States and Transitions

### `Created`
- **Definition:** The `TerminalSession` object is instantiated in memory but no transport is engaged.
- **Valid Transitions:**
  - ➔ `Initializing` (when `connect()` is invoked)
  - ➔ `Disposed` (if aborted before init)

### `Initializing`
- **Definition:** Validating metadata, requesting resource locks, and evaluating configurations.
- **Valid Transitions:**
  - ➔ `Connecting` (validation succeeded)
  - ➔ `Closing` (validation failed)

### `Connecting`
- **Definition:** Actively negotiating the byte stream over transport (e.g., establishing SSH bridge, Docker attach, Local PTY spawn).
- **Valid Transitions:**
  - ➔ `Running` (stream established and PTY spawned)
  - ➔ `Closing` (timeout, remote unavailable)

### `Running`
- **Definition:** PTY is active and bidirectional streaming of stdout/stdin is healthy.
- **Valid Transitions:**
  - ➔ `Suspended` (connection dropped abruptly, idle timeout, backgrounded)
  - ➔ `Closing` (explicit user exit, remote shell exit `exit 0`)

### `Suspended`
- **Definition:** The backend process may be alive or dead, but the UI is detached from the stream temporarily. Buffer is frozen.
- **Valid Transitions:**
  - ➔ `Connecting` (reconnect triggered)
  - ➔ `Closing` (abandoned or garbage collected)

### `Closing`
- **Definition:** Sending SIGTERM/SIGKILL, draining remaining buffers, and flushing to session persistence.
- **Valid Transitions:**
  - ➔ `Closed` (flushing complete and process verified dead)

### `Closed`
- **Definition:** The terminal session has finalized all remote connections. The session is functionally dead but metadata remains for review/logs.
- **Valid Transitions:**
  - ➔ `Disposed` (user clicks 'X', removing it from registry)

### `Disposed`
- **Definition:** The instance is fully removed from `TerminalRegistry`, event listeners detached, ready for Garbage Collection.
- **Valid Transitions:**
  - None. Terminal state machine.

## Recovery Transitions
If the state machine encounters a non-fatal `Suspended` state (e.g., network drop to a Cloud Runtime), the automatic recovery routine triggers:
1. Attempt `Connecting`
2. If fails, backoff exponentially.
3. If max attempts reached, transition to `Closing`.

## Illegal Transitions
- Moving from `Running` to `Created`.
- Moving from `Disposed` to any state.
- Bypassing `Connecting` to jump to `Running` directly from `Created`.
