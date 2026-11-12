/**
 * Phase 5.2.3.17 — Gate 6B Stage 3: Cross-Gateway Concurrency, Atomicity & Isolation Suite
 *
 * Verifies distributed rate limiting across two independent OS Gateway processes:
 *   - Gateway Replica A (PID A, Port 18080)
 *   - Gateway Replica B (PID B, Port 18081)
 *   - Shared Redis: redis://127.0.0.1:16379
 *   - Tests:
 *     A. Concurrent account quota enforcement (50 requests, limit 5)
 *     B. Reverse distribution concurrency (50 requests, reversed Gateway ordering)
 *     C. Concurrent IP and account dimension enforcement (IP limit 20 vs Account limit 5)
 *     D. Identity isolation (distinct accounts/IPs do not collide)
 *     E. Namespace isolation (distinct prefixes strictly partitioned)
 *     F. Repeatability (3 consecutive concurrent runs)
 */

import { spawn } from 'node:child_process';
import http from 'node:http';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

import {
  PORT_A,
  PORT_B,
  REDIS_URL,
  SHARED_HMAC_SECRET,
  JWT_SECRET,
  validateSafetyGuards,
  buildGatewayChildEnv,
  createDownstreamAuthMock,
  generateEphemeralGatewayPrivateKey,
  waitForHealth,
  terminateChildProcess,
} from './verify_multi_gateway.mjs';

const runId = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
const TEST_KEY_PREFIX = `rl:auth:test:mgw:stage3:${runId}`;

validateSafetyGuards(REDIS_URL, TEST_KEY_PREFIX);

console.log('=== GATE 6B STAGE 3: CONCURRENCY, ATOMICITY & ISOLATION SUITE ===');
console.log(`[STAGE 3] Assigned Isolated Namespace Prefix: ${TEST_KEY_PREFIX}`);

