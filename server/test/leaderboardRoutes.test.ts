import { describe, expect, it, vi } from 'vitest';

import { buildApp, type AppDeps } from '../src/app.js';
import { loadConfig } from '../src/config/env.js';
import { encodeScore } from '../src/core/score.js';

const config = loadConfig({
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://test:test@localhost:5432/test',
  REDIS_URL: 'redis://localhost:6379',
  MONGODB_URI: 'mongodb://localhost:27017/test',
  JWT_SECRET: 'test-secret-at-least-32-characters-long',
  INTERNAL_PAYOUT_SECRET: 'test-internal-secret-at-least-32-chars',
});

function flatEntry(playerId: string, rawEarnings: number): [string, string] {
  return [playerId, String(encodeScore(rawEarnings, 0))];
}

interface RankedPlayer {
  playerId: string;
  displayName: string;
  rawEarnings: number;
}

const DEFAULT_RANKED: RankedPlayer[] = [
  { playerId: 'p1', displayName: 'Alice', rawEarnings: 1000 },
  { playerId: 'p2', displayName: 'Bob', rawEarnings: 900 },
  { playerId: 'p3', displayName: 'Carol', rawEarnings: 800 },
];

/** `n` synthetic ranked players, descending earnings — for range/boundary tests. */
function manyRanked(n: number): RankedPlayer[] {
  return Array.from({ length: n }, (_unused, i) => ({
    playerId: `q${i}`,
    displayName: `Q${i}`,
    rawEarnings: n - i,
  }));
}

/**
 * Redis/Postgres are injected as minimal fakes exposing only the methods the
 * leaderboard service calls — same pattern as `test/scoreRoute.test.ts`.
 * `zrevrange`/`readWindow` return fixtures built with the real `encodeScore`
 * so decoding round-trips correctly through `toEntries`. `ranked` is the sorted
 * set contents; the fake db resolves display names for the same players (plus
 * `known-player` used by the `/me` fixtures).
 */
function buildDeps(ranked: RankedPlayer[] = DEFAULT_RANKED) {
  const cacheStore = new Map<string, string>();
  const get = vi.fn(async (key: string) => cacheStore.get(key) ?? null);
  const set = vi.fn(async (key: string, value: string) => {
    cacheStore.set(key, value);
    return 'OK';
  });
  const zrevrange = vi.fn(async (_key: string, from: number, to: number) =>
    ranked
      .slice(from, to + 1)
      .flatMap((p) => flatEntry(p.playerId, p.rawEarnings)),
  );
  const readWindow = vi.fn(async (_key: string, playerId: string) => {
    if (playerId !== 'known-player') {
      return null;
    }
    return [
      1,
      0,
      [...flatEntry('p1', 1000), ...flatEntry('known-player', 900)],
    ];
  });

  const rows = [
    ...ranked.map(({ playerId, displayName }) => ({ playerId, displayName })),
    { playerId: 'known-player', displayName: 'Dana' },
  ];
  const execute = vi.fn(async () => rows);
  const dbBuilder = {
    selectFrom: () => dbBuilder,
    select: () => dbBuilder,
    where: () => dbBuilder,
    execute,
  };

  const deps = {
    redis: { get, set, zrevrange, readWindow } as unknown as AppDeps['redis'],
    mongoDb: {} as unknown as AppDeps['mongoDb'],
    mongoReady: () => false,
    db: dbBuilder as unknown as AppDeps['db'],
  } satisfies AppDeps;

  return { deps, get, set, zrevrange, readWindow, execute };
}

