/**
 * Composite score: pure, isolated arithmetic. No framework, no db, no HTTP.
 *
 * Packs raw earnings and a tie-break timing term into a single integer that Redis
 * can sort. See README §3.2 for the bit-budget reasoning behind SHIFT = 2^14.
 */

/** 2^14 — one earnings unit outweighs any possible timing advantage. README §3.2. */
export const SHIFT = 16384;

/** Minutes in a UTC week. README §3.3 (always exactly this in UTC). */
export const WEEK_MINUTES = 10080;

/**
 * Largest raw earnings whose packed score stays an exact IEEE-754 integer.
 * Above this the low bits (the timing term) are no longer representable and the
 * score silently corrupts.
 */
export const MAX_EARNINGS = Math.floor(
  (Number.MAX_SAFE_INTEGER - WEEK_MINUTES) / SHIFT,
);

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(n, lo), hi);
}

/**
 * Pack `rawEarnings` and `minutesElapsed` into a sortable composite score.
 *
 * The time term `WEEK_MINUTES − minutesElapsed` is clamped to `[0, WEEK_MINUTES]`
 * (invariant 3): a clock skew or a write landing past the week boundary would
 * otherwise push it negative and borrow a unit from the earnings bits.
 *
 * `minutesElapsed` is trusted as a server-computed value (invariant 4); the clamp
 * is the only guard it needs. `rawEarnings` cannot be clamped without lying about
 * the score, so out-of-range earnings throw rather than corrupt silently.
 *
 * @throws {RangeError} if `rawEarnings` is negative, non-integer, or > MAX_EARNINGS.
 */
export function encodeScore(
  rawEarnings: number,
  minutesElapsed: number,
): number {
  if (
    !Number.isInteger(rawEarnings) ||
    rawEarnings < 0 ||
    rawEarnings > MAX_EARNINGS
  ) {
    throw new RangeError(
      `rawEarnings must be an integer in [0, ${MAX_EARNINGS}], got ${rawEarnings}`,
    );
  }

  const timeTerm = clamp(WEEK_MINUTES - minutesElapsed, 0, WEEK_MINUTES);
  return rawEarnings * SHIFT + timeTerm;
}

/**
 * Recover raw earnings from a packed score. Total over all inputs — the timing
 * term is always `< SHIFT`, so flooring the quotient discards it exactly.
 */
export function decodeEarnings(score: number): number {
  return Math.floor(score / SHIFT);
}
