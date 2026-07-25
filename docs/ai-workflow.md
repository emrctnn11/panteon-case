# AI workflow log

Chronological record of AI-assisted development moments. Feeds README §5.
Newest entries on top. Dated, factual, 2–3 lines each — no embellishment.

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
