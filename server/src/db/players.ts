import type { Kysely } from 'kysely';

import type { Database } from './schema.js';

export interface PlayerProfile {
  displayName: string;
}

/**
 * Bounded profile lookup for leaderboard enrichment (invariant 20 — callers
 * pass at most the ~100 top rows or the ~6 window rows, never an unbounded
 * player list). One `WHERE player_id IN (...)` round trip.
 */
export async function getPlayerProfiles(
  db: Kysely<Database>,
  playerIds: readonly string[],
): Promise<Map<string, PlayerProfile>> {
  if (playerIds.length === 0) {
    return new Map();
  }

  const rows = await db
    .selectFrom('players')
    .select(['playerId', 'displayName'])
    .where('playerId', 'in', playerIds as string[])
    .execute();

  return new Map(
    rows.map((row) => [row.playerId, { displayName: row.displayName }]),
  );
}

interface WithPlayerId {
  playerId: string;
}

/**
 * Attaches `displayName` to any ranked/scored row shape that carries a
 * `playerId`. Falls back to the bare player id when Postgres has no matching
 * row yet (e.g. replication lag on a brand-new player) — a deliberate
 * default, not a silently swallowed error. Shared by every read endpoint
 * that enriches Redis or `weekly_snapshots` rows with a display name.
 */
export async function attachDisplayNames<T extends WithPlayerId>(
  db: Kysely<Database>,
  entries: readonly T[],
): Promise<(T & { displayName: string })[]> {
  const profiles = await getPlayerProfiles(
    db,
    entries.map((e) => e.playerId),
  );
  return entries.map((e) => ({
    ...e,
    displayName: profiles.get(e.playerId)?.displayName ?? e.playerId,
  }));
}
