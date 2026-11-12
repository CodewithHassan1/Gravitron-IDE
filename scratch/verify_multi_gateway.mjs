/**
 * Phase 5.2.3.17 — Multi-Gateway Process Verification Harness (Gate 4C / Gate 6A / Gate 6B)
 *
 * Verifies distributed rate-limiting synchronization across two independent OS processes:
 *   - Gateway Replica A (PID A, Port 18080)
 *   - Gateway Replica B (PID B, Port 18081)
 *   - Shared Redis: redis://127.0.0.1:16379
 *   - Shared HMAC Secret: verify-shared-secret-min-32-chars-long-here!
 *   - SEC-TEST-01: Isolated unique run-specific Redis key prefix (rl:auth:test:mgw:<run-id>)
 *   - SEC-TEST-02: Ephemeral ES256 PKCS8 Gateway private key for S2SIssuer initialization
 *   - SEC-TEST-03: Downstream Auth Service loopback mock returning deterministic 401 unauthenticated
 *   - SEC-TEST-04: Robust Windows child-process lifecycle, early-exit detection, and cleanup
 */

import { spawn } from 'node:child_process';
import http from 'node:http';
import assert from 'node:assert';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

export const REDIS_URL = process.env.TEST_REDIS_URL || 'redis://127.0.0.1:16379';
export const SHARED_HMAC_SECRET =
  process.env.RATE_LIMIT_HMAC_SECRET || 'verify-shared-secret-min-32-chars-long-here!';
export const JWT_SECRET =
  process.env.JWT_SECRET || 'test-secret-that-is-at-least-32-characters-long!';

export const PORT_A = 18080;
export const PORT_B = 18081;

/**
 * Normalizes entrypoint and checks whether this file was executed directly or imported.
 * Supports Windows drive-letter casing and cross-platform canonical paths.
 */
export function isMainModule(metaUrl, argvEntry) {
  if (!argvEntry) return false;
  try {
    const entryPath = path.resolve(argvEntry);
    const metaPath = fileURLToPath(metaUrl);
    return path.normalize(entryPath).toLowerCase() === path.normalize(metaPath).toLowerCase();
  } catch {
    return false;
  }
}

/**
 * SEC-TEST-01: Generates an isolated, unpredictable test namespace prefix.
 */
export function generateTestKeyPrefix() {
  const runId = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  return `rl:auth:test:mgw:${runId}`;
}

/**
 * SEC-TEST-02: Generates an in-memory ephemeral ES256 PKCS8 key pair for S2SIssuer.
 * Never persisted, logged, or written to disk.
 */
export function generateEphemeralGatewayPrivateKey() {
  const { privateKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'P-256',
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return privateKey;
}

/**
 * Validates safety guards for Redis connection and isolated namespace.
 */
export function validateSafetyGuards(redisUrl = REDIS_URL, prefix) {
  const parsed = new URL(redisUrl);
  assert.strictEqual(
    parsed.protocol,
    'redis:',
    `Safety Guard: Protocol must be redis: (got ${parsed.protocol})`
  );
  assert(
    parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost',
    `Safety Guard: Host must be loopback (127.0.0.1 or localhost), got: ${parsed.hostname}`
  );
  assert.strictEqual(
    parsed.port || '6379',
    '16379',
    `Safety Guard: Port must be dedicated test port 16379 (got ${parsed.port})`
  );

  if (prefix !== undefined) {
    assert(
      typeof prefix === 'string' && prefix.startsWith('rl:auth:test:mgw:') && prefix.length > 20,
      `Safety Guard: prefix must be an isolated test namespace starting with 'rl:auth:test:mgw:'`
    );
  }
}

/**
 * Builds child process environment for Gateway replicas.
 * Configures NODE_ENV='development' to activate Gateway HTTP listener (preserving NODE_ENV='test' for unit test isolation).
 */
export function buildGatewayChildEnv({
  port,
  redisUrl,
  hmacSecret,
  keyPrefix,
  jwtSecret,
  gatewayPrivateKey,
  authServiceUrl,
}) {
  return {
    ...process.env,
    PORT: String(port),
    REDIS_URL: redisUrl,
    RATE_LIMIT_HMAC_SECRET: hmacSecret,
    RATE_LIMIT_KEY_PREFIX: keyPrefix,
    JWT_SECRET: jwtSecret,
    GATEWAY_PRIVATE_KEY: gatewayPrivateKey,
    AUTH_SERVICE_URL: authServiceUrl,
    AUTH_JWKS_URL: `${authServiceUrl.replace(/\/+$/, '')}/.well-known/jwks.json`,
    NODE_ENV: 'development',
    TRUSTED_PROXIES: '127.0.0.1,::1',
  };
}

/**
 * SEC-TEST-03: Minimal harness-owned downstream Auth Service mock.
 * Bound dynamically to 127.0.0.1 on port 0.
 * Returns deterministic 401 Unauthenticated for invalid test credentials.
 */
export function createDownstreamAuthMock() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const urlPath = (req.url || '').split('?')[0];

      if (urlPath === '/.well-known/jwks.json') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ keys: [] }));
        return;
      }

      if (urlPath === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
        return;
      }

      if (
        urlPath === '/api/v1/auth/passwordLogin' ||
        urlPath === '/auth.v1.AuthService/PasswordLogin' ||
        urlPath === '/api/v1/auth/register' ||
        urlPath === '/auth.v1.AuthService/Register'
      ) {
        res.writeHead(401, {
          'Content-Type': 'application/json',
          'X-Auth-Mock': 'true',
        });
        res.end(
          JSON.stringify({
            error: 'Invalid email or password',
            code: 'UNAUTHENTICATED',
          })
        );
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    });

    server.on('error', reject);

    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = address.port;
      resolve({
        server,
        port,
        url: `http://127.0.0.1:${port}`,
        close: () =>
          new Promise((resClose) => {
            server.close(() => resClose());
          }),
      });
    });
  });
}

