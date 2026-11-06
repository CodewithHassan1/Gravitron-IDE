/**
 * PHASE 8.3 -- REAL end-to-end delegation proof.
 *
 * Exercises the live trust chain with real ES256 key material:
 *
 *   renderer access token (auth key)
 *        -> Gateway  POST /api/v1/agent/executions   (verify + S2S + sole issuer)
 *             -> Orchestrator POST /api/v1/orchestrator/authorize
 *                  -> Gateway mints execution-bound delegation
 *                       -> Worker-AI POST /api/v1/worker/execute (verifies)
 *                            -> Execution-Service POST /api/v1/execute (verifies again)
 *
 * It also proves the trusted-host exchange (raw delegation is returned ONLY to a
 * holder of AGENT_HOST_SECRET) and a matrix of fail-closed negatives.
 *
 * The raw delegation token is never printed. Run with the whole stack up:
 *   pnpm tsx scratch/test-delegation-flow.ts
 */
import { readFileSync } from 'node:fs';
import { connect } from 'node:net';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { importPKCS8, importSPKI, SignJWT, jwtVerify, type KeyLike } from 'jose';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnv(relPath: string): Record<string, string> {
  const out: Record<string, string> = {};
  const raw = readFileSync(resolve(ROOT, relPath), 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let value = m[2].trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1).replace(/\\n/g, '\n');
    }
    out[m[1]] = value;
  }
  return out;
}

const AUTH = loadEnv('services/auth/.env');
const ROOTENV = loadEnv('.env');
const GATEWAY = loadEnv('services/gateway/.env');

const AUTH_KID = AUTH.AUTH_KID || 'test-key-v1';
const USER_ID = 'user-e2e-bob';
const ORG_ID = 'org_e2e_alpha';
const HOST_SECRET = 'local-dev-host-secret';

const GATEWAY_URL = 'http://localhost:8080';
const WORKER_URL = 'http://localhost:3005';
const EXECUTION_URL = 'http://localhost:8083';

let failures = 0;
function check(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -> ${detail}` : ''}`);
  if (!ok) failures++;
}
function section(title: string): void {
  console.log(`\n=== ${title} ===`);
}

function decodeJwt(token: string): { header: any; payload: any } {
  const [h, p] = token.split('.');
  return {
    header: JSON.parse(Buffer.from(h, 'base64url').toString('utf8')),
    payload: JSON.parse(Buffer.from(p, 'base64url').toString('utf8')),
  };
}

function waitForPort(port: number, timeoutMs = 60000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolveP, rejectP) => {
    const attempt = () => {
      const sock = connect({ host: '127.0.0.1', port });
      sock.once('connect', () => {
        sock.destroy();
        resolveP();
      });
      sock.once('error', () => {
        sock.destroy();
        if (Date.now() > deadline) rejectP(new Error(`port ${port} not ready`));
        else setTimeout(attempt, 500);
      });
    };
    attempt();
  });
}

async function waitForHttp(url: string, timeoutMs = 60000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const r = await fetch(url);
      if (r.status < 500) return;
    } catch {
      /* retry */
    }
    if (Date.now() > deadline) throw new Error(`no response from ${url}`);
    await new Promise((r) => setTimeout(r, 500));
  }
}

