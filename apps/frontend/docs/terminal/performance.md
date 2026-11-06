# Terminal Performance Targets

The Terminal Subsystem is built to accommodate enterprise-scale, professional development workloads. All runtime implementations in subsequent phases must adhere strictly to these architectural performance targets.

## Primary Targets

### Startup & Interaction

- **Terminal Creation:** `<100 ms` from UI click to `Running` state.
- **Terminal Switch:** `<10 ms` to render when switching active tabs.
- **Resize Operations:** `<10 ms` latency to propagate dimensional changes through the PTY.
- **Reconnection Time:** `<200 ms` to restore a `Suspended` stream after waking up.
- **Restore After Refresh:** `<250 ms` to fully reinstate the terminal layout and state after an IDE page reload.

### Streaming Latency & Throughput

- **Input/Output Latency:** `<20 ms` for a keystroke to travel down the stream, echo in the PTY, and render back to the UI.
- **Maximum Output Throughput:** `100 MB/sec` capability without freezing the UI thread or blocking the IDE.

### Scale & Endurance

- **Concurrency:** Support `100 terminals opened simultaneously` without resource starvation or thread locking.
- **Long-Running Sessions:** Guaranteed continuous, flawless output for `24 hours` continuously.
- **Data Integrity:** **Zero dropped frames** during canvas rendering, and **zero byte loss** in the `ITerminalStream` layer, regardless of data velocity.
