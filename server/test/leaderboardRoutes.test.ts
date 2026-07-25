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

/**
 * Redis/Postgres are injected as minimal fakes exposing only the methods the
 * leaderboard service calls — same pattern as `test/scoreRoute.test.ts`.
 * `zrevrange`/`readWindow` return fixtures built with the real `encodeScore`
 * so decoding round-trips correctly through `toEntries`.
 */
function buildDeps() {
  const cacheStore = new Map<string, string>();
  const get = vi.fn(async (key: string) => cacheStore.get(key) ?? null);
  const set = vi.fn(async (key: string, value: string) => {
    cacheStore.set(key, value);
    return 'OK';
  });
  const zrevrange = vi.fn(async (_key: string, from: number, to: number) => {
    const all = [
      flatEntry('p1', 1000),
      flatEntry('p2', 900),
      flatEntry('p3', 800),
    ];
    return all.slice(from, to + 1).flat();
  });
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
    { playerId: 'p1', displayName: 'Alice' },
    { playerId: 'p2', displayName: 'Bob' },
    { playerId: 'p3', displayName: 'Carol' },
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
      expect(get).toHaveBeenCalledTimes(2);
    } finally {
      await app.close();
    }
  });

  it('bypasses the cache for a non-default page', async () => {
    const { deps, zrevrange, set } = buildDeps();
    const app = await buildApp(config, deps);
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/api/leaderboard/top?from=1&limit=1',
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        entries: [
          { playerId: 'p2', rank: 1, rawEarnings: 900, displayName: 'Bob' },
        ],
      });
      expect(zrevrange).toHaveBeenCalledTimes(1);
      expect(set).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('rejects a limit above the 100-row cap', async () => {
    const { deps } = buildDeps();
    const app = await buildApp(config, deps);
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/api/leaderboard/top?limit=500',
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
