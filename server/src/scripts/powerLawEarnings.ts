/**
 * Power-law (Pareto) earnings sampling for the demo seeder. Pure, isolated — no
 * framework, no db, no Redis. See README §4 for why the demo uses a skewed
 * distribution instead of uniform random: it makes the reward curve and the
 * dense competition near rank 100 behave like real player data.
 */
import { MAX_EARNINGS } from '../core/score.js';

/** Minimum raw earnings any bulk player can roll. */
const XM = 50;
/** Pareto shape — lower means a heavier tail (a few whales, many small earners). */
const ALPHA = 1.16;

/**
 * One inverse-CDF Pareto draw: `xm / u^(1/alpha)`, `u` uniform on `(0, 1]`.
 * `1 - Math.random()` excludes 0 (which would divide by zero) while keeping 1
 * reachable, so the result is always finite and `>= xm`.
 */
function paretoDraw(): number {
  const u = 1 - Math.random();
  return Math.min(MAX_EARNINGS, Math.floor(XM / Math.pow(u, 1 / ALPHA)));
}

/** `count` power-law earnings values, sorted descending (highest earner first). */
export function generateBulkEarnings(count: number): number[] {
  const values: number[] = new Array(count);
  for (let i = 0; i < count; i++) {
    values[i] = paretoDraw();
  }
  values.sort((a, b) => b - a);
  return values;
}

/**
 * Earnings for a fixed test account that should land at approximately
 * `rank` (1-based) among the full population once inserted into `bulkSorted`
 * (the descending bulk array, *before* any fixed accounts are added).
 *
 * Interpolates between the two bulk values that would straddle that rank.
 * Approximate by design — README §4 documents these as "~2", "~50", "~102",
 * "~400,000"; exact placement would require re-deriving every other fixed
 * account's offset for no real benefit.
 */
export function fixedAccountEarnings(
  bulkSorted: number[],
  rank: number,
): number {
  const above = bulkSorted[Math.max(0, rank - 2)];
  const below = bulkSorted[Math.min(bulkSorted.length - 1, rank - 1)];
  if (above === undefined || below === undefined) {
    throw new RangeError(
      `rank ${rank} is out of range for a bulk array of length ${bulkSorted.length}`,
    );
  }
  return Math.floor((above + below) / 2);
}