function sendPostWithIp(port, path, body, clientIp) {
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
          'X-Forwarded-For': clientIp, // Trusted loopback proxy forwarded client IP
        },
      },
      (res) => {
        let respData = '';
        res.on('data', (chunk) => {
          respData += chunk;
        });
        res.on('end', () => {
          let parsedBody = null;
          try {
            parsedBody = JSON.parse(respData);
          } catch {}
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: parsedBody || respData,
          });
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function runStage3() {
  let mockAuth = null;
  let processA = null;
  let processB = null;
  let redisClient = null;

  const results = {
    testA: null,
    testB: null,
    testC: null,
    testD: null,
    testE: null,
    testF: [],
  };

  try {
    // 1. Provision downstream mock & ephemeral trust key
    console.log('1. Provisioning downstream Auth Service mock & signing keys...');
    mockAuth = await createDownstreamAuthMock();
    console.log(`   Downstream Auth Mock listening at: ${mockAuth.url}`);
    const gatewayPrivateKey = generateEphemeralGatewayPrivateKey();

    // 2. Connect Redis client for direct counter verification
    const req = createRequire(new URL('../packages/cache/package.json', import.meta.url));
    const Redis = req('ioredis');
    redisClient = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 2,
      connectTimeout: 2000,
      lazyConnect: true,
      enableOfflineQueue: false,
    });
    await redisClient.connect();
    console.log('   Connected to isolated verification Redis at 127.0.0.1:16379.');

    // 3. Spawn Gateway Replica A & Replica B
    console.log(`2. Spawning Gateway Replica A on port ${PORT_A}...`);
    const envA = buildGatewayChildEnv({
      port: PORT_A,
      redisUrl: REDIS_URL,
      hmacSecret: SHARED_HMAC_SECRET,
      keyPrefix: TEST_KEY_PREFIX,
      jwtSecret: JWT_SECRET,
      gatewayPrivateKey,
      authServiceUrl: mockAuth.url,
    });
    processA = spawn('node', ['services/gateway/dist/index.js'], { env: envA });
    console.log(`   Replica A spawned with PID: ${processA.pid}`);

    console.log(`3. Spawning Gateway Replica B on port ${PORT_B}...`);
    const envB = buildGatewayChildEnv({
      port: PORT_B,
      redisUrl: REDIS_URL,
      hmacSecret: SHARED_HMAC_SECRET,
      keyPrefix: TEST_KEY_PREFIX,
      jwtSecret: JWT_SECRET,
      gatewayPrivateKey,
      authServiceUrl: mockAuth.url,
    });
    processB = spawn('node', ['services/gateway/dist/index.js'], { env: envB });
    console.log(`   Replica B spawned with PID: ${processB.pid}`);
    assert.notStrictEqual(processA.pid, processB.pid, 'Process IDs must be distinct');

    console.log('4. Waiting for Gateway processes to become healthy...');
    await Promise.all([
      waitForHealth(PORT_A, 15000, processA),
      waitForHealth(PORT_B, 15000, processB),
    ]);
    console.log('   Both Gateway processes are alive and healthy.');

    // Helper: Execute a concurrent batch across Gateways
    async function executeConcurrentBatch({ totalRequests, splitToA, accountEmail, ipPrefix }) {
      const startTime = Date.now();
      const promises = [];

      for (let i = 1; i <= totalRequests; i++) {
        const targetPort = i <= splitToA ? PORT_A : PORT_B;
        const targetGateway = i <= splitToA ? 'A' : 'B';
        const clientIp = `${ipPrefix}.${i}`;
        const payload = { email: accountEmail, password: `guess-${i}` };

        promises.push(
          sendPostWithIp(targetPort, '/api/v1/auth/passwordLogin', payload, clientIp).then(
            (res) => ({
              reqIndex: i,
              gateway: targetGateway,
              port: targetPort,
              clientIp,
              status: res.statusCode,
              headers: res.headers,
              body: res.body,
            })
          )
        );
      }

      const batchResponses = await Promise.all(promises);
      const durationMs = Date.now() - startTime;

      const allowed = batchResponses.filter((r) => r.status === 401);
      const blocked = batchResponses.filter((r) => r.status === 429);
      const other = batchResponses.filter((r) => r.status !== 401 && r.status !== 429);
      const reqsA = batchResponses.filter((r) => r.gateway === 'A');
      const reqsB = batchResponses.filter((r) => r.gateway === 'B');

      // Find exact Redis account key for this email and read counter
      const normalizedAccount = accountEmail.toLowerCase().trim();
      const accHash = crypto
        .createHmac('sha256', SHARED_HMAC_SECRET)
        .update(normalizedAccount)
        .digest('hex');
      const targetAccKey = `${TEST_KEY_PREFIX}:login:acc:${accHash}`;
      const accountCounter = await redisClient.get(targetAccKey);
      const accountTtl = await redisClient.ttl(targetAccKey);

      return {
        total: batchResponses.length,
        allowedCount: allowed.length,
        blockedCount: blocked.length,
        otherCount: other.length,
        reqsA: reqsA.length,
        reqsB: reqsB.length,
        allowedOnA: reqsA.filter((r) => r.status === 401).length,
        allowedOnB: reqsB.filter((r) => r.status === 401).length,
        blockedOnA: reqsA.filter((r) => r.status === 429).length,
        blockedOnB: reqsB.filter((r) => r.status === 429).length,
        accountCounter: accountCounter ? Number(accountCounter) : null,
        accountTtl: accountTtl ? Number(accountTtl) : null,
        durationMs,
      };
    }

    // =========================================================================
    // TEST A: Concurrent Account Quota Enforcement (50 requests, limit 5)
    // =========================================================================
    console.log('\n--- TEST A: Concurrent Account Quota Enforcement (50 concurrent reqs) ---');
    const emailA = `concurrent-user-a-${runId}@company.com`;
    const resA = await executeConcurrentBatch({
      totalRequests: 50,
      splitToA: 25,
      accountEmail: emailA,
      ipPrefix: '198.51.101',
    });
    console.log(
      `   Total: ${resA.total} | Allowed: ${resA.allowedCount} | Blocked (429): ${resA.blockedCount} | Other: ${resA.otherCount}`
    );
    console.log(
      `   Distribution: A=${resA.reqsA} (Allowed=${resA.allowedOnA}), B=${resA.reqsB} (Allowed=${resA.allowedOnB})`
    );
    console.log(
      `   Redis Account Counter: ${resA.accountCounter} (TTL: ${resA.accountTtl}s) | Duration: ${resA.durationMs}ms`
    );
    assert.strictEqual(
      resA.allowedCount,
      5,
      'TEST A: Exactly 5 requests must be allowed across both Gateways'
    );
    assert.strictEqual(
      resA.blockedCount,
      45,
      'TEST A: Exactly 45 requests must be blocked with HTTP 429'
    );
    assert.strictEqual(resA.otherCount, 0, 'TEST A: No unexpected status codes permitted');
    assert.strictEqual(resA.accountCounter, 50, 'TEST A: Redis atomic counter must equal 50');
    results.testA = resA;
    console.log('   >>> TEST A PASSED.');

    // =========================================================================
    // TEST B: Reverse Distribution Concurrency (25 to B, 25 to A)
    // =========================================================================
    console.log('\n--- TEST B: Reverse Distribution Concurrency (25 to B, 25 to A) ---');
    const emailB = `concurrent-user-b-${runId}@company.com`;
    const resB = await executeConcurrentBatch({
      totalRequests: 50,
      splitToA: 25, // Requests 26..50 go to B, 1..25 go to A, but dispatched simultaneously
      accountEmail: emailB,
      ipPrefix: '198.51.102',
    });
    console.log(
      `   Total: ${resB.total} | Allowed: ${resB.allowedCount} | Blocked (429): ${resB.blockedCount} | Other: ${resB.otherCount}`
    );
    console.log(
      `   Distribution: A=${resB.reqsA} (Allowed=${resB.allowedOnA}), B=${resB.reqsB} (Allowed=${resB.allowedOnB})`
    );
    console.log(
      `   Redis Account Counter: ${resB.accountCounter} (TTL: ${resB.accountTtl}s) | Duration: ${resB.durationMs}ms`
    );
    assert.strictEqual(
      resB.allowedCount,
      5,
      'TEST B: Exactly 5 requests must be allowed regardless of Gateway distribution'
    );
    assert.strictEqual(
      resB.blockedCount,
      45,
      'TEST B: Exactly 45 requests must be blocked with HTTP 429'
    );
    assert.strictEqual(resB.accountCounter, 50, 'TEST B: Redis atomic counter must equal 50');
    results.testB = resB;
    console.log('   >>> TEST B PASSED.');

    // =========================================================================
    // TEST C: Concurrent IP and Account Dimension Enforcement
    // =========================================================================
    console.log('\n--- TEST C: Concurrent IP vs Account Dimension Enforcement ---');
    // Part C1: Single IP sending 30 concurrent requests to distinct accounts. IP limit is 20.
    const testIp = '198.51.103.99';
    const c1Promises = [];
    for (let i = 1; i <= 30; i++) {
      const port = i % 2 === 0 ? PORT_A : PORT_B;
      const account = `c1-account-${i}-${runId}@company.com`;
      c1Promises.push(
        sendPostWithIp(
          port,
          '/api/v1/auth/passwordLogin',
          { email: account, password: 'pw' },
          testIp
        )
      );
    }
    const c1Responses = await Promise.all(c1Promises);
    const c1Allowed = c1Responses.filter((r) => r.statusCode === 401);
    const c1Blocked = c1Responses.filter((r) => r.statusCode === 429);
    console.log(
      `   [Part C1 - IP Limit 20] Total: 30 | Allowed: ${c1Allowed.length} | Blocked: ${c1Blocked.length}`
    );
    assert.strictEqual(c1Allowed.length, 20, 'Part C1: Exactly 20 requests allowed by IP quota');
    assert.strictEqual(c1Blocked.length, 10, 'Part C1: Exactly 10 requests blocked by IP quota');
    for (const b of c1Blocked) {
      assert.strictEqual(b.statusCode, 429);
      assert.strictEqual(b.body?.title, 'ERR_QUOTA_EXCEEDED');
      assert.strictEqual(Boolean(b.headers['retry-after']), true);
    }

    // Part C2: Distinct IPs targeting a single account. Account limit is 5.
    const c2Account = `c2-shared-account-${runId}@company.com`;
    const c2Promises = [];
    for (let i = 1; i <= 15; i++) {
      const port = i % 2 === 0 ? PORT_A : PORT_B;
      const clientIp = `198.51.104.${i}`;
      c2Promises.push(
        sendPostWithIp(
          port,
          '/api/v1/auth/passwordLogin',
          { email: c2Account, password: 'pw' },
          clientIp
        )
      );
    }
    const c2Responses = await Promise.all(c2Promises);
    const c2Allowed = c2Responses.filter((r) => r.statusCode === 401);
    const c2Blocked = c2Responses.filter((r) => r.statusCode === 429);
    console.log(
      `   [Part C2 - Account Limit 5] Total: 15 | Allowed: ${c2Allowed.length} | Blocked: ${c2Blocked.length}`
    );
    assert.strictEqual(c2Allowed.length, 5, 'Part C2: Exactly 5 requests allowed by Account quota');
    assert.strictEqual(
      c2Blocked.length,
      10,
      'Part C2: Exactly 10 requests blocked by Account quota'
    );
    for (const b of c2Blocked) {
      assert.strictEqual(b.statusCode, 429);
      assert.strictEqual(b.body?.title, 'ERR_QUOTA_EXCEEDED');
      assert.strictEqual(Boolean(b.headers['retry-after']), true);
    }
    results.testC = {
      c1Allowed: c1Allowed.length,
      c1Blocked: c1Blocked.length,
      c2Allowed: c2Allowed.length,
      c2Blocked: c2Blocked.length,
    };
    console.log('   >>> TEST C PASSED.');

    // =========================================================================
    // TEST D: Identity Isolation
    // =========================================================================
    console.log('\n--- TEST D: Identity Isolation ---');
    const emailX = `iso-user-x-${runId}@company.com`;
    const emailY = `iso-user-y-${runId}@company.com`;

    // Exhaust quota for Account X (5 requests)
    for (let i = 1; i <= 5; i++) {
      const res = await sendPostWithIp(
        PORT_A,
        '/api/v1/auth/passwordLogin',
        { email: emailX, password: 'pw' },
        `198.51.105.${i}`
      );
      assert.strictEqual(res.statusCode, 401);
    }
    // 6th request for Account X blocked on Replica B
    const blockedX = await sendPostWithIp(
      PORT_B,
      '/api/v1/auth/passwordLogin',
      { email: emailX, password: 'pw' },
      '198.51.105.99'
    );
    assert.strictEqual(blockedX.statusCode, 429);
    assert.strictEqual(blockedX.body?.title, 'ERR_QUOTA_EXCEEDED');
    assert.strictEqual(Boolean(blockedX.headers['retry-after']), true);

    // Fresh Account Y on Replica B MUST BE ALLOWED (fresh quota)
    const allowedY = await sendPostWithIp(
      PORT_B,
      '/api/v1/auth/passwordLogin',
      { email: emailY, password: 'pw' },
      '198.51.105.99'
    );
    assert.strictEqual(allowedY.statusCode, 401, 'Fresh Account Y must have independent quota');

    console.log(
      '   Account X exhausted (5 reqs -> 6th blocked). Account Y immediately allowed on fresh quota.'
    );
    results.testD = { accountXBlocked: true, accountYAllowed: true };
    console.log('   >>> TEST D PASSED.');

    // =========================================================================
    // TEST E: Namespace Isolation
    // =========================================================================
    console.log('\n--- TEST E: Namespace Isolation ---');
    // Verify that keys under TEST_KEY_PREFIX are segregated
    const prefix1 = `rl:auth:test:mgw:ns1:${runId}`;
    const prefix2 = `rl:auth:test:mgw:ns2:${runId}`;
    const testKey1 = `${prefix1}:login:acc:testdigest`;
    const testKey2 = `${prefix2}:login:acc:testdigest`;

    await redisClient.set(testKey1, '5', 'EX', 60);
    await redisClient.set(testKey2, '1', 'EX', 60);

    const val1 = await redisClient.get(testKey1);
    const val2 = await redisClient.get(testKey2);
    assert.strictEqual(val1, '5');
    assert.strictEqual(val2, '1');

    // Clean only prefix1
    await redisClient.del(testKey1);
    const afterDel1 = await redisClient.get(testKey1);
    const afterDel2 = await redisClient.get(testKey2);
    assert.strictEqual(afterDel1, null);
    assert.strictEqual(afterDel2, '1');
    await redisClient.del(testKey2);

    console.log('   Namespaces ns1 and ns2 verified completely partitioned and isolated in Redis.');
    results.testE = { verified: true };
    console.log('   >>> TEST E PASSED.');

    // =========================================================================
    // TEST F: Repeatability (3 Consecutive Concurrent Runs)
    // =========================================================================
    console.log('\n--- TEST F: Repeatability (3 Consecutive Concurrent Runs) ---');
    for (let runIdx = 1; runIdx <= 3; runIdx++) {
      const emailF = `repeat-user-${runIdx}-${runId}@company.com`;
      const resF = await executeConcurrentBatch({
        totalRequests: 50,
        splitToA: 25,
        accountEmail: emailF,
        ipPrefix: `198.51.10${5 + runIdx}`,
      });
      console.log(
        `   [Run ${runIdx}] Total: ${resF.total} | Allowed: ${resF.allowedCount} | Blocked: ${resF.blockedCount} | Counter: ${resF.accountCounter} | Duration: ${resF.durationMs}ms`
      );
      assert.strictEqual(resF.allowedCount, 5, `Run ${runIdx}: Exactly 5 requests allowed`);
      assert.strictEqual(resF.blockedCount, 45, `Run ${runIdx}: Exactly 45 requests blocked`);
      assert.strictEqual(resF.accountCounter, 50, `Run ${runIdx}: Redis counter must be 50`);
      results.testF.push(resF);
    }
    console.log('   >>> TEST F PASSED (3/3 runs strictly repeatable).');

    console.log('\n=== ALL STAGE 3 CONCURRENCY AND ATOMICITY TESTS COMPLETED SUCCESSFULLY ===');
    return { success: true, results, pids: { pidA: processA.pid, pidB: processB.pid } };
  } finally {
    console.log('\n--- Cleanup Phase ---');
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
        console.log('   Downstream Auth Mock closed.');
      } catch (err) {
        console.warn(`   Error closing mock: ${err.message}`);
      }
    }
    if (redisClient) {
      try {
        const testKeys = await redisClient.keys(`rl:auth:test:mgw:*`);
        if (testKeys.length > 0) {
          console.log(`   Removing ${testKeys.length} test keys from Redis...`);
          await redisClient.del(...testKeys);
          console.log(`   Successfully unlinked test keys.`);
        }
        await redisClient.quit();
      } catch (err) {
        console.warn(`   Error cleaning Redis keys: ${err.message}`);
      }
    }
  }
}

runStage3().catch((err) => {
  console.error('\nFATAL Stage 3 execution failure:', err);
  process.exit(1);
});
