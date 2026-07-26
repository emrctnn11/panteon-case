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
