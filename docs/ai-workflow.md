# AI workflow log

Chronological record of AI-assisted development moments. Feeds README §5.
Newest entries on top. Dated, factual, 2–3 lines each — no embellishment.

## 2026-07-25
README §4 says Mongo events are "written in batches", but CLAUDE.md invariant 15 rules out
the obvious reading (in-memory buffer + periodic flush — module-level state, exactly what's
banned). Flagged the conflict and asked instead of picking silently; user confirmed "batch"
means a caller passing multiple documents to one `insertMany` call, not a cross-request
buffer — `mongo/eventLog.ts#logEvents` takes `events: T[]`, a single submission is just the
length-1 case, no timer/counter anywhere.

## 2026-07-25
`mongo/eventLog.ts` verified against an ephemeral `mongo:7` container: single event, a 3-event
batch in one round trip, an empty-batch no-op, and (with a temporary unique index to force a
duplicate-key error) that `insertMany(..., { ordered: false })` writes the valid documents in
a batch and still throws — the error propagates to the caller rather than being swallowed, per
CLAUDE.md's no-silent-catches convention.

## 2026-07-25
Redis access module (`redis/client.ts`, `scoreboard.ts`, `pool.ts`, `cache.ts`) wraps
`writeScore.lua`/`readWindow.lua` via ioredis `defineCommand`. Resolved the `.lua`-not-copied-
to-`dist/` gap flagged earlier: added `scripts/copy-lua.mjs` (plain `fs`, no new dependency),
wired into `npm run build`. Verified end-to-end against an ephemeral `redis:7` container:
idempotent replay, tie-break ordering (earlier arrival wins, higher earnings beats worst
arrival), `readWindow`'s null-for-absent-player and start-clamp near rank 0, pool accumulation,
and cache TTL expiry all matched expectations — no surprises this round.

## 2026-07-25
`import Redis, { type X } from 'ioredis'` failed to typecheck under this project's
`NodeNext`/`verbatimModuleSyntax` config ("Cannot use namespace 'Redis' as a type") even
though ioredis's own `.d.ts` exports a usable default. Switched to the named import
`import { Redis, type X } from 'ioredis'`, which resolves correctly — a module-resolution
quirk, not a design decision, noted here so it isn't rediscovered from scratch later.

## 2026-07-25
Postgres access (Kysely) and migration tool (node-pg-migrate) were both marked "ask before
choosing" in CLAUDE.md — asked before scaffolding rather than picking one; user chose Kysely
+ node-pg-migrate over raw pg/Prisma and Kysely's own migrator/hand-rolled SQL runner.

## 2026-07-25
`payout_runs` schema: README §3.4 describes a claim step followed by a separate completing
transaction, but doesn't name a status column. Modeled it as two explicit states
(`'claimed'` → `'completed'`) with `pool_minor` nullable until completion, since the pool
amount isn't known until Redis is read *after* the claim — inferred, not in the brief, flagged here.

## 2026-07-25
Verified `migrations/*_init-schema.sql` against an ephemeral `postgres:16` Docker container
(same pattern as the earlier Lua verification): confirmed the `payout_runs` ON CONFLICT DO
NOTHING guard affects 0 rows on a repeat claim, the `(week_id, player_id)` PK on `payouts`
rejects a duplicate, negative-balance/out-of-range-rank CHECKs reject bad rows, and
`migrate:down` fully reverses `migrate:up`.

## 2026-07-25
Lua scripts can't be exercised by Vitest (ioredis-mock doesn't run Lua). Rather than trust
review, verified `writeScore`/`readWindow` by EVAL against an ephemeral `redis:7` Docker
container — proved GT idempotency (a replayed total is a no-op, pool unchanged) and the
`ZREVRANGE` start-clamp (rank 0 doesn't wrap to the set's tail). Also flagged: `tsc` won't
copy `.lua` into `dist/`, so the loader/build must handle that at the ioredis-wiring step.

## 2026-07-25
`core/scripts/writeScore.lua` design. Considered precomputing the pool delta server-side and
passing it as ARGV; rejected — it must be derived from the old score read *inside* the same
script (ZSCORE → decode), or a stale separately-read value breaks the atomic score/pool coupling
(invariant 6). Compare on the composite score, not raw, so a replayed same-total (later, smaller
time term → lower composite) is rejected for free (idempotency, invariant 8).

## 2026-07-25
`core/rewards.ts` reward curve. Considered summing the float shares to get the pool total;
rejected because IEEE-754 drift could over/under-shoot by a unit. Derived `leftover` from the
integer floor-sum instead, so Σ awards === pool exactly by construction. Remainder handed out
top-rank-first (not largest-remainder) to keep awards monotonically non-increasing (README §3.5).

## 2026-07-25
`core/week.ts` ISO week key. Flagged a bug the naive version would ship: date-fns reads a Date's
*local* fields, so `getISOWeek` on a non-UTC server resolves a Monday-00:00-UTC instant to the
previous week (verified: W01 vs correct W02 under TZ=America/New_York, invariant 10). Fixed by
shifting UTC calendar fields into a local-field Date. Chose date-fns over a hand-rolled impl
(user call) for battle-tested ISO boundaries — added `date-fns` as a dependency.

## 2026-07-25
`core/score.ts` composite encode. CLAUDE.md convention says internal fns assume valid input, but
the time term must be clamped (invariant 3) and raw earnings can't be clamped without lying about
the score. Chose to fail loud: `encodeScore` throws `RangeError` on negative/non-integer/over-ceiling
earnings rather than silently corrupting the packed bits.

## 2026-07-25
In `server/src/config/env.ts` the env-validation error handler first used `z.prettifyError()`,
a zod v4 API absent from the pinned zod 3.24 — it would have thrown at runtime on the first bad
config. Caught before running and replaced with manual `error.issues` formatting.

## 2026-07-25
Scaffolded `server/` and `client/` as separate TS-strict/ESM projects. Chose Fastify over
Express (first-class types, schema hooks pairing with zod). Kept scope to a runnable skeleton
(health route + placeholder App) rather than wiring ioredis/pg/Mongo now, to avoid a premature
Postgres-access decision (raw pg vs Kysely vs Prisma) still marked undecided in CLAUDE.md.

## 2026-07-25
Chose to encode CLAUDE.md's rules as executable Claude Code skills rather than rely on
manual recall each session. Wrote three project skills: `check-invariants` (audits a diff
against the 20 hard invariants), `new-endpoint` (scaffolds a route in the mandatory
validation→service→typed-return layer order), and `wtf-log` (this log's own writer).
