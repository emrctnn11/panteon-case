import { z } from 'zod';

/**
 * `playerId` is the JWT `sub`. Loose but bounded: any non-empty id (seeded
 * accounts look like `p000123` or `test-rank-102`), length-capped so the demo
 * endpoint can't be used to mint absurd tokens.
 */
export const devTokenBodySchema = z.object({
  playerId: z.string().min(1).max(64),
});

export type DevTokenBody = z.infer<typeof devTokenBodySchema>;
