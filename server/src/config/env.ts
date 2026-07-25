import { z } from 'zod';

/**
 * Environment is parsed and validated exactly once, here, at startup.
 * Business logic imports the typed `Config`; it never touches `process.env`.
 * Keep this schema minimal — do not add keys nothing reads yet (see CLAUDE.md conventions).
 */
const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().max(65535).default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  MONGODB_URI: z.string().url(),
});

export type Config = Readonly<z.infer<typeof envSchema>>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    // Fail fast and loud: a misconfigured process must not start.
    const details = parsed.error.issues
      .map(
        (issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`,
      )
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  return Object.freeze(parsed.data);
}
