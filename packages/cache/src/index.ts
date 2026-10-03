import Redis from 'ioredis';
import { validateConfig } from '@ag/config';
import { RedisSession, RedisSessionSchema } from '@ag/validation';

const config = validateConfig(process.env);
export const redis = new Redis(config.REDIS_URL);

/**
 * Whitelist Session Manager using exact Redis commands.
 */
export class SessionManager {
  
  static async createSession(sid: string, data: RedisSession): Promise<void> {
    const key = `session:${sid}`;
    const ttlSeconds = Math.max(0, Math.floor((data.expires_at - Date.now()) / 1000));
    if (ttlSeconds > 0) {
      await redis.set(key, JSON.stringify(data), 'EX', ttlSeconds);
    }
  }

  static async getSession(sid: string): Promise<RedisSession | null> {
    const data = await redis.get(`session:${sid}`);
    if (!data) return null;
    
    const parsed = RedisSessionSchema.safeParse(JSON.parse(data));
    if (!parsed.success) return null;
    
    return parsed.data;
  }

  static async rotateJTI(sid: string, expectedJTI: string, newJTI: string): Promise<boolean> {
    // Lua script to atomically verify JTI and update it, preventing race conditions
    const script = `
      local data = redis.call("GET", KEYS[1])
      if not data then return 0 end
      local decoded = cjson.decode(data)
      if decoded.current_jti == ARGV[1] then
        decoded.current_jti = ARGV[2]
        redis.call("SET", KEYS[1], cjson.encode(decoded), "KEEPTTL")
        return 1
      end
      return 0
    `;
    const result = await redis.eval(script, 1, `session:${sid}`, expectedJTI, newJTI);
    return result === 1;
  }

  static async revokeSession(sid: string): Promise<void> {
    await redis.del(`session:${sid}`);
  }
}
