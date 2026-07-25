import { describe, expect, it } from 'vitest';

import { distributeRewards } from '../src/core/rewards.js';

const ALPHA = 1.0; // configured value, README §3.5

describe('distributeRewards — total equals the pool exactly (priority #5)', () => {
  for (const pool of [1_000_000, 1_000_003, 999_997, 7, 1]) {
    it(`Σ awards === ${pool} for a full ladder`, () => {
      const { awards, distributed, rollover } = distributeRewards(
        pool,
        100,
        ALPHA,
      );
      expect(awards).toHaveLength(100);
      expect(distributed).toBe(pool);
      expect(rollover).toBe(0);
    });
  }
});

describe('distributeRewards — README §3.5 worked example (pool 1,000,000, α=1.0)', () => {
  const { awards } = distributeRewards(1_000_000, 100, ALPHA);

  it('gives the fixed podium (20% / 15% / 10%, plus remainder units on top ranks)', () => {
    // Flooring leftover is handed to the top ranks first, so these read one over the %.
    expect(awards[0]).toBe(200_001); // rank 1
    expect(awards[1]).toBe(150_001); // rank 2
    expect(awards[2]).toBe(100_001); // rank 3
  });

  it('matches the documented tail figures (~41k at rank 4, ~1,640 at rank 100)', () => {
    expect(awards[3]).toBeCloseTo(41_000, -3); // rank 4
    expect(awards[99]).toBeCloseTo(1_640, -2); // rank 100
  });
});

describe('distributeRewards — monotonic non-increasing by rank (priority #5)', () => {
  it('never lets a lower rank out-earn a higher one at α=1.0', () => {
    const { awards } = distributeRewards(1_000_003, 100, ALPHA);
    for (let i = 1; i < awards.length; i++) {
      const prev = awards[i - 1] ?? 0;
      const cur = awards[i] ?? 0;
      expect(prev).toBeGreaterThanOrEqual(cur);
    }
  });
});

describe('distributeRewards — remainder goes to the top ranks, not largest-remainder', () => {
  it('lands the flooring leftover on rank 1 downward', () => {
    // pool 100 with α=1: podium 20/15/10, tail floors are all 0 (55 spread over 97 ranks),
    // so a large leftover must pile onto the very top ranks in order.
    const { awards, distributed } = distributeRewards(100, 100, ALPHA);
    expect(distributed).toBe(100);
    // Rank 1 keeps the most; awards are non-increasing and the tail is mostly zeros.
    expect(awards[0] ?? 0).toBeGreaterThanOrEqual(awards[1] ?? 0);
    expect(awards[awards.length - 1]).toBe(0);
  });
});

describe('distributeRewards — fewer than 100 players (priority #7)', () => {
  it('awards only the present ranks and rolls the rest over', () => {
    const pool = 1_000_000;
    const { awards, distributed, rollover } = distributeRewards(pool, 3, ALPHA);
    expect(awards).toHaveLength(3);
    // Present players get exactly their full-ladder podium award.
    const full = distributeRewards(pool, 100, ALPHA).awards.slice(0, 3);
    expect(awards).toEqual(full);
    expect(distributed + rollover).toBe(pool);
    expect(rollover).toBeGreaterThan(0); // the absent ranks' 55% tail region
  });

  it('rolls the entire pool over when there are no ranked players', () => {
    const { awards, distributed, rollover } = distributeRewards(500, 0, ALPHA);
    expect(awards).toEqual([]);
    expect(distributed).toBe(0);
    expect(rollover).toBe(500);
  });
});

describe('distributeRewards — empty pool (priority #7)', () => {
  it('produces all-zero awards and no rollover', () => {
    const { awards, distributed, rollover } = distributeRewards(0, 100, ALPHA);
    expect(awards).toHaveLength(100);
    expect(awards.every((a) => a === 0)).toBe(true);
    expect(distributed).toBe(0);
    expect(rollover).toBe(0);
  });
});

describe('distributeRewards — guards', () => {
  it('rejects a non-integer pool', () => {
    expect(() => distributeRewards(1.5, 100, ALPHA)).toThrow(RangeError);
  });
  it('rejects a negative pool', () => {
    expect(() => distributeRewards(-1, 100, ALPHA)).toThrow(RangeError);
  });
  it('rejects a non-integer player count', () => {
    expect(() => distributeRewards(1000, 3.5, ALPHA)).toThrow(RangeError);
  });
  it('rejects a non-positive alpha', () => {
    expect(() => distributeRewards(1000, 100, 0)).toThrow(RangeError);
  });
  it('rejects a NaN alpha', () => {
    expect(() => distributeRewards(1000, 100, Number.NaN)).toThrow(RangeError);
  });
});
