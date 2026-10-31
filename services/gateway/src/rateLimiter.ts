import crypto from "crypto";
import { FastifyRequest, FastifyReply } from "fastify";
import { AGLogger, LogContext } from "@ag/logger";
import { redis as defaultRedis } from "@ag/cache";

export interface RateLimiterRedisClient {
  eval(script: string, numKeys: number, ...args: (string | number)[]): Promise<any>;
  on?(event: string, callback: (...args: any[]) => void): any;
}

export interface EndpointPolicy {
  endpointId: string;
  ipLimit: number;
  ipWindowSec: number;
  accountLimit?: number;
  accountWindowSec?: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  dimension?: "ip" | "account" | "fallback";
  limit?: number;
  remaining?: number;
  retryAfterSec: number;
  current?: number;
}

export interface RateLimiterOptions {
  redisClient?: RateLimiterRedisClient;
  hmacSecret?: string;
  commandTimeoutMs?: number;
  logger?: AGLogger;
}

interface FallbackEntry {
  count: number;
  expiresAt: number;
}

/**
 * Approved Phase 5.2.3.16 Rate Limiting Policies.
 * Fixed-window counters shared through Redis.
 */
export const AUTH_RATE_LIMIT_POLICIES: Record<string, EndpointPolicy> = {
  login: {
    endpointId: "login",
    ipLimit: 20,
    ipWindowSec: 900, // 15 min
    accountLimit: 5,
    accountWindowSec: 900, // 15 min
  },
  register: {
    endpointId: "register",
    ipLimit: 5,
    ipWindowSec: 3600, // 1 hr
  },
  forgotPassword: {
    endpointId: "forgotPassword",
    ipLimit: 10,
    ipWindowSec: 900, // 15 min
    accountLimit: 3,
    accountWindowSec: 900, // 15 min
  },
  resetPassword: {
    endpointId: "resetPassword",
    ipLimit: 10,
    ipWindowSec: 900, // 15 min
  },
  resendVerification: {
    endpointId: "resendVerification",
    ipLimit: 10,
    ipWindowSec: 900, // 15 min
  },
  refresh: {
    endpointId: "refresh",
    ipLimit: 60,
    ipWindowSec: 60, // 1 min
  },
};

/**
 * Maps incoming request URL paths to their corresponding approved EndpointPolicy.
 * Both ConnectRPC and REST aliases share the exact same logical policy and Redis counters.
 */
export function resolveEndpointPolicy(urlPath: string): { policy: EndpointPolicy; requiresAccount: boolean } | null {
  const path = urlPath.split("?")[0].replace(/\/+$/, "");

  // Password Login (and deprecated OIDC Login)
  if (
    path === "/auth.v1.AuthService/PasswordLogin" ||
    path === "/api/v1/auth/passwordLogin" ||
    path === "/auth.v1.AuthService/Login"
  ) {
    return { policy: AUTH_RATE_LIMIT_POLICIES.login, requiresAccount: true };
  }

  // Register
  if (
    path === "/auth.v1.AuthService/Register" ||
    path === "/api/v1/auth/register"
  ) {
    return { policy: AUTH_RATE_LIMIT_POLICIES.register, requiresAccount: false };
  }

  // Forgot Password
  if (
    path === "/auth.v1.AuthService/ForgotPassword" ||
    path === "/api/v1/auth/forgotPassword"
  ) {
    return { policy: AUTH_RATE_LIMIT_POLICIES.forgotPassword, requiresAccount: true };
  }

  // Reset Password
  if (
    path === "/auth.v1.AuthService/ResetPassword" ||
    path === "/api/v1/auth/resetPassword"
  ) {
    return { policy: AUTH_RATE_LIMIT_POLICIES.resetPassword, requiresAccount: false };
  }

  // Resend Verification
  if (
    path === "/auth.v1.AuthService/ResendVerification" ||
    path === "/api/v1/auth/resendVerification"
  ) {
    return { policy: AUTH_RATE_LIMIT_POLICIES.resendVerification, requiresAccount: false };
  }

  // Refresh
  if (
    path === "/auth.v1.AuthService/Refresh" ||
    path === "/api/v1/auth/refresh"
  ) {
    return { policy: AUTH_RATE_LIMIT_POLICIES.refresh, requiresAccount: false };
  }

  return null;
}

