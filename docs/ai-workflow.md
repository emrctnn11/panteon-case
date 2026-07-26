# AI workflow log

Chronological record of AI-assisted development moments. Feeds README §5.
Newest entries on top. Dated, factual, 2–3 lines each — no embellishment.

## 2026-07-26 (13)
Provisioned the EventBridge weekly payout trigger (7.3) and smoke-tested the write path (7.4)
against the live EC2. Caught that nginx only proxied `/api/` — `POST /internal/payout` fell to
the SPA static location and returned 405, so EventBridge would have silently dead-lettered every
week; added an `/internal/` proxy block. Smoke test: first `POST /api/score` moved `pool` 0 →
2,000,000 and returned a rank; replaying the same total returned `applied:false` (GT, invariant 8).
Also: the provisioning IAM role needed `iam:CreateServiceLinkedRole` + scoped `secretsmanager:*`
on `events!connection/*` before `CreateConnection` succeeded — not obvious from the script.

## 2026-07-26 (12)
Chose the hook architecture for visible-only polling. Options: keep `useInfiniteQuery` and
just pin the poll to the first page (small change, but a deep page in view wouldn't stay
live), or move to per-page `useQueries` (larger rewrite of the hook + list, but each page
polls independently). Picked `useQueries` — §3.7 needs whatever page the user is actually
looking at to stay fresh, deep or not; freshness-follows-viewport was the deciding reason.

## 2026-07-26 (11)
Review caught three gaps in the pagination plan. (1) Per-page cache key was still
attacker-driven — fixed by allowlisting `limit` to `{20,50,100}` and snapping `from` to a
multiple of `limit` server-side, so cardinality is (aligned pages × 3) and two users share a
key. (2) A single infinite query refetches every loaded page on poll; replaced with per-page
`useQueries` so only viewport pages poll (§3.7), deep pages freeze until scrolled back. (3)
Exact page-multiple lists (e.g. 40 players) risked an infinite "loading more"; terminal is now
"last loaded page shorter than page size", proven by a 40-player test.

## 2026-07-26 (10)
Rank-based pagination set the client page size to 20. Flagged that this makes the §3.6 Redis
5s string-cache — gated on the exact `(0,100)` page — dead, so the hot first page would hit
Postgres enrichment on every poll. Chose (over "cache only page 0" / "leave it") to key
`topCacheKey` on `(week, from, limit)` and cache every non-empty page; empty pages stay
uncached so absurd `?from=` values can't accumulate keys. `from` also capped (`max 1_000_000`).

## 2026-07-26 (9)
"Couldn't load the leaderboard": client uses `API_BASE_URL = ''` (same-origin, correct for
nginx in prod) but Vite dev had no `/api` proxy, so requests hit the dev server, got
`index.html` (HTTP 200), and `response.json()` threw. Added a dev-only proxy to
`http://localhost:3000` in `vite.config.ts`. Follow-up `ECONNREFUSED` was just the
`tsx watch` restart window, not a real fault — no change needed.

## 2026-07-26 (8)
Task framed as "all three stores are awaited before listen; make Redis/Postgres fail-fast,
Mongo non-blocking." Inspection showed the reverse: Mongo was already non-blocking, and
Redis/Postgres were *not* verified (lazy connect). Actual work was to *add* fail-fast probes
(`redis.ping()`, `select 1`, each bounded by `withTimeout`) and a Mongo readiness gate so a
down secondary store skips the event write instead of stalling the hot path (invariant 21).

## 2026-07-26 (7)
Reward/status messaging scope for the leaderboard row + personal window: offered a
top-100 paid-boundary indicator (no new data) vs. an estimated payout per rank (would
require exposing the reward curve, or duplicating `distributeRewards`' shape client-side —
risking curve/client drift). User chose the boundary indicator only; if an estimate is
wanted later, the server should compute it via `distributeRewards` and return one field,
keeping the curve single-sourced.

