import type { LeaderboardRedis } from './client.js';

/**
 * Payout lock (README §3.4). An optimisation only — if this worker's lock
 * outlives its TTL, a second worker can acquire the same key while the first
 * is still running. The real exactly-once guarantee is the `payout_runs`
 * `ON CONFLICT DO NOTHING` guard (CLAUDE.md invariant 11); this just avoids
 * redundant concurrent work in the common case.
 */
export async function acquireLock(
  client: LeaderboardRedis,
  key: string,
  token: string,
  ttlMs: number,
): Promise<boolean> {
  const result = await client.set(key, token, 'PX', ttlMs, 'NX');
  return result === 'OK';
}

/**
 * Wraps `releaseLock.lua`: only deletes the key if it still holds this
 * worker's token (compare-and-delete), so a lock re-acquired by another
 * worker after this one's TTL expired is never deleted out from under them.
 */
export async function releaseLock(
  client: LeaderboardRedis,
  key: string,
  token: string,
): Promise<void> {
  await client.releaseLock(key, token);
}
