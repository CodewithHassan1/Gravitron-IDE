import crypto from 'crypto';
import { FastifyRequest, FastifyReply } from 'fastify';
import { AGLogger, LogContext } from '@ag/logger';
import { redis as defaultRedis } from '@ag/cache';

export interface RateLimiterRedisClient {
  eval(script: string, numKeys: number, ...args: (string | number)[]): Promise<any>;
  on?(event: string, listener: (...args: any[]) => void): this;
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
  dimension?: 'ip' | 'account' | 'fallback';
  limit?: number;
  remaining?: number;
  retryAfterSec: number;
  current?: number;
}

export interface RateLimiterOptions {
  redisClient?: RateLimiterRedisClient;
  logger?: AGLogger;
  hmacSecret?: string;
  commandTimeoutMs?: number;
  alertThrottleMs?: number;
  fallbackCapacity?: number;
  fallbackLimit?: number;
  fallbackWindowSec?: number;
  keyPrefix?: string;
}

interface FallbackEntry {
  count: number;
  expiresAt: number;
}

/**
 * Approved Rate Limiting Policies for all authentication endpoints.
 * Shared across ConnectRPC and REST aliases.
 */
export const AUTH_RATE_LIMIT_POLICIES: Record<string, EndpointPolicy> = {
  login: {
    endpointId: 'login',
    ipLimit: 20,
    ipWindowSec: 900, // 15 min
    accountLimit: 5,
    accountWindowSec: 900, // 15 min
  },
  register: {
    endpointId: 'register',
    ipLimit: 5,
    ipWindowSec: 3600, // 1 hr
  },
  forgotPassword: {
    endpointId: 'forgotPassword',
    ipLimit: 10,
    ipWindowSec: 900, // 15 min
    accountLimit: 3,
    accountWindowSec: 900, // 15 min
  },
  resetPassword: {
    endpointId: 'resetPassword',
    ipLimit: 10,
    ipWindowSec: 900, // 15 min
  },
  resendVerification: {
    endpointId: 'resendVerification',
    ipLimit: 10,
    ipWindowSec: 900, // 15 min
  },
  refresh: {
    endpointId: 'refresh',
    ipLimit: 60,
    ipWindowSec: 60, // 1 min
  },
};

/**
 * Maps incoming request URL paths to their corresponding approved EndpointPolicy.
 * Both ConnectRPC and REST aliases share the exact same logical policy and Redis counters.
 */
export function resolveEndpointPolicy(
  urlPath: string
): { policy: EndpointPolicy; requiresAccount: boolean } | null {
  const path = urlPath.split('?')[0].replace(/\/+$/, '');

  // Password Login (and deprecated OIDC Login)
  if (
    path === '/auth.v1.AuthService/PasswordLogin' ||
    path === '/api/v1/auth/passwordLogin' ||
    path === '/auth.v1.AuthService/Login'
  ) {
    return { policy: AUTH_RATE_LIMIT_POLICIES.login, requiresAccount: true };
  }

  // Register
  if (path === '/auth.v1.AuthService/Register' || path === '/api/v1/auth/register') {
    return { policy: AUTH_RATE_LIMIT_POLICIES.register, requiresAccount: false };
  }

  // Forgot Password
  if (path === '/auth.v1.AuthService/ForgotPassword' || path === '/api/v1/auth/forgotPassword') {
    return { policy: AUTH_RATE_LIMIT_POLICIES.forgotPassword, requiresAccount: true };
  }

  // Reset Password
  if (path === '/auth.v1.AuthService/ResetPassword' || path === '/api/v1/auth/resetPassword') {
    return { policy: AUTH_RATE_LIMIT_POLICIES.resetPassword, requiresAccount: false };
  }

  // Resend Verification
  if (
    path === '/auth.v1.AuthService/ResendVerification' ||
    path === '/api/v1/auth/resendVerification'
  ) {
    return { policy: AUTH_RATE_LIMIT_POLICIES.resendVerification, requiresAccount: false };
  }

  // Refresh
  if (path === '/auth.v1.AuthService/Refresh' || path === '/api/v1/auth/refresh') {
    return { policy: AUTH_RATE_LIMIT_POLICIES.refresh, requiresAccount: false };
  }

  return null;
}

