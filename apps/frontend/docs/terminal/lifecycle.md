# Terminal Lifecycle

The Terminal Subsystem manages lifecycles strictly through `TerminalManager` and `TerminalRegistry`. This guarantees predictability when opening, restoring, backgrounding, and terminating terminals.

## 1. Creation Lifecycle
1. User requests a new terminal via UI or an internal process.
2. `TerminalManager` mints `TerminalMetadata` (assigning a UUID, initial CWD, and Env).
3. `TerminalManager` instantiates a `TerminalSession` in `Created` state.
4. `TerminalRegistry` registers the session.
5. `TerminalSession.connect()` is called. The State transitions to `Initializing` then `Connecting`.
6. `TerminalProvider` negotiates a connection to the execution boundary and spins up the PTY via `PTYProvider`.
7. `TerminalSession` state transitions to `Running` and begins piping bytes.
8. `TerminalEvents` broadcasts `TerminalCreated`.

## 2. Active Lifecycle (Input/Output)
1. `React UI` issues user keystrokes to `TerminalSession.write(data)`.
2. Data traverses down into `TerminalProvider`, which pipes it into the `ITerminalStream`.
3. The underlying process processes the input and emits stdout/stderr.
4. `ITerminalStream.onData` triggers.
5. `TerminalSession` broadcasts the raw bytes directly to the UI rendering engine.
6. Periodically, `SessionPersistence` dumps metadata layout (excluding output buffer by default).

## 3. Background/Suspension Lifecycle
1. Network drops or IDE sleeps.
2. Stream emits `onClose` or `onError`.
3. `TerminalSession` transitions to `Suspended`.
4. Render buffer freezes. UI dims or displays "Reconnecting...".
5. Upon wakeup, `TerminalSession` attempts re-establishment via `TerminalProvider.createStream()`.

## 4. Teardown Lifecycle
1. Process naturally exits (e.g., user typing `exit`), OR user forcefully closes the tab.
2. `TerminalSession` enters `Closing` state.
3. `ProcessManager.kill(pid, SIGTERM)` is invoked.
4. A short timeout triggers. If process remains, `SIGKILL` is issued.
5. `TerminalEvents` broadcasts `TerminalClosed`.
6. `TerminalSession` state updates to `Closed`.
7. `TerminalRegistry.removeSession()` purges the instance.
8. `TerminalSession` state becomes `Disposed`.
9. Garbage collector reclaims memory.

## 5. Persistence & Restoration Lifecycle
1. On IDE shutdown, `SessionPersistence.save()` writes active terminal layout, CWD, and active PID states to disk/IDB.
2. On IDE launch, `SessionPersistence.load()` provides `TerminalSnapshot`.
3. `TerminalManager` iterates the snapshot, reconstructing `TerminalSession` instances into `Suspended` or `Created` states, avoiding immediate reconnect storms.
4. User clicking a restored terminal tab triggers `connect()`.
