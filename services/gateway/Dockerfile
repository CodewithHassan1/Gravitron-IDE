# Builder Stage
FROM node:22-bookworm-slim AS builder
WORKDIR /app

RUN corepack enable

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY services/gateway/package.json ./services/gateway/

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm turbo run build --filter=gateway

# Runtime Stage
FROM gcr.io/distroless/nodejs22-debian12 AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

COPY --from=builder /app/services/gateway/dist ./dist
COPY --from=builder /app/services/gateway/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/services/gateway/node_modules ./services/gateway/node_modules

EXPOSE 8080
CMD ["dist/index.js"]
