# Builder Stage
FROM node:22-bookworm-slim AS builder
WORKDIR /app

# Enable corepack for pnpm
RUN corepack enable

# Copy monorepo workspace dependencies
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/frontend/package.json ./apps/frontend/

# Install dependencies (ignoring scripts to prevent postinstall issues in pure builder)
RUN pnpm install --frozen-lockfile --ignore-scripts

# Copy source
COPY . .

# Build the frontend (Turborepo build)
RUN pnpm turbo run build --filter=frontend

# Runtime Stage
FROM gcr.io/distroless/nodejs22-debian12 AS runtime
WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000

# Next.js standalone output automatically traces and copies required files
COPY --from=builder /app/apps/frontend/public ./public
COPY --from=builder /app/apps/frontend/.next/standalone ./
COPY --from=builder /app/apps/frontend/.next/static ./.next/static

# Expose port and start
EXPOSE 3000
CMD ["server.js"]
