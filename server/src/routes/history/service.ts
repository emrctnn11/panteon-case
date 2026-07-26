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

  return readSnapshot(deps, weekId);
}

/**
 * Reads a known-completed week's frozen top-100 snapshot. Callers must have
 * already established the week is `completed` — this does not re-check, so it is
 * shared by both `getWeekHistory` (checks first) and `getLatestWeekHistory`
 * (selects only completed weeks), without querying `payout_runs` twice.
 */
async function readSnapshot(
  deps: HistoryServiceDeps,
  weekId: string,
): Promise<HistoryResult> {
  const rows = await deps.db
    .selectFrom('weeklySnapshots')
    .select(['rank', 'playerId', 'earningsMinor', 'amountMinor'])
    .where('weekId', '=', weekId)
    .orderBy('rank', 'asc')
    .execute();

  return { weekId, entries: await attachDisplayNames(deps.db, rows) };
}

/**
 * The most recent `completed` week's frozen results — what the client's "Last
 * week" screen shows without having to derive an ISO week key itself (that
 * derivation is exactly the boundary bug README §3.3 warns about, so the id is
 * resolved server-side). `week_id` is zero-padded (`YYYY-Www`), so lexical
 * `desc` ordering is chronological. Returns `null` when no week has completed
 * yet — an empty completed week still returns a `HistoryResult` with `[]`.
 */
export async function getLatestWeekHistory(
  deps: HistoryServiceDeps,
): Promise<HistoryResult | null> {
  const latest = await deps.db
    .selectFrom('payoutRuns')
    .select('weekId')
    .where('status', '=', 'completed')
    .orderBy('weekId', 'desc')
    .limit(1)
    .executeTakeFirst();

  if (!latest) {
    return null;
  }

  return readSnapshot(deps, latest.weekId);
}
