import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import {
  isMainModule,
  generateTestKeyPrefix,
  generateEphemeralGatewayPrivateKey,
  validateSafetyGuards,
  buildGatewayChildEnv,
  createDownstreamAuthMock,
  terminateChildProcess,
  PORT_A,
  PORT_B,
} from './verify_multi_gateway.mjs';
import { importPKCS8 } from 'jose';

describe('Gate 6B Stage 2A: Multi-Gateway Verification Harness Unit & Static Tests', () => {
  it('TEST-01: Windows file URL and entrypoint canonical normalization', () => {
    const metaUrl = 'file:///D:/Gravitron-IDE/scratch/verify_multi_gateway.mjs';

    // Test exact path with Windows backslashes
    assert.strictEqual(
      isMainModule(metaUrl, 'D:\\Gravitron-IDE\\scratch\\verify_multi_gateway.mjs'),
      true,
      'Should match exact absolute Windows path'
    );

    // Test lowercase drive letter (Windows drive-letter casing tolerance)
    assert.strictEqual(
      isMainModule(metaUrl, 'd:\\Gravitron-IDE\\scratch\\verify_multi_gateway.mjs'),
      true,
      'Should match lowercase drive letter'
    );

    // Test relative path resolution
    const relativeToCwd = path.relative(
      process.cwd(),
      'D:\\Gravitron-IDE\\scratch\\verify_multi_gateway.mjs'
    );
    assert.strictEqual(
      isMainModule(metaUrl, relativeToCwd),
      true,
      'Should match relative path resolved to CWD'
    );

    // Test module import (different file)
    assert.strictEqual(
      isMainModule(metaUrl, 'D:\\Gravitron-IDE\\scratch\\verify_multi_gateway.test.mjs'),
      false,
      'Should return false when imported from test file'
    );

    // Test undefined/null argv entry
    assert.strictEqual(isMainModule(metaUrl, undefined), false);
    assert.strictEqual(isMainModule(metaUrl, ''), false);
  });

  it('TEST-02: Isolated Redis test prefix generation and safety guard validation', () => {
    const prefix = generateTestKeyPrefix();
    assert.match(
      prefix,
      /^rl:auth:test:mgw:\d+-[0-9a-f]{8}$/,
      'Prefix must match unique run namespace format'
    );
    assert(prefix.length > 25, 'Prefix must be sufficiently long and isolated');

    // Valid loopback URL on dedicated port 16379 passes
    assert.doesNotThrow(() => {
      validateSafetyGuards('redis://127.0.0.1:16379', prefix);
      validateSafetyGuards('redis://localhost:16379', prefix);
    });

    // Prohibited ports, protocols, or external hosts must throw
    assert.throws(
      () => validateSafetyGuards('redis://127.0.0.1:6379', prefix),
      /Port must be dedicated test port 16379/
    );
    assert.throws(
      () => validateSafetyGuards('http://127.0.0.1:16379', prefix),
      /Protocol must be redis:/
    );
    assert.throws(
      () => validateSafetyGuards('redis://192.168.1.1:16379', prefix),
      /Host must be loopback/
    );
    assert.throws(
      () => validateSafetyGuards('redis://127.0.0.1:16379', 'rl:auth:production'),
      /prefix must be an isolated test namespace/
    );
  });

  it('TEST-03: In-memory ephemeral ES256 PKCS8 Gateway private key generation', async () => {
    const keyPem = generateEphemeralGatewayPrivateKey();
    assert.strictEqual(typeof keyPem, 'string');
    assert(keyPem.startsWith('-----BEGIN PRIVATE KEY-----'), 'Key must be in PKCS8 PEM format');
    assert(keyPem.includes('-----END PRIVATE KEY-----'));

    // Verify compatibility with S2SIssuer importPKCS8
    const imported = await importPKCS8(keyPem, 'ES256');
    assert.strictEqual(imported.type, 'private');
    assert(Boolean(imported), 'Imported key object must be defined');
  });

  it('TEST-04: Gateway child process environment configuration', () => {
    const mockAuthUrl = 'http://127.0.0.1:54321';
    const fakeKey = '-----BEGIN PRIVATE KEY-----\nMOCK\n-----END PRIVATE KEY-----';
    const env = buildGatewayChildEnv({
      port: PORT_A,
      redisUrl: 'redis://127.0.0.1:16379',
      hmacSecret: 'test-hmac-secret-at-least-32-chars-long!',
      keyPrefix: 'rl:auth:test:mgw:12345-abcdef12',
      jwtSecret: 'test-jwt-secret-at-least-32-chars-long!',
      gatewayPrivateKey: fakeKey,
      authServiceUrl: mockAuthUrl,
    });

    assert.strictEqual(env.PORT, '18080');
    assert.strictEqual(env.REDIS_URL, 'redis://127.0.0.1:16379');
    assert.strictEqual(env.RATE_LIMIT_HMAC_SECRET, 'test-hmac-secret-at-least-32-chars-long!');
    assert.strictEqual(env.RATE_LIMIT_KEY_PREFIX, 'rl:auth:test:mgw:12345-abcdef12');
    assert.strictEqual(env.JWT_SECRET, 'test-jwt-secret-at-least-32-chars-long!');
    assert.strictEqual(env.GATEWAY_PRIVATE_KEY, fakeKey);
    assert.strictEqual(env.AUTH_SERVICE_URL, mockAuthUrl);
    assert.strictEqual(env.AUTH_JWKS_URL, 'http://127.0.0.1:54321/.well-known/jwks.json');
    assert.strictEqual(
      env.NODE_ENV,
      'development',
      'Must set NODE_ENV=development so Gateway binds HTTP port'
    );
    assert.strictEqual(env.TRUSTED_PROXIES, '127.0.0.1,::1');
  });

  it('TEST-05: Downstream Auth mock lifecycle and HTTP responses', async () => {
    const mock = await createDownstreamAuthMock();
    assert(mock.port > 0, 'Port must be a dynamically allocated positive integer');
    assert(mock.url.startsWith('http://127.0.0.1:'), 'Must bind strictly to loopback 127.0.0.1');

    function httpGet(path) {
      return new Promise((resolve, reject) => {
        http
          .get(`${mock.url}${path}`, (res) => {
            let data = '';
            res.on('data', (c) => (data += c));
            res.on('end', () =>
              resolve({
                status: res.statusCode,
                data: JSON.parse(data),
                headers: res.headers,
              })
            );
          })
          .on('error', reject);
      });
    }

    function httpPost(path, body) {
      return new Promise((resolve, reject) => {
        const payload = JSON.stringify(body);
        const req = http.request(
          `${mock.url}${path}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(payload),
            },
          },
          (res) => {
            let data = '';
            res.on('data', (c) => (data += c));
            res.on('end', () =>
              resolve({
                status: res.statusCode,
                data: JSON.parse(data),
                headers: res.headers,
              })
            );
          }
        );
        req.on('error', reject);
        req.write(payload);
        req.end();
      });
    }

    // 1. Health endpoint
    const health = await httpGet('/health');
    assert.strictEqual(health.status, 200);
    assert.strictEqual(health.data.status, 'ok');

    // 2. JWKS endpoint
    const jwks = await httpGet('/.well-known/jwks.json');
    assert.strictEqual(jwks.status, 200);
    assert.deepStrictEqual(jwks.data.keys, []);

    // 3. Password Login endpoint -> returns deterministic 401 unauthenticated
    const login = await httpPost('/api/v1/auth/passwordLogin', {
      email: 'user@test.com',
      password: 'bad',
    });
    assert.strictEqual(login.status, 401);
    assert.strictEqual(login.headers['x-auth-mock'], 'true');
    assert.strictEqual(login.data.code, 'UNAUTHENTICATED');

    // 4. Connect-RPC Password Login alias
    const rpcLogin = await httpPost('/auth.v1.AuthService/PasswordLogin', {
      email: 'user@test.com',
    });
    assert.strictEqual(rpcLogin.status, 401);

    // 5. Clean teardown
    await mock.close();

    // Verify port is closed
    await assert.rejects(httpGet('/health'), /ECONNREFUSED|ECONNRESET/);
  });

  it('TEST-06: Terminate child process helper handles exited or non-existent processes gracefully', async () => {
    await assert.doesNotReject(terminateChildProcess(null, 'null process'));
    await assert.doesNotReject(terminateChildProcess({ exitCode: 0 }, 'exited process'));
  });
});