## 2026-07-26 (6)
Prize pool has no player-facing endpoint — `redis/pool.ts#getPool` was only read inside
the internal payout job. Offered three options: extend `/top`'s response, add a separate
`/pool` endpoint, or skip the pool indicator this pass. User chose extending `/top` —
the pool is shared data with the same freshness/cache profile as `/top`, and the extra
Redis read costs nothing beyond one more `GET` in the same request. Also added
`weekEndsAt` to the same response for the countdown, for the same reason.

## 2026-07-26 (5)
`usePlayerWindow` needs a JWT but no login endpoint exists (tokens minted out-of-band,
`http/auth.ts`). Offered three options: localStorage set manually, a fixed dev token
baked in via `VITE_*` env var, or deferring the auth-gated hook entirely. User chose
localStorage — a baked-in bundle token was the wrong shape for anything past local
testing, and deferring blocked `/me` for no reason once a real token can just be set.

## 2026-07-26 (4)
`useLeaderboard`/`usePlayerWindow`: proposed adding a third hook for the combined
`GET /api/leaderboard` now (README §3.6's stated initial-load use). User deferred it —
not clear the combined endpoint's cache-bypass cost is worth it over two parallel
`/top` + `/me` calls without measuring first.

## 2026-07-26 (3)
Poll cadence for `useLeaderboard`/`usePlayerWindow`: offered two options (uniform 5s vs a
5s/15s split), both justified purely by cache-TTL/load. User instead derived cadence from
actual freshness need — the player's own rank should update optimistically from the
score-write response (README §3.1), not wait on `/me`'s poll, which only needs to catch
neighbors entering/leaving the window. Both intervals moved to `config/env.ts`, not inline.

## 2026-07-26 (2)
Implemented the 750k-player demo seeder. Real alternative: route bulk writes through
`writeScore.lua` (consistent with the live path) vs. plain pipelined `ZADD` that skips the
pool key entirely. Chose the latter — seeding has no prior total to delta against and the
pool is a real-money figure that should only ever move through the real write path; user
confirmed skipping the pool.

## 2026-07-26
Built `infra/eventbridge/` (AWS CLI script) for the weekly payout trigger. Correction:
README §3.4 says "EventBridge Scheduler", but Scheduler can't target an API destination
(only event-bus Rules can POST to a raw HTTPS endpoint — confirmed against AWS docs).
Replaced with a scheduled EventBridge **Rule** → API destination (Connection injects the
`x-internal-secret` header); same weekly-cron + retry + DLQ behaviour. README §3.4 wording
still to be updated.

## 2026-07-25
Audited the already-built `POST /internal/payout`. Flagged that the `payout_runs` guard keys
on row *existence*, so a crash or a `players`-FK abort after the `claimed` row commits but
before `completed` strands the week permanently unpaid — exactly-once silently degrades to
at-most-once, and no test pins it. Left as a product decision (guard on `completed` vs re-enter
on stale claim vs alert). Fixed only the safe adjacent gap: the pool key never got a TTL, so
`expire(poolKey, 14d)` now runs alongside the sorted-set expire.

## 2026-07-25
`POST /internal/payout`: README calls it "secret-protected" but names no mechanism, and
it has no player identity to reuse `@fastify/jwt` for. Flagged this as a different trust
boundary than player auth and asked instead of picking silently. User chose a
constant-time-compared shared-secret header (`INTERNAL_PAYOUT_SECRET`) over reusing JWT
with a service token — matches EventBridge Scheduler's native static-header support.

## 2026-07-25
`POST /api/score`: README §2 commits to "JWT-based" auth but names no library, and the
`players` table has no credential column — so a login flow was never designed. Flagged
both gaps and asked instead of picking silently. User chose `@fastify/jwt` over
`jsonwebtoken`/`jose`, and verify-only tokens (minted out-of-band, `sub` claim = playerId)
over building a login endpoint — no auth-issuance scope was invented.

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