/**
 * Dispatches an HTTP POST request to a Gateway replica.
 */
export function sendPost(port, path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          'X-Forwarded-For': '198.51.100.99', // Trusted loopback proxy forwarded IP
        },
      },
      (res) => {
        let respData = '';
        res.on('data', (chunk) => {
          respData += chunk;
        });
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: respData,
          });
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

/**
 * Polls the Gateway replica's /health endpoint until it returns HTTP 200.
 */
export function waitForHealth(port, timeoutMs = 15000, processRef = null) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    let earlyExitHandler = null;

    if (processRef) {
      earlyExitHandler = (code, signal) => {
        clearInterval(interval);
        reject(
          new Error(
            `Gateway child process on port ${port} exited prematurely with code ${code}, signal ${signal}`
          )
        );
      };
      processRef.once('exit', earlyExitHandler);
    }

    const interval = setInterval(() => {
      if (processRef && processRef.exitCode !== null) {
        clearInterval(interval);
        return;
      }

      const req = http.get(`http://127.0.0.1:${port}/health`, (res) => {
        if (res.statusCode === 200) {
          clearInterval(interval);
          if (processRef && earlyExitHandler) {
            processRef.removeListener('exit', earlyExitHandler);
          }
          resolve();
        }
      });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) {
          clearInterval(interval);
          if (processRef && earlyExitHandler) {
            processRef.removeListener('exit', earlyExitHandler);
          }
          reject(new Error(`Timeout waiting for Gateway on port ${port}`));
        }
      });
    }, 200);
  });
}

/**
 * Reliably terminates a child process and waits for exit on Windows and POSIX.
 */
export async function terminateChildProcess(proc, label) {
  if (!proc || proc.exitCode !== null) return;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      try {
        proc.kill('SIGKILL');
      } catch {}
      resolve();
    }, 3000);

    proc.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });

    try {
      proc.kill('SIGTERM');
    } catch {
      clearTimeout(timer);
      resolve();
    }
  });
}

