import { describe, expect, it, vi } from 'vitest';

import { buildApp, type AppDeps } from '../src/app.js';
import { loadConfig } from '../src/config/env.js';
import { distributeRewards } from '../src/core/rewards.js';
import { encodeScore } from '../src/core/score.js';

const SECRET = 'test-internal-secret-at-least-32-chars';

const config = loadConfig({
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://test:test@localhost:5432/test',
  REDIS_URL: 'redis://localhost:6379',
  MONGODB_URI: 'mongodb://localhost:27017/test',
  JWT_SECRET: 'test-secret-at-least-32-characters-long',
  INTERNAL_PAYOUT_SECRET: SECRET,
});

function flatEntry(playerId: string, rawEarnings: number): [string, string] {
  return [playerId, String(encodeScore(rawEarnings, 0))];
}

interface InsertResultRow {
  numInsertedOrUpdatedRows: bigint;
}

/** Minimal chainable stand-in for a Kysely insert query builder. */
function makeInsertBuilder(
  onValues: (rows: unknown[]) => void,
  result: InsertResultRow,
) {
  const builder = {
    values: vi.fn((rows: unknown) => {
      onValues(Array.isArray(rows) ? rows : [rows]);
      return builder;
    }),
    onConflict: vi.fn(() => builder),
    execute: vi.fn(async () => [result]),
    executeTakeFirst: vi.fn(async () => result),
  };
  return builder;
}

/** Minimal chainable stand-in for a Kysely update query builder. */
function makeUpdateBuilder(onSet: (values: unknown) => void) {
  const builder = {
    set: vi.fn((values: unknown) => {
      onSet(values);
      return builder;
    }),
    where: vi.fn(() => builder),
    execute: vi.fn(async () => undefined),
  };
  return builder;
}

/**
 * Fakes for `redis`/`db` exposing only what `routes/payout/service.ts` calls
 * — same minimal-fake pattern as the other route tests. `db` mimics just
 * enough of Kysely's chainable builder shape to capture what would have been
 * written, without a real Postgres connection.
 */
function buildDeps(opts: {
  claimSucceeds: boolean;
  pool: number;
  entries?: [string, string][];
  lockAcquires?: boolean;
}) {
  const payoutsRows: Record<string, unknown>[] = [];
  const balancesRows: Record<string, unknown>[] = [];
  const snapshotRows: Record<string, unknown>[] = [];
  const runUpdates: Record<string, unknown>[] = [];

  const claimResult: InsertResultRow = {
    numInsertedOrUpdatedRows: opts.claimSucceeds ? 1n : 0n,
  };

  const payoutRunsInsert = makeInsertBuilder(() => {}, claimResult);
  const payoutRunsUpdate = makeUpdateBuilder((v) =>
    runUpdates.push(v as Record<string, unknown>),
  );
  const payoutsInsert = makeInsertBuilder(
    (rows) => payoutsRows.push(...(rows as Record<string, unknown>[])),
    { numInsertedOrUpdatedRows: 0n },
  );
  const balancesInsert = makeInsertBuilder(
    (rows) => balancesRows.push(...(rows as Record<string, unknown>[])),
    { numInsertedOrUpdatedRows: 0n },
  );
  const snapshotsInsert = makeInsertBuilder(
    (rows) => snapshotRows.push(...(rows as Record<string, unknown>[])),
    { numInsertedOrUpdatedRows: 0n },
  );

  const trx = {
    insertInto: vi.fn((table: string) => {
      if (table === 'payouts') return payoutsInsert;
      if (table === 'balances') return balancesInsert;
      if (table === 'weeklySnapshots') return snapshotsInsert;
      throw new Error(`unexpected insertInto('${table}') in transaction`);
    }),
    updateTable: vi.fn((table: string) => {
      if (table === 'payoutRuns') return payoutRunsUpdate;
      throw new Error(`unexpected updateTable('${table}') in transaction`);
    }),
  };

  const insertInto = vi.fn((table: string) => {
    if (table === 'payoutRuns') return payoutRunsInsert;
    throw new Error(`unexpected insertInto('${table}')`);
  });
  const updateTable = vi.fn((table: string) => {
    if (table === 'payoutRuns') return payoutRunsUpdate;
    throw new Error(`unexpected updateTable('${table}')`);
  });
  const transaction = vi.fn(() => ({
    execute: async (cb: (trx: unknown) => Promise<void>) => cb(trx),
  }));

  const entries = opts.entries ?? [];
  const set = vi.fn(async () => (opts.lockAcquires === false ? null : 'OK'));
  const releaseLock = vi.fn(async () => 1);
  const get = vi.fn(async () => String(opts.pool));
  const zrevrange = vi.fn(async () => entries.flat());
  const incrby = vi.fn(async () => 0);
  const expire = vi.fn(async () => 1);

  const deps = {
    redis: {
      set,
      releaseLock,
      get,
      zrevrange,
      incrby,
      expire,
    } as unknown as AppDeps['redis'],
    mongoDb: {} as unknown as AppDeps['mongoDb'],
    mongoReady: () => false,
    db: { insertInto, updateTable, transaction } as unknown as AppDeps['db'],
  } satisfies AppDeps;

  return {
    deps,
    payoutsRows,
    balancesRows,
    snapshotRows,
    runUpdates,
    insertInto,
    updateTable,
    transaction,
    set,
    get,
    zrevrange,
    incrby,
  };
}

