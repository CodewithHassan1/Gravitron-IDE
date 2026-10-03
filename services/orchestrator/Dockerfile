# Builder Stage
FROM node:22-bookworm-slim AS builder
WORKDIR /app

RUN corepack enable

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY services/orchestrator/package.json ./services/orchestrator/

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm turbo run build --filter=orchestrator

# Runtime Stage
FROM gcr.io/distroless/nodejs22-debian12 AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8081

COPY --from=builder /app/services/orchestrator/dist ./dist
COPY --from=builder /app/services/orchestrator/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/services/orchestrator/node_modules ./services/orchestrator/node_modules

EXPOSE 8081
CMD ["dist/index.js"]
