import { getISOWeek, getISOWeekYear, startOfISOWeek } from 'date-fns';

/**
 * ISO week key: pure, isolated. No framework, no db, no HTTP.
 *
 * Produces the Redis key for a week's sorted set, e.g. `lb:2026-W30`. The week
 * boundary is derived from the given instant server-side (invariant 9) using
 * ISO week-year, never the calendar year — `2027-01-01` belongs to `2026-W53`,
 * and `getFullYear()` would mint a nonexistent key and reset the ladder at New
 * Year. See README §3.3.
 */

const SCOREBOARD_PREFIX = 'lb:';
const POOL_PREFIX = 'pool:';
const TOP_CACHE_PREFIX = 'cache:top:';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * date-fns reads a `Date`'s **local** calendar fields. All week handling is UTC
 * (invariant 10), so we build a Date whose local fields equal the instant's UTC
 * fields — otherwise a server running in a non-UTC timezone computes the wrong
 * ISO week near midnight boundaries. Verified: without this shift, a Monday-00:00
 * UTC instant resolves to the previous week under a negative-offset timezone.
 */
function asUtcCalendarDate(instant: Date): Date {
  return new Date(
    instant.getUTCFullYear(),
    instant.getUTCMonth(),
    instant.getUTCDate(),
    instant.getUTCHours(),
    instant.getUTCMinutes(),
    instant.getUTCSeconds(),
  );
}

/**
 * `YYYY-Www` for the ISO week containing `instant` (UTC), week zero-padded to two
 * digits (`2026-W05`). Shared by every Redis key that scopes to a week, so the
 * three keys below always agree on which week they mean. Also the bare form
 * stored on Mongo event-log documents (`mongo/eventLog.ts`).
 */
export function weekId(instant: Date): string {
  const local = asUtcCalendarDate(instant);
  const year = getISOWeekYear(local);
  const week = getISOWeek(local);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/**
 * Minutes elapsed since the ISO week's Monday 00:00 UTC start, for the
 * composite-score tie-break term (invariant 4 — computed server-side only,
 * never accepted from the request; README §3.2). Uses the same UTC-shift as
 * `weekId` so both agree on which week `instant` falls in.
 */
export function minutesElapsedInWeek(instant: Date): number {
  const local = asUtcCalendarDate(instant);
  const start = startOfISOWeek(local);
  return Math.floor((local.getTime() - start.getTime()) / 60_000);
}

/**
 * The instant exactly one week before `instant`. Weeks in this system are
 * always exactly 604,800 seconds (UTC, no DST — README §3.3), so this
 * reliably lands in the ISO week that just closed regardless of what moment
 * within the current week `instant` is. Used by the payout endpoint to
 * derive its own target week server-side (invariant 13) — never a request
 * parameter.
 */
export function previousWeekInstant(instant: Date): Date {
  return new Date(instant.getTime() - WEEK_MS);
}

/**
 * The Redis sorted-set key for the ISO week containing `instant` (UTC).
 * Format: `lb:YYYY-Www` (`lb:2026-W05`). `core/scripts/writeScore.lua` KEYS[1].
 */
export function weekKey(instant: Date): string {
  return `${SCOREBOARD_PREFIX}${weekId(instant)}`;
}

/**
 * The Redis key for the week's prize-pool counter. `core/scripts/writeScore.lua` KEYS[2].
 */
export function poolKey(instant: Date): string {
  return `${POOL_PREFIX}${weekId(instant)}`;
}

/**
 * The Redis key for the cached top-100 response (README §1/§3.6 — a single
 * string, 5s TTL, absorbing the majority of read traffic at nginx).
 */
export function topCacheKey(instant: Date): string {
  return `${TOP_CACHE_PREFIX}${weekId(instant)}`;
}
