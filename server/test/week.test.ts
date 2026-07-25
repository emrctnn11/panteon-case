import { describe, expect, it } from 'vitest';

import {
  minutesElapsedInWeek,
  previousWeekInstant,
  weekId,
  weekKey,
} from '../src/core/week.js';

describe('weekKey — ISO week-year boundaries (invariant 9, README §3.3)', () => {
  it('resolves 2027-01-01 to 2026-W53, not 2027-W01', () => {
    // 2027-01-01 is a Friday; getFullYear() would wrongly produce lb:2027-W...
    expect(weekKey(new Date('2027-01-01T00:00:00.000Z'))).toBe('lb:2026-W53');
  });

  it('keeps the whole ISO W53 tail of 2026 on the 2026 key', () => {
    // Mon 2026-12-28 .. Sun 2027-01-03 is ISO 2026-W53.
    expect(weekKey(new Date('2026-12-28T00:00:00.000Z'))).toBe('lb:2026-W53');
    expect(weekKey(new Date('2027-01-03T23:59:59.000Z'))).toBe('lb:2026-W53');
  });

  it('rolls to 2027-W01 at the Monday boundary', () => {
    // Mon 2027-01-04 00:00 UTC starts ISO 2027-W01.
    expect(weekKey(new Date('2027-01-04T00:00:00.000Z'))).toBe('lb:2027-W01');
  });
});

describe('weekKey — format', () => {
  it('zero-pads single-digit weeks to two digits', () => {
    // Mon 2026-01-05 starts ISO 2026-W02.
    expect(weekKey(new Date('2026-01-05T00:00:00.000Z'))).toBe('lb:2026-W02');
  });

  it('uses the lb: prefix and a plain two-digit week', () => {
    expect(weekKey(new Date('2026-07-20T12:00:00.000Z'))).toMatch(
      /^lb:\d{4}-W\d{2}$/,
    );
  });
});

describe('weekKey — UTC, independent of instant within the week', () => {
  it('maps every instant Mon..Sun of an ISO week to the same key', () => {
    // ISO 2026-W30: Mon 2026-07-20 .. Sun 2026-07-26 (UTC).
    const key = 'lb:2026-W30';
    expect(weekKey(new Date('2026-07-20T00:00:00.000Z'))).toBe(key);
    expect(weekKey(new Date('2026-07-23T09:30:00.000Z'))).toBe(key);
    expect(weekKey(new Date('2026-07-26T23:59:59.999Z'))).toBe(key);
  });

  it('does not slip the week at a midnight-UTC Monday start', () => {
    // The instant that most easily slips under a non-UTC process timezone.
    expect(weekKey(new Date('2026-07-27T00:00:00.000Z'))).toBe('lb:2026-W31');
  });
});

describe('minutesElapsedInWeek — boundaries (testing priority #1)', () => {
  it('is 0 exactly at the Monday 00:00 UTC start', () => {
    expect(minutesElapsedInWeek(new Date('2026-07-20T00:00:00.000Z'))).toBe(0);
  });

  it('is 1 one minute after the start', () => {
    expect(minutesElapsedInWeek(new Date('2026-07-20T00:01:00.000Z'))).toBe(1);
  });

  it('is 10079 in the last minute before the next week starts', () => {
    expect(minutesElapsedInWeek(new Date('2026-07-26T23:59:59.999Z'))).toBe(
      10079,
    );
  });

  it('agrees with weekKey on which week a midnight-UTC Monday belongs to', () => {
    // Same instant used in the "does not slip" weekKey test above.
    expect(minutesElapsedInWeek(new Date('2026-07-27T00:00:00.000Z'))).toBe(0);
  });
});

describe('previousWeekInstant — payout target week (invariant 13)', () => {
  it('resolves to the prior ISO week at the actual EventBridge fire time (Mon 00:05 UTC)', () => {
    // Payout fires cron(5 0 ? * MON *) UTC into ISO 2026-W31 (Mon 2026-07-27..).
    const fireTime = new Date('2026-07-27T00:05:00.000Z');
    expect(weekId(previousWeekInstant(fireTime))).toBe('2026-W30');
  });

  it('crosses a year boundary correctly', () => {
    // ISO 2027-W01 starts Mon 2027-01-04; the week before is 2026-W53.
    const fireTime = new Date('2027-01-04T00:05:00.000Z');
    expect(weekId(previousWeekInstant(fireTime))).toBe('2026-W53');
  });

  it('is exactly 7 days earlier, agreeing with weekKey on the closed week', () => {
    const fireTime = new Date('2026-07-27T00:05:00.000Z');
    expect(weekKey(previousWeekInstant(fireTime))).toBe('lb:2026-W30');
  });
});
