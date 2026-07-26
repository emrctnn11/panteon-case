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

interface FakeRun {
  status: 'claimed' | 'completed';
}

interface FakeSnapshotRow {
  rank: number;
  playerId: string;
  earningsMinor: string;
  amountMinor: string;
}

/**
 * Fakes for `db` exposing only the two `selectFrom` chains
 * `routes/history/service.ts` calls, same minimal-fake pattern as the other
 * route tests. `getPlayerProfiles` (via `attachDisplayNames`) issues a third
 * `selectFrom('players')` call, handled the same way.
 */
function buildDeps(opts: {
  run?: FakeRun;
  snapshotRows?: FakeSnapshotRow[];
  playerRows?: { playerId: string; displayName: string }[];
}) {
  const run = opts.run;
  const snapshotRows = opts.snapshotRows ?? [];
  const playerRows = opts.playerRows ?? [];

  function selectFrom(table: string) {
    if (table === 'payoutRuns') {
      const builder = {
        select: vi.fn(() => builder),
        where: vi.fn(() => builder),
        executeTakeFirst: vi.fn(async () => run),
      };
      return builder;
    }
    if (table === 'weeklySnapshots') {
      const builder = {
        select: vi.fn(() => builder),
        where: vi.fn(() => builder),
        orderBy: vi.fn(() => builder),
        execute: vi.fn(async () => snapshotRows),
      };
      return builder;
    }
    if (table === 'players') {
      const builder = {
        select: vi.fn(() => builder),
        where: vi.fn(() => builder),
        execute: vi.fn(async () => playerRows),
      };
      return builder;
    }
    throw new Error(`unexpected selectFrom('${table}')`);
  }

  const deps = {
    redis: {} as unknown as AppDeps['redis'],
    mongoDb: {} as unknown as AppDeps['mongoDb'],
    mongoReady: () => false,
    db: { selectFrom: vi.fn(selectFrom) } as unknown as AppDeps['db'],
  } satisfies AppDeps;

  return { deps };
}

async function get(deps: AppDeps, weekId: string) {
  const app = await buildApp(config, deps);
  try {
    return await app.inject({
      method: 'GET',
      url: `/api/leaderboard/history/${weekId}`,
    });
  } finally {
    await app.close();
  }
}

describe('GET /api/leaderboard/history/:weekId', () => {
  it('rejects a malformed weekId', async () => {
    const { deps } = buildDeps({});
    const res = await get(deps, 'not-a-week');
    expect(res.statusCode).toBe(400);
  });

  it('404s for a week that was never run', async () => {
    const { deps } = buildDeps({ run: undefined });
    const res = await get(deps, '2026-W01');
    expect(res.statusCode).toBe(404);
  });

  it('404s for a week that is only claimed, not completed', async () => {
    const { deps } = buildDeps({ run: { status: 'claimed' } });
    const res = await get(deps, '2026-W01');
    expect(res.statusCode).toBe(404);
  });

  it('200s with an empty array for a completed, empty-pool week', async () => {
    const { deps } = buildDeps({
      run: { status: 'completed' },
      snapshotRows: [],
    });
    const res = await get(deps, '2026-W01');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ weekId: '2026-W01', entries: [] });
  });

  it('200s with ranked, enriched entries and a long Cache-Control', async () => {
    const { deps } = buildDeps({
      run: { status: 'completed' },
      snapshotRows: [
        { rank: 1, playerId: 'p1', earningsMinor: '500', amountMinor: '200' },
        { rank: 2, playerId: 'p2', earningsMinor: '400', amountMinor: '150' },
      ],
      playerRows: [
        { playerId: 'p1', displayName: 'Alice' },
        { playerId: 'p2', displayName: 'Bob' },
      ],
    });

    const res = await get(deps, '2026-W01');

    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe(
      'public, max-age=3600, immutable',
    );
    expect(res.json()).toEqual({
      weekId: '2026-W01',
      entries: [
        {
          rank: 1,
          playerId: 'p1',
          displayName: 'Alice',
          earningsMinor: '500',
          amountMinor: '200',
        },
        {
          rank: 2,
          playerId: 'p2',
          displayName: 'Bob',
          earningsMinor: '400',
          amountMinor: '150',
        },
      ],
    });
  });

  it('falls back to the bare player id when a profile row is missing', async () => {
    const { deps } = buildDeps({
      run: { status: 'completed' },
      snapshotRows: [
        { rank: 1, playerId: 'ghost', earningsMinor: '10', amountMinor: '5' },
      ],
      playerRows: [],
    });

    const res = await get(deps, '2026-W01');
    expect(res.json().entries[0].displayName).toBe('ghost');
  });
});
