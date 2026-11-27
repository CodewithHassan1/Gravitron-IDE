# ==============================================================================
# Gravitron IDE - Orchestrator Service Dockerfile
# Multi-stage production build for @ag/orchestrator
# ==============================================================================

# --- Builder Stage ---
FROM node:22-bookworm-slim AS builder
WORKDIR /app

# Enable corepack for pinned pnpm
RUN corepack enable

# Copy root workspace manifests
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

# Copy all shared package manifests and source
COPY packages/ ./packages/

# Copy orchestrator service manifest
COPY services/orchestrator/package.json ./services/orchestrator/

# Install dependencies deterministically
RUN pnpm install --frozen-lockfile

# Copy remaining source code (respects .dockerignore)
COPY . .

# Build all upstream shared packages and orchestrator service
RUN pnpm turbo run build --filter=@ag/orchestrator...

# --- Runtime Stage ---
FROM node:22-bookworm-slim AS runtime
WORKDIR /app/services/orchestrator

ENV NODE_ENV=production
ENV PORT=3004

# Run as non-root user
USER node

# Copy dependencies and built packages preserving monorepo layout
COPY --chown=node:node --from=builder /app/node_modules /app/node_modules
COPY --chown=node:node --from=builder /app/packages /app/packages
COPY --chown=node:node --from=builder /app/services/orchestrator/dist /app/services/orchestrator/dist
COPY --chown=node:node --from=builder /app/services/orchestrator/package.json /app/services/orchestrator/package.json
COPY --chown=node:node --from=builder /app/services/orchestrator/node_modules /app/services/orchestrator/node_modules

EXPOSE 3004

# Health check using Node 22 native fetch
HEALTHCHECK --interval=10s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT || 3004) + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "dist/index.js"]