describe('GET /api/leaderboard/top', () => {
  it('returns enriched entries with a 5s Cache-Control header', async () => {
    const { deps } = buildDeps();
    const app = await buildApp(config, deps);
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/api/leaderboard/top',
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers['cache-control']).toBe('public, max-age=5');
      expect(res.json()).toEqual({
        entries: [
          { playerId: 'p1', rank: 0, rawEarnings: 1000, displayName: 'Alice' },
          { playerId: 'p2', rank: 1, rawEarnings: 900, displayName: 'Bob' },
          { playerId: 'p3', rank: 2, rawEarnings: 800, displayName: 'Carol' },
        ],
        pool: 0,
        weekEndsAt: expect.any(String),
      });
    } finally {
      await app.close();
    }
  });

  it('serves the default page from cache on the second call', async () => {
    const { deps, zrevrange, get, set } = buildDeps();
    const app = await buildApp(config, deps);
    try {
      await app.inject({ method: 'GET', url: '/api/leaderboard/top' });
      await app.inject({ method: 'GET', url: '/api/leaderboard/top' });

      expect(zrevrange).toHaveBeenCalledTimes(1);
      expect(set).toHaveBeenCalledTimes(1);
      // 1 cache-check + 1 pool read on the miss, + 1 cache-check (hit) on the
      // second call — pool isn't re-read once the cached JSON already has it.
      expect(get).toHaveBeenCalledTimes(3);
    } finally {
      await app.close();
    }
  });

  it('serves a deep page from the aligned Redis range', async () => {
    const { deps, zrevrange } = buildDeps(manyRanked(60));
    const app = await buildApp(config, deps);
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/api/leaderboard/top?from=40&limit=20',
      });
      expect(res.statusCode).toBe(200);
      // ZREVRANGE gets the offset directly — never a SQL OFFSET (invariant 18).
      expect(zrevrange).toHaveBeenCalledWith(
        expect.any(String),
        40,
        59,
        'WITHSCORES',
      );
      const body = res.json();
      expect(body.entries).toHaveLength(20);
      expect(body.entries[0].rank).toBe(40);
      expect(body.entries[0].playerId).toBe('q40');
    } finally {
      await app.close();
    }
  });

  it('snaps an unaligned from down to a multiple of limit', async () => {
    const { deps, zrevrange } = buildDeps(manyRanked(60));
    const app = await buildApp(config, deps);
    try {
      // from=25 with limit=20 must be served as the from=20 page — the client
      // is never trusted to align, so the cache stays genuinely shared.
      const res = await app.inject({
        method: 'GET',
        url: '/api/leaderboard/top?from=25&limit=20',
      });
      expect(res.statusCode).toBe(200);
      expect(zrevrange).toHaveBeenCalledWith(
        expect.any(String),
        20,
        39,
        'WITHSCORES',
      );
      expect(res.json().entries[0].rank).toBe(20);
    } finally {
      await app.close();
    }
  });

  it('caches each aligned page independently', async () => {
    const { deps, zrevrange, set } = buildDeps(manyRanked(60));
    const app = await buildApp(config, deps);
    try {
      const url = '/api/leaderboard/top?from=20&limit=20';
      await app.inject({ method: 'GET', url });
      await app.inject({ method: 'GET', url });

      // Second call to the same page is served from cache — no re-read.
      expect(zrevrange).toHaveBeenCalledTimes(1);
      expect(set).toHaveBeenCalledTimes(1);
    } finally {
      await app.close();
    }
  });

  it('does not cache an empty page past the end of the list', async () => {
    const { deps, set } = buildDeps();
    const app = await buildApp(config, deps);
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/api/leaderboard/top?from=100&limit=20',
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().entries).toEqual([]);
      expect(set).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('serves an empty trailing page for an exact page-multiple list', async () => {
    // Exactly 40 players, page size 20: the page-2 request (from=40) must come
    // back empty and uncached so the client sees "end" and stops (no loop).
    const { deps, set } = buildDeps(manyRanked(40));
    const app = await buildApp(config, deps);
    try {
      const full = await app.inject({
        method: 'GET',
        url: '/api/leaderboard/top?from=20&limit=20',
      });
      expect(full.json().entries).toHaveLength(20);

      const past = await app.inject({
        method: 'GET',
        url: '/api/leaderboard/top?from=40&limit=20',
      });
      expect(past.statusCode).toBe(200);
      expect(past.json().entries).toEqual([]);
      // The full page is cached, the empty trailing page is not.
      expect(set).toHaveBeenCalledTimes(1);
    } finally {
      await app.close();
    }
  });

  it('rejects a limit outside the allowlist', async () => {
    const { deps } = buildDeps();
    const app = await buildApp(config, deps);
    try {
      for (const limit of [30, 500, 1000000]) {
        const res = await app.inject({
          method: 'GET',
          url: `/api/leaderboard/top?limit=${limit}`,
        });
        expect(res.statusCode).toBe(400);
      }
    } finally {
      await app.close();
    }
  });

  it('accepts an allowlisted limit of 50', async () => {
    const { deps } = buildDeps(manyRanked(60));
    const app = await buildApp(config, deps);
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/api/leaderboard/top?limit=50',
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().entries).toHaveLength(50);
    } finally {
      await app.close();
    }
  });

  it('rejects a negative from', async () => {
    const { deps } = buildDeps();
    const app = await buildApp(config, deps);
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/api/leaderboard/top?from=-1',
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  it('rejects an absurdly large from', async () => {
    const { deps } = buildDeps();
    const app = await buildApp(config, deps);
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/api/leaderboard/top?from=99999999',
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });
});

describe('GET /api/leaderboard/me', () => {
  it('rejects a request with no token', async () => {
    const { deps } = buildDeps();
    const app = await buildApp(config, deps);
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/api/leaderboard/me',
      });
      expect(res.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });

  it('returns rank: null when the player has no score this week', async () => {
    const { deps } = buildDeps();
    const app = await buildApp(config, deps);
    try {
      const token = app.jwt.sign({ sub: 'unranked-player' });
      const res = await app.inject({
        method: 'GET',
        url: '/api/leaderboard/me',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ rank: null, entries: [] });
      expect(res.headers['cache-control']).toBeUndefined();
    } finally {
      await app.close();
    }
  });

  it('returns the enriched window for a ranked player', async () => {
    const { deps } = buildDeps();
    const app = await buildApp(config, deps);
    try {
      const token = app.jwt.sign({ sub: 'known-player' });
      const res = await app.inject({
        method: 'GET',
        url: '/api/leaderboard/me',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        rank: 1,
        entries: [
          { playerId: 'p1', rank: 0, rawEarnings: 1000, displayName: 'Alice' },
          {
            playerId: 'known-player',
            rank: 1,
            rawEarnings: 900,
            displayName: 'Dana',
          },
        ],
      });
    } finally {
      await app.close();
    }
  });
});

describe('GET /api/leaderboard (combined)', () => {
  it('rejects a request with no token', async () => {
    const { deps } = buildDeps();
    const app = await buildApp(config, deps);
    try {
      const res = await app.inject({ method: 'GET', url: '/api/leaderboard' });
      expect(res.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });

  it('combines top and me for an authenticated request', async () => {
    const { deps } = buildDeps();
    const app = await buildApp(config, deps);
    try {
      const token = app.jwt.sign({ sub: 'known-player' });
      const res = await app.inject({
        method: 'GET',
        url: '/api/leaderboard',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.top.entries).toHaveLength(3);
      expect(body.me.rank).toBe(1);
    } finally {
      await app.close();
    }
  });
});