/**
 * Atomic Redis Lua Script for Fixed-Window Rate Limiting.
 * Returns [allowed (1 or 0), current_count, ttl_remaining].
 */
const FIXED_WINDOW_LUA_SCRIPT = `
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])

local current = redis.call('INCR', key)

if current == 1 then
    redis.call('EXPIRE', key, window)
end

local ttl = redis.call('TTL', key)
if ttl == -1 then
    redis.call('EXPIRE', key, window)
    ttl = window
end

local allowed = 1
if current > limit then
    allowed = 0
end

return {allowed, current, ttl}
`;

export class RateLimiter {
  private redis?: RateLimiterRedisClient;
  private readonly commandTimeoutMs: number;
  private readonly logger: AGLogger;
  private readonly hmacSecret: string;
  private readonly keyPrefix: string;

  // Local bounded in-memory LRU fallback
  // Note: This fallback is instance-local and NOT distributed across Gateway replicas.
  private fallbackCache = new Map<string, FallbackEntry>();
  private readonly fallbackCapacity: number;
  private readonly fallbackLimit: number;
  private readonly fallbackWindowSec: number;

  // Observability & alert throttling
  private lastAlertTimestamp = 0;
  private readonly alertThrottleMs = 60000; // 1 alert per minute max

  constructor(options: RateLimiterOptions = {}) {
    this.redis = options.redisClient !== undefined ? options.redisClient : defaultRedis;
    this.commandTimeoutMs = options.commandTimeoutMs ?? 50;
    this.logger = options.logger ?? new AGLogger('gateway:rate-limiter', '1.0.0');

    // SEC-TEST-01: Key prefix configuration with fallback to environment and safe validation
    let prefix = options.keyPrefix;
    if (prefix === undefined && process.env.RATE_LIMIT_KEY_PREFIX !== undefined) {
      prefix = process.env.RATE_LIMIT_KEY_PREFIX;
    }

    if (prefix !== undefined) {
      if (typeof prefix !== 'string' || prefix.trim().length === 0) {
        throw new Error('RATE_LIMIT_KEY_PREFIX must be a non-empty string');
      }
      this.keyPrefix = prefix.trim();
    } else {
      this.keyPrefix = 'rl:auth';
    }

    this.fallbackCapacity = options.fallbackCapacity ?? 5000;
    this.fallbackLimit = options.fallbackLimit ?? 10;
    this.fallbackWindowSec = options.fallbackWindowSec ?? 60;

    // DEF-03: Shared HMAC secret validation
    if (options.hmacSecret) {
      if (options.hmacSecret.length < 32) {
        throw new Error('RATE_LIMIT_HMAC_SECRET must be at least 32 characters long');
      }
      this.hmacSecret = options.hmacSecret;
    } else if (process.env.RATE_LIMIT_HMAC_SECRET) {
      if (process.env.RATE_LIMIT_HMAC_SECRET.length < 32) {
        throw new Error('RATE_LIMIT_HMAC_SECRET must be at least 32 characters long');
      }
      this.hmacSecret = process.env.RATE_LIMIT_HMAC_SECRET;
    } else {
      if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging') {
        const errMsg =
          'FATAL: RATE_LIMIT_HMAC_SECRET is required in production and must be at least 32 characters long. Refusing to start with ephemeral key.';
        this.logger.error(
          { trace_id: 'none', span_id: 'none', request_id: 'none', error_code: 'ERR_CONFIG_INVALID' },
          errMsg
        );
        throw new Error(errMsg);
      }
      this.hmacSecret = crypto.randomBytes(32).toString('hex');
      this.logger.warn(
        { trace_id: 'none', span_id: 'none', request_id: 'none' },
        'RATE_LIMIT_HMAC_SECRET is not configured. Ephemeral HMAC key generated for dev/test; multi-replica account rate limits will not share digests.'
      );
    }

