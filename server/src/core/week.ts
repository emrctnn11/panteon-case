import { getISOWeek, getISOWeekYear } from 'date-fns';

/**
 * ISO week key: pure, isolated. No framework, no db, no HTTP.
 *
 * Produces the Redis key for a week's sorted set, e.g. `lb:2026-W30`. The week
 * boundary is derived from the given instant server-side (invariant 9) using
 * ISO week-year, never the calendar year — `2027-01-01` belongs to `2026-W53`,
 * and `getFullYear()` would mint a nonexistent key and reset the ladder at New
 * Year. See README §3.3.
 */

const KEY_PREFIX = 'lb:';

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
 * The Redis sorted-set key for the ISO week containing `instant` (UTC).
 * Format: `lb:YYYY-Www`, week zero-padded to two digits (`lb:2026-W05`).
 */
export function weekKey(instant: Date): string {
  const local = asUtcCalendarDate(instant);
  const year = getISOWeekYear(local);
  const week = getISOWeek(local);
  return `${KEY_PREFIX}${year}-W${String(week).padStart(2, '0')}`;
}
