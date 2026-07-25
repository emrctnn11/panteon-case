-- Up Migration

-- Money-of-record tables: players, balances, payouts, payout_runs, weekly snapshot.
-- See CLAUDE.md invariants 1, 11-14 and README §3.4. All money columns are BIGINT
-- minor units (invariant 1) — never NUMERIC/FLOAT, never INCRBYFLOAT-style drift.

CREATE TABLE players (
  player_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE balances (
  player_id TEXT PRIMARY KEY REFERENCES players (player_id),
  balance_minor BIGINT NOT NULL DEFAULT 0 CHECK (balance_minor >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Two-phase run guard (README §3.4 execution order):
--   1. 'claimed'   — the guard INSERT ... ON CONFLICT (week_id) DO NOTHING (invariant 11)
--   2. 'completed' — set inside the same transaction that writes payouts/balances/snapshot
--                    (invariant 12); pool_minor is only known once Redis is read, which
--                    happens after the claim, so it stays NULL until then.
CREATE TABLE payout_runs (
  week_id TEXT PRIMARY KEY CHECK (week_id ~ '^\d{4}-W\d{2}$'),
  status TEXT NOT NULL DEFAULT 'claimed' CHECK (status IN ('claimed', 'completed')),
  pool_minor BIGINT CHECK (pool_minor >= 0),
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- Keyed on (week_id, player_id) — invariant 14, makes an individual payout unwritable twice.
CREATE TABLE payouts (
  week_id TEXT NOT NULL REFERENCES payout_runs (week_id),
  player_id TEXT NOT NULL REFERENCES players (player_id),
  rank INTEGER NOT NULL CHECK (rank BETWEEN 1 AND 100),
  amount_minor BIGINT NOT NULL CHECK (amount_minor >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (week_id, player_id)
);

-- "Last week's results" screen (README §3.4) — read by week, joined to players for
-- display name, never touches Redis once the run has completed.
CREATE TABLE weekly_snapshots (
  week_id TEXT NOT NULL REFERENCES payout_runs (week_id),
  rank INTEGER NOT NULL CHECK (rank BETWEEN 1 AND 100),
  player_id TEXT NOT NULL REFERENCES players (player_id),
  earnings_minor BIGINT NOT NULL CHECK (earnings_minor >= 0),
  amount_minor BIGINT NOT NULL CHECK (amount_minor >= 0),
  PRIMARY KEY (week_id, rank)
);

-- Down Migration

DROP TABLE weekly_snapshots;
DROP TABLE payouts;
DROP TABLE payout_runs;
DROP TABLE balances;
DROP TABLE players;
