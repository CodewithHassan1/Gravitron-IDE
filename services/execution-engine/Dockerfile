# Builder Stage
FROM golang:1.24-bookworm AS builder
WORKDIR /app

# Enable CGO if needed, but static distroless usually requires CGO_ENABLED=0
ENV CGO_ENABLED=0
ENV GOOS=linux
ENV GOARCH=amd64

# Download Go modules
COPY services/execution-engine/go.mod services/execution-engine/go.sum ./services/execution-engine/
RUN cd services/execution-engine && go mod download

# Copy source
COPY services/execution-engine/ ./services/execution-engine/

# Build
RUN cd services/execution-engine && go build -o /app/bin/execution-engine ./cmd/server/main.go

# Runtime Stage
FROM gcr.io/distroless/static-debian12 AS runtime
WORKDIR /

# Copy the statically linked binary
COPY --from=builder /app/bin/execution-engine /execution-engine

EXPOSE 8082
USER nonroot:nonroot
CMD ["/execution-engine"]