async function post(deps: AppDeps, headers?: Record<string, string>) {
  const app = await buildApp(config, deps);
  try {
    return await app.inject({
      method: 'POST',
      url: '/internal/payout',
      headers,
    });
  } finally {
    await app.close();
  }
}

describe('POST /internal/payout — auth', () => {
  it('rejects a request with no secret header', async () => {
    const { deps } = buildDeps({ claimSucceeds: true, pool: 0 });
    const res = await post(deps);
    expect(res.statusCode).toBe(401);
  });

  it('rejects a request with the wrong secret', async () => {
    const { deps } = buildDeps({ claimSucceeds: true, pool: 0 });
    const res = await post(deps, { 'x-internal-secret': 'not-the-secret' });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /internal/payout — idempotency (testing priority #6)', () => {
  it('returns already_run and touches no Postgres writes when the claim loses the race', async () => {
    const { deps, transaction, updateTable } = buildDeps({
      claimSucceeds: false,
      pool: 1000,
    });
    const res = await post(deps, { 'x-internal-secret': SECRET });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('already_run');
    expect(transaction).not.toHaveBeenCalled();
    expect(updateTable).not.toHaveBeenCalled();
  });
});

describe('POST /internal/payout — lock (README §3.4, invariant 11)', () => {
  it('returns lock_held and never touches Postgres when the lock is already held', async () => {
    const { deps, insertInto, transaction } = buildDeps({
      claimSucceeds: true,
      pool: 1000,
      lockAcquires: false,
    });
    const res = await post(deps, { 'x-internal-secret': SECRET });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('lock_held');
    expect(insertInto).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });
});

describe('POST /internal/payout — empty pool (README §3.4 edge case)', () => {
  it('marks the run completed with paidCount 0 and writes no payout rows', async () => {
    const { deps, payoutsRows, balancesRows, snapshotRows, runUpdates } =
      buildDeps({ claimSucceeds: true, pool: 0 });
    const res = await post(deps, { 'x-internal-secret': SECRET });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      status: 'completed',
      pool: 0,
      paidCount: 0,
    });
    expect(payoutsRows).toHaveLength(0);
    expect(balancesRows).toHaveLength(0);
    expect(snapshotRows).toHaveLength(0);
    expect(runUpdates).toEqual([
      expect.objectContaining({ status: 'completed', poolMinor: 0 }),
    ]);
  });
});

describe('POST /internal/payout — non-empty pool', () => {
  it('pays 1-based ranks matching distributeRewards, rolling the remainder into next week’s pool', async () => {
    // Only 5 of 100 paid ranks present: most of the tail rolls over (README
    // §3.4 edge case) rather than summing to the full pool — the curve math
    // itself is covered by test/rewards.test.ts, this just checks the wiring.
    const entries: [string, string][] = [
      flatEntry('p1', 500),
      flatEntry('p2', 400),
      flatEntry('p3', 300),
      flatEntry('p4', 200),
      flatEntry('p5', 100),
    ];
    const { awards, rollover } = distributeRewards(1000, entries.length, 1);

    const { deps, payoutsRows, balancesRows, snapshotRows, incrby } = buildDeps(
      { claimSucceeds: true, pool: 1000, entries },
    );

    const res = await post(deps, { 'x-internal-secret': SECRET });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      status: 'completed',
      pool: 1000,
      paidCount: 5,
    });

    expect(payoutsRows).toHaveLength(5);
    expect(payoutsRows.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(payoutsRows.map((r) => r.playerId)).toEqual([
      'p1',
      'p2',
      'p3',
      'p4',
      'p5',
    ]);
    expect(payoutsRows.map((r) => r.amountMinor)).toEqual(awards);

    expect(balancesRows).toHaveLength(5);
    expect(balancesRows.map((r) => r.balanceMinor)).toEqual(awards);

    expect(snapshotRows).toHaveLength(5);
    expect(snapshotRows.map((r) => r.earningsMinor)).toEqual([
      500, 400, 300, 200, 100,
    ]);
    expect(snapshotRows.map((r) => r.amountMinor)).toEqual(awards);

    expect(rollover).toBeGreaterThan(0);
    expect(incrby).toHaveBeenCalledTimes(1);
    expect(incrby.mock.calls[0]?.[1]).toBe(rollover);
  });

  it('sums exactly to the pool when all 100 paid ranks are present (testing priority #5)', async () => {
    const entries: [string, string][] = Array.from({ length: 100 }, (_, i) =>
      flatEntry(`p${i + 1}`, 1000 - i),
    );
    const { deps, payoutsRows, incrby } = buildDeps({
      claimSucceeds: true,
      pool: 1_000_000,
      entries,
    });

    const res = await post(deps, { 'x-internal-secret': SECRET });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      status: 'completed',
      pool: 1_000_000,
      paidCount: 100,
    });

    const total = payoutsRows.reduce(
      (sum, r) => sum + (r.amountMinor as number),
      0,
    );
    expect(total).toBe(1_000_000);
    expect(incrby).not.toHaveBeenCalled();

    // Monotonically non-increasing by rank (README §3.5 rounding rule).
    const amounts = payoutsRows.map((r) => r.amountMinor as number);
    for (let i = 1; i < amounts.length; i++) {
      expect(amounts[i]).toBeLessThanOrEqual(amounts[i - 1] as number);
    }
  });
});
