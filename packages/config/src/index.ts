import { z } from "zod";

export const ConfigSchema = z.object({
  PORT: z.coerce.number().default(8080),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  REDIS_URL: z.string().url().default("redis://localhost:6379"),
  POSTGRES_URL: z.string().url().default("postgres://ag_user:ag_password@localhost:5432/ag_ide"),
  JWT_SECRET: z.string().min(32),
  SMTP_URL: z.string().optional(),
  FROM_EMAIL: z.string().email().optional(),
});

export type Config = z.infer<typeof ConfigSchema>;

// In a real application, we would use process.env, but strictly fail if invalid.
export function validateConfig(env: Record<string, string | undefined>): Config {
  const result = ConfigSchema.safeParse(env);
  if (!result.success) {
    console.error("❌ Invalid environment variables:", result.error.format());
    process.exit(1);
  }
  return result.data;
}
