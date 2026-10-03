# ADR-0010: Terminal Runtime Decoupling

## Status
Accepted

## Context
Modern cloud IDEs execute terminal processes either locally, within lightweight containers (Docker/Podman), or across secure remote network boundaries (SSH, Cloud VMs). If the terminal subsystem binds its pseudoterminal (PTY) logic to the execution host, it severely limits multi-environment support.

## Decision
We will cleanly separate the `PTYProvider` (handling columns, rows, terminal emulation logic) from the `RuntimeProvider` (handling execution, sandbox isolation, file system context).

The `TerminalManager` will possess absolutely zero knowledge of the actual environment executing the command. It will only orchestrate `TerminalSession` objects, which in turn delegate to these abstract providers.

## Consequences
- **Positive:** Adding Kubernetes or WSL support simply requires a new `RuntimeProvider` without altering any core IDE logic.
- **Positive:** PTY translation layers are reusable across any runtime.
- **Negative:** Increased abstraction layers make simple local-PTY spawns more verbose to architect.
