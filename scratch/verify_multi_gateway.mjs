/**
 * Phase 5.2.3.17 — Multi-Gateway Process Verification Harness (Gate 4C / Gate 6A)
 * 
 * Verifies distributed rate-limiting synchronization across two independent OS processes:
 *   - Gateway Replica A (PID A, Port 18080)
 *   - Gateway Replica B (PID B, Port 18081)
 *   - Shared Redis: redis://127.0.0.1:16379
 *   - Shared HMAC Secret: verify-shared-secret-min-32-chars-long-here!
 *   - SEC-TEST-01: Isolated unique run-specific Redis key prefix (rl:auth:test:mgw:<run-id>)
 */

import { spawn } from 'node:child_process';
import http from 'node:http';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const REDIS_URL = process.env.TEST_REDIS_URL || 'redis://127.0.0.1:16379';
const SHARED_HMAC_SECRET = process.env.RATE_LIMIT_HMAC_SECRET || 'verify-shared-secret-min-32-chars-long-here!';
const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-that-is-at-least-32-characters-long!';

const PORT_A = 18080;
const PORT_B = 18081;

// SEC-TEST-01: Generate a unique run-specific test namespace
const runId = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
const TEST_KEY_PREFIX = `rl:auth:test:mgw:${runId}`;

console.log('=== MULTI-GATEWAY PROCESS RUNTIME VERIFICATION HARNESS ===');
console.log(`[SEC-TEST-01] Assigned Isolated Namespace Prefix: ${TEST_KEY_PREFIX}`);

function validateSafetyGuards() {
  const parsed = new URL(REDIS_URL);
  assert.strictEqual(parsed.protocol, 'redis:', `Safety Guard: Protocol must be redis: (got ${parsed.protocol})`);
  assert(
    parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost',
    `Safety Guard: Host must be loopback (127.0.0.1 or localhost), got: ${parsed.hostname}`
  );
  assert.strictEqual(
    parsed.port || '6379',
    '16379',
    `Safety Guard: Port must be dedicated test port 16379 (got ${parsed.port})`
  );
  assert(
    typeof TEST_KEY_PREFIX === 'string' &&
      TEST_KEY_PREFIX.startsWith('rl:auth:test:mgw:') &&
      TEST_KEY_PREFIX.length > 20,
    `Safety Guard: TEST_KEY_PREFIX must be an isolated test namespace starting with 'rl:auth:test:mgw:'`
  );
}

function sendPost(port, path, body) {
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

function waitForHealth(port, timeoutMs = 10000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const interval = setInterval(() => {
      const req = http.get(`http://127.0.0.1:${port}/health`, (res) => {
        if (res.statusCode === 200) {
          clearInterval(interval);
          resolve();
        }
      });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) {
          clearInterval(interval);
          reject(new Error(`Timeout waiting for Gateway on port ${port}`));
        }
      });
    }, 200);
  });
}

