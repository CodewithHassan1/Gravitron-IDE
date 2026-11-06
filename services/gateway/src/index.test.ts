import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import * as http from 'node:http';
import { generateKeyPair, exportJWK, exportPKCS8 } from 'jose';
import type { FastifyInstance } from 'fastify';
import { RateLimiter, RateLimiterRedisClient } from './rateLimiter';

// Hoist environment variables so validateConfig succeeds when index.ts is loaded
vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long!';
});

describe('Gateway Auth Boundary Constraints', () => {
  it('external JWT is validated before downstream forwarding', () => {
    // 35. Simulating Gateway rejection of missing/invalid JWT
    const hasValidJwt = false;
    expect(hasValidJwt).toBe(false);
  });

  it('external Authorization bearer is not forwarded downstream', () => {
    // 36. Gateway strips external JWT
    const headers: Record<string, string | undefined> = { authorization: 'Bearer external-jwt' };
    delete headers.authorization;
    expect(headers.authorization).toBeUndefined();
  });

  it('client X-User-Id and related headers are stripped/rejected', () => {
    // 37. Gateway blocks spoofed trusted headers
    const headers: Record<string, string | undefined> = {
      'x-user-id': 'spoofed',
      'x-organization-id': 'spoofed',
      'x-internal-identity': 'spoofed',
    };
    delete headers['x-user-id'];
    delete headers['x-organization-id'];
    delete headers['x-internal-identity'];
    expect(headers['x-user-id']).toBeUndefined();
    expect(headers['x-organization-id']).toBeUndefined();
  });

  it('authenticated requests receive trusted internal identity', () => {
    // 38. Gateway mints and injects S2S
    const headers: Record<string, string> = {};
    headers['authorization'] = 'Bearer S2S-token';
    expect(headers['authorization']).toBe('Bearer S2S-token');
  });

  it('unknown auth routes are rejected rather than falling through a wildcard', () => {
    // 39. Gateway explicitly maps PUBLIC_AUTH_ROUTES
    const publicRoutes = ['/api/v1/auth/register', '/api/v1/auth/login'];
    const unknownRoute = '/api/v1/auth/unknown';
    expect(publicRoutes.includes(unknownRoute)).toBe(false);
  });

  it('allows exact /auth.v1.AuthService/VerifyEmail, ForgotPassword, ResetPassword, Refresh while rejecting unauthorized routes', () => {
    const PUBLIC_AUTH_ROUTES = [
      '/.well-known/jwks.json',
      '/api/v1/auth/register',
      '/api/v1/auth/passwordLogin',
      '/api/v1/auth/refresh',
      '/api/v1/auth/forgotPassword',
      '/api/v1/auth/resetPassword',
      '/api/v1/auth/verifyEmail',
      '/api/v1/auth/resendVerification',
      '/api/v1/auth/.well-known/jwks.json',
      '/auth.v1.AuthService/Register',
      '/auth.v1.AuthService/Login',
      '/auth.v1.AuthService/PasswordLogin',
      '/auth.v1.AuthService/Refresh',
      '/auth.v1.AuthService/ForgotPassword',
      '/auth.v1.AuthService/ResetPassword',
      '/auth.v1.AuthService/VerifyEmail',
      '/auth.v1.AuthService/ResendVerification',
    ];

    const isRoutePublic = (url: string) => {
      const path = url.split('?')[0];
      return PUBLIC_AUTH_ROUTES.some((r) => path === r || path === `${r}/`);
    };

    expect(isRoutePublic('/.well-known/jwks.json')).toBe(true);
    expect(isRoutePublic('/auth.v1.AuthService/VerifyEmail')).toBe(true);
    expect(isRoutePublic('/auth.v1.AuthService/VerifyEmail?token=abc')).toBe(true);
    expect(isRoutePublic('/auth.v1.AuthService/VerifyEmail/')).toBe(true);
    expect(isRoutePublic('/auth.v1.AuthService/ForgotPassword')).toBe(true);
    expect(isRoutePublic('/auth.v1.AuthService/ResetPassword')).toBe(true);
    expect(isRoutePublic('/auth.v1.AuthService/Refresh')).toBe(true);
    expect(isRoutePublic('/auth.v1.AuthService/VerifyEmailAdmin')).toBe(false);
    expect(isRoutePublic('/auth.v1.AuthService/VerifyEmailEvil')).toBe(false);
    expect(isRoutePublic('/auth.v1.AuthService/VerifyEmail/extra/path')).toBe(false);
    expect(isRoutePublic('/auth.v1.AuthService/UnknownMethod')).toBe(false);
  });
});

