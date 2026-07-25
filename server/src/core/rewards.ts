/**
 * Reward distribution curve: pure, isolated. No framework, no db, no HTTP.
 *
 * Splits a prize pool across the top 100 ranks — a fixed podium plus a power-law
 * tail — in integer minor units, with the total landing exactly on the pool. The
 * curve shape and rounding rationale live in README §3.5; α is config, not a
 * constant, so it is passed in.
 */

/** Ranks 1–3, fixed by the brief. */
const PODIUM_PERCENT = [20, 15, 10] as const;
/** Ranks 4–TOP_N, shaped by the 1/i^α tail. */
const TAIL_PERCENT = 55;
/** Only the top 100 are paid. */
const TOP_N = 100;

export interface RewardDistribution {
  /** Award per rank in minor units; index 0 = rank 1. Length = min(rankedPlayerCount, TOP_N). */
  awards: number[];
  /** Σ awards. */
  distributed: number;
  /** pool − distributed: the absent ranks' unclaimed share, folded into next week (README §3.4). */
  rollover: number;
}

/**
 * Distribute `pool` (integer minor units) across the top ranks using the fixed
 * podium and the 1/i^α tail. The result sums to `pool` exactly when the ladder is
 * full; with fewer than TOP_N players the absent ranks' share becomes `rollover`.
 *
 * Rounding: floor each share, then hand the leftover units out one at a time in
 * rank order (rank 1 first). This keeps awards monotonically non-increasing —
 * largest-remainder rounding would be fairer in the abstract but can make a lower
 * rank out-earn a higher one on screen (README §3.5).
 *
 * @throws {RangeError} if pool/rankedPlayerCount are not non-negative integers, or alpha is not finite > 0.
 */
export function distributeRewards(
  pool: number,
  rankedPlayerCount: number,
  alpha: number,
): RewardDistribution {
  if (!Number.isInteger(pool) || pool < 0) {
    throw new RangeError(`pool must be a non-negative integer, got ${pool}`);
  }
  if (!Number.isInteger(rankedPlayerCount) || rankedPlayerCount < 0) {
    throw new RangeError(
      `rankedPlayerCount must be a non-negative integer, got ${rankedPlayerCount}`,
    );
  }
  if (!Number.isFinite(alpha) || alpha <= 0) {
    throw new RangeError(`alpha must be a finite number > 0, got ${alpha}`);
  }

  // Full 100-rank real-valued shares. The tail denominator is always the full
  // 97-rank sum, so a present player's award does not depend on how many players
  // rank below them.
  let denom = 0;
  for (let i = 4; i <= TOP_N; i++) {
    denom += Math.pow(i, -alpha);
  }

  const shares: number[] = [];
  for (const pct of PODIUM_PERCENT) {
    shares.push((pool * pct) / 100);
  }
  for (let i = 4; i <= TOP_N; i++) {
    shares.push((Math.pow(i, -alpha) / denom) * ((pool * TAIL_PERCENT) / 100));
  }

  const flooredAwards = shares.map((s) => Math.floor(s));

  // Exact total is guaranteed here: leftover comes from the integer floor-sum,
  // never from the float shares. It is in [0, TOP_N), so it is fully drained below.
  let leftover = pool - flooredAwards.reduce((a, b) => a + b, 0);
  const fullAwards = flooredAwards.map((award) => {
    if (leftover > 0) {
      leftover--;
      return award + 1;
    }
    return award;
  });
  if (leftover !== 0) {
    // Unreachable: signals a broken invariant rather than silently misallocating.
    throw new Error(`reward remainder not fully distributed: ${leftover} left`);
  }

  const n = Math.min(rankedPlayerCount, TOP_N);
  const awards = fullAwards.slice(0, n);
  const distributed = awards.reduce((a, b) => a + b, 0);

  return { awards, distributed, rollover: pool - distributed };
}
