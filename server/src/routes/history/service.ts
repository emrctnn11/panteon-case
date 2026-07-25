import type { Kysely } from 'kysely';

import { attachDisplayNames } from '../../db/players.js';
import type { Database } from '../../db/schema.js';

export interface HistoryServiceDeps {
  db: Kysely<Database>;
}

export interface HistoryEntry {
  rank: number;
  playerId: string;
  displayName: string;
  /** BIGINT minor units as returned by `pg` — kept as `string` to avoid
   * precision loss past 2^53 (`db/schema.ts`'s `Money` type, same reasoning). */
  earningsMinor: string;
  amountMinor: string;
}

export interface HistoryResult {
  weekId: string;
  entries: HistoryEntry[];
}

/**
 * Reads a completed week's frozen top-100 (README §3.4 — "the 'last week's
 * results' screen never touches Redis"). Returns `null` when the week was
 * never run or hasn't completed yet, distinct from a legitimately empty
 * completed week (zero ranked players), which returns an empty `entries`
 * array.
 */
export async function getWeekHistory(
  deps: HistoryServiceDeps,
  weekId: string,
): Promise<HistoryResult | null> {
  const run = await deps.db
    .selectFrom('payoutRuns')
    .select('status')
    .where('weekId', '=', weekId)
    .executeTakeFirst();

  if (!run || run.status !== 'completed') {
    return null;
  }

  const rows = await deps.db
    .selectFrom('weeklySnapshots')
    .select(['rank', 'playerId', 'earningsMinor', 'amountMinor'])
    .where('weekId', '=', weekId)
    .orderBy('rank', 'asc')
    .execute();

  return { weekId, entries: await attachDisplayNames(deps.db, rows) };
}
