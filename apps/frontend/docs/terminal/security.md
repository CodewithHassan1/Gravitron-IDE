# Terminal Security Model

The Terminal Subsystem establishes a stringent security perimeter preventing untrusted processes, AI execution anomalies, or compromised networks from damaging the host operating system or leaking sensitive IDE state.

## 1. Working Directory Isolation

- Every `TerminalSession` mandates a rigidly defined Current Working Directory (CWD).
- Execution environments restrict shell initialization to this path, actively blocking escape attempts outside the defined workspace boundary via sandboxing or container volume mounting.

## 2. Environment Variable Sanitization

- IDE host environment variables are scrubbed by default.
- The `TerminalMetadata` strictly enumerates an allowlist of environment variables injected into the execution context (e.g., overriding `$PATH`, restricting `$HOME`).

## 3. Container Isolation

- Execution environments defaulting to Docker/Podman must implement rootless execution schemas.
- `RuntimeProvider` disables privileged modes, drops Linux capabilities (e.g., `CAP_SYS_ADMIN`), and prevents host network/PID namespace sharing.

## 4. Command Injection Prevention

- The API explicitly forbids passing raw string commands that rely on implicit shell expansion.
- Commands and arguments must be passed as explicitly discrete array parameters (e.g., `['npm', 'install']` instead of `'npm install'`) to neutralize `$()` and `;` shell injection vulnerabilities at the PTY provider level.

## 5. Resource Quotas

The `ResourceMonitor` tracks and enforces hard limits:

- **CPU Limits:** Capping processes to specific core ratios to prevent cryptographic mining or infinite loop CPU starvation.
- **Memory Limits:** Strict byte thresholds to trigger `OOMKill` inside the container boundary before host memory is impacted.
- **Disk Quotas:** Volume restrictions preventing storage exhaustion from runaway logs or recursive copy commands.
- **Execution Timeouts:** Automated cleanup of idle or stalled instances.

## 6. Multi-User Isolation (Future Proofing)

- `TerminalManager` architectures are fundamentally designed assuming multi-tenant usage.
- Terminal events, sessions, and persistence payloads include strict user/session ownership tagging, ensuring cross-tenant terminal access is mathematically impossible inside the registry.
