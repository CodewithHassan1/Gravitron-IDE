import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import * as http from 'node:http';
import {
  generateKeyPair,
  exportJWK,
  exportPKCS8,
  exportSPKI,
  importSPKI,
  SignJWT,
  jwtVerify,
} from 'jose';
import type { FastifyInstance } from 'fastify';

const AUTH_ISSUER = 'https://auth.ag-ide.local';
const AUTH_AUDIENCE = 'ag-ide-platform';
const EXTERNAL_SUB = 'user-bob';
const EXTERNAL_ORG = 'org_alpha';
const EXECUTION_ID = 'exec-abc';

let fastify: FastifyInstance;
let jwksServer: http.Server;
let jwksUrl: string;

let gatewayPrivatePem: string;
let gatewayPublicPem: string;
let authPrivate: CryptoKey;

let orchestratorAuthHeader = '';
let workerAuthHeader = '';

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long!';
  delete process.env.AUTH_ISSUER;
  delete process.env.AUTH_AUDIENCE;

  // Gateway = sole delegation issuer keys.
  const gatewayPair = await generateKeyPair('ES256', { extractable: true });
  gatewayPrivatePem = await exportPKCS8(gatewayPair.privateKey);
  gatewayPublicPem = await exportSPKI(gatewayPair.publicKey);

  // Auth provider keys serving an ephemeral JWKS for external-token verification.
  const authPair = await generateKeyPair('ES256', { extractable: true });
  authPrivate = authPair.privateKey;
  const authPublicJwk = await exportJWK(authPair.publicKey);

  jwksServer = http.createServer((_req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ keys: [authPublicJwk] }));
  });
  await new Promise<void>((resolve) => jwksServer.listen(0, '127.0.0.1', resolve));
  jwksUrl = `http://127.0.0.1:${(jwksServer.address() as any).port}/.well-known/jwks.json`;

  process.env.AUTH_JWKS_URL = jwksUrl;
  process.env.GATEWAY_PRIVATE_KEY = gatewayPrivatePem;

  const originalFetch = globalThis.fetch;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: any, init?: any) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      if (url.includes('/api/v1/orchestrator/authorize')) {
        orchestratorAuthHeader = (init?.headers as any)?.Authorization || '';
        return {
          ok: true,
          status: 200,
          json: async () => ({
            executionId: EXECUTION_ID,
            userId: EXTERNAL_SUB,
            orgId: EXTERNAL_ORG,
            scope: 'agent:execute',
          }),
          text: async () => JSON.stringify({}),
        } as any;
      }
      if (url.includes('/api/v1/worker/execute')) {
        workerAuthHeader = (init?.headers as any)?.Authorization || '';
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ success: true }),
          json: async () => ({}),
        } as any;
      }
      return originalFetch(input, init);
    })
  );

  const { buildGateway } = await import('./index');
  fastify = await buildGateway();
}, 60000);

afterAll(async () => {
  jwksServer.close();
  vi.unstubAllGlobals();
});

async function signExternalToken(overrides: Record<string, unknown> = {}): Promise<string> {
  return new SignJWT({ org_id: EXTERNAL_ORG, ...overrides })
    .setProtectedHeader({ alg: 'ES256' })
    .setSubject(EXTERNAL_SUB)
    .setIssuer(AUTH_ISSUER)
    .setAudience(AUTH_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(authPrivate);
}

async function verifyWithGatewayPublic(token: string): Promise<{ payload: any }> {
  const gatewayPublicKey = await importSPKI(gatewayPublicPem, 'ES256');
  return jwtVerify(token, gatewayPublicKey, {
    issuer: 'ag-internal-gateway',
    audience: 'worker-ai',
  }) as Promise<{ payload: any }>;
}

describe('PHASE 8.3 Gateway Delegation Boundaries', () => {
  it('executions endpoint rejects requests without a valid external JWT', async () => {
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/v1/agent/executions',
      payload: { workspaceId: 'ws-1' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('executions endpoint never returns the raw delegation token to the caller', async () => {
    const externalToken = await signExternalToken();
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/v1/agent/executions',
      headers: { authorization: `Bearer ${externalToken}` },
      payload: { workspaceId: 'ws-1' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.executionId).toBe(EXECUTION_ID);
    // The raw delegation must never reach the client surface.
    expect(body).not.toHaveProperty('delegation');
    expect(body).not.toHaveProperty('token');
  });

  it('forwards a trusted internal S2S token downstream, never the external JWT', async () => {
    const externalToken = await signExternalToken();
    await fastify.inject({
      method: 'POST',
      url: '/api/v1/agent/executions',
      headers: { authorization: `Bearer ${externalToken}` },
      payload: { workspaceId: 'ws-1' },
    });

    const s2sToken = orchestratorAuthHeader.replace(/^Bearer /, '');
    expect(s2sToken).not.toBe(externalToken);

    const gatewayPublicKey = await importSPKI(gatewayPublicPem, 'ES256');
    const { payload } = await jwtVerify(s2sToken, gatewayPublicKey, {
      issuer: 'ag-internal-gateway',
      audience: 'internal-services',
    });
    expect(payload.purpose).toBe('s2s');
    expect(payload.user_id).toBe(EXTERNAL_SUB);
    expect(payload.org_id).toBe(EXTERNAL_ORG);
  });

  it('issues the worker-ai an execution-bound delegation (purpose, audience, binding)', async () => {
    const externalToken = await signExternalToken();
    await fastify.inject({
      method: 'POST',
      url: '/api/v1/agent/executions',
      headers: { authorization: `Bearer ${externalToken}` },
      payload: { workspaceId: 'ws-1' },
    });

    const delegation = workerAuthHeader.replace(/^Bearer /, '');
    expect(delegation).not.toBe(externalToken);
    const { payload } = await verifyWithGatewayPublic(delegation);
    expect(payload.purpose).toBe('agent_delegation');
    expect(payload.execution_id).toBe(EXECUTION_ID);
    expect(payload.org_id).toBe(EXTERNAL_ORG);
    expect(payload.scope).toBe('agent:execute');
    expect(typeof payload.jti).toBe('string');
    expect(typeof payload.exp).toBe('number');
  });

  it('delegations endpoint (trusted execution host) requires the agent host secret', async () => {
    const externalToken = await signExternalToken();
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/v1/agent/delegations',
      headers: { authorization: `Bearer ${externalToken}` },
      payload: { workspaceId: 'ws-1' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('delegations endpoint denies a forged host secret', async () => {
    const externalToken = await signExternalToken();
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/v1/agent/delegations',
      headers: { authorization: `Bearer ${externalToken}`, 'x-agent-host-token': 'wrong-secret' },
      payload: { workspaceId: 'ws-1' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('delegations endpoint returns an ephemeral execution-bound delegation only to a trusted host', async () => {
    process.env.AGENT_HOST_SECRET = 'local-dev-host-secret';
    const externalToken = await signExternalToken();
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/v1/agent/delegations',
      headers: {
        authorization: `Bearer ${externalToken}`,
        'x-agent-host-token': 'local-dev-host-secret',
      },
      payload: { workspaceId: 'ws-1' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.delegation).toBeDefined();
    expect(body.executionId).toBe(EXECUTION_ID);
    expect(body.orgId).toBe(EXTERNAL_ORG);

    const { payload } = await verifyWithGatewayPublic(body.delegation);
    expect(payload.purpose).toBe('agent_delegation');
    expect(payload.execution_id).toBe(EXECUTION_ID);
    expect(typeof payload.jti).toBe('string');
  });
});
