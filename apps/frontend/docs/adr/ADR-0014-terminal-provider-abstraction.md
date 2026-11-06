# ADR-0014: Terminal Provider Abstraction Architecture

## Status

Accepted

## Context

If `TerminalManager` orchestrates terminal connections, it needs to spin up Docker containers, SSH streams, and local processes. Injecting all these specific domain dependencies directly into the `TerminalManager` violates the single responsibility principle and creates a massive, monolithic entry point.

## Decision

We enforce a strict provider delegation chain:

1. `TerminalManager` communicates only with an abstract `TerminalProvider`.
2. A specific `TerminalProvider` (e.g., `ContainerTerminalProvider`) delegates to a specific `RuntimeProvider`.
3. The `RuntimeProvider` (e.g., `DockerRuntimeProvider`) acts as the ultimate bridge to the execution environment.

This absolutely prohibits `TerminalManager` from executing any domain logic specific to PTY spawning, Kubernetes networking, or WebSockets.

## Consequences

- **Positive:** Dependency injection becomes simple. Testing `TerminalManager` only requires a mocked `TerminalProvider`.
- **Positive:** Third-party extensions can register custom providers (e.g., AWS EC2 Provider) without touching core IDE engine code.
- **Negative:** Increased initial scaffolding complexity requiring data structures to traverse multiple layers before execution.