async function run() {
  validateSafetyGuards();

  let processA = null;
  let processB = null;

  try {
    console.log(`1. Spawning Gateway Replica A on port ${PORT_A}...`);
    processA = spawn('node', ['services/gateway/dist/index.js'], {
      env: {
        ...process.env,
        PORT: String(PORT_A),
        REDIS_URL,
        RATE_LIMIT_HMAC_SECRET: SHARED_HMAC_SECRET,
        RATE_LIMIT_KEY_PREFIX: TEST_KEY_PREFIX, // SEC-TEST-01: Injected into Gateway A
        JWT_SECRET,
        NODE_ENV: 'test',
        TRUSTED_PROXIES: '127.0.0.1,::1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    console.log(`   Replica A spawned with PID: ${processA.pid}`);

    console.log(`2. Spawning Gateway Replica B on port ${PORT_B}...`);
    processB = spawn('node', ['services/gateway/dist/index.js'], {
      env: {
        ...process.env,
        PORT: String(PORT_B),
        REDIS_URL,
        RATE_LIMIT_HMAC_SECRET: SHARED_HMAC_SECRET,
        RATE_LIMIT_KEY_PREFIX: TEST_KEY_PREFIX, // SEC-TEST-01: Injected into Gateway B
        JWT_SECRET,
        NODE_ENV: 'test',
        TRUSTED_PROXIES: '127.0.0.1,::1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    console.log(`   Replica B spawned with PID: ${processB.pid}`);
    assert.notStrictEqual(processA.pid, processB.pid, 'Processes must have distinct PIDs');

    console.log('3. Waiting for both Gateway processes to become healthy...');
    await Promise.all([waitForHealth(PORT_A), waitForHealth(PORT_B)]);
    console.log('   Both Gateway processes are alive and listening.');

    console.log('4. Executing distributed account rate-limit tests across replicas...');
    const targetEmail = 'distributed-victim@company.com';
    const payload = { email: targetEmail, password: 'guess' };

    // Requests 1, 2, 3 through Gateway A
    for (let i = 1; i <= 3; i++) {
      const res = await sendPost(PORT_A, '/api/v1/auth/passwordLogin', payload);
      console.log(`   [Req ${i}] Replica A (Port ${PORT_A}) -> Status: ${res.statusCode}`);
      assert.strictEqual(res.statusCode, 401, 'Expected 401 unauthenticated from downstream Auth service');
    }

    // Requests 4, 5 through Gateway B
    for (let i = 4; i <= 5; i++) {
      const res = await sendPost(PORT_B, '/api/v1/auth/passwordLogin', payload);
      console.log(`   [Req ${i}] Replica B (Port ${PORT_B}) -> Status: ${res.statusCode}`);
      assert.strictEqual(res.statusCode, 401, 'Expected 401 unauthenticated from downstream Auth service');
    }

    // Request 6 through Gateway B -> MUST BE BLOCKED by shared Redis account limit (5 limit)
    console.log('5. Sending 6th request to Gateway B to verify shared account exhaustion...');
    const blockedRes = await sendPost(PORT_B, '/api/v1/auth/passwordLogin', payload);
    console.log(`   [Req 6] Replica B (Port ${PORT_B}) -> Status: ${blockedRes.statusCode}`);
    assert.strictEqual(blockedRes.statusCode, 429, 'Expected HTTP 429 ERR_QUOTA_EXCEEDED');
    assert.strictEqual(blockedRes.headers['retry-after'] !== undefined, true, 'Expected Retry-After header');

    console.log('6. Sending 7th request to Gateway A to verify Replica A also enforces exhaustion...');
    const blockedResA = await sendPost(PORT_A, '/api/v1/auth/passwordLogin', payload);
    console.log(`   [Req 7] Replica A (Port ${PORT_A}) -> Status: ${blockedResA.statusCode}`);
    assert.strictEqual(blockedResA.statusCode, 429, 'Expected HTTP 429 ERR_QUOTA_EXCEEDED on Replica A');

    console.log('=== MULTI-GATEWAY RUNTIME VERIFICATION COMPLETED SUCCESSFULLY ===');
  } finally {
    console.log('7. Tearing down spawned test processes...');
    if (processA) {
      try {
        processA.kill();
        console.log(`   Killed Replica A (PID ${processA.pid})`);
      } catch (err) {
        console.warn(`   Failed to kill Replica A: ${err.message}`);
      }
    }
    if (processB) {
      try {
        processB.kill();
        console.log(`   Killed Replica B (PID ${processB.pid})`);
      } catch (err) {
        console.warn(`   Failed to kill Replica B: ${err.message}`);
      }
    }

    // SEC-TEST-01: Strictly scoped Redis key cleanup (never touches rl:auth:* or FLUSHDB)
    console.log(`8. Cleaning up isolated test keys under '${TEST_KEY_PREFIX}:*'...`);
    let redisClient = null;
    try {
      assert(
        typeof TEST_KEY_PREFIX === 'string' &&
          TEST_KEY_PREFIX.startsWith('rl:auth:test:mgw:') &&
          TEST_KEY_PREFIX.length > 20,
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
      const keys = await redisClient.keys(`${TEST_KEY_PREFIX}:*`);
      if (keys.length > 0) {
        console.log(`   Found ${keys.length} test keys to remove in namespace '${TEST_KEY_PREFIX}:*'`);
        await redisClient.del(...keys);
        console.log(`   Successfully deleted ${keys.length} test keys.`);
      } else {
        console.log(`   No leftover keys found under namespace '${TEST_KEY_PREFIX}:*'`);
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
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
  run().catch((err) => {
    console.error('Multi-Gateway verification failed:', err);
    process.exit(1);
  });
}