/**
 * Atomic Lua script for Redis fixed-window counter.
 * Atomically increments counter, sets TTL on initial creation, and returns [allowed, current, ttl].
 */
const FIXED_WINDOW_LUA_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[2]))
end

local ttl = redis.call('TTL', KEYS[1])
if ttl == -1 then
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[2]))
  ttl = tonumber(ARGV[2])
elseif ttl == -2 then
  ttl = tonumber(ARGV[2])
end

if current > tonumber(ARGV[1]) then
  return { 0, current, ttl }
else
  return { 1, current, ttl }
end
`;

export class RateLimiter {
  private redis: RateLimiterRedisClient | null;
  private hmacSecret: string;
  private commandTimeoutMs: number;
  private logger: AGLogger;

  // Local bounded in-memory LRU fallback
  // Note: This fallback is instance-local and NOT distributed across Gateway replicas.
  private fallbackCache = new Map<string, FallbackEntry>();
  private readonly fallbackCapacity = 5000;
  private readonly fallbackLimit = 10;
  private readonly fallbackWindowSec = 60;

  // Observability & alert throttling
  private lastAlertTimestamp = 0;
  private readonly alertThrottleMs = 60000; // 1 alert per minute max

  constructor(options: RateLimiterOptions = {}) {
    this.redis = options.redisClient !== undefined ? options.redisClient : defaultRedis;
    this.commandTimeoutMs = options.commandTimeoutMs ?? 50;
    this.logger = options.logger ?? new AGLogger("gateway:rate-limiter", "1.0.0");

    // Use dedicated secret if provided; fallback to process-lifetime ephemeral secret if unconfigured.
    // Never silently reuse JWT_SECRET or private keys. Never hardcode keys.
    if (options.hmacSecret) {
      this.hmacSecret = options.hmacSecret;
    } else if (process.env.RATE_LIMIT_HMAC_SECRET) {
      this.hmacSecret = process.env.RATE_LIMIT_HMAC_SECRET;
    } else {
      this.hmacSecret = crypto.randomBytes(32).toString("hex");
      if (process.env.NODE_ENV === "production") {
        this.logger.warn(
          { trace_id: "none", span_id: "none", request_id: "none" },
          "RATE_LIMIT_HMAC_SECRET is not configured. Ephemeral HMAC key generated; multi-replica account rate limits will not share digests."
        );
      }
    }

    // Attach error listener to prevent unhandled EventEmitter error events
    if (this.redis && typeof this.redis.on === "function") {
      this.redis.on("error", (err: any) => {
        this.handleRedisFailure("Redis client emitted error", err);
      });
    }
  }

  /**
   * Normalizes email address consistently with Auth Service (trim and lowercase).
   */
  public normalizeAccount(raw: string): string {
    return raw.trim().toLowerCase();
  }

  /**
   * Derives fixed-length 64-hex privacy-preserving HMAC digest for account identifier.
   * Never stores plain-text emails in Redis keys or logs.
   */
  public hashAccount(normalizedAccount: string): string {
    return crypto.createHmac("sha256", this.hmacSecret).update(normalizedAccount).digest("hex");
  }

  /**
   * Derives fixed-length 64-hex safe bounded representation for client IP.
   * Safe against key injection, IPv6 colons, and arbitrary header lengths.
   */
  public hashIp(rawIp: string): string {
    return crypto.createHash("sha256").update(rawIp.trim().toLowerCase()).digest("hex");
  }

  /**
   * Builds the Redis key with approved namespace:
   * rl:auth:<endpoint>:<dimension>:<digest>
   */
  public buildKey(endpoint: string, dimension: "ip" | "acc", digest: string): string {
    return `rl:auth:${endpoint}:${dimension}:${digest}`;
  }

  /**
   * Checks rate limit for the given request parameters.
   * Evaluates IP dimension first, then account dimension if applicable.
   * Fails open to local bounded in-memory fallback on Redis timeout or error.
   */
  public async checkRateLimit(params: {
    clientIp: string;
    accountIdentifier?: string;
    policy: EndpointPolicy;
  }): Promise<RateLimitDecision> {
    const { clientIp, accountIdentifier, policy } = params;
    const ipHash = this.hashIp(clientIp);

    // 1. Evaluate IP dimension
    const ipKey = this.buildKey(policy.endpointId, "ip", ipHash);
    const ipResult = await this.executeCounter(ipKey, policy.ipLimit, policy.ipWindowSec, ipHash);

    if (!ipResult.allowed) {
      return {
        allowed: false,
        dimension: ipResult.isFallback ? "fallback" : "ip",
        limit: ipResult.isFallback ? this.fallbackLimit : policy.ipLimit,
        remaining: 0,
        retryAfterSec: Math.max(1, ipResult.ttl),
        current: ipResult.current,
      };
    }

    // 2. Evaluate Account dimension (if policy defines accountLimit and identifier is provided)
    if (policy.accountLimit && policy.accountWindowSec && accountIdentifier) {
      const normalizedAccount = this.normalizeAccount(accountIdentifier);
      const accHash = this.hashAccount(normalizedAccount);
      const accKey = this.buildKey(policy.endpointId, "acc", accHash);

      const accResult = await this.executeCounter(accKey, policy.accountLimit, policy.accountWindowSec, ipHash);

      if (!accResult.allowed) {
        return {
          allowed: false,
          dimension: "account",
          limit: policy.accountLimit,
          remaining: 0,
          retryAfterSec: Math.max(1, accResult.ttl),
          current: accResult.current,
        };
      }
    }

    return {
      allowed: true,
      retryAfterSec: 0,
      remaining: Math.max(0, policy.ipLimit - ipResult.current),
      current: ipResult.current,
    };
  }

  /**
   * Executes atomic Lua script in Redis with strict timeout.
   * Falls back to local in-memory fallback if Redis fails or times out.
   */
  private async executeCounter(
    key: string,
    limit: number,
    windowSec: number,
    fallbackKey: string
  ): Promise<{ allowed: boolean; current: number; ttl: number; isFallback?: boolean }> {
    if (!this.redis) {
      return this.executeFallback(fallbackKey);
    }

    try {
      const redisPromise = this.redis.eval(FIXED_WINDOW_LUA_SCRIPT, 1, key, limit, windowSec);

      // Bounded command timeout prevents hanging Gateway event loop
      const result = await Promise.race([
        redisPromise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Redis command timed out after ${this.commandTimeoutMs}ms`)), this.commandTimeoutMs)
        ),
      ]);

      if (Array.isArray(result) && result.length >= 3) {
        const allowed = Number(result[0]) === 1;
        const current = Number(result[1]);
        const ttl = Number(result[2]);
        return { allowed, current, ttl, isFallback: false };
      }

      // Unexpected Redis output, fallback
      return this.executeFallback(fallbackKey);
    } catch (err: any) {
      this.handleRedisFailure("Redis operation failed", err);
      return this.executeFallback(fallbackKey);
    }
  }

  /**
   * Local bounded in-memory fallback.
   * Capacity: max 5,000 entries.
   * Evicts oldest entry when capacity is reached.
   * Limit: 10 requests / 60 seconds.
   */
  private executeFallback(key: string): { allowed: boolean; current: number; ttl: number; isFallback: boolean } {
    const now = Date.now();
    const existing = this.fallbackCache.get(key);

    if (existing && existing.expiresAt > now) {
      existing.count += 1;
      const ttlSec = Math.max(1, Math.ceil((existing.expiresAt - now) / 1000));
      const allowed = existing.count <= this.fallbackLimit;
      return { allowed, current: existing.count, ttl: ttlSec, isFallback: true };
    }

    // Clean up expired or add new entry
    if (this.fallbackCache.size >= this.fallbackCapacity) {
      // Evict oldest entry (first key in map)
      const oldestKey = this.fallbackCache.keys().next().value;
      if (oldestKey !== undefined) {
        this.fallbackCache.delete(oldestKey);
      }
    }

    const expiresAt = now + this.fallbackWindowSec * 1000;
    this.fallbackCache.set(key, { count: 1, expiresAt });
    return { allowed: true, current: 1, ttl: this.fallbackWindowSec, isFallback: true };
  }

  /**
   * Logs structured high-priority alert with rate-limiting throttling.
   */
  private handleRedisFailure(reason: string, error?: any): void {
    const now = Date.now();
    if (now - this.lastAlertTimestamp > this.alertThrottleMs) {
      this.lastAlertTimestamp = now;
      this.logger.error(
        {
          trace_id: "none",
          span_id: "none",
          request_id: "none",
          error_code: "ERR_RATE_LIMIT_REDIS_UNAVAILABLE",
        },
        "Redis rate limiting unavailable; falling back to local bounded in-memory limiter.",
        error instanceof Error ? error : new Error(String(error || reason)),
        { reason }
      );
    }
  }

  /**
   * For testing: clear in-memory fallback cache.
   */
  public clearFallbackCache(): void {
    this.fallbackCache.clear();
  }

  /**
   * For testing: get in-memory fallback cache size.
   */
  public getFallbackCacheSize(): number {
    return this.fallbackCache.size;
  }
}

