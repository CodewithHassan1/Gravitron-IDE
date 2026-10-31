# ==============================================================================
# Gravitron IDE - Auth Service Dockerfile
# Multi-stage production build for @ag/auth-service
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

# Copy auth service manifest
COPY services/auth/package.json ./services/auth/

# Install dependencies deterministically
RUN pnpm install --frozen-lockfile

# Copy remaining source code (respects .dockerignore)
COPY . .

# Build all upstream shared packages and auth service
RUN pnpm turbo run build --filter=@ag/auth-service...

# --- Runtime Stage ---
FROM node:22-bookworm-slim AS runtime
WORKDIR /app/services/auth

ENV NODE_ENV=production
ENV PORT=3001

# Run as non-root user
USER node

# Copy dependencies and built packages preserving monorepo layout
COPY --chown=node:node --from=builder /app/node_modules /app/node_modules
COPY --chown=node:node --from=builder /app/packages /app/packages
COPY --chown=node:node --from=builder /app/services/auth/dist /app/services/auth/dist
COPY --chown=node:node --from=builder /app/services/auth/package.json /app/services/auth/package.json
COPY --chown=node:node --from=builder /app/services/auth/node_modules /app/services/auth/node_modules

EXPOSE 3001

# Health check using Node 22 native fetch
HEALTHCHECK --interval=10s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT || 3001) + '/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["node", "dist/index.js"]
