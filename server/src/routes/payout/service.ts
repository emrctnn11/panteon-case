import { randomUUID } from 'node:crypto';

import type { Kysely } from 'kysely';
import { sql } from 'kysely';

import { distributeRewards } from '../../core/rewards.js';
import {
  poolKey,
  previousWeekInstant,
  weekId,
  weekKey,
} from '../../core/week.js';
import type { Database } from '../../db/schema.js';
import { getPool } from '../../redis/pool.js';
import { acquireLock, releaseLock } from '../../redis/lock.js';
import type { LeaderboardRedis } from '../../redis/client.js';
import { getRange } from '../../redis/scoreboard.js';

const LOCK_TTL_MS = 60_000;
const FROZEN_WEEK_TTL_SECONDS = 14 * 24 * 60 * 60;
const TOP_N = 100;

export interface PayoutServiceDeps {
  redis: LeaderboardRedis;
  db: Kysely<Database>;
}

export type PayoutStatus = 'completed' | 'already_run' | 'lock_held';

export interface PayoutResult {
  status: PayoutStatus;
  weekId: string;
  pool?: number;
  paidCount?: number;
}

function lockKey(week: string): string {
  return `lock:payout:${week}`;
}

/**
 * `distributeRewards` returns exactly one award per rank up to `rankedPlayerCount`
 * (`core/rewards.ts`), so `i < entries.length` always has a matching award — this
 * just satisfies `noUncheckedIndexedAccess` without silently coercing `undefined`.
 */
function awardAt(awards: readonly number[], i: number): number {
  const amount = awards[i];
  if (amount === undefined) {
    throw new Error(`distributeRewards produced no award for rank ${i + 1}`);
  }
  return amount;
}

/**
 * Closes out the given target week (README §3.4): claim → read the frozen
 * ladder → compute awards → one Postgres transaction → done. `instant` is
 * "now" — the target week is always `instant` minus one week (invariant 13,
 * `core/week.ts#previousWeekInstant`), never a request parameter.
 */
export async function runPayout(
  deps: PayoutServiceDeps,
  instant: Date,
  alpha: number,
): Promise<PayoutResult> {
  const previousInstant = previousWeekInstant(instant);
  const targetWeek = weekId(previousInstant);
  const lock = lockKey(targetWeek);
  const token = randomUUID();

  const acquired = await acquireLock(deps.redis, lock, token, LOCK_TTL_MS);
  if (!acquired) {
    return { status: 'lock_held', weekId: targetWeek };
  }

  try {
    return await claimAndPay(deps, instant, previousInstant, targetWeek, alpha);
  } finally {
    await releaseLock(deps.redis, lock, token);
  }
}

async function claimAndPay(
  deps: PayoutServiceDeps,
  instant: Date,
  previousInstant: Date,
  targetWeek: string,
  alpha: number,
): Promise<PayoutResult> {
  // Own statement, not the main transaction below — invariant 11: this is the
  // actual exactly-once guarantee, the Redis lock above is only an optimisation.
  const claim = await deps.db
    .insertInto('payoutRuns')
    .values({ weekId: targetWeek, status: 'claimed' })
    .onConflict((oc) => oc.column('weekId').doNothing())
    .executeTakeFirst();
  if (!claim || claim.numInsertedOrUpdatedRows !== 1n) {
    return { status: 'already_run', weekId: targetWeek };
  }

  const pool = await getPool(deps.redis, previousInstant);

  if (pool === 0) {
    // README §3.4 edge case: still marked completed, otherwise a retry would
    // loop indefinitely against the claim guard forever finding nothing to do.
    await deps.db
      .updateTable('payoutRuns')
      .set({
        status: 'completed',
        poolMinor: 0,
        completedAt: new Date().toISOString(),
      })
      .where('weekId', '=', targetWeek)
      .execute();
    return { status: 'completed', weekId: targetWeek, pool: 0, paidCount: 0 };
  }

  const entries = await getRange(deps.redis, previousInstant, 0, TOP_N - 1);
  const { awards, rollover } = distributeRewards(pool, entries.length, alpha);

  await deps.db.transaction().execute(async (trx) => {
    if (entries.length > 0) {
      await trx
        .insertInto('payouts')
        .values(
          entries.map((entry, i) => ({
            weekId: targetWeek,
            playerId: entry.playerId,
            rank: i + 1,
            amountMinor: awardAt(awards, i),
          })),
        )
        .execute();

      await trx
        .insertInto('balances')
        .values(
          entries.map((entry, i) => ({
            playerId: entry.playerId,
            balanceMinor: awardAt(awards, i),
          })),
        )
        .onConflict((oc) =>
          oc.column('playerId').doUpdateSet({
            balanceMinor: sql`balances.balance_minor + excluded.balance_minor`,
          }),
        )
        .execute();

      await trx
        .insertInto('weeklySnapshots')
        .values(
          entries.map((entry, i) => ({
            weekId: targetWeek,
            rank: i + 1,
            playerId: entry.playerId,
            earningsMinor: entry.rawEarnings,
            amountMinor: awardAt(awards, i),
          })),
        )
        .execute();
    }

    await trx
      .updateTable('payoutRuns')
      .set({
        status: 'completed',
        poolMinor: pool,
        completedAt: new Date().toISOString(),
      })
      .where('weekId', '=', targetWeek)
      .execute();
  });

  // Best-effort, outside the transaction: money of record is Postgres above,
  // this only feeds the *next* live Redis counter. A crash between the
  // transaction commit and this INCRBY would silently drop the rollover on
  // retry (the claim guard above blocks re-entry once completed) — an
  // accepted gap at this project's scope, same as README §3.1's earnings-
  // validation trade-off.
  if (rollover > 0) {
    await deps.redis.incrby(poolKey(instant), rollover);
  }

  // Reclaim both of the paid-out week's live keys together: the ladder and its
  // pool counter. `writeScore.lua` sets no expiry on either, so without this the
  // pool key would linger indefinitely after the sorted set is gone.
  await deps.redis.expire(weekKey(previousInstant), FROZEN_WEEK_TTL_SECONDS);
  await deps.redis.expire(poolKey(previousInstant), FROZEN_WEEK_TTL_SECONDS);

  return {
    status: 'completed',
    weekId: targetWeek,
    pool,
    paidCount: entries.length,
  };
}
