import type { ColumnType } from 'kysely';

/**
 * Hand-typed mirror of `migrations/*_init-schema.sql` — the migration file is the
 * source of truth, this is kept in sync by hand (no codegen tool chosen).
 *
 * Table/column names are camelCase here because `db/client.ts` installs Kysely's
 * `CamelCasePlugin`, which maps them to the actual snake_case DB identifiers
 * (`payoutRuns` ↔ `payout_runs`, `balanceMinor` ↔ `balance_minor`, ...).
 *
 * `node-postgres` returns BIGINT columns as `string`, not `number` — JS numbers
 * lose precision past 2^53 and this project's own earnings ceiling
 * (`core/score.ts` MAX_EARNINGS, ~550B) is close enough to that boundary that
 * silently narrowing to `number` here would be its own invariant-1 violation.
 * Every money column is therefore typed `string` on select, accepting
 * `string | number` on insert/update for caller convenience.
 */
type Money = ColumnType<string, string | number, string | number>;
type Timestamp = ColumnType<Date, string | undefined, never>;

export interface PlayersTable {
  playerId: string;
  displayName: string;
  createdAt: Timestamp;
}

export interface BalancesTable {
  playerId: string;
  balanceMinor: Money;
  updatedAt: ColumnType<Date, string | undefined, string>;
}

export interface PayoutRunsTable {
  weekId: string;
  status: 'claimed' | 'completed';
  poolMinor: ColumnType<
    string | null,
    string | number | undefined,
    string | number
  >;
  claimedAt: Timestamp;
  completedAt: ColumnType<Date | null, undefined, string>;
}

export interface PayoutsTable {
  weekId: string;
  playerId: string;
  rank: number;
  amountMinor: Money;
  createdAt: Timestamp;
}

export interface WeeklySnapshotsTable {
  weekId: string;
  rank: number;
  playerId: string;
  earningsMinor: Money;
  amountMinor: Money;
}

export interface Database {
  players: PlayersTable;
  balances: BalancesTable;
  payoutRuns: PayoutRunsTable;
  payouts: PayoutsTable;
  weeklySnapshots: WeeklySnapshotsTable;
}
