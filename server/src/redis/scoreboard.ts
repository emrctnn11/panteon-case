import { decodeEarnings, encodeScore } from '../core/score.js';
import { poolKey, weekKey } from '../core/week.js';
import type { LeaderboardRedis } from './client.js';

export interface WriteScoreResult {
  /** `false` if rejected as non-increasing (GT semantics, invariant 8). */
  applied: boolean;
  /** The player's current 0-based rank, returned either way (README §3.1). */
  rank: number;
}

export interface LeaderboardEntry {
  playerId: string;
  /** 0-based rank. */
  rank: number;
  rawEarnings: number;
}

export interface RankAndWindow {
  /** 0-based rank of the requesting player. */
  rank: number;
  /** Surrounding rows, in descending rank order, including the player themself. */
  entries: LeaderboardEntry[];
}

/**
 * Wraps `writeScore.lua`: encodes the composite score (`core/score.ts`, invariants
 * 2-4) and atomically writes the sorted set + pool counter in one script
 * (invariant 6). Rejects non-increasing totals for free (invariant 8).
 */
export async function writeScore(
  client: LeaderboardRedis,
  instant: Date,
  playerId: string,
  rawEarnings: number,
  minutesElapsed: number,
  poolMultiplier: number,
): Promise<WriteScoreResult> {
  const score = encodeScore(rawEarnings, minutesElapsed);
  const [applied, rank] = await client.writeScore(
    weekKey(instant),
    poolKey(instant),
    playerId,
    score,
    poolMultiplier,
  );
  return { applied: applied === 1, rank };
}

/**
 * Top `n` entries for the week, ranked. Plain `ZREVRANGE` — no Lua needed, this
 * isn't paired with another read the way rank+window is (invariant 7 is about
 * *that* pairing, not every ranking read). `n` is caller-controlled but never
 * request-controlled beyond a bounded default (invariant 20).
 */
export async function getTopN(
  client: LeaderboardRedis,
  instant: Date,
  n = 100,
): Promise<LeaderboardEntry[]> {
  const raw = await client.zrevrange(weekKey(instant), 0, n - 1, 'WITHSCORES');
  return toEntries(raw, 0);
}

/**
 * Wraps `readWindow.lua`: rank and surrounding window from a single atomic
 * snapshot (invariant 7) — a separate ZREVRANK + ZREVRANGE could straddle a
 * concurrent write and either shift the rank or omit the player from the window.
 */
export async function getRankAndWindow(
  client: LeaderboardRedis,
  instant: Date,
  playerId: string,
  above = 3,
  below = 2,
): Promise<RankAndWindow | null> {
  const reply = await client.readWindow(
    weekKey(instant),
    playerId,
    above,
    below,
  );
  if (reply === null) {
    return null;
  }
  const [rank, start, entries] = reply;
  return { rank, entries: toEntries(entries, start) };
}

/** `[member, score, member, score, ...]` → decoded entries, ranks starting at `startRank`. */
function toEntries(flat: string[], startRank: number): LeaderboardEntry[] {
  const entries: LeaderboardEntry[] = [];
  for (let i = 0; i < flat.length; i += 2) {
    const playerId = flat[i];
    const scoreStr = flat[i + 1];
    if (playerId === undefined || scoreStr === undefined) {
      throw new Error(`malformed ZREVRANGE WITHSCORES reply at index ${i}`);
    }
    entries.push({
      playerId,
      rank: startRank + entries.length,
      rawEarnings: decodeEarnings(Number(scoreStr)),
    });
  }
  return entries;
}
