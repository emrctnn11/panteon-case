import { z } from 'zod';

/**
 * Allowed page sizes. `limit` is an allowlist rather than a free `1..100` range
 * so the `(from, limit)` cache key can't be driven to unbounded cardinality by
 * a hostile query (README §3.6). The client only ever sends 20; 100 stays in
 * the set so the combined endpoint's `TOP_DEFAULT_LIMIT` page still validates.
 * Enrichment stays bounded (invariant 20) since the largest entry is 100.
 */
export const ALLOWED_LIMITS = [20, 50, 100] as const;
export const TOP_DEFAULT_LIMIT = 100;

/** Upper bound on `from` — demo scale (~750k seeded) fits well under this; in
 * production (2M+ players) raise it to the actual player count. Anything past
 * it is an absurd/hostile offset and is rejected. See README (pagination). */
export const TOP_MAX_FROM = 1_000_000;

/**
 * `from` is snapped to a multiple of `limit` **server-side** (never trusting the
 * client) so only aligned page offsets (0, limit, 2·limit, …) exist. Two users
 * requesting the same page land on the same cache key — the cache is genuinely
 * shared — and cardinality collapses to (aligned pages × allowed limits).
 * Done as an object-level transform because the snap depends on `limit`.
 */
export const topQuerySchema = z
  .object({
    from: z.coerce.number().int().min(0).max(TOP_MAX_FROM).default(0),
    limit: z.coerce
      .number()
      .int()
      .refine(
        (v): v is (typeof ALLOWED_LIMITS)[number] =>
          (ALLOWED_LIMITS as readonly number[]).includes(v),
        { message: `limit must be one of ${ALLOWED_LIMITS.join(', ')}` },
      )
      .default(TOP_DEFAULT_LIMIT),
  })
  .transform(({ from, limit }) => ({
    from: Math.floor(from / limit) * limit,
    limit,
  }));

export type TopQuery = z.infer<typeof topQuerySchema>;
