import { z } from 'zod';

/** Page size is capped at 100 so a single request's enrichment stays bounded
 * (invariant 20) regardless of how deep `from` reaches (README §1 — offset is
 * free in a sorted set; size is what must stay bounded). */
export const TOP_MAX_LIMIT = 100;
export const TOP_DEFAULT_LIMIT = 100;

export const topQuerySchema = z.object({
  from: z.coerce.number().int().min(0).default(0),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(TOP_MAX_LIMIT)
    .default(TOP_DEFAULT_LIMIT),
});

export type TopQuery = z.infer<typeof topQuerySchema>;