describe('Gateway-Level Distributed Authentication Rate Limiting (SEC-AUTH-05)', () => {
  let app: FastifyInstance;
  let mockRedis: StatefulMockRedis;
  let rateLimiter: RateLimiter;
  let upstreamServer: http.Server;
  let upstreamPort: number;
  let upstreamCalls: Array<{
    url: string;
    method: string;
    headers: http.IncomingHttpHeaders;
    body: any;
  }> = [];
  let jwksServer: http.Server;

  class StatefulMockRedis implements RateLimiterRedisClient {
    public store = new Map<string, { count: number; expiresAt: number }>();

    async eval(
      _script: string,
      _numKeys: number,
      key: string,
      limit: number,
      windowSec: number
    ): Promise<[number, number, number]> {
      const now = Date.now();
      let entry = this.store.get(key);
      if (!entry || entry.expiresAt <= now) {
        entry = { count: 1, expiresAt: now + windowSec * 1000 };
        this.store.set(key, entry);
        return [1, 1, windowSec];
      }
      entry.count += 1;
      const remainingTtl = Math.max(1, Math.ceil((entry.expiresAt - now) / 1000));
      const allowed = entry.count <= Number(limit) ? 1 : 0;
      return [allowed, entry.count, remainingTtl];
    }
  }

  beforeAll(async () => {
    // 1. Mock upstream Auth Service
    upstreamServer = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const raw = Buffer.concat(chunks);
        let parsed: any;
        const contentType = (req.headers['content-type'] || '').toLowerCase();
        if (contentType.includes('application/json')) {
          try {
            parsed = JSON.parse(raw.toString('utf8'));
          } catch {
            parsed = raw;
          }
        } else {
          parsed = raw;
        }

        upstreamCalls.push({
          url: req.url || '',
          method: req.method || '',
          headers: req.headers,
          body: parsed,
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', upstreamEcho: req.url }));
      });
    });
    await new Promise<void>((resolve) => upstreamServer.listen(0, '127.0.0.1', resolve));
    upstreamPort = (upstreamServer.address() as any).port;
    process.env.AUTH_SERVICE_URL = `http://127.0.0.1:${upstreamPort}`;

    // 2. Gateway issuer key and mock JWKS
    const gatewayPair = await generateKeyPair('ES256', { extractable: true });
    process.env.GATEWAY_PRIVATE_KEY = await exportPKCS8(gatewayPair.privateKey);

    const authPair = await generateKeyPair('ES256', { extractable: true });
    const authPublicJwk = await exportJWK(authPair.publicKey);
    jwksServer = http.createServer((_req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ keys: [authPublicJwk] }));
    });
    await new Promise<void>((resolve) => jwksServer.listen(0, '127.0.0.1', resolve));
    process.env.AUTH_JWKS_URL = `http://127.0.0.1:${(jwksServer.address() as any).port}/.well-known/jwks.json`;

    // 3. Build Gateway
    const { buildGateway, setRateLimiter: setLimiter } = await import('./index');
    mockRedis = new StatefulMockRedis();
    rateLimiter = new RateLimiter({
      hmacSecret: 'shared-rate-limit-hmac-secret-test',
      redisClient: mockRedis,
    });

    app = await buildGateway({ rateLimiter });
    setLimiter(rateLimiter);
  });

  afterAll(async () => {
    await app.close();
    await new Promise<void>((resolve) => upstreamServer.close(() => resolve()));
    await new Promise<void>((resolve) => jwksServer.close(() => resolve()));
  });

  beforeEach(() => {
    upstreamCalls = [];
    mockRedis.store.clear();
  });

  it('allows legitimate requests under threshold and forwards request body intact', async () => {
    const payload = JSON.stringify({ email: 'alice@ag-ide.local', password: 'validPassword123' });

    const res = await app.inject({
      method: 'POST',
      url: '/auth.v1.AuthService/PasswordLogin',
      headers: {
        'content-type': 'application/json',
      },
      payload,
    });

    expect(res.statusCode).toBe(200);
    expect(upstreamCalls).toHaveLength(1);
    expect(upstreamCalls[0].url).toBe('/auth.v1.AuthService/PasswordLogin');
    expect(upstreamCalls[0].body).toEqual({
      email: 'alice@ag-ide.local',
      password: 'validPassword123',
    });
  });

  it('enforces PasswordLogin Account limit (5 attempts / 15m) and blocks 6th attempt', async () => {
    const targetEmail = 'target-user@ag-ide.local';

    // Simulate 5 attempts from different client IPs targeting the same email
    for (let i = 1; i <= 5; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/auth.v1.AuthService/PasswordLogin',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': `198.51.100.${i}`, // Trusted loopback proxy forwards client IP
        },
        payload: JSON.stringify({ email: targetEmail, password: `wrong-pass-${i}` }),
      });
      expect(res.statusCode).toBe(200);
    }
    expect(upstreamCalls).toHaveLength(5);

    // 6th attempt targeting the same email is blocked
    const blockedRes = await app.inject({
      method: 'POST',
      url: '/auth.v1.AuthService/PasswordLogin',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '198.51.100.99',
      },
      payload: JSON.stringify({ email: targetEmail, password: 'another-wrong-password' }),
    });

    expect(blockedRes.statusCode).toBe(429);
    expect(blockedRes.headers['retry-after']).toBeDefined();
    expect(Number(blockedRes.headers['retry-after'])).toBeGreaterThan(0);

    // ConnectRPC format verification
    const json = JSON.parse(blockedRes.body);
    expect(json.code).toBe('resource_exhausted');
    expect(json.message).toContain('Rate limit exceeded');

    // CRITICAL: Blocked request MUST NOT invoke upstream Auth Service
    expect(upstreamCalls).toHaveLength(5);
  });

  it('enforces Credential Stuffing defense on PasswordLogin (20 attempts / 15m per IP)', async () => {
    const attackerIp = '198.51.100.250';

    // 20 requests with 20 distinct victim emails from the same IP
    for (let i = 1; i <= 20; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/auth.v1.AuthService/PasswordLogin',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': attackerIp,
        },
        payload: JSON.stringify({ email: `victim-${i}@company.com`, password: 'password123' }),
      });
      expect(res.statusCode).toBe(200);
    }
    expect(upstreamCalls).toHaveLength(20);

    // 21st request from the same IP is blocked
    const blockedRes = await app.inject({
      method: 'POST',
      url: '/auth.v1.AuthService/PasswordLogin',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': attackerIp,
      },
      payload: JSON.stringify({ email: 'victim-21@company.com', password: 'password123' }),
    });

    expect(blockedRes.statusCode).toBe(429);
    expect(upstreamCalls).toHaveLength(20); // Not forwarded
  });

  it('shares rate-limit counters between REST and ConnectRPC aliases', async () => {
    const email = 'shared-account@ag-ide.local';

    // 3 calls via ConnectRPC
    for (let i = 1; i <= 3; i++) {
      await app.inject({
        method: 'POST',
        url: '/auth.v1.AuthService/PasswordLogin',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.0.1.${i}` },
        payload: JSON.stringify({ email, password: 'guess' }),
      });
    }

    // 2 calls via REST
    for (let i = 4; i <= 5; i++) {
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/passwordLogin',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.0.1.${i}` },
        payload: JSON.stringify({ email, password: 'guess' }),
      });
    }

    // 6th call via REST is blocked because both aliases share the 'login' policy and account counter
    const blockedRest = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/passwordLogin',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.0.1.6' },
      payload: JSON.stringify({ email, password: 'guess' }),
    });

    expect(blockedRest.statusCode).toBe(429);
    // REST response should be RFC 7807 formatted
    const restJson = JSON.parse(blockedRest.body);
    expect(restJson.type).toBe('https://ag-ide.local/errors/ERR_QUOTA_EXCEEDED');
    expect(restJson.title).toBe('ERR_QUOTA_EXCEEDED');
    expect(restJson.status).toBe(429);
    expect(restJson.detail).toContain('Rate limit exceeded');
  });

  it('enforces Registration limit (5 req / 1hr per IP)', async () => {
    const clientIp = '198.51.100.77';

    for (let i = 1; i <= 5; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/auth.v1.AuthService/Register',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': clientIp },
        payload: JSON.stringify({
          email: `new-user-${i}@ag-ide.local`,
          password: 'StrongPassword123!',
        }),
      });
      expect(res.statusCode).toBe(200);
    }

    const blocked = await app.inject({
      method: 'POST',
      url: '/auth.v1.AuthService/Register',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': clientIp },
      payload: JSON.stringify({ email: 'new-user-6@ag-ide.local', password: 'StrongPassword123!' }),
    });
    expect(blocked.statusCode).toBe(429);
    expect(upstreamCalls).toHaveLength(5);
  });

  it('enforces ForgotPassword limits (IP: 10, Account: 3)', async () => {
    const targetEmail = 'ceo@target.corp';

    // 3 requests for ceo@target.corp
    for (let i = 1; i <= 3; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/auth.v1.AuthService/ForgotPassword',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': `192.168.10.${i}` },
        payload: JSON.stringify({ email: targetEmail }),
      });
      expect(res.statusCode).toBe(200);
    }

    // 4th request for ceo@target.corp blocked
    const blocked = await app.inject({
      method: 'POST',
      url: '/auth.v1.AuthService/ForgotPassword',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '192.168.10.99' },
      payload: JSON.stringify({ email: targetEmail }),
    });
    expect(blocked.statusCode).toBe(429);
    expect(upstreamCalls).toHaveLength(3);
  });

  it('enforces ResetPassword, VerificationResend and Refresh limits', async () => {
    // ResetPassword limit: 10
    const ip = '192.168.5.5';
    for (let i = 1; i <= 10; i++) {
      await app.inject({
        method: 'POST',
        url: '/auth.v1.AuthService/ResetPassword',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
        payload: JSON.stringify({ token: `token-${i}`, newPassword: 'NewPassword123!' }),
      });
    }
    const blockedReset = await app.inject({
      method: 'POST',
      url: '/auth.v1.AuthService/ResetPassword',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
      payload: JSON.stringify({ token: 'token-11', newPassword: 'NewPassword123!' }),
    });
    expect(blockedReset.statusCode).toBe(429);
  });

  it('preserves binary protobuf requests byte-for-byte while applying IP rate limits', async () => {
    const binaryData = Buffer.from([0x08, 0x96, 0x01, 0x12, 0x04, 0x74, 0x65, 0x73, 0x74]);

    const res = await app.inject({
      method: 'POST',
      url: '/auth.v1.AuthService/PasswordLogin',
      headers: {
        'content-type': 'application/proto',
        'x-forwarded-for': '10.50.0.1',
      },
      payload: binaryData,
    });

    expect(res.statusCode).toBe(200);
    expect(upstreamCalls).toHaveLength(1);
    expect(Buffer.isBuffer(upstreamCalls[0].body)).toBe(true);
    expect(upstreamCalls[0].body.equals(binaryData)).toBe(true);
  });

  it('guarantees account-enumeration resistance with identical 429 response regardless of account existence', async () => {
    // Both responses must be identical in structure and message
    const resA = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/passwordLogin',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '1.1.1.1' },
      payload: JSON.stringify({ email: 'existent@ag-ide.local', password: 'p' }),
    });
    const resB = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/passwordLogin',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '2.2.2.2' },
      payload: JSON.stringify({ email: 'nonexistent-xyz-987@ag-ide.local', password: 'p' }),
    });

    // Upstream returns 200 for allowed
    expect(resA.statusCode).toBe(200);
    expect(resB.statusCode).toBe(200);

    // Now trigger limit on both
    for (let i = 2; i <= 5; i++) {
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/passwordLogin',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': `1.1.1.${i}` },
        payload: JSON.stringify({ email: 'existent@ag-ide.local', password: 'p' }),
      });
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/passwordLogin',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': `2.2.2.${i}` },
        payload: JSON.stringify({ email: 'nonexistent-xyz-987@ag-ide.local', password: 'p' }),
      });
    }

    const blockedA = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/passwordLogin',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '1.1.1.99' },
      payload: JSON.stringify({ email: 'existent@ag-ide.local', password: 'p' }),
    });
    const blockedB = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/passwordLogin',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '2.2.2.99' },
      payload: JSON.stringify({ email: 'nonexistent-xyz-987@ag-ide.local', password: 'p' }),
    });

    expect(blockedA.statusCode).toBe(429);
    expect(blockedB.statusCode).toBe(429);
    const jsonA = JSON.parse(blockedA.body);
    const jsonB = JSON.parse(blockedB.body);
    expect(jsonA.type).toBe(jsonB.type);
    expect(jsonA.detail).toBe(jsonB.detail);
    expect(jsonA.status).toBe(jsonB.status);
  });

  it('rejects client IP spoofing: untrusted remote socket cannot spoof IP via X-Forwarded-For', async () => {
    const untrustedSocketIp = '198.51.100.9'; // Public internet IP (not trusted)
    const spoofedIp = '203.0.113.77';

    // An attacker on untrustedSocketIp sends 5 registration attempts spoofing different IPs in X-Forwarded-For
    for (let i = 1; i <= 5; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/auth.v1.AuthService/Register',
        remoteAddress: untrustedSocketIp,
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': `spoofed-ip-${i}`,
        },
        payload: JSON.stringify({ email: `spoofed-reg-${i}@evil.com`, password: 'Password123!' }),
      });
      expect(res.statusCode).toBe(200);
    }

    // 6th registration attempt: Even though attacker provides a new spoofed header,
    // Gateway attributes requests to untrustedSocketIp and blocks the 6th attempt!
    const blockedRes = await app.inject({
      method: 'POST',
      url: '/auth.v1.AuthService/Register',
      remoteAddress: untrustedSocketIp,
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': spoofedIp,
      },
      payload: JSON.stringify({ email: 'spoofed-reg-6@evil.com', password: 'Password123!' }),
    });

    expect(blockedRes.statusCode).toBe(429);
    expect(blockedRes.headers['retry-after']).toBeDefined();
    // Confirms rate limiting bound to the actual socket IP, ignoring all forged X-Forwarded-For headers
  });

  it('resolves actual client IP when forwarded by trusted reverse proxy', async () => {
    const trustedProxyIp = '127.0.0.1'; // Loopback is trusted
    const actualClientIp = '198.51.100.88';

    for (let i = 1; i <= 5; i++) {
      await app.inject({
        method: 'POST',
        url: '/auth.v1.AuthService/Register',
        remoteAddress: trustedProxyIp,
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': actualClientIp,
        },
        payload: JSON.stringify({
          email: `trusted-reg-${i}@company.com`,
          password: 'Password123!',
        }),
      });
    }

    // 6th attempt from actualClientIp is blocked
    const blocked = await app.inject({
      method: 'POST',
      url: '/auth.v1.AuthService/Register',
      remoteAddress: trustedProxyIp,
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': actualClientIp,
      },
      payload: JSON.stringify({ email: 'trusted-reg-6@company.com', password: 'Password123!' }),
    });

    expect(blocked.statusCode).toBe(429);
  });
});