/**
 * Creates Fastify preHandler hook for rate limiting authentication requests.
 * Extracts account identifier safely from JSON payload without corrupting stream forwarding.
 */
export function createRateLimitingPreHandler(rateLimiter: RateLimiter, logger: AGLogger) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<boolean> => {
    // Avoid double-evaluation if multiple hooks run on the same request
    if ((request as any).rateLimitEvaluated) {
      return false;
    }

    // Never rate-limit CORS preflight requests
    if (request.method === "OPTIONS") {
      return false;
    }

    const resolved = resolveEndpointPolicy(request.url);
    if (!resolved) {
      return false;
    }

    (request as any).rateLimitEvaluated = true;

    let extractedEmail: string | undefined;

    // Account extraction is only needed for endpoints that require account-level limits
    if (resolved.requiresAccount) {
      if (request.body && typeof (request.body as any).pipe === "function") {
        // Fastify httpProxy leaves request.body as a stream by default
        const chunks: Buffer[] = [];
        for await (const chunk of request.body as any) {
          chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
        }
        const buf = Buffer.concat(chunks);
        const contentType = (request.headers["content-type"] || "").toLowerCase();

        if (contentType.includes("application/json")) {
          try {
            const parsed = JSON.parse(buf.toString("utf8"));
            request.body = parsed; // reply-from transparently re-encodes JSON object
            if (parsed && typeof parsed.email === "string") {
              extractedEmail = parsed.email;
            }
          } catch {
            // Malformed JSON: keep raw buffer, fallback to IP-only rate limiting
            request.body = buf;
          }
        } else {
          // Binary protobuf or other content-type: keep raw buffer, IP-only rate limiting
          request.body = buf;
        }
      } else if (request.body && typeof request.body === "object") {
        if (typeof (request.body as any).email === "string") {
          extractedEmail = (request.body as any).email;
        }
      }
    }

    const clientIp = request.ip || "127.0.0.1";

    const decision = await rateLimiter.checkRateLimit({
      clientIp,
      accountIdentifier: extractedEmail,
      policy: resolved.policy,
    });

    if (!decision.allowed) {
      const retryAfter = Math.max(1, decision.retryAfterSec);
      reply.header("Retry-After", String(retryAfter));
      reply.header("Content-Type", "application/json; charset=utf-8");

      const logCtx: LogContext = (request as any).logCtx || {
        trace_id: "none",
        span_id: "none",
        request_id: request.id || "none",
      };

      logger.warn(
        {
          ...logCtx,
          error_code: "ERR_QUOTA_EXCEEDED",
        },
        `Rate limit exceeded on ${resolved.policy.endpointId} (${decision.dimension}) from IP hash ${rateLimiter.hashIp(clientIp)}`
      );

      const isConnectRpc =
        request.url.startsWith("/auth.v1.AuthService") ||
        Boolean(request.headers["connect-protocol-version"]);

      if (isConnectRpc) {
        reply.status(429).send({
          code: "resource_exhausted",
          message: "Rate limit exceeded. Please try again later.",
        });
      } else {
        reply.status(429).send({
          type: "https://ag-ide.local/errors/ERR_QUOTA_EXCEEDED",
          title: "ERR_QUOTA_EXCEEDED",
          status: 429,
          detail: "Rate limit exceeded. Please try again later.",
          instance: request.url,
          extensions: {
            retryAfter,
          },
        });
      }
      return true; // Request blocked
    }

    return false; // Request allowed
  };
}
