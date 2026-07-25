import { poolKey } from '../core/week.js';
import type { LeaderboardRedis } from './client.js';

/**
 * Current prize pool for the week, in integer minor units (invariant 1 — the
 * counter is only ever written by `INCRBY` in `writeScore.lua`, never
 * `INCRBYFLOAT`). `0` if the week has no writes yet.
 */
export async function getPool(
  client: LeaderboardRedis,
  instant: Date,
): Promise<number> {
  const raw = await client.get(poolKey(instant));
  return raw === null ? 0 : Number(raw);
}
