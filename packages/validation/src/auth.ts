import { z } from 'zod';

// Validates the shape of our Access Token JWT payload
export const JWTPayloadSchema = z.object({
  iss: z.string(),
  aud: z.union([z.string(), z.array(z.string())]),
  nbf: z.number().optional(),
  iat: z.number(),
  exp: z.number(),
  jti: z.string(),
  sid: z.string().uuid(),
  sub: z.string().uuid(), // User ID
  org_id: z.string().uuid(), // Organization ID
  roles: z.array(z.string()), // ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER']
  amr: z.array(z.string()).optional(),
  azp: z.string().optional(),
});

export type JWTPayload = z.infer<typeof JWTPayloadSchema>;

// Internal Redis structure for Session Whitelist Tracking
export const RedisSessionSchema = z.object({
  user_id: z.string().uuid(),
  org_id: z.string().uuid(),
  current_jti: z.string(),
  expires_at: z.number(),
  device: z.string().optional(),
  ip: z.string().optional(),
});

export type RedisSession = z.infer<typeof RedisSessionSchema>;

// API Key Database Model
export const ApiKeySchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  org_id: z.string().uuid(),
  name: z.string(),
  key_hash: z.string(), // SHA-256 Hash of the raw secret
  prefix: z.string(), // 'ag_pat_'
  created_at: z.date(),
  expires_at: z.date().optional(),
  last_used_at: z.date().optional(),
});

export type ApiKey = z.infer<typeof ApiKeySchema>;
