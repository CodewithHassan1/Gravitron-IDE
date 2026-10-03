# ADR-0013: Terminal Security & Isolation

## Status
Accepted

## Context
Providing untrusted code or highly-autonomous AI agents access to a raw shell poses severe host-level security risks (e.g., escaping namespaces, consuming all memory, filling disk space, command injection).

## Decision
The terminal execution boundary will aggressively sandbox processes via `ResourceMonitor` and `ProcessManager` implementations.
1. **Command Input:** Terminals will refuse raw string commands susceptible to implicit bash expansion unless explicitly bypassed. APIs must accept strict `[executable, ...args]` parameters.
2. **Resource Limits:** CPU, memory bytes, and disk consumption will be strictly capped. Violation of limits results in immediate `SIGKILL` and emission of `ResourceLimitExceeded`.
3. **CWD Constraints:** Initial working directories must be validated and enforced.

## Consequences
- **Positive:** Safely facilitates future integration of autonomous AI without host compromise.
- **Positive:** Multi-tenant Cloud environments are immune from individual user resource starvation.
- **Negative:** Strict command array parsing may break plugins reliant on executing complex concatenated shell sequences directly.
