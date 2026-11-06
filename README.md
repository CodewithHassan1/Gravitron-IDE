# Gravitron IDE

A modular personal agent & cloud-native IDE monorepo orchestrated with Turborepo and pnpm.

## Architecture

- **apps/**: Desktop (Electron) and Frontend applications.
- **services/**: Distributed agent microservices and background workers.
- **packages/**: Shared TypeScript libraries, proto definitions, and UI components.
- **infra/**: Docker, Kubernetes, Helm, and Terraform configuration.

## Getting Started

### Prerequisites

- Node.js (v18+)
- pnpm (`corepack enable`)

### Installation & Run

```bash
pnpm install
pnpm dev
```
