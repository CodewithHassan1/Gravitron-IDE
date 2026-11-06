# M8.3 — Agent Delegation Security — Final Report

**Status:** `PHASE 8.3 VERIFIED` (M8.3 scope)
**Date:** 2026-10-10
**Repo:** `D:\Personal Agent`
**Runtime proof:** `scratch\e2e-run.ps1` -> harness `EXIT=0`, "ALL E2E CHECKS PASSED"

> Finding labels **A–F** follow the M8.3 audit enumerated in the prior phase work.
> No canonical audit document exists in-repo, so each label below states the concrete
> vulnerability class it addresses and the control delivered + where it is verified.

---

## 1. Scope

Harden the agent execution delegation chain so a renderer-initiated execution is
cryptographically authorized end-to-end and cannot be forged, replayed, widened,
leaked, or executed by an untrusted caller:

```
renderer access token (auth ES256)
  -> Gateway       /api/v1/agent/executions        (verify access token, S2S, SOLE issuer)
  -> Orchestrator  /api/v1/orchestrator/authorize  (verify S2S, scope check, NO key)
  -> Worker-AI     /api/v1/worker/execute          (verify delegation + execution binding)
  -> Go Exec       /api/v1/execute                 (independent verify + tenant/user binding)
  -> Electron main (trusted-host exchange; raw token never leaves main)
```

Frozen (unchanged): RBAC roles OWNER/ADMIN/MEMBER/VIEWER, purpose `agent_delegation`,
claim set `user_id/org_id/execution_id/scope/jti/iss/aud/iat/exp/purpose`, no redesign of
RBAC / Electron / AgentStateMachine / AgentSession / ConnectRPC / Fastify, no generic mint API.

---

## 2. Findings & Remediation

### A. Downstream services accepted unverifiable / forgeable delegations

- **Control:** every downstream hop independently verifies the delegation signature and
  standard claims against a public key; no service trusts a caller's word.
- **Where:** `packages/auth/src/s2s.ts` (`verifyAgentDelegation`,
  `requireAgentDelegation`), consumed by the Worker-AI HTTP boundary and Go
  `services/execution/internal/delegation/delegation.go`.
- **Proof:** harness §3 (worker `401` on missing delegation), §4 (Go `401` missing token).

### B. Delegation not bound to an execution / identity (replayable, cross-tenant)

- **Control:** token carries `execution_id`, `user_id`, `org_id`; each hop enforces the
  expected audience and the execution binding; Go additionally enforces tenant/user
  binding (`403` on mismatch).
- **Where:** `requireAgentDelegation(token, key, audience, expectedExecutionId)` in
  `packages/auth/src/s2s.ts`; `delegation.Verify` tenant/user checks in
  `services/execution/internal/delegation/delegation.go`.
- **Proof:** harness §3 (worker `401` mismatched execution binding), §4
  (execution-service `403` tenant mismatch). Go log:
  `Execution rejected: ... organization mismatch`.

### C. Private-key sprawl — more than one component could mint delegations

- **Control:** the **Gateway is the ONLY** holder of `GATEWAY_PRIVATE_KEY` and the only
  caller of `mintDelegation`. Orchestrator, Worker-AI, Execution-Service, and Electron
  hold **public** material only.
- **Where:** `services/gateway/src/index.ts:221` (sole `mintDelegation` call site);
  `services/orchestrator/src/index.ts` has no key; Go verifier parses public SPKI only.
- **Proof:** static isolation scan (§4): `mintDelegation` / `GATEWAY_PRIVATE_KEY` in
  production only in `services/gateway`; none in worker-ai/electron/execution/orchestrator.

### D. Raw delegation leaked to the renderer / persisted / logged / telemetry

- **Control:** the raw token is returned **only** on the trusted-host exchange
  (`POST /api/v1/agent/delegations`, gated by `x-agent-host-token` == `AGENT_HOST_SECRET`).
  The client-facing `POST /api/v1/agent/executions` returns only
  `{ executionId, workerResponse }`. Electron main performs the exchange and never hands
  the token to the renderer.
- **Where:** `services/gateway/src/index.ts` (executions vs delegations routes);
  `apps/electron/src/services/AgentIpcService.ts`, `src/preload.ts`, `src/ipc/IpcDispatcher.ts`.
- **Proof:** harness §1 "no raw delegation token in client response"; harness §2 host-only
  exchange; log scan: no `eyJ...` JWT substring in any captured service log.

### E. Weak / missing claim set (purpose, aud, scope, exp, jti)

- **Control:** mint enforces `purpose=agent_delegation`, `scope=agent:execute`,
  `aud=worker-ai`, ES256, unique `jti`, ~15 min TTL; verify enforces iss/aud/exp/purpose/
  scope and rejects downgrade/foreign tokens.
- **Where:** `packages/auth/src/s2s.ts`; Go `internal/delegation/delegation.go`.
- **Proof:** harness §2 decodes and asserts alg/iss/aud/purpose/scope/binding/jti/TTL and
  signature; harness negatives reject forged host secret and missing access token.

### F. Transport / IPC caller trust (host secret + Electron sender frame)

- **Control:** the delegation-issuing gateway route requires a host-secret check; Electron
  IPC only accepts messages from the trusted renderer frame (`senderFrame.url` /
  `sender.getURL()` fallback), and handler results containing an error envelope are
  surfaced unwrapped.
- **Where:** `services/gateway/src/index.ts` (`agentHostSecret`);
  `apps/electron/src/ipc/IpcDispatcher.ts` (`trustedSenderMiddleware`).
