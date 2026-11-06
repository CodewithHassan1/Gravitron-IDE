import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Readable } from 'node:stream';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long!';
  process.env.RATE_LIMIT_HMAC_SECRET = 'test-shared-hmac-secret-min-32-chars-long!';
});

import {
  RateLimiter,
  RateLimiterRedisClient,
  AUTH_RATE_LIMIT_POLICIES,
  resolveEndpointPolicy,
  createRateLimitingPreHandler,
  MAX_AUTH_PAYLOAD_BYTES,
} from './rateLimiter';
import { getTrustedProxies } from './index';
import { AGLogger } from '@ag/logger';

const VALID_TEST_SECRET = 'test-shared-hmac-secret-min-32-chars-long!';

describe('RateLimiter Unit Tests', () => {
  let mockRedis: RateLimiterRedisClient;
  let mockEval: ReturnType<typeof vi.fn>;
  let mockLogger: AGLogger;
  let loggedErrors: any[];
  let loggedWarns: any[];

  beforeEach(() => {
    mockEval = vi.fn();
    mockRedis = {
      eval: mockEval,
      on: vi.fn(),
    };
    loggedErrors = [];
    loggedWarns = [];
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn((ctx, msg, extra) => loggedWarns.push({ ctx, msg, extra })),
      error: vi.fn((ctx, msg, err, extra) => loggedErrors.push({ ctx, msg, err, extra })),
      debug: vi.fn(),
    } as any;
  });

  describe('Account Normalization and Key Generation', () => {
    it('normalizes email by trimming and lowercasing', () => {
      const limiter = new RateLimiter({ hmacSecret: VALID_TEST_SECRET, redisClient: mockRedis });
      expect(limiter.normalizeAccount('  User@Example.COM  ')).toBe('user@example.com');
      expect(limiter.normalizeAccount('USER@domain.org\t')).toBe('user@domain.org');
    });

    it('generates 64-character hex HMAC-SHA-256 account digest without raw email', () => {
      const limiter = new RateLimiter({ hmacSecret: VALID_TEST_SECRET, redisClient: mockRedis });
      const hash1 = limiter.hashAccount('user@example.com');
      const hash2 = limiter.hashAccount('user@example.com');
      const hash3 = limiter.hashAccount('other@example.com');

      expect(hash1).toHaveLength(64);
      expect(hash1).toMatch(/^[0-9a-f]{64}$/);
      expect(hash1).toBe(hash2);
      expect(hash1).not.toBe(hash3);
      expect(hash1).not.toContain('user@example.com');
    });

    it('generates 64-character hex SHA-256 IP digest without raw IP', () => {
      const limiter = new RateLimiter({ hmacSecret: VALID_TEST_SECRET, redisClient: mockRedis });
      const ipHash1 = limiter.hashIp(' 192.168.1.50 ');
      const ipHash2 = limiter.hashIp('192.168.1.50');
      const ipHash3 = limiter.hashIp('2001:0db8:85a3:0000:0000:8a2e:0370:7334');

      expect(ipHash1).toHaveLength(64);
      expect(ipHash1).toMatch(/^[0-9a-f]{64}$/);
      expect(ipHash1).toBe(ipHash2);
      expect(ipHash3).toHaveLength(64);
      expect(ipHash1).not.toContain('192.168');
      expect(ipHash3).not.toContain(':');
    });

    it('constructs Redis key according to approved namespace rl:auth:<endpoint>:<dimension>:<digest>', () => {
      const limiter = new RateLimiter({ hmacSecret: VALID_TEST_SECRET, redisClient: mockRedis });
      const ipKey = limiter.buildKey('login', 'ip', 'abc123digest');
      const accKey = limiter.buildKey('login', 'acc', 'def456digest');

      expect(ipKey).toBe('rl:auth:login:ip:abc123digest');
      expect(accKey).toBe('rl:auth:login:acc:def456digest');
    });

    it('supports custom keyPrefix for isolated test namespaces', () => {
      const limiter = new RateLimiter({
        hmacSecret: VALID_TEST_SECRET,
        redisClient: mockRedis,
        keyPrefix: 'test:rl:auth:run123',
      });
      const ipKey = limiter.buildKey('login', 'ip', 'digest123');
      expect(ipKey).toBe('test:rl:auth:run123:login:ip:digest123');
    });
  });

  describe('Endpoint Policy Resolution', () => {
    it('resolves approved policy for PasswordLogin aliases (ConnectRPC and REST)', () => {
      const rpc = resolveEndpointPolicy('/auth.v1.AuthService/PasswordLogin');
      const rest = resolveEndpointPolicy('/api/v1/auth/passwordLogin');
      const oidc = resolveEndpointPolicy('/auth.v1.AuthService/Login');

      expect(rpc).not.toBeNull();
      expect(rpc?.policy.endpointId).toBe('login');
      expect(rpc?.requiresAccount).toBe(true);
      expect(rpc?.policy.ipLimit).toBe(20);
      expect(rpc?.policy.accountLimit).toBe(5);

      expect(rest).not.toBeNull();
      expect(rest?.policy.endpointId).toBe('login');
      expect(rest?.requiresAccount).toBe(true);

      expect(oidc?.policy.endpointId).toBe('login');
    });

    it('resolves approved policy for Register', () => {
      const rpc = resolveEndpointPolicy('/auth.v1.AuthService/Register');
      const rest = resolveEndpointPolicy('/api/v1/auth/register');

      expect(rpc?.policy.endpointId).toBe('register');
      expect(rpc?.policy.ipLimit).toBe(5);
      expect(rpc?.policy.ipWindowSec).toBe(3600);
      expect(rpc?.requiresAccount).toBe(false);

      expect(rest?.policy.endpointId).toBe('register');
    });

    it('resolves approved policy for ForgotPassword', () => {
      const rpc = resolveEndpointPolicy('/auth.v1.AuthService/ForgotPassword');
      const rest = resolveEndpointPolicy('/api/v1/auth/forgotPassword');

      expect(rpc?.policy.endpointId).toBe('forgotPassword');
      expect(rpc?.policy.ipLimit).toBe(10);
      expect(rpc?.policy.accountLimit).toBe(3);
      expect(rpc?.requiresAccount).toBe(true);

      expect(rest?.policy.endpointId).toBe('forgotPassword');
    });

    it('resolves approved policy for ResetPassword, ResendVerification, and Refresh', () => {
      expect(resolveEndpointPolicy('/auth.v1.AuthService/ResetPassword')?.policy.endpointId).toBe(
        'resetPassword'
      );
      expect(resolveEndpointPolicy('/api/v1/auth/resetPassword')?.policy.ipLimit).toBe(10);

      expect(
        resolveEndpointPolicy('/auth.v1.AuthService/ResendVerification')?.policy.endpointId
      ).toBe('resendVerification');
      expect(resolveEndpointPolicy('/api/v1/auth/resendVerification')?.policy.ipLimit).toBe(10);

      expect(resolveEndpointPolicy('/auth.v1.AuthService/Refresh')?.policy.endpointId).toBe(
        'refresh'
      );
      expect(resolveEndpointPolicy('/api/v1/auth/refresh')?.policy.ipLimit).toBe(60);
      expect(resolveEndpointPolicy('/api/v1/auth/refresh')?.policy.ipWindowSec).toBe(60);
    });

    it('returns null for non-auth or unknown routes', () => {
      expect(resolveEndpointPolicy('/api/v1/organization/list')).toBeNull();
      expect(resolveEndpointPolicy('/api/v1/workspace/create')).toBeNull();
      expect(resolveEndpointPolicy('/health')).toBeNull();
    });
  });

  describe('Redis Atomic Enforcement and Dimensions', () => {
    it('allows request when Redis counter is under limit', async () => {
      mockEval.mockResolvedValueOnce([1, 1, 900]);

      const limiter = new RateLimiter({ hmacSecret: VALID_TEST_SECRET, redisClient: mockRedis });
      const decision = await limiter.checkRateLimit({
        clientIp: '192.168.1.100',
        policy: AUTH_RATE_LIMIT_POLICIES.register,
      });

      expect(decision.allowed).toBe(true);
      expect(decision.current).toBe(1);
      expect(decision.retryAfterSec).toBe(0);
      expect(mockEval).toHaveBeenCalledTimes(1);
    });

    it('blocks request when IP limit is exceeded and returns Retry-After', async () => {
      mockEval.mockResolvedValueOnce([0, 21, 750]);

      const limiter = new RateLimiter({ hmacSecret: VALID_TEST_SECRET, redisClient: mockRedis });
      const decision = await limiter.checkRateLimit({
        clientIp: '192.168.1.100',
        policy: AUTH_RATE_LIMIT_POLICIES.login,
      });

      expect(decision.allowed).toBe(false);
      expect(decision.dimension).toBe('ip');
      expect(decision.current).toBe(21);
      expect(decision.retryAfterSec).toBe(750);
      expect(decision.remaining).toBe(0);
    });

    it('evaluates both IP and Account dimensions for Login', async () => {
      mockEval.mockResolvedValueOnce([1, 3, 850]);
      mockEval.mockResolvedValueOnce([1, 2, 850]);

      const limiter = new RateLimiter({ hmacSecret: VALID_TEST_SECRET, redisClient: mockRedis });
      const decision = await limiter.checkRateLimit({
        clientIp: '192.168.1.100',
        accountIdentifier: 'target@example.com',
        policy: AUTH_RATE_LIMIT_POLICIES.login,
      });

      expect(decision.allowed).toBe(true);
      expect(mockEval).toHaveBeenCalledTimes(2);

      const ipCallArgs = mockEval.mock.calls[0];
      const accCallArgs = mockEval.mock.calls[1];
      expect(ipCallArgs[2]).toMatch(/^rl:auth:login:ip:[0-9a-f]{64}$/);
      expect(accCallArgs[2]).toMatch(/^rl:auth:login:acc:[0-9a-f]{64}$/);
    });

    it('blocks request when Account limit is exceeded even if IP is under limit', async () => {
      mockEval.mockResolvedValueOnce([1, 2, 800]);
      mockEval.mockResolvedValueOnce([0, 6, 400]);

      const limiter = new RateLimiter({ hmacSecret: VALID_TEST_SECRET, redisClient: mockRedis });
      const decision = await limiter.checkRateLimit({
        clientIp: '192.168.1.100',
        accountIdentifier: 'target@example.com',
        policy: AUTH_RATE_LIMIT_POLICIES.login,
      });

      expect(decision.allowed).toBe(false);
      expect(decision.dimension).toBe('account');
      expect(decision.limit).toBe(5);
      expect(decision.retryAfterSec).toBe(400);
    });

    it('guarantees positive retryAfterSec on edge case where TTL is 0 or negative', async () => {
      mockEval.mockResolvedValueOnce([0, 15, 0]);

      const limiter = new RateLimiter({ hmacSecret: VALID_TEST_SECRET, redisClient: mockRedis });
      const decision = await limiter.checkRateLimit({
        clientIp: '192.168.1.100',
        policy: AUTH_RATE_LIMIT_POLICIES.forgotPassword,
      });

      expect(decision.allowed).toBe(false);
      expect(decision.retryAfterSec).toBeGreaterThanOrEqual(1);
    });
  });

  describe('DEF-01: Fallback Counter Double-Increment Remediation', () => {
    it('increments IP counter exactly once and Account counter exactly once per request during Redis outage', async () => {
      mockEval.mockRejectedValue(new Error('Redis offline'));

      const limiter = new RateLimiter({
        hmacSecret: VALID_TEST_SECRET,
        redisClient: mockRedis,
        logger: mockLogger,
      });

      const res = await limiter.checkRateLimit({
        clientIp: '10.0.0.1',
        accountIdentifier: 'user@example.com',
        policy: AUTH_RATE_LIMIT_POLICIES.login,
      });

      expect(res.allowed).toBe(true);

      const ipHash = limiter.hashIp('10.0.0.1');
      const accHash = limiter.hashAccount('user@example.com');

      const ipEntry = limiter.getFallbackEntry(`ip:${ipHash}`);
      const accEntry = limiter.getFallbackEntry(`acc:login:${accHash}`);

      expect(ipEntry).toBeDefined();
      expect(ipEntry?.count).toBe(1); // EXACTLY ONCE, not 2!

      expect(accEntry).toBeDefined();
      expect(accEntry?.count).toBe(1); // EXACTLY ONCE
    });

    it('enforces account fallback quota independently when targeting single account from different IPs', async () => {
      mockEval.mockRejectedValue(new Error('Redis offline'));

      const limiter = new RateLimiter({
        hmacSecret: VALID_TEST_SECRET,
        redisClient: mockRedis,
        logger: mockLogger,
      });

      const targetEmail = 'victim@company.com';
      // Login account limit is 5
      for (let i = 1; i <= 5; i++) {
        const d = await limiter.checkRateLimit({
          clientIp: `192.168.1.${i}`,
          accountIdentifier: targetEmail,
          policy: AUTH_RATE_LIMIT_POLICIES.login,
        });
        expect(d.allowed).toBe(true);
      }

      // 6th request targeting victim@company.com from a fresh IP is blocked on account quota
      const blocked = await limiter.checkRateLimit({
        clientIp: '192.168.1.99',
        accountIdentifier: targetEmail,
        policy: AUTH_RATE_LIMIT_POLICIES.login,
      });

      expect(blocked.allowed).toBe(false);
      expect(blocked.dimension).toBe('account');
    });

    it('enforces IP quota independently when single IP attacks different accounts', async () => {
      mockEval.mockRejectedValue(new Error('Redis offline'));

      const limiter = new RateLimiter({
        hmacSecret: VALID_TEST_SECRET,
        redisClient: mockRedis,
        logger: mockLogger,
      });

      const attackerIp = '203.0.113.5';
      // Fallback limit is 10 requests / 60 seconds
      for (let i = 1; i <= 10; i++) {
        const d = await limiter.checkRateLimit({
          clientIp: attackerIp,
          accountIdentifier: `victim-${i}@company.com`,
          policy: AUTH_RATE_LIMIT_POLICIES.login,
        });
        expect(d.allowed).toBe(true);
      }

      // 11th request from same IP is blocked on fallback/ip quota
      const blocked = await limiter.checkRateLimit({
        clientIp: attackerIp,
        accountIdentifier: 'victim-11@company.com',
        policy: AUTH_RATE_LIMIT_POLICIES.login,
      });

      expect(blocked.allowed).toBe(false);
      expect(blocked.dimension).toBe('fallback');
    });
  });

  describe('DEF-02: True LRU Fallback Cache', () => {
    it('refreshes recency on access so accessed entry moves to MRU', async () => {
      mockEval.mockRejectedValue(new Error('Redis down'));

      const limiter = new RateLimiter({
        hmacSecret: VALID_TEST_SECRET,
        redisClient: mockRedis,
        logger: mockLogger,
      });

      // Insert keys A, B, C via IP check
      await limiter.checkRateLimit({ clientIp: '10.0.0.1', policy: AUTH_RATE_LIMIT_POLICIES.register });
      await limiter.checkRateLimit({ clientIp: '10.0.0.2', policy: AUTH_RATE_LIMIT_POLICIES.register });
      await limiter.checkRateLimit({ clientIp: '10.0.0.3', policy: AUTH_RATE_LIMIT_POLICIES.register });

      const hash1 = limiter.hashIp('10.0.0.1');
      const hash2 = limiter.hashIp('10.0.0.2');
      const hash3 = limiter.hashIp('10.0.0.3');

      expect(limiter.getFallbackKeys()).toEqual([`ip:${hash1}`, `ip:${hash2}`, `ip:${hash3}`]);

      // Re-access key A -> should move to end of map (MRU)
      await limiter.checkRateLimit({ clientIp: '10.0.0.1', policy: AUTH_RATE_LIMIT_POLICIES.register });

      expect(limiter.getFallbackKeys()).toEqual([`ip:${hash2}`, `ip:${hash3}`, `ip:${hash1}`]);
    });

    it('evicts least recently used entry at capacity', async () => {
      mockEval.mockRejectedValue(new Error('Redis down'));

      // Create a small limiter with capacity 3
      const limiter = new RateLimiter({
        hmacSecret: VALID_TEST_SECRET,
        redisClient: mockRedis,
        fallbackCapacity: 3,
        logger: mockLogger,
      });

      await limiter.checkRateLimit({ clientIp: '10.0.0.1', policy: AUTH_RATE_LIMIT_POLICIES.register });
      await limiter.checkRateLimit({ clientIp: '10.0.0.2', policy: AUTH_RATE_LIMIT_POLICIES.register });
      await limiter.checkRateLimit({ clientIp: '10.0.0.3', policy: AUTH_RATE_LIMIT_POLICIES.register });

      const hash1 = limiter.hashIp('10.0.0.1');
      const hash2 = limiter.hashIp('10.0.0.2');
      const hash3 = limiter.hashIp('10.0.0.3');
      const hash4 = limiter.hashIp('10.0.0.4');

      // Access key 1 to make it MRU
      await limiter.checkRateLimit({ clientIp: '10.0.0.1', policy: AUTH_RATE_LIMIT_POLICIES.register });

      // Cache order is now [2, 3, 1]. Inserting 4 should evict 2 (the true LRU entry)!
      await limiter.checkRateLimit({ clientIp: '10.0.0.4', policy: AUTH_RATE_LIMIT_POLICIES.register });

      expect(limiter.getFallbackCacheSize()).toBe(3);
      expect(limiter.getFallbackKeys()).toEqual([`ip:${hash3}`, `ip:${hash1}`, `ip:${hash4}`]);
      expect(limiter.getFallbackEntry(`ip:${hash2}`)).toBeUndefined();
    });
  });

  describe('DEF-03: Shared HMAC Secret Across Replicas', () => {
    it('throws when HMAC secret is shorter than 32 characters', () => {
      expect(() => {
        new RateLimiter({ hmacSecret: 'too-short', redisClient: mockRedis });
      }).toThrow('RATE_LIMIT_HMAC_SECRET must be at least 32 characters long');
    });

    it('throws fatal error in production when RATE_LIMIT_HMAC_SECRET is missing', () => {
      const origEnv = process.env.NODE_ENV;
      const origSecret = process.env.RATE_LIMIT_HMAC_SECRET;
      try {
        process.env.NODE_ENV = 'production';
        delete process.env.RATE_LIMIT_HMAC_SECRET;

        expect(() => {
          new RateLimiter({ redisClient: mockRedis, logger: mockLogger });
        }).toThrow(/FATAL: RATE_LIMIT_HMAC_SECRET is required in production/);
      } finally {
        process.env.NODE_ENV = origEnv;
        process.env.RATE_LIMIT_HMAC_SECRET = origSecret;
      }
    });

    it('generates identical 64-hex digests across independent RateLimiter instances with same secret', () => {
      const secret = 'identical-secret-shared-across-all-gateways-1234!';
      const replicaA = new RateLimiter({ hmacSecret: secret, redisClient: mockRedis });
      const replicaB = new RateLimiter({ hmacSecret: secret, redisClient: mockRedis });

      const email = 'employee@company.com';
      const hashA = replicaA.hashAccount(email);
      const hashB = replicaB.hashAccount(email);

      expect(hashA).toBe(hashB);
      expect(hashA).toHaveLength(64);
    });

    it('generates divergent digests across RateLimiter instances with different secrets', () => {
      const secretA = 'secret-a-for-gateway-instance-one-1234567890!';
      const secretB = 'secret-b-for-gateway-instance-two-1234567890!';
      const replicaA = new RateLimiter({ hmacSecret: secretA, redisClient: mockRedis });
      const replicaB = new RateLimiter({ hmacSecret: secretB, redisClient: mockRedis });

      const email = 'employee@company.com';
      expect(replicaA.hashAccount(email)).not.toBe(replicaB.hashAccount(email));
    });
  });

  describe('DEF-04: Authentication Payload Body Buffering Limit (64 KiB)', () => {
    it('rejects declared Content-Length greater than 64 KiB early before buffering', async () => {
      const limiter = new RateLimiter({ hmacSecret: VALID_TEST_SECRET, redisClient: mockRedis });
      const preHandler = createRateLimitingPreHandler(limiter, mockLogger);

      const fakeReq: any = {
        url: '/auth.v1.AuthService/PasswordLogin',
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': String(MAX_AUTH_PAYLOAD_BYTES + 100),
        },
      };

      let sentStatus = 0;
      let sentPayload: any = null;
      const fakeReply: any = {
        header: vi.fn(),
        status: (code: number) => {
          sentStatus = code;
          return {
            send: (payload: any) => {
              sentPayload = payload;
            },
          };
        },
      };

      const blocked = await preHandler(fakeReq, fakeReply);
      expect(blocked).toBe(true);
      expect(sentStatus).toBe(413);
      expect(sentPayload.code).toBe('resource_exhausted');
    });

    it('rejects chunked streamed body exceeding 64 KiB and aborts stream', async () => {
      const limiter = new RateLimiter({ hmacSecret: VALID_TEST_SECRET, redisClient: mockRedis });
      const preHandler = createRateLimitingPreHandler(limiter, mockLogger);

      // Create a readable stream producing 70 KiB
      const chunkSize = 10 * 1024; // 10 KiB
      const stream = new Readable({
        read() {
          for (let i = 0; i < 7; i++) {
            this.push(Buffer.alloc(chunkSize, 'a'));
          }
          this.push(null);
        },
      });

      const destroySpy = vi.spyOn(stream, 'destroy');

      const fakeReq: any = {
        url: '/api/v1/auth/passwordLogin',
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: stream,
      };

      let sentStatus = 0;
      let sentPayload: any = null;
      const fakeReply: any = {
        header: vi.fn(),
        status: (code: number) => {
          sentStatus = code;
          return {
            send: (payload: any) => {
              sentPayload = payload;
            },
          };
        },
      };

      const blocked = await preHandler(fakeReq, fakeReply);
      expect(blocked).toBe(true);
      expect(sentStatus).toBe(413);
      expect(sentPayload.type).toBe('https://ag-ide.local/errors/ERR_PAYLOAD_TOO_LARGE');
      expect(destroySpy).toHaveBeenCalled();
    });

    it('allows payload exactly at 64 KiB limit', async () => {
      mockEval.mockResolvedValueOnce([1, 1, 900]);
      mockEval.mockResolvedValueOnce([1, 1, 900]);

      const limiter = new RateLimiter({ hmacSecret: VALID_TEST_SECRET, redisClient: mockRedis });
      const preHandler = createRateLimitingPreHandler(limiter, mockLogger);

      const exactPayload = JSON.stringify({
        email: 'exact@company.com',
        padding: 'x'.repeat(MAX_AUTH_PAYLOAD_BYTES - 50),
      });
      const exactBuf = Buffer.from(exactPayload).subarray(0, MAX_AUTH_PAYLOAD_BYTES);

      const fakeReq: any = {
        url: '/api/v1/auth/passwordLogin',
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': String(exactBuf.length),
        },
        body: Readable.from([exactBuf]),
      };

      const fakeReply: any = {
        header: vi.fn(),
        status: vi.fn(),
      };

      const blocked = await preHandler(fakeReq, fakeReply);
      expect(blocked).toBe(false); // Allowed through
    });
  });

  describe('DEF-05: Trusted Proxy Configuration', () => {
    it('defaults strictly to loopback interfaces', () => {
      const orig = process.env.TRUSTED_PROXIES;
      try {
        delete process.env.TRUSTED_PROXIES;
        const proxies = getTrustedProxies();
        expect(proxies).toEqual(['127.0.0.1', '::1']);
        expect(proxies).not.toContain('10.0.0.0/8');
        expect(proxies).not.toContain('172.16.0.0/12');
        expect(proxies).not.toContain('192.168.0.0/16');
      } finally {
        if (orig !== undefined) process.env.TRUSTED_PROXIES = orig;
      }
    });

    it('parses explicit comma-separated TRUSTED_PROXIES', () => {
      const orig = process.env.TRUSTED_PROXIES;
      try {
        process.env.TRUSTED_PROXIES = ' 127.0.0.1, 172.28.0.0/16 , 10.1.2.3 ';
        const proxies = getTrustedProxies();
        expect(proxies).toEqual(['127.0.0.1', '172.28.0.0/16', '10.1.2.3']);
      } finally {
        if (orig !== undefined) process.env.TRUSTED_PROXIES = orig;
        else delete process.env.TRUSTED_PROXIES;
      }
    });
  });

  describe('SEC-TEST-01: Key Prefix Configuration and Namespace Isolation', () => {
    const origEnvPrefix = process.env.RATE_LIMIT_KEY_PREFIX;

    afterEach(() => {
      if (origEnvPrefix !== undefined) {
        process.env.RATE_LIMIT_KEY_PREFIX = origEnvPrefix;
      } else {
        delete process.env.RATE_LIMIT_KEY_PREFIX;
      }
    });

    it('preserves default production key prefix rl:auth when unconfigured', () => {
      delete process.env.RATE_LIMIT_KEY_PREFIX;
      const limiter = new RateLimiter({ hmacSecret: VALID_TEST_SECRET, redisClient: mockRedis });
      expect(limiter.getKeyPrefix()).toBe('rl:auth');

      const ipKey = limiter.buildKey('login', 'ip', 'testdigest');
      const accKey = limiter.buildKey('login', 'acc', 'testdigest');
      expect(ipKey).toBe('rl:auth:login:ip:testdigest');
      expect(accKey).toBe('rl:auth:login:acc:testdigest');
    });

    it('applies configured test prefix to every relevant Redis key', () => {
      const testPrefix = 'rl:auth:test:mgw:run-12345';
      const limiter = new RateLimiter({
        hmacSecret: VALID_TEST_SECRET,
        redisClient: mockRedis,
        keyPrefix: testPrefix,
      });
      expect(limiter.getKeyPrefix()).toBe(testPrefix);

      const ipKey = limiter.buildKey('login', 'ip', 'hash123');
      const accKey = limiter.buildKey('login', 'acc', 'hash456');
      expect(ipKey).toBe(`${testPrefix}:login:ip:hash123`);
      expect(accKey).toBe(`${testPrefix}:login:acc:hash456`);
      expect(ipKey).not.toContain('rl:auth:login');
    });

    it('inherits test prefix from process.env.RATE_LIMIT_KEY_PREFIX when options.keyPrefix is omitted', () => {
      const envPrefix = 'rl:auth:test:mgw:env-run-999';
      process.env.RATE_LIMIT_KEY_PREFIX = envPrefix;

      const limiter = new RateLimiter({
        hmacSecret: VALID_TEST_SECRET,
        redisClient: mockRedis,
      });
      expect(limiter.getKeyPrefix()).toBe(envPrefix);

      const ipKey = limiter.buildKey('register', 'ip', 'digest999');
      expect(ipKey).toBe(`${envPrefix}:register:ip:digest999`);
    });

    it('ensures two Gateway instances with identical prefix produce compatible Redis keys', () => {
      const sharedPrefix = 'rl:auth:test:mgw:shared-replica-run';
      const replicaA = new RateLimiter({
        hmacSecret: VALID_TEST_SECRET,
        redisClient: mockRedis,
        keyPrefix: sharedPrefix,
      });
      const replicaB = new RateLimiter({
        hmacSecret: VALID_TEST_SECRET,
        redisClient: mockRedis,
        keyPrefix: sharedPrefix,
      });

      const email = 'user@example.com';
      const ip = '203.0.113.42';

      const accKeyA = replicaA.buildKey('login', 'acc', replicaA.hashAccount(replicaA.normalizeAccount(email)));
      const accKeyB = replicaB.buildKey('login', 'acc', replicaB.hashAccount(replicaB.normalizeAccount(email)));
      expect(accKeyA).toBe(accKeyB);

      const ipKeyA = replicaA.buildKey('login', 'ip', replicaA.hashIp(ip));
      const ipKeyB = replicaB.buildKey('login', 'ip', replicaB.hashIp(ip));
      expect(ipKeyA).toBe(ipKeyB);
    });

    it('ensures different test prefixes remain completely isolated', () => {
      const limiterRun1 = new RateLimiter({
        hmacSecret: VALID_TEST_SECRET,
        redisClient: mockRedis,
        keyPrefix: 'rl:auth:test:mgw:run-alpha',
      });
      const limiterRun2 = new RateLimiter({
        hmacSecret: VALID_TEST_SECRET,
        redisClient: mockRedis,
        keyPrefix: 'rl:auth:test:mgw:run-beta',
      });

      const accKey1 = limiterRun1.buildKey('login', 'acc', limiterRun1.hashAccount('user@example.com'));
      const accKey2 = limiterRun2.buildKey('login', 'acc', limiterRun2.hashAccount('user@example.com'));

      expect(accKey1).not.toBe(accKey2);
      expect(accKey1.startsWith('rl:auth:test:mgw:run-alpha:')).toBe(true);
      expect(accKey2.startsWith('rl:auth:test:mgw:run-beta:')).toBe(true);
    });

    it('validates cleanup key pattern targets only current run namespace and rejects broad patterns', () => {
      const runPrefix = 'rl:auth:test:mgw:1730829000-abcd';
      const cleanupPattern = `${runPrefix}:*`;

      expect(cleanupPattern).toBe('rl:auth:test:mgw:1730829000-abcd:*');
      expect(cleanupPattern).not.toBe('rl:auth:*');
      expect(cleanupPattern.startsWith('rl:auth:test:mgw:')).toBe(true);
      // Ensure pattern does NOT match root production keys
      const sampleProdKey = 'rl:auth:login:acc:abcdef';
      const patternRegex = new RegExp(`^${runPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:.*$`);
      expect(patternRegex.test(sampleProdKey)).toBe(false);
    });

    it('fails safely when key prefix is empty or whitespace only', () => {
      expect(() => {
        new RateLimiter({
          hmacSecret: VALID_TEST_SECRET,
          redisClient: mockRedis,
          keyPrefix: '',
        });
      }).toThrow('RATE_LIMIT_KEY_PREFIX must be a non-empty string');

      expect(() => {
        new RateLimiter({
          hmacSecret: VALID_TEST_SECRET,
          redisClient: mockRedis,
          keyPrefix: '   ',
        });
      }).toThrow('RATE_LIMIT_KEY_PREFIX must be a non-empty string');

      process.env.RATE_LIMIT_KEY_PREFIX = '   ';
      expect(() => {
        new RateLimiter({
          hmacSecret: VALID_TEST_SECRET,
          redisClient: mockRedis,
        });
      }).toThrow('RATE_LIMIT_KEY_PREFIX must be a non-empty string');
    });
  });
});
