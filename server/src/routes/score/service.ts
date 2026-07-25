import type { Db } from 'mongodb';

import { minutesElapsedInWeek, weekId } from '../../core/week.js';
import { logEvents } from '../../mongo/eventLog.js';
import type { LeaderboardRedis } from '../../redis/client.js';
import { writeScore } from '../../redis/scoreboard.js';

export interface ScoreServiceDeps {
  redis: LeaderboardRedis;
  mongoDb: Db;
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

  return { applied, rank };
}
