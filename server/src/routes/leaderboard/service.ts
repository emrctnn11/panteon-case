import type { Kysely } from 'kysely';

import { topCacheKey } from '../../core/week.js';
import { attachDisplayNames } from '../../db/players.js';
import type { Database } from '../../db/schema.js';
import { getCache, setCache } from '../../redis/cache.js';
import type { LeaderboardRedis } from '../../redis/client.js';
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
 * Shared top-N page (README §3.6). Only the exact default page
 * (`from=0, limit=TOP_DEFAULT_LIMIT`) is served from/written to the 5s Redis
 * string cache — every other page bypasses it and reads Redis live, which is
 * cheap regardless of offset (README §1).
 */
export async function getTop(
  deps: LeaderboardServiceDeps,
  instant: Date,
  from: number,
  limit: number,
): Promise<TopResult> {
  const isDefaultPage = from === 0 && limit === TOP_DEFAULT_LIMIT;

  if (isDefaultPage) {
    const cached = await getCache(deps.redis, topCacheKey(instant));
    if (cached !== null) {
      return JSON.parse(cached) as TopResult;
    }
  }

  const entries = await getRange(deps.redis, instant, from, from + limit - 1);
  const result: TopResult = {
    entries: await attachDisplayNames(deps.db, entries),
  };

  if (isDefaultPage) {
    await setCache(
      deps.redis,
      topCacheKey(instant),
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
