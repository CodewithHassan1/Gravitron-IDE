# Redis Keyspace Specification

| Prefix | Type | Example Key | TTL | Description | Eviction |
|---|---|---|---|---|---|
| `ws:routing:` | STRING | `ws:routing:workspace_uuid` | 15m | Maps Workspace ID to WebSocket server pod. | `volatile-lru` |
| `rate:` | HASH | `rate:org_uuid` | 1m | GCRA rate limit buckets. | `volatile-lru` |
| `sess:` | STRING | `sess:session_uuid` | 15m | JWT Auth short-lived session cache. | `volatile-lru` |
| `revoked:` | BLOOM | `revoked:tokens` | - | Bloom filter tracking revoked refresh tokens. | None |
| `idem:` | HASH | `idem:uuid` | 24h | Idempotency keys mapping to API responses. | `volatile-lru` |
| `lock:` | STRING | `lock:workspace_uuid` | 30s | Distributed locks using Redlock algorithm. | `volatile-lru` |
| `agent:` | HASH | `agent:run_uuid` | 1h | Ephemeral agent state during execution. | `allkeys-lru` |