    // Attach error listener to prevent unhandled EventEmitter error events
    if (this.redis && typeof this.redis.on === 'function') {
      this.redis.on('error', (err: any) => {
        this.handleRedisFailure('Redis client emitted error', err);
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
    return crypto.createHmac('sha256', this.hmacSecret).update(normalizedAccount).digest('hex');
  }

  /**
   * Derives fixed-length 64-hex safe bounded representation for client IP.
   * Safe against key injection, IPv6 colons, and arbitrary header lengths.
   */
  public hashIp(rawIp: string): string {
    return crypto.createHash('sha256').update(rawIp.trim().toLowerCase()).digest('hex');
  }

  /**
   * Returns the active Redis key prefix.
   */
  public getKeyPrefix(): string {
    return this.keyPrefix;
  }

  /**
   * Builds the Redis key with approved namespace:
   * <keyPrefix>:<endpoint>:<dimension>:<digest>
   */
  public buildKey(endpoint: string, dimension: 'ip' | 'acc', digest: string): string {
    return `${this.keyPrefix}:${endpoint}:${dimension}:${digest}`;
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

    // 1. Evaluate IP dimension (DEF-01: isolated fallback key)
    const ipKey = this.buildKey(policy.endpointId, 'ip', ipHash);
    const ipFallbackKey = `ip:${ipHash}`;
    const ipFallbackLimit = Math.min(policy.ipLimit, this.fallbackLimit);
    const ipFallbackWindow = Math.min(policy.ipWindowSec, this.fallbackWindowSec);

    const ipResult = await this.executeCounter(
      ipKey,
      policy.ipLimit,
      policy.ipWindowSec,
      ipFallbackKey,
      ipFallbackLimit,
      ipFallbackWindow
    );

    if (!ipResult.allowed) {
      return {
        allowed: false,
        dimension: ipResult.isFallback ? 'fallback' : 'ip',
        limit: ipResult.isFallback ? ipFallbackLimit : policy.ipLimit,
        remaining: 0,
        retryAfterSec: Math.max(1, ipResult.ttl),
        current: ipResult.current,
      };
    }

    // 2. Evaluate Account dimension (if policy defines accountLimit and identifier is provided)
    if (policy.accountLimit && policy.accountWindowSec && accountIdentifier) {
      const normalizedAccount = this.normalizeAccount(accountIdentifier);
      const accHash = this.hashAccount(normalizedAccount);
      const accKey = this.buildKey(policy.endpointId, 'acc', accHash);
      const accFallbackKey = `acc:${policy.endpointId}:${accHash}`;
      const accFallbackLimit = Math.min(policy.accountLimit, this.fallbackLimit);
      const accFallbackWindow = Math.min(policy.accountWindowSec, this.fallbackWindowSec);

      const accResult = await this.executeCounter(
        accKey,
        policy.accountLimit,
        policy.accountWindowSec,
        accFallbackKey,
        accFallbackLimit,
        accFallbackWindow
      );

      if (!accResult.allowed) {
        return {
          allowed: false,
          dimension: 'account',
          limit: accResult.isFallback ? accFallbackLimit : policy.accountLimit,
          remaining: 0,
          retryAfterSec: Math.max(1, accResult.ttl),
          current: accResult.current,
        };
      }

      // Return remaining for both dimensions
      const accRemaining = Math.max(0, policy.accountLimit - accResult.current);
      const ipRemaining = Math.max(0, policy.ipLimit - ipResult.current);
      return {
        allowed: true,
        limit: policy.accountLimit,
        remaining: Math.min(ipRemaining, accRemaining),
        retryAfterSec: 0,
        current: accResult.current,
      };
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
    fallbackKey: string,
    fallbackLimit: number = this.fallbackLimit,
    fallbackWindowSec: number = this.fallbackWindowSec
  ): Promise<{ allowed: boolean; current: number; ttl: number; isFallback?: boolean }> {
    if (!this.redis) {
      return this.executeFallback(fallbackKey, fallbackLimit, fallbackWindowSec);
    }

    try {
      const redisPromise = this.redis.eval(FIXED_WINDOW_LUA_SCRIPT, 1, key, limit, windowSec);

      // Bounded command timeout prevents hanging Gateway event loop
      const result = await Promise.race([
        redisPromise,
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`Redis command timed out after ${this.commandTimeoutMs}ms`)),
            this.commandTimeoutMs
          )
        ),
      ]);

      if (Array.isArray(result) && result.length >= 3) {
        const allowed = Number(result[0]) === 1;
        const current = Number(result[1]);
        const ttl = Number(result[2]);
        return { allowed, current, ttl, isFallback: false };
      }

      // Unexpected Redis output, fallback
      return this.executeFallback(fallbackKey, fallbackLimit, fallbackWindowSec);
    } catch (err: any) {
      this.handleRedisFailure('Redis operation failed', err);
      return this.executeFallback(fallbackKey, fallbackLimit, fallbackWindowSec);
    }
  }

  /**
   * Local bounded in-memory LRU fallback (DEF-02).
   * Capacity: max 5,000 entries.
   * Evicts least recently used entry when capacity is reached.
   */
  private executeFallback(
    key: string,
    limit: number = this.fallbackLimit,
    windowSec: number = this.fallbackWindowSec
  ): {
    allowed: boolean;
    current: number;
    ttl: number;
    isFallback: boolean;
  } {
    const now = Date.now();
    const existing = this.fallbackCache.get(key);

    if (existing) {
      // LRU refresh: remove so re-insertion places entry at MRU (tail of iteration)
      this.fallbackCache.delete(key);

      if (existing.expiresAt > now) {
        existing.count += 1;
        this.fallbackCache.set(key, existing);
        const ttlSec = Math.max(1, Math.ceil((existing.expiresAt - now) / 1000));
        const allowed = existing.count <= limit;
        return { allowed, current: existing.count, ttl: ttlSec, isFallback: true };
      }
      // If expired, fall through to create fresh entry
    }

    // Capacity enforcement: evict least recently used (first key in map)
    while (this.fallbackCache.size >= this.fallbackCapacity) {
      const oldestKey = this.fallbackCache.keys().next().value;
      if (oldestKey === undefined) break;
      this.fallbackCache.delete(oldestKey);
    }

    const expiresAt = now + windowSec * 1000;
    this.fallbackCache.set(key, { count: 1, expiresAt });
    return { allowed: true, current: 1, ttl: windowSec, isFallback: true };
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
          trace_id: 'none',
          span_id: 'none',
          request_id: 'none',
          error_code: 'ERR_RATE_LIMIT_REDIS_UNAVAILABLE',
        },
        'Redis rate limiting unavailable; falling back to local bounded in-memory limiter.',
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

  /**
   * For testing: get keys in in-memory fallback cache in iteration (LRU) order.
   */
  public getFallbackKeys(): string[] {
    return Array.from(this.fallbackCache.keys());
  }

  /**
   * For testing: get entry from fallback cache.
   */
  public getFallbackEntry(key: string): FallbackEntry | undefined {
    return this.fallbackCache.get(key);
  }
}

