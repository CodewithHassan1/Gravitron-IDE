import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { generateKeyPair, exportSPKI, SignJWT } from 'jose';
import type { FastifyInstance } from 'fastify';

const ISS = 'ag-internal-gateway';
const AUD = 'worker-ai';
const EXEC = 'exec-001';
const USER = 'user-bob';
const ORG = 'org_alpha';

let app: FastifyInstance;
let gatewayPrivate: CryptoKey;
let gatewayPublicPem: string;
let forwardedAuthorization = '';
let forwardedBody: any = null;

async function signDelegation(
  privateKey: CryptoKey,
  opts: { purpose: string; execId: string; org: string; user: string; scope: string; exp: string | number; iss?: string; aud?: string }
): Promise<string> {
  return new SignJWT({
    purpose: opts.purpose,
    user_id: opts.user,
    org_id: opts.org,
    execution_id: opts.execId,
    scope: opts.scope,
  })
    .setProtectedHeader({ alg: 'ES256' })
    .setIssuedAt()
    .setExpirationTime(opts.exp)
    .setIssuer(opts.iss || ISS)
    .setAudience(opts.aud || AUD)
    .setJti('jti-' + Math.random().toString(36).slice(2))
    .sign(privateKey);
}

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  const pair = await generateKeyPair('ES256', { extractable: true });
  gatewayPrivate = pair.privateKey;
  gatewayPublicPem = await exportSPKI(pair.publicKey);
  process.env.INTERNAL_PUBLIC_KEY = gatewayPublicPem;

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: any, init?: any) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      if (url.includes('/api/v1/execute')) {
        forwardedAuthorization = (init?.headers as any)?.Authorization || '';
        forwardedBody = init?.body ? JSON.parse(init.body) : null;
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true }),
          text: async () => JSON.stringify({ success: true }),
        } as any;
      }
      throw new Error(`Unexpected fetch: ${url}`);
    })
  );

  const { buildWorkerApp } = await import('../src/index');
  app = await buildWorkerApp();
});

afterAll(async () => {
  vi.unstubAllGlobals();
});

function post(token: string | undefined, body: Record<string, unknown>) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/worker/execute',
    headers: token ? { authorization: `Bearer ${token}` } : {},
    payload: body,
  });
}

describe('PHASE 8.3 Worker-AI HTTP Delegation Boundary', () => {
  it('accepts a valid, execution-bound delegation and forwards it unchanged', async () => {
    const token = await signDelegation(gatewayPrivate, { purpose: 'agent_delegation', execId: EXEC, org: ORG, user: USER, scope: 'agent:execute', exp: '15m' });
    const res = await post(token, { executionId: EXEC, workspaceId: 'ws-1', prompt: 'hello' });

    expect(res.statusCode).toBe(200);
    expect(res.json().executionId).toBe(EXEC);
    // The worker relays the delegation (it holds no signing key of its own).
    expect(forwardedAuthorization).toBe(`Bearer ${token}`);
    expect(forwardedBody.executionId).toBe(EXEC);
    expect(forwardedBody.userId).toBe(USER);
    expect(forwardedBody.orgId).toBe(ORG);
  });

  it('rejects requests without a delegation bearer token', async () => {
    const res = await post(undefined, { executionId: EXEC });
    expect(res.statusCode).toBe(401);
  });

  it('rejects an arbitrary bearer string', async () => {
    const res = await post('some-arbitrary-bearer-value', { executionId: EXEC });
    expect(res.statusCode).toBe(401);
  });

  it('rejects a token signed by an untrusted key', async () => {
    const roguePair = await generateKeyPair('ES256');
    const token = await signDelegation(roguePair.privateKey, { purpose: 'agent_delegation', execId: EXEC, org: ORG, user: USER, scope: 'agent:execute', exp: '15m' });
    const res = await post(token, { executionId: EXEC });
    expect(res.statusCode).toBe(401);
  });

  it('rejects an expired delegation', async () => {
    const token = await signDelegation(gatewayPrivate, { purpose: 'agent_delegation', execId: EXEC, org: ORG, user: USER, scope: 'agent:execute', exp: '-10m' });
    const res = await post(token, { executionId: EXEC });
    expect(res.statusCode).toBe(401);
  });

  it('rejects a purpose=s2s token presented as a delegation', async () => {
    const token = await signDelegation(gatewayPrivate, { purpose: 's2s', execId: EXEC, org: ORG, user: USER, scope: 'agent:execute', exp: '15m' });
    const res = await post(token, { executionId: EXEC });
    expect(res.statusCode).toBe(401);
  });

  it('rejects a wrong issuer', async () => {
    const token = await signDelegation(gatewayPrivate, { purpose: 'agent_delegation', execId: EXEC, org: ORG, user: USER, scope: 'agent:execute', exp: '15m', iss: 'evil-issuer' });
    const res = await post(token, { executionId: EXEC });
    expect(res.statusCode).toBe(401);
  });

  it('rejects the wrong audience', async () => {
    const token = await signDelegation(gatewayPrivate, { purpose: 'agent_delegation', execId: EXEC, org: ORG, user: USER, scope: 'agent:execute', exp: '15m', aud: 'other-service' });
    const res = await post(token, { executionId: EXEC });
    expect(res.statusCode).toBe(401);
  });

  it('rejects an execution-binding mismatch', async () => {
    const token = await signDelegation(gatewayPrivate, { purpose: 'agent_delegation', execId: EXEC, org: ORG, user: USER, scope: 'agent:execute', exp: '15m' });
    const res = await post(token, { executionId: 'exec-DIFFERENT' });
    expect(res.statusCode).toBe(401);
  });

  it('rejects a missing executionId in the request body', async () => {
    const token = await signDelegation(gatewayPrivate, { purpose: 'agent_delegation', execId: EXEC, org: ORG, user: USER, scope: 'agent:execute', exp: '15m' });
    const res = await post(token, {});
    expect(res.statusCode).toBe(400);
  });

  it('rejects a cross-tenant orgId supplied in the body', async () => {
    const token = await signDelegation(gatewayPrivate, { purpose: 'agent_delegation', execId: EXEC, org: ORG, user: USER, scope: 'agent:execute', exp: '15m' });
    const res = await post(token, { executionId: EXEC, orgId: 'org_OTHER' });
    expect(res.statusCode).toBe(403);
  });

  it('rejects a userId that does not match the delegation', async () => {
    const token = await signDelegation(gatewayPrivate, { purpose: 'agent_delegation', execId: EXEC, org: ORG, user: USER, scope: 'agent:execute', exp: '15m' });
    const res = await post(token, { executionId: EXEC, userId: 'user-evil' });
    expect(res.statusCode).toBe(403);
  });
});