export async function run() {
  const testKeyPrefix = generateTestKeyPrefix();
  validateSafetyGuards(REDIS_URL, testKeyPrefix);

  console.log('=== MULTI-GATEWAY PROCESS RUNTIME VERIFICATION HARNESS ===');
  console.log(`[SEC-TEST-01] Assigned Isolated Namespace Prefix: ${testKeyPrefix}`);

  let mockAuth = null;
  let processA = null;
  let processB = null;

  try {
    console.log('0. Provisioning downstream Auth Service loopback mock...');
    mockAuth = await createDownstreamAuthMock();
    console.log(`   Downstream Auth Mock listening at: ${mockAuth.url}`);

    console.log('0. Provisioning ephemeral Gateway signing key for S2SIssuer...');
    const gatewayPrivateKey = generateEphemeralGatewayPrivateKey();

    console.log(`1. Spawning Gateway Replica A on port ${PORT_A}...`);
    const envA = buildGatewayChildEnv({
      port: PORT_A,
      redisUrl: REDIS_URL,
      hmacSecret: SHARED_HMAC_SECRET,
      keyPrefix: testKeyPrefix,
      jwtSecret: JWT_SECRET,
      gatewayPrivateKey,
      authServiceUrl: mockAuth.url,
    });

    processA = spawn('node', ['services/gateway/dist/index.js'], {
      env: envA,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const stderrA = [];
    processA.stderr.on('data', (c) => stderrA.push(c.toString()));
    console.log(`   Replica A spawned with PID: ${processA.pid}`);

    console.log(`2. Spawning Gateway Replica B on port ${PORT_B}...`);
    const envB = buildGatewayChildEnv({
      port: PORT_B,
      redisUrl: REDIS_URL,
      hmacSecret: SHARED_HMAC_SECRET,
      keyPrefix: testKeyPrefix,
      jwtSecret: JWT_SECRET,
      gatewayPrivateKey,
      authServiceUrl: mockAuth.url,
    });

    processB = spawn('node', ['services/gateway/dist/index.js'], {
      env: envB,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const stderrB = [];
    processB.stderr.on('data', (c) => stderrB.push(c.toString()));
    console.log(`   Replica B spawned with PID: ${processB.pid}`);
    assert.notStrictEqual(processA.pid, processB.pid, 'Processes must have distinct PIDs');

    console.log('3. Waiting for both Gateway processes to become healthy...');
    await Promise.all([
      waitForHealth(PORT_A, 15000, processA),
      waitForHealth(PORT_B, 15000, processB),
    ]);
    console.log('   Both Gateway processes are alive and listening.');

    console.log('4. Executing distributed account rate-limit tests across replicas...');
    const targetEmail = 'distributed-victim@company.com';
    const payload = { email: targetEmail, password: 'guess' };

    // Requests 1, 2, 3 through Gateway A
    for (let i = 1; i <= 3; i++) {
      const res = await sendPost(PORT_A, '/api/v1/auth/passwordLogin', payload);
      console.log(`   [Req ${i}] Replica A (Port ${PORT_A}) -> Status: ${res.statusCode}`);
      assert.strictEqual(
        res.statusCode,
        401,
        'Expected 401 unauthenticated from downstream Auth service'
      );
    }

    // Requests 4, 5 through Gateway B
    for (let i = 4; i <= 5; i++) {
      const res = await sendPost(PORT_B, '/api/v1/auth/passwordLogin', payload);
      console.log(`   [Req ${i}] Replica B (Port ${PORT_B}) -> Status: ${res.statusCode}`);
      assert.strictEqual(
        res.statusCode,
        401,
        'Expected 401 unauthenticated from downstream Auth service'
      );
    }

    // Request 6 through Gateway B -> MUST BE BLOCKED by shared Redis account limit (5 limit)
    console.log('5. Sending 6th request to Gateway B to verify shared account exhaustion...');
    const blockedRes = await sendPost(PORT_B, '/api/v1/auth/passwordLogin', payload);
    console.log(`   [Req 6] Replica B (Port ${PORT_B}) -> Status: ${blockedRes.statusCode}`);
    assert.strictEqual(blockedRes.statusCode, 429, 'Expected HTTP 429 ERR_QUOTA_EXCEEDED');
    assert.strictEqual(
      blockedRes.headers['retry-after'] !== undefined,
      true,
      'Expected Retry-After header'
    );

    console.log(
      '6. Sending 7th request to Gateway A to verify Replica A also enforces exhaustion...'
    );
    const blockedResA = await sendPost(PORT_A, '/api/v1/auth/passwordLogin', payload);
    console.log(`   [Req 7] Replica A (Port ${PORT_A}) -> Status: ${blockedResA.statusCode}`);
    assert.strictEqual(
      blockedResA.statusCode,
      429,
      'Expected HTTP 429 ERR_QUOTA_EXCEEDED on Replica A'
    );

    console.log('=== MULTI-GATEWAY RUNTIME VERIFICATION COMPLETED SUCCESSFULLY ===');
  } finally {
    console.log('7. Tearing down spawned test processes and local mock...');
    if (processA) {
      await terminateChildProcess(processA, 'Replica A');
      console.log(`   Killed Replica A (PID ${processA.pid})`);
    }
    if (processB) {
      await terminateChildProcess(processB, 'Replica B');
      console.log(`   Killed Replica B (PID ${processB.pid})`);
    }
    if (mockAuth) {
      try {
        await mockAuth.close();
        console.log('   Downstream Auth Mock server stopped.');
      } catch (err) {
        console.warn(`   Failed to close Auth Mock: ${err.message}`);
      }
    }

    // SEC-TEST-01: Strictly scoped Redis key cleanup (never touches rl:auth:* or FLUSHDB)
    console.log(`8. Cleaning up isolated test keys under '${testKeyPrefix}:*'...`);
    let redisClient = null;
    try {
      assert(
        typeof testKeyPrefix === 'string' &&
          testKeyPrefix.startsWith('rl:auth:test:mgw:') &&
          testKeyPrefix.length > 20,
        'CRITICAL: Refusing to clean up with unverified or broad prefix'
      );

      const req = createRequire(new URL('../packages/cache/package.json', import.meta.url));
      const Redis = req('ioredis');
      redisClient = new Redis(REDIS_URL, {
        maxRetriesPerRequest: 1,
        connectTimeout: 2000,
        lazyConnect: true,
        enableOfflineQueue: false,
      });

      await redisClient.connect();
      const keys = await redisClient.keys(`${testKeyPrefix}:*`);
      if (keys.length > 0) {
        console.log(
          `   Found ${keys.length} test keys to remove in namespace '${testKeyPrefix}:*'`
        );
        await redisClient.del(...keys);
        console.log(`   Successfully deleted ${keys.length} test keys.`);
      } else {
        console.log(`   No leftover keys found under namespace '${testKeyPrefix}:*'`);
      }
    } catch (cleanupErr) {
      console.warn(`   Redis cleanup note (harmless if Redis not running): ${cleanupErr.message}`);
    } finally {
      if (redisClient) {
        try {
          await redisClient.quit();
        } catch {}
      }
    }
  }
}

// If executed directly, run harness
if (isMainModule(import.meta.url, process.argv[1])) {
  run().catch((err) => {
    console.error('Multi-Gateway verification failed:', err);
    process.exit(1);
  });
}
