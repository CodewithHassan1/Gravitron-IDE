import { describe, it, expect, vi, beforeEach } from "vitest";

vi.hoisted(() => {
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = "test-secret-that-is-at-least-32-characters-long!";
});
import {
  RateLimiter,
  RateLimiterRedisClient,
  AUTH_RATE_LIMIT_POLICIES,
  resolveEndpointPolicy,
} from "./rateLimiter";
import { AGLogger } from "@ag/logger";

describe("RateLimiter Unit Tests", () => {
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

  describe("Account Normalization and Key Generation", () => {
    it("normalizes email by trimming and lowercasing", () => {
      const limiter = new RateLimiter({ hmacSecret: "test-secret", redisClient: mockRedis });
      expect(limiter.normalizeAccount("  User@Example.COM  ")).toBe("user@example.com");
      expect(limiter.normalizeAccount("USER@domain.org\t")).toBe("user@domain.org");
    });

    it("generates 64-character hex HMAC-SHA-256 account digest without raw email", () => {
      const limiter = new RateLimiter({ hmacSecret: "test-secret", redisClient: mockRedis });
      const hash1 = limiter.hashAccount("user@example.com");
      const hash2 = limiter.hashAccount("user@example.com");
      const hash3 = limiter.hashAccount("other@example.com");

      expect(hash1).toHaveLength(64);
      expect(hash1).toMatch(/^[0-9a-f]{64}$/);
      expect(hash1).toBe(hash2);
      expect(hash1).not.toBe(hash3);
      expect(hash1).not.toContain("user@example.com");
    });

    it("generates 64-character hex SHA-256 IP digest without raw IP", () => {
      const limiter = new RateLimiter({ hmacSecret: "test-secret", redisClient: mockRedis });
      const ipHash1 = limiter.hashIp(" 192.168.1.50 ");
      const ipHash2 = limiter.hashIp("192.168.1.50");
      const ipHash3 = limiter.hashIp("2001:0db8:85a3:0000:0000:8a2e:0370:7334");

      expect(ipHash1).toHaveLength(64);
      expect(ipHash1).toMatch(/^[0-9a-f]{64}$/);
      expect(ipHash1).toBe(ipHash2);
      expect(ipHash3).toHaveLength(64);
      expect(ipHash1).not.toContain("192.168");
      expect(ipHash3).not.toContain(":");
    });

    it("constructs Redis key according to approved namespace rl:auth:<endpoint>:<dimension>:<digest>", () => {
      const limiter = new RateLimiter({ hmacSecret: "test-secret", redisClient: mockRedis });
      const ipKey = limiter.buildKey("login", "ip", "abc123digest");
      const accKey = limiter.buildKey("login", "acc", "def456digest");

      expect(ipKey).toBe("rl:auth:login:ip:abc123digest");
      expect(accKey).toBe("rl:auth:login:acc:def456digest");
    });
  });

  describe("Endpoint Policy Resolution", () => {
    it("resolves approved policy for PasswordLogin aliases (ConnectRPC and REST)", () => {
      const rpc = resolveEndpointPolicy("/auth.v1.AuthService/PasswordLogin");
      const rest = resolveEndpointPolicy("/api/v1/auth/passwordLogin");
      const oidc = resolveEndpointPolicy("/auth.v1.AuthService/Login");

      expect(rpc).not.toBeNull();
      expect(rpc?.policy.endpointId).toBe("login");
      expect(rpc?.requiresAccount).toBe(true);
      expect(rpc?.policy.ipLimit).toBe(20);
      expect(rpc?.policy.accountLimit).toBe(5);

      expect(rest).not.toBeNull();
      expect(rest?.policy.endpointId).toBe("login");
      expect(rest?.requiresAccount).toBe(true);

      expect(oidc?.policy.endpointId).toBe("login");
    });

    it("resolves approved policy for Register", () => {
      const rpc = resolveEndpointPolicy("/auth.v1.AuthService/Register");
      const rest = resolveEndpointPolicy("/api/v1/auth/register");

      expect(rpc?.policy.endpointId).toBe("register");
      expect(rpc?.policy.ipLimit).toBe(5);
      expect(rpc?.policy.ipWindowSec).toBe(3600);
      expect(rpc?.requiresAccount).toBe(false);

      expect(rest?.policy.endpointId).toBe("register");
    });

    it("resolves approved policy for ForgotPassword", () => {
      const rpc = resolveEndpointPolicy("/auth.v1.AuthService/ForgotPassword");
      const rest = resolveEndpointPolicy("/api/v1/auth/forgotPassword");

      expect(rpc?.policy.endpointId).toBe("forgotPassword");
      expect(rpc?.policy.ipLimit).toBe(10);
      expect(rpc?.policy.accountLimit).toBe(3);
      expect(rpc?.requiresAccount).toBe(true);

      expect(rest?.policy.endpointId).toBe("forgotPassword");
    });

    it("resolves approved policy for ResetPassword, ResendVerification, and Refresh", () => {
      expect(resolveEndpointPolicy("/auth.v1.AuthService/ResetPassword")?.policy.endpointId).toBe("resetPassword");
      expect(resolveEndpointPolicy("/api/v1/auth/resetPassword")?.policy.ipLimit).toBe(10);

      expect(resolveEndpointPolicy("/auth.v1.AuthService/ResendVerification")?.policy.endpointId).toBe("resendVerification");
      expect(resolveEndpointPolicy("/api/v1/auth/resendVerification")?.policy.ipLimit).toBe(10);

      expect(resolveEndpointPolicy("/auth.v1.AuthService/Refresh")?.policy.endpointId).toBe("refresh");
      expect(resolveEndpointPolicy("/api/v1/auth/refresh")?.policy.ipLimit).toBe(60);
      expect(resolveEndpointPolicy("/api/v1/auth/refresh")?.policy.ipWindowSec).toBe(60);
    });

    it("returns null for non-auth or unknown routes", () => {
      expect(resolveEndpointPolicy("/api/v1/organization/list")).toBeNull();
      expect(resolveEndpointPolicy("/api/v1/workspace/create")).toBeNull();
      expect(resolveEndpointPolicy("/health")).toBeNull();
    });
  });

  describe("Redis Atomic Enforcement and Dimensions", () => {
    it("allows request when Redis counter is under limit", async () => {
      // Return: [allowed=1, current=1, ttl=900]
      mockEval.mockResolvedValueOnce([1, 1, 900]);

      const limiter = new RateLimiter({ hmacSecret: "test-secret", redisClient: mockRedis });
      const decision = await limiter.checkRateLimit({
        clientIp: "192.168.1.100",
        policy: AUTH_RATE_LIMIT_POLICIES.register,
      });

      expect(decision.allowed).toBe(true);
      expect(decision.current).toBe(1);
      expect(decision.retryAfterSec).toBe(0);
      expect(mockEval).toHaveBeenCalledTimes(1);
    });

    it("blocks request when IP limit is exceeded and returns Retry-After", async () => {
      // Return: [allowed=0, current=21, ttl=750]
      mockEval.mockResolvedValueOnce([0, 21, 750]);

      const limiter = new RateLimiter({ hmacSecret: "test-secret", redisClient: mockRedis });
      const decision = await limiter.checkRateLimit({
        clientIp: "192.168.1.100",
        policy: AUTH_RATE_LIMIT_POLICIES.login,
      });

      expect(decision.allowed).toBe(false);
      expect(decision.dimension).toBe("ip");
      expect(decision.current).toBe(21);
      expect(decision.retryAfterSec).toBe(750);
      expect(decision.remaining).toBe(0);
    });

    it("evaluates both IP and Account dimensions for Login", async () => {
      // Call 1 (IP): allowed=1, current=3, ttl=850
      // Call 2 (Account): allowed=1, current=2, ttl=850
      mockEval.mockResolvedValueOnce([1, 3, 850]);
      mockEval.mockResolvedValueOnce([1, 2, 850]);

      const limiter = new RateLimiter({ hmacSecret: "test-secret", redisClient: mockRedis });
      const decision = await limiter.checkRateLimit({
        clientIp: "192.168.1.100",
        accountIdentifier: "target@example.com",
        policy: AUTH_RATE_LIMIT_POLICIES.login,
      });

      expect(decision.allowed).toBe(true);
      expect(mockEval).toHaveBeenCalledTimes(2);

      // Verify key arguments passed to Redis eval
      const ipCallArgs = mockEval.mock.calls[0];
      const accCallArgs = mockEval.mock.calls[1];
      expect(ipCallArgs[2]).toMatch(/^rl:auth:login:ip:[0-9a-f]{64}$/);
      expect(accCallArgs[2]).toMatch(/^rl:auth:login:acc:[0-9a-f]{64}$/);
    });

    it("blocks request when Account limit is exceeded even if IP is under limit", async () => {
      // Call 1 (IP): allowed=1, current=2, ttl=800
      // Call 2 (Account): allowed=0, current=6, ttl=400 (exceeded account limit 5)
      mockEval.mockResolvedValueOnce([1, 2, 800]);
      mockEval.mockResolvedValueOnce([0, 6, 400]);

      const limiter = new RateLimiter({ hmacSecret: "test-secret", redisClient: mockRedis });
      const decision = await limiter.checkRateLimit({
        clientIp: "192.168.1.100",
        accountIdentifier: "target@example.com",
        policy: AUTH_RATE_LIMIT_POLICIES.login,
      });

      expect(decision.allowed).toBe(false);
      expect(decision.dimension).toBe("account");
      expect(decision.limit).toBe(5);
      expect(decision.retryAfterSec).toBe(400);
    });

    it("handles TTL edge case where ttl is 0 or negative by guaranteeing positive retryAfter", async () => {
      // Redis returned 0 for TTL
      mockEval.mockResolvedValueOnce([0, 15, 0]);

      const limiter = new RateLimiter({ hmacSecret: "test-secret", redisClient: mockRedis });
      const decision = await limiter.checkRateLimit({
        clientIp: "192.168.1.100",
        policy: AUTH_RATE_LIMIT_POLICIES.forgotPassword,
      });

      expect(decision.allowed).toBe(false);
      expect(decision.retryAfterSec).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Redis Failure, Timeout and Bounded In-Memory Fallback", () => {
    it("fails open to local in-memory fallback on Redis timeout (> 50ms)", async () => {
      // Redis eval promise that never resolves
      mockEval.mockImplementationOnce(() => new Promise(() => {}));

      const limiter = new RateLimiter({
        hmacSecret: "test-secret",
        redisClient: mockRedis,
        commandTimeoutMs: 10,
        logger: mockLogger,
      });

      const decision = await limiter.checkRateLimit({
        clientIp: "10.0.0.5",
        policy: AUTH_RATE_LIMIT_POLICIES.login,
      });

      // Should fail open via fallback
      expect(decision.allowed).toBe(true);
      expect(limiter.getFallbackCacheSize()).toBe(1);
      expect(loggedErrors.length).toBeGreaterThan(0);
      expect(loggedErrors[0].ctx.error_code).toBe("ERR_RATE_LIMIT_REDIS_UNAVAILABLE");
    });

    it("enforces conservative in-memory fallback limit (10 req / 60s per IP)", async () => {
      // Disconnect Redis by rejecting eval
      mockEval.mockRejectedValue(new Error("Connection refused"));

      const limiter = new RateLimiter({
        hmacSecret: "test-secret",
        redisClient: mockRedis,
        logger: mockLogger,
      });

      // Send 10 requests -> all allowed under fallback limit
      for (let i = 1; i <= 10; i++) {
        const d = await limiter.checkRateLimit({
          clientIp: "10.0.0.99",
          policy: AUTH_RATE_LIMIT_POLICIES.login,
        });
        expect(d.allowed).toBe(true);
      }

      // 11th request -> blocked by fallback
      const blocked = await limiter.checkRateLimit({
        clientIp: "10.0.0.99",
        policy: AUTH_RATE_LIMIT_POLICIES.login,
      });
      expect(blocked.allowed).toBe(false);
      expect(blocked.dimension).toBe("fallback");
      expect(blocked.retryAfterSec).toBeGreaterThan(0);
    });

    it("throttles Redis failure alert logs to prevent log flooding", async () => {
      mockEval.mockRejectedValue(new Error("Redis disconnected"));

      const limiter = new RateLimiter({
        hmacSecret: "test-secret",
        redisClient: mockRedis,
        logger: mockLogger,
      });

      // 5 failed requests in quick succession
      for (let i = 0; i < 5; i++) {
        await limiter.checkRateLimit({
          clientIp: `10.0.0.${i}`,
          policy: AUTH_RATE_LIMIT_POLICIES.login,
        });
      }

      // Alert should be throttled: only 1 error logged
      expect(loggedErrors.length).toBe(1);
    });

    it("bounds in-memory LRU cache capacity to 5,000 entries max", async () => {
      mockEval.mockRejectedValue(new Error("Redis offline"));

      const limiter = new RateLimiter({
        hmacSecret: "test-secret",
        redisClient: mockRedis,
        logger: mockLogger,
      });

      // Directly insert 5,000 items
      for (let i = 0; i < 5000; i++) {
        await limiter.checkRateLimit({
          clientIp: `192.168.0.${i}`,
          policy: AUTH_RATE_LIMIT_POLICIES.login,
        });
      }
      expect(limiter.getFallbackCacheSize()).toBe(5000);

      // Insert 1 more -> size remains at 5,000 (oldest evicted)
      await limiter.checkRateLimit({
        clientIp: "192.168.1.1",
        policy: AUTH_RATE_LIMIT_POLICIES.login,
      });
      expect(limiter.getFallbackCacheSize()).toBe(5000);
    });

    it("automatically recovers and resumes Redis enforcement once Redis reconnects", async () => {
      // First call fails -> fallback
      mockEval.mockRejectedValueOnce(new Error("Transient network partition"));
      // Second call succeeds -> Redis
      mockEval.mockResolvedValueOnce([1, 1, 900]);

      const limiter = new RateLimiter({
        hmacSecret: "test-secret",
        redisClient: mockRedis,
        logger: mockLogger,
      });

      const d1 = await limiter.checkRateLimit({ clientIp: "1.2.3.4", policy: AUTH_RATE_LIMIT_POLICIES.login });
      expect(d1.allowed).toBe(true);

      const d2 = await limiter.checkRateLimit({ clientIp: "1.2.3.4", policy: AUTH_RATE_LIMIT_POLICIES.login });
      expect(d2.allowed).toBe(true);
      expect(mockEval).toHaveBeenCalledTimes(2);
    });
  });
});