async function main(): Promise<void> {
  // ---- Preflight: prove the trust material is a coherent pair -------------
  section('PREFLIGHT: trust material');
  const authKey = await importPKCS8(AUTH.AUTH_PRIVATE_KEY, 'ES256');
  const gatewayKey = await importPKCS8(GATEWAY.GATEWAY_PRIVATE_KEY, 'ES256');
  const internalPubStr = ROOTENV.INTERNAL_PUBLIC_KEY || GATEWAY.INTERNAL_PUBLIC_KEY;
  const internalPub: KeyLike = await importSPKI(internalPubStr, 'ES256');
  try {
    const probe = await new SignJWT({})
      .setProtectedHeader({ alg: 'ES256' })
      .setIssuer('ag-internal-gateway')
      .setAudience('worker-ai')
      .setIssuedAt()
      .setExpirationTime('1m')
      .sign(gatewayKey);
    await jwtVerify(probe, internalPub, { issuer: 'ag-internal-gateway', audience: 'worker-ai' });
    check(
      'GATEWAY_PRIVATE_KEY verifies against INTERNAL_PUBLIC_KEY',
      true,
      'gateway signing key -> downstream verification key'
    );
  } catch (e: any) {
    check('GATEWAY_PRIVATE_KEY verifies against INTERNAL_PUBLIC_KEY', false, e.message);
  }
  check(
    'root INTERNAL_PUBLIC_KEY == gateway INTERNAL_PUBLIC_KEY',
    ROOTENV.INTERNAL_PUBLIC_KEY === GATEWAY.INTERNAL_PUBLIC_KEY
  );

  section('WAITING for services');
  await waitForHttp('http://localhost:3001/health');
  const jwks = (await (await fetch('http://localhost:3001/.well-known/jwks.json')).json()) as any;
  check(
    'auth JWKS serves exactly the expected kid',
    Array.isArray(jwks.keys) && jwks.keys.some((k: any) => k.kid === AUTH_KID),
    `kids=[${(jwks.keys || []).map((k: any) => k.kid).join(',')}]`
  );
  await waitForPort(8080);
  await waitForHttp('http://localhost:3004/health');
  await waitForPort(3005);
  await waitForPort(8083);
  console.log('all services reachable');

  // ---- External access token (what the auth service would issue) ----------
  const accessToken = await new SignJWT({ org_id: ORG_ID, email: 'bob@example.com' })
    .setProtectedHeader({ alg: 'ES256', kid: AUTH_KID })
    .setIssuer('https://auth.ag-ide.local')
    .setAudience('ag-ide-platform')
    .setSubject(USER_ID)
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(authKey);

  const json = (r: Response) => r.json().catch(() => ({}));

  // ---- 1. Server-side path: client calls Gateway, raw token never returned -
  section('1. Gateway /api/v1/agent/executions (server-side full chain)');
  const execRes = await fetch(`${GATEWAY_URL}/api/v1/agent/executions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({
      workspaceId: 'ws-e2e-1',
      orgId: ORG_ID,
      prompt: 'e2e proof',
      command: 'echo e2e',
    }),
  });
  const execBody = (await json(execRes)) as any;
  check('execution request accepted (200)', execRes.status === 200, `status=${execRes.status}`);
  check(
    'returns an executionId (uuid)',
    typeof execBody.executionId === 'string' && execBody.executionId.length >= 8,
    execBody.executionId
  );
  check(
    'worker + execution-service succeeded downstream',
    execBody.workerResponse?.success === true,
    JSON.stringify(execBody.workerResponse?.execData?.result || execBody.workerResponse || {})
  );
  const serialized = JSON.stringify(execBody);
  check(
    'no raw delegation token in client response',
    !serialized.includes('delegation') && !/\beyJ[A-Za-z0-9_-]+\./.test(serialized)
  );

  // ---- 2. Trusted-host exchange: raw delegation returned only to host -----
  section('2. Gateway /api/v1/agent/delegations (trusted host only)');
  const delRes = await fetch(`${GATEWAY_URL}/api/v1/agent/delegations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'x-agent-host-token': HOST_SECRET,
    },
    body: JSON.stringify({ workspaceId: 'ws-e2e-1', orgId: ORG_ID }),
  });
  const delBody = (await json(delRes)) as any;
  check('host exchange accepted (200)', delRes.status === 200, `status=${delRes.status}`);
  check(
    'returns a raw delegation token to the host',
    typeof delBody.delegation === 'string' && delBody.delegation.split('.').length === 3
  );

  let delegation = delBody.delegation as string;
  let delegationExecId = delBody.executionId as string;
  let claims: any = {};
  if (delegation) {
    claims = decodeJwt(delegation).payload;
    const header = decodeJwt(delegation).header;
    check('delegation alg=ES256', header.alg === 'ES256', String(header.alg));
    check(
      'delegation issuer=ag-internal-gateway',
      claims.iss === 'ag-internal-gateway',
      String(claims.iss)
    );
    check('delegation audience=worker-ai', claims.aud === 'worker-ai', JSON.stringify(claims.aud));
    check(
      'delegation purpose=agent_delegation',
      claims.purpose === 'agent_delegation',
      String(claims.purpose)
    );
    check('delegation scope=agent:execute', claims.scope === 'agent:execute', String(claims.scope));
    check(
      'delegation bound to execution id',
      claims.execution_id === delegationExecId,
      String(claims.execution_id)
    );
    check(
      'delegation carries verified identity',
      claims.user_id === USER_ID && claims.org_id === ORG_ID,
      `user_id=${claims.user_id} org_id=${claims.org_id}`
    );
    const ttl = (claims.exp || 0) - (claims.iat || 0);
    check('delegation TTL ~ 15m', ttl === 900, `${ttl}s`);
    check(
      'delegation has unique jti',
      typeof claims.jti === 'string' && claims.jti.length > 0,
      String(claims.jti)
    );
    try {
      await jwtVerify(delegation, internalPub, {
        issuer: 'ag-internal-gateway',
        audience: 'worker-ai',
      });
      check('delegation signature verifies with INTERNAL_PUBLIC_KEY', true);
    } catch (e: any) {
      check('delegation signature verifies with INTERNAL_PUBLIC_KEY', false, e.message);
    }
  }

  // ---- 3. Worker-AI boundary: independent verification + Go forwarding ----
  section('3. Worker-AI /api/v1/worker/execute (verify -> forward to Go)');
  const workerOk = await fetch(`${WORKER_URL}/api/v1/worker/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${delegation}` },
    body: JSON.stringify({
      executionId: delegationExecId,
      workspaceId: 'ws-e2e-1',
      command: 'echo e2e',
    }),
  });
  const workerBody = (await json(workerOk)) as any;
  check(
    'worker accepted the verified delegation (200)',
    workerOk.status === 200,
    `status=${workerOk.status}`
  );
  check(
    'worker forwarded to execution-service and got a result',
    workerBody.success === true && workerBody.execData?.success === true,
    JSON.stringify(workerBody.execData?.result || workerBody)
  );

  const wrongBinding = await fetch(`${WORKER_URL}/api/v1/worker/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${delegation}` },
    body: JSON.stringify({ executionId: 'not-the-bound-execution', workspaceId: 'ws-e2e-1' }),
  });
  check(
    'worker rejects mismatched execution binding (401)',
    wrongBinding.status === 401,
    `status=${wrongBinding.status}`
  );

  const noDelegation = await fetch(`${WORKER_URL}/api/v1/worker/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ executionId: delegationExecId, workspaceId: 'ws-e2e-1' }),
  });
  check(
    'worker rejects missing delegation (401)',
    noDelegation.status === 401,
    `status=${noDelegation.status}`
  );

  // ---- 4. Go execution-service direct: independent verification + identity -
  section('4. Execution-Service /api/v1/execute (independent crypto verify)');
  const goOk = await fetch(`${EXECUTION_URL}/api/v1/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${delegation}` },
    body: JSON.stringify({
      executionId: delegationExecId,
      orgId: ORG_ID,
      userId: USER_ID,
      workspaceId: 'ws-e2e-1',
      command: 'echo e2e',
    }),
  });
  const goBody = (await json(goOk)) as any;
  check(
    'execution-service accepts the delegation (200)',
    goOk.status === 200,
    `status=${goOk.status}`
  );
  check(
    'execution-service executes with verified execution id',
    goBody.executionId === delegationExecId,
    String(goBody.executionId)
  );

  const goMismatch = await fetch(`${EXECUTION_URL}/api/v1/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${delegation}` },
    body: JSON.stringify({
      executionId: delegationExecId,
      orgId: 'org_attacker',
      userId: USER_ID,
      command: 'echo x',
    }),
  });
  check(
    'execution-service rejects tenant mismatch (403)',
    goMismatch.status === 403,
    `status=${goMismatch.status}`
  );

  const goNoToken = await fetch(`${EXECUTION_URL}/api/v1/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ executionId: delegationExecId, command: 'echo x' }),
  });
  check(
    'execution-service rejects missing token (401)',
    goNoToken.status === 401,
    `status=${goNoToken.status}`
  );

  // ---- 5. Gateway fail-closed negatives ------------------------------------
  section('5. Gateway negatives');
  const badHost = await fetch(`${GATEWAY_URL}/api/v1/agent/delegations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'x-agent-host-token': 'wrong-secret',
    },
    body: JSON.stringify({ workspaceId: 'ws-e2e-1' }),
  });
  check(
    'host exchange rejects forged host secret (403)',
    badHost.status === 403,
    `status=${badHost.status}`
  );

  const noAuth = await fetch(`${GATEWAY_URL}/api/v1/agent/executions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspaceId: 'ws-e2e-1' }),
  });
  check(
    'executions rejects missing access token (401)',
    noAuth.status === 401,
    `status=${noAuth.status}`
  );

  section('SUMMARY');
  console.log(failures === 0 ? 'ALL E2E CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((e) => {
  console.error('HARNESS ERROR:', e);
  process.exitCode = 2;
});
