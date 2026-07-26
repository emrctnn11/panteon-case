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
  JWT_SECRET: z.string().min(32),
  /** Integer minor units of pool credited per earnings unit (README §3.1's "2%"). Config, not a magic constant. */
  SCORE_POOL_MULTIPLIER: z.coerce.number().int().positive().default(2),
  /** Shared secret for the EventBridge-triggered payout endpoint (no player identity involved). */
  INTERNAL_PAYOUT_SECRET: z.string().min(32),
  /** Reward curve exponent α (README §3.5) — config, not a constant, so it can be retuned without a deploy. */
  PAYOUT_CURVE_ALPHA: z.coerce.number().positive().default(1),
  /**
   * Enables the demo-only `POST /api/dev/token` (mints a player JWT for any id
   * so a reviewer can "view as" a seeded account and see the personal window).
   * OFF by default and **must stay off in production** — it is an auth bypass.
   * String enum, not `z.coerce.boolean()`, because coercion treats "false" as true.
   */
  DEMO_MODE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
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
