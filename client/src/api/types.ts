/**
 * Duplicated from server/src/redis/scoreboard.ts and routes/leaderboard/service.ts.
 * Client and server are separate projects with no shared build step (CLAUDE.md) —
 * these shapes are copied explicitly, not imported.
 */
export interface LeaderboardEntry {
  playerId: string;
  rank: number;
  rawEarnings: number;
  displayName: string;
}

export interface TopResult {
  entries: LeaderboardEntry[];
  /** Current week's prize pool, integer minor units. */
  pool: number;
  /** ISO instant of the next Monday 00:00 UTC rollover. */
  weekEndsAt: string;
}

export interface MeResult {
  /** `null` when the player has no score yet this week. */
  rank: number | null;
  entries: LeaderboardEntry[];
}

/**
 * Duplicated from server/src/routes/history/service.ts. Money-scale fields are
 * `string` (BIGINT minor units): the server keeps them as strings to avoid
 * precision loss past 2^53, so the client receives and displays them as-is,
 * converting to number only at the presentation boundary.
 */
export interface HistoryEntry {
  rank: number;
  playerId: string;
  displayName: string;
  earningsMinor: string;
  amountMinor: string;
}

export interface HistoryResult {
  weekId: string;
  entries: HistoryEntry[];
}
