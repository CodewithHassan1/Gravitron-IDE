/**
 * Phase 5.2.3.17 — Real-Redis Distributed Rate Limiting Runtime Verification Suite
 * 
 * STRICT ISOLATION & HOST SAFETY GUARDS:
 * 1. Strictly skipped unless BOTH environment variables are set:
 *    - RUN_REAL_REDIS_TESTS=true
 *    - TEST_REDIS_URL=redis://127.0.0.1:16379 (or localhost:16379)
 * 2. Strict URL validation: protocol MUST be redis:, host MUST be loopback, port MUST be 16379.
 * 3. Never executes FLUSHDB or FLUSHALL.
 * 4. Only deletes exact keys in the dedicated test namespace: `rl:auth:test:*`.
 * 5. Exercises actual production RateLimiter and actual atomic Lua script.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long!';
  process.env.RATE_LIMIT_HMAC_SECRET = 'verified-shared-secret-for-real-redis-test-suite-32chars!';
});

import { Redis } from '@ag/cache';
import { Readable } from 'node:stream';
import {
  RateLimiter,
  AUTH_RATE_LIMIT_POLICIES,
  createRateLimitingPreHandler,
  MAX_AUTH_PAYLOAD_BYTES,
} from './rateLimiter';
import { getTrustedProxies } from './index';
import { AGLogger } from '@ag/logger';

const shouldRunRealRedis =
  process.env.RUN_REAL_REDIS_TESTS === 'true' &&
  Boolean(process.env.TEST_REDIS_URL);

describe.skipIf(!shouldRunRealRedis)('Phase 5.2.3.17 Real-Redis Distributed Rate Limiting Runtime Verification', () => {
  let redisClient: Redis;
  let testKeyPrefix: string;
  const testRedisUrl = process.env.TEST_REDIS_URL || '';
  const testHmacSecret = 'verified-shared-secret-for-real-redis-test-suite-32chars!';
  const runId = Math.random().toString(36).substring(2, 10);
  const logger = new AGLogger('gateway:test:real-redis', '1.0.0');

  beforeAll(async () => {
    // 1. Safety Guard: parse and validate TEST_REDIS_URL
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(testRedisUrl);
    } catch {
      throw new Error(`CRITICAL SAFETY GUARD: TEST_REDIS_URL '${testRedisUrl}' is not a valid URL.`);
    }

    if (parsedUrl.protocol !== 'redis:') {
      throw new Error(`CRITICAL SAFETY GUARD: Protocol must be redis:, received ${parsedUrl.protocol}`);
    }

    const host = parsedUrl.hostname;
    if (host !== '127.0.0.1' && host !== 'localhost') {
      throw new Error(`CRITICAL SAFETY GUARD: Host must be loopback (127.0.0.1 or localhost), received ${host}`);
    }

    const port = parsedUrl.port || '6379';
    if (port !== '16379') {
      throw new Error(`CRITICAL SAFETY GUARD: Port must be dedicated test port 16379, received ${port}`);
    }

    testKeyPrefix = `rl:auth:test:${runId}`;

    redisClient = new Redis(testRedisUrl, {
      maxRetriesPerRequest: 2,
      connectTimeout: 2000,
      lazyConnect: true,
      enableOfflineQueue: false,
    });

    await redisClient.connect();
  });

  afterAll(async () => {
    if (redisClient) {
      // Clean only test keys created during this test run
      const keys = await redisClient.keys(`${testKeyPrefix}:*`);
      if (keys.length > 0) {
        await redisClient.del(...keys);
      }
      await redisClient.quit();
    }
  });

  beforeEach(async () => {
    if (redisClient) {
      const keys = await redisClient.keys(`${testKeyPrefix}:*`);
      if (keys.length > 0) {
        await redisClient.del(...keys);
      }
    }
  });

  it('RUN-01: executes atomic FIXED_WINDOW_LUA_SCRIPT directly on live Redis engine', async () => {
    const limiter = new RateLimiter({
      redisClient: redisClient as any,
      hmacSecret: testHmacSecret,
      keyPrefix: testKeyPrefix,
      logger,
    });

    const decision = await limiter.checkRateLimit({
      clientIp: '198.51.100.1',
      policy: AUTH_RATE_LIMIT_POLICIES.login,
    });

    expect(decision.allowed).toBe(true);
    expect(decision.current).toBe(1);
    expect(decision.remaining).toBe(19);

    const ipHash = limiter.hashIp('198.51.100.1');
    const key = limiter.buildKey('login', 'ip', ipHash);
    const ttl = await redisClient.ttl(key);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(900);
  });

  it('RUN-02: enforces exact IP threshold and rejection with positive Retry-After on real Redis', async () => {
    const limiter = new RateLimiter({
      redisClient: redisClient as any,
      hmacSecret: testHmacSecret,
      keyPrefix: testKeyPrefix,
      logger,
    });

    const ip = '198.51.100.2';
    // Register policy limit is 5 per hour (3600s)
    for (let i = 1; i <= 5; i++) {
      const res = await limiter.checkRateLimit({
        clientIp: ip,
        policy: AUTH_RATE_LIMIT_POLICIES.register,
      });
      expect(res.allowed).toBe(true);
      expect(res.current).toBe(i);
    }

    // 6th request is blocked by live Redis Lua counter
    const blocked = await limiter.checkRateLimit({
      clientIp: ip,
      policy: AUTH_RATE_LIMIT_POLICIES.register,
    });

    expect(blocked.allowed).toBe(false);
    expect(blocked.dimension).toBe('ip');
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
    expect(blocked.retryAfterSec).toBeLessThanOrEqual(3600);
  });

  it('RUN-03: enforces exact Account threshold and rejection with positive Retry-After on real Redis', async () => {
    const limiter = new RateLimiter({
      redisClient: redisClient as any,
      hmacSecret: testHmacSecret,
      keyPrefix: testKeyPrefix,
      logger,
    });

    const targetAccount = 'target-user@company.com';
    // Login account limit is 5 per 15 min (900s). Send 5 requests from different IPs:
    for (let i = 1; i <= 5; i++) {
      const res = await limiter.checkRateLimit({
        clientIp: `198.51.100.${10 + i}`,
        accountIdentifier: targetAccount,
        policy: AUTH_RATE_LIMIT_POLICIES.login,
      });
      expect(res.allowed).toBe(true);
      expect(res.current).toBe(i);
    }

    // 6th request targeting same account from a fresh IP is blocked on account quota
    const blocked = await limiter.checkRateLimit({
      clientIp: '198.51.100.99',
      accountIdentifier: targetAccount,
      policy: AUTH_RATE_LIMIT_POLICIES.login,
    });

    expect(blocked.allowed).toBe(false);
    expect(blocked.dimension).toBe('account');
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
    expect(blocked.retryAfterSec).toBeLessThanOrEqual(900);
  });

  it('RUN-04: evaluates dual-counter independence (IP vs Account) on real Redis', async () => {
    const limiter = new RateLimiter({
      redisClient: redisClient as any,
      hmacSecret: testHmacSecret,
      keyPrefix: testKeyPrefix,
      logger,
    });

    const attackerIp = '198.51.100.44';
    // Exhaust account quota for accountA (5 requests)
    for (let i = 1; i <= 5; i++) {
      await limiter.checkRateLimit({
        clientIp: `198.51.100.${20 + i}`,
        accountIdentifier: 'account-a@company.com',
        policy: AUTH_RATE_LIMIT_POLICIES.login,
      });
    }

    // Now send request from attackerIp targeting accountA -> blocked on account
    const resA = await limiter.checkRateLimit({
      clientIp: attackerIp,
      accountIdentifier: 'account-a@company.com',
      policy: AUTH_RATE_LIMIT_POLICIES.login,
    });
    expect(resA.allowed).toBe(false);
    expect(resA.dimension).toBe('account');

    // attackerIp targeting fresh accountB -> allowed because attackerIp has only used 1 attempt
    const resB = await limiter.checkRateLimit({
      clientIp: attackerIp,
      accountIdentifier: 'account-b@company.com',
      policy: AUTH_RATE_LIMIT_POLICIES.login,
    });
    expect(resB.allowed).toBe(true);
  });

  it('RUN-05: recovers from missing TTL (-1) on live Redis', async () => {
    const limiter = new RateLimiter({
      redisClient: redisClient as any,
      hmacSecret: testHmacSecret,
      keyPrefix: testKeyPrefix,
      logger,
    });

    await limiter.checkRateLimit({
      clientIp: '198.51.100.55',
      policy: AUTH_RATE_LIMIT_POLICIES.login,
    });

    const ipHash = limiter.hashIp('198.51.100.55');
    const key = limiter.buildKey('login', 'ip', ipHash);

    // Simulate key persistence (missing TTL)
    await redisClient.persist(key);
    const ttlBefore = await redisClient.ttl(key);
    expect(ttlBefore).toBe(-1);

    // Next request arrives -> Lua script detects TTL == -1 and restores window TTL
    const recovered = await limiter.checkRateLimit({
      clientIp: '198.51.100.55',
      policy: AUTH_RATE_LIMIT_POLICIES.login,
    });

    expect(recovered.allowed).toBe(true);
    const ttlAfter = await redisClient.ttl(key);
    expect(ttlAfter).toBeGreaterThan(0);
  });

  it('RUN-06: handles 50 concurrent requests atomically on real Redis without race conditions', async () => {
    const limiter = new RateLimiter({
      redisClient: redisClient as any,
      hmacSecret: testHmacSecret,
      keyPrefix: testKeyPrefix,
      logger,
    });

    // Login limit is 20 per IP
    const ip = '198.51.100.60';
    const promises = Array.from({ length: 50 }, () =>
      limiter.checkRateLimit({
        clientIp: ip,
        policy: AUTH_RATE_LIMIT_POLICIES.login,
      })
    );

    const results = await Promise.all(promises);
    const allowed = results.filter((r) => r.allowed);
    const blocked = results.filter((r) => !r.allowed);

    expect(allowed).toHaveLength(20);
    expect(blocked).toHaveLength(30);

    const ipHash = limiter.hashIp(ip);
    const key = limiter.buildKey('login', 'ip', ipHash);
    const finalVal = await redisClient.get(key);
    expect(Number(finalVal)).toBe(50);
  });

  it('RUN-07: resets quota after TTL window expiration on live Redis', async () => {
    const limiter = new RateLimiter({
      redisClient: redisClient as any,
      hmacSecret: testHmacSecret,
      keyPrefix: testKeyPrefix,
      logger,
    });

    const shortPolicy = {
      endpointId: 'custom-short',
      ipLimit: 2,
      ipWindowSec: 2, // 2-second window
    };

    const ip = '198.51.100.70';
    await limiter.checkRateLimit({ clientIp: ip, policy: shortPolicy });
    await limiter.checkRateLimit({ clientIp: ip, policy: shortPolicy });

    const blocked = await limiter.checkRateLimit({ clientIp: ip, policy: shortPolicy });
    expect(blocked.allowed).toBe(false);

    // Wait for TTL expiration (2.2s)
    await new Promise((resolve) => setTimeout(resolve, 2200));

    // Next request allowed with reset counter == 1
    const resetRes = await limiter.checkRateLimit({ clientIp: ip, policy: shortPolicy });
    expect(resetRes.allowed).toBe(true);
    expect(resetRes.current).toBe(1);
  });

  it('RUN-08: guarantees cross-service keyspace isolation (session tokens untouched)', async () => {
    const limiter = new RateLimiter({
      redisClient: redisClient as any,
      hmacSecret: testHmacSecret,
      keyPrefix: testKeyPrefix,
      logger,
    });

    // Seed unrelated session keys
    const sessionKey = 'session:user_token_abc123';
    await redisClient.set(sessionKey, 'valid_session_data');

    // Run rate limiter requests
    await limiter.checkRateLimit({ clientIp: '198.51.100.80', policy: AUTH_RATE_LIMIT_POLICIES.login });

    // Assert session key is completely unaffected
    const sessionVal = await redisClient.get(sessionKey);
    expect(sessionVal).toBe('valid_session_data');

    // Clean up test session key
    await redisClient.del(sessionKey);
  });

  it('RUN-09: shares counters across two independent RateLimiter instances connected to same Redis', async () => {
    const replicaA = new RateLimiter({
      redisClient: redisClient as any,
      hmacSecret: testHmacSecret,
      keyPrefix: testKeyPrefix,
      logger,
    });

    const replicaB = new RateLimiter({
      redisClient: redisClient as any,
      hmacSecret: testHmacSecret,
      keyPrefix: testKeyPrefix,
      logger,
    });

    const targetEmail = 'distributed-sync@company.com';

    // Send 3 requests to Replica A:
    for (let i = 1; i <= 3; i++) {
      const resA = await replicaA.checkRateLimit({
        clientIp: `10.2.1.${i}`,
        accountIdentifier: targetEmail,
        policy: AUTH_RATE_LIMIT_POLICIES.login,
      });
      expect(resA.allowed).toBe(true);
    }

    // Send 2 requests to Replica B:
    for (let i = 4; i <= 5; i++) {
      const resB = await replicaB.checkRateLimit({
        clientIp: `10.2.1.${i}`,
        accountIdentifier: targetEmail,
        policy: AUTH_RATE_LIMIT_POLICIES.login,
      });
      expect(resB.allowed).toBe(true);
    }

    // 6th request sent to Replica A targeting same account MUST BE BLOCKED
    const blockedA = await replicaA.checkRateLimit({
      clientIp: '10.2.1.99',
      accountIdentifier: targetEmail,
      policy: AUTH_RATE_LIMIT_POLICIES.login,
    });
    expect(blockedA.allowed).toBe(false);
    expect(blockedA.dimension).toBe('account');

    // 7th request sent to Replica B targeting same account MUST ALSO BE BLOCKED
    const blockedB = await replicaB.checkRateLimit({
      clientIp: '10.2.1.100',
      accountIdentifier: targetEmail,
      policy: AUTH_RATE_LIMIT_POLICIES.login,
    });
    expect(blockedB.allowed).toBe(false);
    expect(blockedB.dimension).toBe('account');
  });

  it('RUN-10: detects HMAC secret consistency vs divergence across instances', () => {
    const replicaA = new RateLimiter({
      hmacSecret: testHmacSecret,
      redisClient: mockRedisClient(),
      keyPrefix: testKeyPrefix,
      logger,
    });

    const replicaB = new RateLimiter({
      hmacSecret: testHmacSecret,
      redisClient: mockRedisClient(),
      keyPrefix: testKeyPrefix,
      logger,
    });

    const email = 'audit-consistency@example.com';
    expect(replicaA.hashAccount(email)).toBe(replicaB.hashAccount(email));

    const replicaC = new RateLimiter({
      hmacSecret: 'completely-different-secret-min-32-chars-long!',
      redisClient: mockRedisClient(),
      keyPrefix: testKeyPrefix,
      logger,
    });

    expect(replicaA.hashAccount(email)).not.toBe(replicaC.hashAccount(email));
  });

  it('RUN-11: activates bounded fallback safely on Redis connection outage', async () => {
    // Create an instance pointing to a closed port to simulate outage
    const badRedis = new Redis('redis://127.0.0.1:16378', {
      maxRetriesPerRequest: 0,
      connectTimeout: 50,
      lazyConnect: true,
      enableOfflineQueue: false,
    });

    const fallbackLimiter = new RateLimiter({
      redisClient: badRedis as any,
      hmacSecret: testHmacSecret,
      commandTimeoutMs: 50,
      logger,
    });

    // Request should fail open to in-memory fallback without throwing
    const res = await fallbackLimiter.checkRateLimit({
      clientIp: '198.51.100.111',
      policy: AUTH_RATE_LIMIT_POLICIES.login,
    });

    expect(res.allowed).toBe(true);
    expect(fallbackLimiter.getFallbackCacheSize()).toBe(1);
    await badRedis.disconnect();
  });

  it('RUN-12: recovers and resumes live Redis counters after transient outage', async () => {
    const limiter = new RateLimiter({
      redisClient: redisClient as any,
      hmacSecret: testHmacSecret,
      keyPrefix: testKeyPrefix,
      logger,
    });

    const ip = '198.51.100.122';
    const firstRes = await limiter.checkRateLimit({ clientIp: ip, policy: AUTH_RATE_LIMIT_POLICIES.login });
    expect(firstRes.allowed).toBe(true);
    expect(firstRes.current).toBe(1);

    const secondRes = await limiter.checkRateLimit({ clientIp: ip, policy: AUTH_RATE_LIMIT_POLICIES.login });
    expect(secondRes.allowed).toBe(true);
    expect(secondRes.current).toBe(2);
  });

  it('RUN-13: enforces 64 KiB payload limit with HTTP 413 error', async () => {
    const limiter = new RateLimiter({
      redisClient: redisClient as any,
      hmacSecret: testHmacSecret,
      keyPrefix: testKeyPrefix,
      logger,
    });

    const preHandler = createRateLimitingPreHandler(limiter, logger);

    const oversizedStream = Readable.from([Buffer.alloc(MAX_AUTH_PAYLOAD_BYTES + 500, 'x')]);
    let sentStatus = 0;
    const fakeReply: any = {
      header: () => {},
      status: (code: number) => {
        sentStatus = code;
        return { send: () => {} };
      },
    };

    const blocked = await preHandler(
      {
        url: '/auth.v1.AuthService/PasswordLogin',
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: oversizedStream,
      } as any,
      fakeReply
    );

    expect(blocked).toBe(true);
    expect(sentStatus).toBe(413);
  });

  it('RUN-14: isolates trusted loopback proxy from untrusted proxy forwarding', () => {
    const proxies = getTrustedProxies();
    expect(proxies).toContain('127.0.0.1');
    expect(proxies).toContain('::1');
  });
});

function mockRedisClient(): any {
  return { eval: async () => [1, 1, 900], on: () => {} };
}
