# Builder Stage
FROM node:22-bookworm-slim AS builder
WORKDIR /app

RUN corepack enable

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY services/worker/package.json ./services/worker/

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm turbo run build --filter=worker

# Runtime Stage
FROM gcr.io/distroless/nodejs22-debian12 AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8083

COPY --from=builder /app/services/worker/dist ./dist
COPY --from=builder /app/services/worker/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/services/worker/node_modules ./services/worker/node_modules

EXPOSE 8083
CMD ["dist/index.js"]