/**
 * Maximum allowed authentication request payload size (64 KiB) for DEF-04.
 */
export const MAX_AUTH_PAYLOAD_BYTES = 64 * 1024; // 64 KiB

/**
 * Sends protocol-compliant 413 Payload Too Large response and logs alert.
 */
export function sendPayloadTooLarge(
  request: FastifyRequest,
  reply: FastifyReply,
  logger: AGLogger,
  endpointId: string
): boolean {
  reply.header('Content-Type', 'application/json; charset=utf-8');

  const logCtx: LogContext = (request as any).logCtx || {
    trace_id: 'none',
    span_id: 'none',
    request_id: request.id || 'none',
  };

  logger.warn(
    {
      ...logCtx,
      error_code: 'ERR_PAYLOAD_TOO_LARGE',
    },
    `Authentication payload exceeded maximum limit of ${MAX_AUTH_PAYLOAD_BYTES} bytes on ${endpointId}`
  );

  const isConnectRpc =
    request.url.startsWith('/auth.v1.AuthService') ||
    Boolean(request.headers['connect-protocol-version']);

  if (isConnectRpc) {
    reply.status(413).send({
      code: 'resource_exhausted',
      message: `Payload too large. Maximum allowed authentication payload size is ${MAX_AUTH_PAYLOAD_BYTES} bytes.`,
    });
  } else {
    reply.status(413).send({
      type: 'https://ag-ide.local/errors/ERR_PAYLOAD_TOO_LARGE',
      title: 'ERR_PAYLOAD_TOO_LARGE',
      status: 413,
      detail: `Payload too large. Maximum allowed authentication payload size is ${MAX_AUTH_PAYLOAD_BYTES} bytes.`,
      instance: request.url,
    });
  }

  return true; // Request blocked, abort pipeline
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
    if (request.method === 'OPTIONS') {
      return false;
    }

    const resolved = resolveEndpointPolicy(request.url);
    if (!resolved) {
      return false;
    }

    (request as any).rateLimitEvaluated = true;

    // DEF-04: Early rejection of oversized declared Content-Length
    const rawContentLength = request.headers['content-length'];
    if (rawContentLength) {
      const declaredLen = parseInt(rawContentLength, 10);
      if (!Number.isNaN(declaredLen) && declaredLen > MAX_AUTH_PAYLOAD_BYTES) {
        return sendPayloadTooLarge(request, reply, logger, resolved.policy.endpointId);
      }
    }

    let extractedEmail: string | undefined;

    // DEF-04: Bounded stream chunk consumption
    if (request.body && typeof (request.body as any).pipe === 'function') {
      const chunks: Buffer[] = [];
      let accumulatedBytes = 0;
      let exceeded = false;

      for await (const chunk of request.body as any) {
        const bufChunk = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
        accumulatedBytes += bufChunk.length;
        if (accumulatedBytes > MAX_AUTH_PAYLOAD_BYTES) {
          exceeded = true;
          // Immediately abort stream to halt chunk reception
          if (typeof (request.body as any).destroy === 'function') {
            (request.body as any).destroy();
          }
          break;
        }
        chunks.push(bufChunk);
      }

      if (exceeded) {
        return sendPayloadTooLarge(request, reply, logger, resolved.policy.endpointId);
      }

      const buf = Buffer.concat(chunks);
      const contentType = (request.headers['content-type'] || '').toLowerCase();

      if (contentType.includes('application/json')) {
        try {
          const parsed = JSON.parse(buf.toString('utf8'));
          request.body = parsed; // reply-from transparently re-encodes JSON object
          if (resolved.requiresAccount && parsed && typeof parsed.email === 'string') {
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
    } else if (Buffer.isBuffer(request.body)) {
      if (request.body.length > MAX_AUTH_PAYLOAD_BYTES) {
        return sendPayloadTooLarge(request, reply, logger, resolved.policy.endpointId);
      }
    } else if (typeof request.body === 'string') {
      if (Buffer.byteLength(request.body) > MAX_AUTH_PAYLOAD_BYTES) {
        return sendPayloadTooLarge(request, reply, logger, resolved.policy.endpointId);
      }
    } else if (request.body && typeof request.body === 'object') {
      if (resolved.requiresAccount && typeof (request.body as any).email === 'string') {
        extractedEmail = (request.body as any).email;
      }
    }

    const clientIp = request.ip || '127.0.0.1';

    const decision = await rateLimiter.checkRateLimit({
      clientIp,
      accountIdentifier: extractedEmail,
      policy: resolved.policy,
    });

    if (!decision.allowed) {
      const retryAfter = Math.max(1, decision.retryAfterSec);
      reply.header('Retry-After', String(retryAfter));
      reply.header('Content-Type', 'application/json; charset=utf-8');

      const logCtx: LogContext = (request as any).logCtx || {
        trace_id: 'none',
        span_id: 'none',
        request_id: request.id || 'none',
      };

      logger.warn(
        {
          ...logCtx,
          error_code: 'ERR_QUOTA_EXCEEDED',
        },
        `Rate limit exceeded on ${resolved.policy.endpointId} (${decision.dimension}) from IP hash ${rateLimiter.hashIp(clientIp)}`
      );

      const isConnectRpc =
        request.url.startsWith('/auth.v1.AuthService') ||
        Boolean(request.headers['connect-protocol-version']);

      if (isConnectRpc) {
        reply.status(429).send({
          code: 'resource_exhausted',
          message: 'Rate limit exceeded. Please try again later.',
        });
      } else {
        reply.status(429).send({
          type: 'https://ag-ide.local/errors/ERR_QUOTA_EXCEEDED',
          title: 'ERR_QUOTA_EXCEEDED',
          status: 429,
          detail: 'Rate limit exceeded. Please try again later.',
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
