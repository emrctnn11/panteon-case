import { z } from 'zod';

/**
 * Boundary validation only (new-endpoint skill). `rawEarnings` is the sole
 * accepted field — no `minutesElapsed`, `week`, or `playerId`: those are
 * server-derived (invariants 4, 9) or come from the verified JWT, never the
 * body.
 */
export const scoreBodySchema = z.object({
  rawEarnings: z.number().int().nonnegative(),
});

export type ScoreBody = z.infer<typeof scoreBodySchema>;