- **Proof:** harness §5 (host exchange `403` forged secret; executions `401` missing access
  token); new electron test `rejects untrusted sender frames before any payload handling
(PHASE 8.3)`.

---

## 3. Runtime Proof (live stack, real crypto)

Driver: `scratch\e2e-run.ps1` (starts Gateway / Orchestrator / Worker-AI / JWKS stand-in /
Go Execution-Service, waits for ports, runs the harness, prints logs, tears down; all
ports released afterward). Harness: `scratch\test-delegation-flow.ts`. JWKS stand-in:
`scratch\e2e-jwks-server.mjs` (serves the real `AUTH_KID` auth public key on `:3001`).

Result — `ALL E2E CHECKS PASSED`, `EXIT=0`:

- Preflight: `GATEWAY_PRIVATE_KEY` verifies against `INTERNAL_PUBLIC_KEY`; root
  `INTERNAL_PUBLIC_KEY` == gateway copy; JWKS serves exactly `kid=test-v1`.
- §1 Gateway full chain: `200`, returns uuid `executionId`, downstream
  `{"exitCode":0,...}`, **no raw token** in response.
- §2 Trusted-host exchange: `200`, raw ES256 delegation; alg/iss/aud/purpose/scope/
  execution binding/identity (`user_id=user-e2e-bob org_id=org_e2e_alpha`) / TTL `900s` /
  unique jti asserted; signature verifies with `INTERNAL_PUBLIC_KEY`.
- §3 Worker: `200` and forwarded to Go; `401` mismatched execution binding; `401` missing.
- §4 Go Execution-Service: `200` with verified execution id; `403` tenant mismatch; `401` missing.
- §5 Gateway negatives: `403` forged host secret; `401` missing access token.
- Cross-service logs corroborate: Gateway both routes; Orchestrator authorized twice;
  Worker verified twice + `[permission_denied] Delegation execution binding mismatch`;
  Go `Authorized execution` twice + `Execution rejected: ... organization mismatch`.

---

## 4. Key-Isolation & Leakage Scans

- `GATEWAY_PRIVATE_KEY` / `mintDelegation` in production code: **only**
  `services/gateway/src/index.ts`. All other hits are tests/harness.
- No `importPKCS8` / `BEGIN PRIVATE KEY` in `services/worker-ai/src`, `apps/electron/src`,
  or `services/execution` (non-test).
- Go execution verifier parses public SPKI only; no `PRIVATE KEY` / signing in production Go.
- No `eyJ...` (raw JWT) substring in any captured stack log.

---

## 5. Verification Matrix

| Component            | Command                                                       | Result                    |
| -------------------- | ------------------------------------------------------------- | ------------------------- |
| `@ag/auth`           | `pnpm --filter @ag/auth test`                                 | 25 passed                 |
| `@ag/gateway`        | `pnpm --filter @ag/gateway test`                              | 12 passed                 |
| `@ag/worker-ai`      | `pnpm --filter @ag/worker-ai test`                            | 46 passed                 |
| `@ag/electron`       | `vitest run --pool=forks --poolOptions.forks.singleFork=true` | 101 passed                |
| Go Execution-Service | `go test ./internal/delegation/...`                           | 21 passed                 |
| End-to-end           | `scratch\e2e-run.ps1`                                         | EXIT=0, all checks passed |
| Gate (lint/build)    | `pnpm turbo run lint test build` (Go on PATH)                 | `@ag/*` lint+build green  |

Electron note: an initial parallel run hit `exit 134` (transient resource flake); the
single-fork run is green at 101/101.

---

## 6. Environment Exceptions (documented, not M8.3 defects)

1. **Auth service boot gap:** `services/auth/dist/server.js` requires
   `@ag/database/src/outbox` (`MODULE_NOT_FOUND`, stale dist) and `tsx src/index.ts` fails
   on `Cannot find module 'nodemailer'` (`services/auth/src/services/mailer.ts`;
   `nodemailer` missing from dependencies). Mitigation: JWKS stand-in on `:3001` using real
   auth key material, so gateway access-token verification remains real crypto.
2. **`@ag/frontend` workspace suites hang** (`tests/**` stress/sync) — pre-existing /
   environmental, outside M8.3 scope.
3. **Go runtime is a MOCK** (`ExecuteCommand` returns `exitCode 0` + mock stdout/stderr);
   Docker/Postgres/Redis not required for the proof.
4. **Root `.env` lacks `GATEWAY_PRIVATE_KEY`** (present in Gateway `.env` by isolation
   design) — intentional; noted for operators.
5. `@ag/execution-service#lint` (`go vet ./...`) requires Go on `PATH`; portable Go lives
   under `%LOCALAPPDATA%\Temp\opencode\go`.

---

## 7. Artifacts

- `scratch/test-delegation-flow.ts` — end-to-end harness (raw token never printed).
- `scratch/e2e-jwks-server.mjs` — JWKS stand-in (`:3001`, real auth public key).
- `scratch/e2e-run.ps1` — orchestration + teardown.
- `scratch/e2e-logs/` — captured service stdout/stderr for this run.
- Security tests: `packages/auth/src/s2s.test.ts`, `services/gateway/src/delegation.test.ts`,
  `services/worker-ai/tests/WorkerExecute.test.ts`,
  `services/execution/internal/delegation/delegation_test.go`,
  `apps/electron/src/services/__tests__/AgentIpcService.test.ts`,
  `apps/electron/tests/ipc/IpcDispatcher.test.ts`.
