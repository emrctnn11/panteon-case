import type { Kysely } from 'kysely';

import { topCacheKey, weekEndsAt } from '../../core/week.js';
import { attachDisplayNames } from '../../db/players.js';
import type { Database } from '../../db/schema.js';
import { getCache, setCache } from '../../redis/cache.js';
import type { LeaderboardRedis } from '../../redis/client.js';
import { getPool } from '../../redis/pool.js';
import {
  getRange,
  getRankAndWindow,
  type LeaderboardEntry,
} from '../../redis/scoreboard.js';
import { TOP_DEFAULT_LIMIT } from './schema.js';

const TOP_CACHE_TTL_SECONDS = 5;

export interface LeaderboardServiceDeps {
  redis: LeaderboardRedis;
  db: Kysely<Database>;
}

export interface EnrichedEntry extends LeaderboardEntry {
  displayName: string;
}

export interface TopResult {
  entries: EnrichedEntry[];
  /** Current week's prize pool, integer minor units (invariant 1). Shared, not
   * personal, so it belongs on `/top` rather than `/me` (invariant 19). */
  pool: number;
  /** ISO instant of the next Monday 00:00 UTC rollover, for a client countdown. */
  weekEndsAt: string;
}

export interface MeResult {
  /** `null` when the player has no score yet this week — a normal state. */
  rank: number | null;
  entries: EnrichedEntry[];
}

export interface CombinedResult {
  top: TopResult;
  me: MeResult;
}

/**
 * Shared `/top` page (README §3.6). Every `(from, limit)` page is served
 * from/written to its own 5s Redis string cache — offset is free in the sorted
 * set (README §1), and per-page caching keeps the hot first page off Postgres
 * enrichment on every poll. Empty pages (past the end / absurd `from`) are not
 * cached, so a spray of large `?from=` values can't accumulate cache entries.
 */
export async function getTop(
  deps: LeaderboardServiceDeps,
  instant: Date,
  from: number,
  limit: number,
): Promise<TopResult> {
  const cacheKey = topCacheKey(instant, from, limit);

  const cached = await getCache(deps.redis, cacheKey);
  if (cached !== null) {
    return JSON.parse(cached) as TopResult;
  }

  const [entries, pool] = await Promise.all([
    getRange(deps.redis, instant, from, from + limit - 1),
    getPool(deps.redis, instant),
  ]);
  const result: TopResult = {
    entries: await attachDisplayNames(deps.db, entries),
    pool,
    weekEndsAt: weekEndsAt(instant).toISOString(),
  };

  if (entries.length > 0) {
    await setCache(
      deps.redis,
      cacheKey,
      JSON.stringify(result),
      TOP_CACHE_TTL_SECONDS,
    );
  }

  return result;
}

/**
 * Personal rank + surrounding window (README §3.6) — uncacheable, ~6 rows.
 */
export async function getMe(
  deps: LeaderboardServiceDeps,
  instant: Date,
  playerId: string,
): Promise<MeResult> {
  const window = await getRankAndWindow(deps.redis, instant, playerId);
  if (window === null) {
    return { rank: null, entries: [] };
  }

  return {
    rank: window.rank,
    entries: await attachDisplayNames(deps.db, window.entries),
  };
}

/** Combined top + me for the initial page load (README §3.6). */
export async function getCombined(
  deps: LeaderboardServiceDeps,
  instant: Date,
  playerId: string,
): Promise<CombinedResult> {
  const [top, me] = await Promise.all([
    getTop(deps, instant, 0, TOP_DEFAULT_LIMIT),
    getMe(deps, instant, playerId),
  ]);
  return { top, me };
}
