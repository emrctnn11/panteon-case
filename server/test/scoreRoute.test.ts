import { describe, expect, it, vi } from 'vitest';

import { buildApp, type AppDeps } from '../src/app.js';
import { loadConfig } from '../src/config/env.js';

const config = loadConfig({
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://test:test@localhost:5432/test',
  REDIS_URL: 'redis://localhost:6379',
  MONGODB_URI: 'mongodb://localhost:27017/test',
  JWT_SECRET: 'test-secret-at-least-32-characters-long',
  INTERNAL_PAYOUT_SECRET: 'test-internal-secret-at-least-32-chars',
});

/**
 * Redis/Mongo are injected as minimal fakes exposing only the methods the
 * score service calls. `ioredis-mock` can't run Lua (docs/ai-workflow.md), so
 * the actual `writeScore.lua` logic is verified separately against a real
 * Redis container — these tests cover the HTTP layer (auth, validation,
 * wiring), not the script.
 */
function buildDeps() {
  const writeScore = vi.fn().mockResolvedValue([1, 4]);
  const insertMany = vi.fn().mockResolvedValue(undefined);

  const deps = {
    redis: { writeScore } as unknown as AppDeps['redis'],
    mongoDb: {
      collection: () => ({ insertMany }),
    } as unknown as AppDeps['mongoDb'],
    mongoReady: () => true,
    // Score route doesn't touch Postgres; only its shape needs to satisfy AppDeps.
    db: {} as unknown as AppDeps['db'],
  } satisfies AppDeps;

  return { deps, writeScore, insertMany };
}

describe('POST /api/score', () => {
  it('rejects a request with no token', async () => {
    const { deps } = buildDeps();
    const app = await buildApp(config, deps);
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/api/score',
        payload: { rawEarnings: 100 },
      });
      expect(res.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });

  it('rejects an invalid body (negative earnings)', async () => {
    const { deps } = buildDeps();
    const app = await buildApp(config, deps);
    try {
      const token = app.jwt.sign({ sub: 'player-1' });
      const res = await app.inject({
        method: 'POST',
        url: '/api/score',
        headers: { authorization: `Bearer ${token}` },
        payload: { rawEarnings: -5 },
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  it('rejects an invalid body (non-integer earnings)', async () => {
    const { deps } = buildDeps();
    const app = await buildApp(config, deps);
    try {
      const token = app.jwt.sign({ sub: 'player-1' });
      const res = await app.inject({
        method: 'POST',
        url: '/api/score',
        headers: { authorization: `Bearer ${token}` },
        payload: { rawEarnings: 12.5 },
      });
      expect(res.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  it('writes the score for the JWT sub, ignoring any playerId/week/minutesElapsed in the body', async () => {
    const { deps, writeScore, insertMany } = buildDeps();
    const app = await buildApp(config, deps);
    try {
      const token = app.jwt.sign({ sub: 'player-1' });
      const res = await app.inject({
        method: 'POST',
        url: '/api/score',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          rawEarnings: 100,
          playerId: 'someone-else',
          week: '2020-W01',
          minutesElapsed: 0,
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ applied: true, rank: 4 });

      expect(writeScore).toHaveBeenCalledTimes(1);
      const [, , playerIdArg] = writeScore.mock.calls[0] as [
        string,
        string,
        string,
        number,
        number,
      ];
      expect(playerIdArg).toBe('player-1');

      expect(insertMany).toHaveBeenCalledTimes(1);
      const [[event]] = insertMany.mock.calls[0] as [
        [{ playerId: string; rawEarnings: number }],
      ];
      expect(event.playerId).toBe('player-1');
      expect(event.rawEarnings).toBe(100);
    } finally {
      await app.close();
    }
  });

  it('still returns the write result when the Mongo event log fails (invariant 21)', async () => {
    const { deps, insertMany } = buildDeps();
    insertMany.mockRejectedValue(new Error('mongo down'));
    const app = await buildApp(config, deps);
    try {
      const token = app.jwt.sign({ sub: 'player-1' });
      const res = await app.inject({
        method: 'POST',
        url: '/api/score',
        headers: { authorization: `Bearer ${token}` },
        payload: { rawEarnings: 100 },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ applied: true, rank: 4 });
    } finally {
      await app.close();
    }
  });

  it('skips the event-log write when Mongo is not ready, still returning the write result (invariant 21)', async () => {
    const { deps, insertMany } = buildDeps();
    deps.mongoReady = () => false;
    const app = await buildApp(config, deps);
    try {
      const token = app.jwt.sign({ sub: 'player-1' });
      const res = await app.inject({
        method: 'POST',
        url: '/api/score',
        headers: { authorization: `Bearer ${token}` },
        payload: { rawEarnings: 100 },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ applied: true, rank: 4 });
      expect(insertMany).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
