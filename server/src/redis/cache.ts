import type { LeaderboardRedis } from './client.js';

/**
 * Thin string cache with a TTL — what README §1/§3.6 describes for the top-100
 * response (a single cached string, 5s, absorbed at nginx). Generic over the
 * key so callers decide what they're caching; not a general-purpose cache
 * layer beyond that.
 */
export async function getCache(
  client: LeaderboardRedis,
  key: string,
): Promise<string | null> {
  return client.get(key);
}

export async function setCache(
  client: LeaderboardRedis,
  key: string,
  value: string,
  ttlSeconds: number,
): Promise<void> {
  await client.set(key, value, 'EX', ttlSeconds);
}
