import { describe, expect, it } from 'vitest';

import {
  MAX_EARNINGS,
  SHIFT,
  WEEK_MINUTES,
  decodeEarnings,
  encodeScore,
} from '../src/core/score.js';

describe('encodeScore — anchor values', () => {
  it('packs earnings in the high bits and the time term in the low bits', () => {
    // 5000 minutes elapsed -> time term 10080 - 5000 = 5080.
    expect(encodeScore(1000, 5000)).toBe(1000 * SHIFT + 5080);
  });

  it('is 0 for zero earnings arriving exactly at the week boundary', () => {
    // minutesElapsed === WEEK_MINUTES -> time term 0.
    expect(encodeScore(0, WEEK_MINUTES)).toBe(0);
  });

  it('gives zero-earnings arrivals only the timing term', () => {
    expect(encodeScore(0, 0)).toBe(WEEK_MINUTES); // earliest possible arrival
    expect(encodeScore(0, 1)).toBe(WEEK_MINUTES - 1);
  });
});

describe('encode/decode round-trip', () => {
  const raws = [0, 1, 42, 1000, 550_000_000, MAX_EARNINGS];
  const mins = [0, 1, 5040, 10079, WEEK_MINUTES];

  for (const raw of raws) {
    for (const min of mins) {
      it(`recovers ${raw} from encode(${raw}, ${min})`, () => {
        expect(decodeEarnings(encodeScore(raw, min))).toBe(raw);
      });
    }
  }
});

describe('time term clamping (invariant 3)', () => {
  it('clamps a negative minutesElapsed (skew before week start) to term 10080', () => {
    expect(encodeScore(0, -100)).toBe(WEEK_MINUTES);
  });

  it('clamps minutesElapsed past the boundary to term 0', () => {
    expect(encodeScore(7, WEEK_MINUTES + 500)).toBe(7 * SHIFT);
  });

  it('is exact at both boundaries', () => {
    expect(encodeScore(3, 0)).toBe(3 * SHIFT + WEEK_MINUTES);
    expect(encodeScore(3, WEEK_MINUTES)).toBe(3 * SHIFT);
  });
});

describe('maximum representable earnings', () => {
  it('round-trips at MAX_EARNINGS with the worst-case (largest) time term', () => {
    const score = encodeScore(MAX_EARNINGS, 0);
    expect(Number.isSafeInteger(score)).toBe(true);
    expect(decodeEarnings(score)).toBe(MAX_EARNINGS);
  });

  it('rejects earnings just above the ceiling', () => {
    expect(() => encodeScore(MAX_EARNINGS + 1, 0)).toThrow(RangeError);
  });
});

describe('tie-break ordering (invariant 2, README §3.2)', () => {
  it('ranks the earlier arrival above an equal-earnings latecomer', () => {
    const earlier = encodeScore(1000, 10); // smaller minutesElapsed
    const later = encodeScore(1000, 500);
    expect(earlier).toBeGreaterThan(later);
  });

  it('lets one earnings unit outweigh the best possible timing advantage', () => {
    // Higher earnings with the worst arrival still beats lower earnings with the best.
    const richLate = encodeScore(1001, WEEK_MINUTES); // time term 0
    const poorEarly = encodeScore(1000, 0); // time term 10080 (max)
    expect(richLate).toBeGreaterThan(poorEarly);
  });
});

describe('earnings guard', () => {
  it('rejects negative earnings', () => {
    expect(() => encodeScore(-1, 0)).toThrow(RangeError);
  });

  it('rejects non-integer earnings', () => {
    expect(() => encodeScore(1.5, 0)).toThrow(RangeError);
  });

  it('rejects earnings above MAX_EARNINGS', () => {
    expect(() => encodeScore(MAX_EARNINGS + 1, 0)).toThrow(RangeError);
  });
});
