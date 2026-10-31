# Builder Stage
FROM node:22-bookworm-slim AS builder
WORKDIR /app

RUN corepack enable

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/ ./packages/
COPY services/gateway/package.json ./services/gateway/

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm turbo run build --filter=@ag/gateway...

# Runtime Stage
FROM gcr.io/distroless/nodejs22-debian12 AS runtime
WORKDIR /app/services/gateway

ENV NODE_ENV=production
ENV PORT=8080

COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/packages /app/packages
COPY --from=builder /app/services/gateway/dist /app/services/gateway/dist
COPY --from=builder /app/services/gateway/package.json /app/services/gateway/package.json
COPY --from=builder /app/services/gateway/node_modules /app/services/gateway/node_modules

EXPOSE 8080
CMD ["dist/index.js"]
