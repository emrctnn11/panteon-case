import type { Db } from 'mongodb';

import { minutesElapsedInWeek, weekId } from '../../core/week.js';
import { logEvents } from '../../mongo/eventLog.js';
import type { LeaderboardRedis } from '../../redis/client.js';
import { writeScore } from '../../redis/scoreboard.js';

export interface ScoreServiceDeps {
  redis: LeaderboardRedis;
  mongoDb: Db;
  /** Live Mongo readiness — when false the event-log write is skipped entirely
   * so a down secondary store can't stall the hot path (invariant 21). */
  mongoReady: () => boolean;
  /** Called when the (non-critical) Mongo event-log write fails or is skipped —
   * CLAUDE.md invariant 21: Mongo must never fail a request. The error is logged
   * here, not swallowed (invariant 3), but never rethrown from `submitScore`. */
  logMongoError: (err: unknown) => void;
}

export interface SubmitScoreResult {
  applied: boolean;
  rank: number;
}

/**
 * Business logic for the score write path — HTTP-unaware. Derives the week
 * and minutes-elapsed server-side (invariants 4, 9), writes the composite
 * score + pool atomically via `writeScore.lua` (invariant 6), and logs the
 * outcome to the Mongo event log (README §2 — audit trail / recovery source).
 * The Redis write is the source of truth; the Mongo log is best-effort and
 * never fails the request (invariant 21).
 */
export async function submitScore(
  deps: ScoreServiceDeps,
  instant: Date,
  playerId: string,
  rawEarnings: number,
  poolMultiplier: number,
): Promise<SubmitScoreResult> {
  const minutesElapsed = minutesElapsedInWeek(instant);

  const { applied, rank } = await writeScore(
    deps.redis,
    instant,
    playerId,
    rawEarnings,
    minutesElapsed,
    poolMultiplier,
  );

  if (deps.mongoReady()) {
    try {
      await logEvents(deps.mongoDb, [
        {
          type: 'score_submission',
          playerId,
          weekId: weekId(instant),
          rawEarnings,
          minutesElapsed,
          applied,
          rank,
          occurredAt: instant,
        },
      ]);
    } catch (err) {
      deps.logMongoError(err);
    }
  } else {
    // Known-down: skip to keep the hot path fast. Not silent (invariant 3) — logged.
    deps.logMongoError(
      new Error('mongo event log skipped: connection not ready'),
    );
  }

  return { applied, rank };
}
