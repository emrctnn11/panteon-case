# Weekly Leaderboard System

A stateless leaderboard backend + client for an idle/clicker game with ~10M registered
players and ~2M DAU. Weekly competition, automatic prize pool, automatic payout.

- **Live demo:** https://panteoncase.duckdns.org
- **Stack:** Node.js + TypeScript, PostgreSQL, MongoDB, Redis, React + TypeScript, AWS EC2

---

## 1. The problems, and how each one is solved

The brief describes a leaderboard that "works, but barely." Each complaint has a
specific technical cause, and each cause is addressed directly.

### "The leaderboard takes forever to load."

**Cause:** ranking computed on read. Any `ORDER BY score` over millions of rows either
scans or leans on an index that must be re-walked on every request, and the result is
recomputed identically for every one of the 2M players.

**Solution:** ranking is maintained as a data structure, not a query. Each week lives in
a Redis Sorted Set (`lb:2026-W30`), where ordering is intrinsic. Retrieval is
`ZREVRANGE key 0 99` — O(log N + 100), independent of how many players exist.

The top-100 payload is identical for every player, so it is enriched once (names,
avatars) and cached as a single Redis string with a 5s TTL, then served with
`Cache-Control: public, max-age=5` so nginx absorbs the majority of reads before they
reach Node. The expensive path runs ~0.2 times per second instead of once per request.

### "I can see the top players fine, but I can't find my own rank."

**Cause:** the old system could only paginate forward. Finding your own position meant
scanning until you appeared.

**Solution:** `ZREVRANK` returns a player's rank directly in O(log N), with no scan.
The surrounding window (3 above, 2 below) is fetched by rank offset in the same call.

Rank lookup and window fetch run inside a single Lua script. This matters: between two
separate commands, concurrent writes can shift the player's rank, and the returned
window may not contain the player at all. Redis executes Lua atomically, so the rank and
the window are always drawn from the same snapshot.

Additionally, the write path itself returns the player's new rank — every score
submission tells the client where it now stands, with no extra request.

### "My friend is in the top 50 but the page just freezes when I scroll down."

**Cause (server):** deep pagination. `OFFSET 5000` forces the database to walk and
discard 5,000 rows before returning anything; latency grows linearly with depth.

**Cause (client):** rendering thousands of DOM nodes at once.

**Solution (server):** in a sorted set, offset is free. `ZREVRANGE 50000 50049` costs
essentially the same as `ZREVRANGE 0 49`. Because deep access is no longer expensive,
the API exposes rank-based pagination (`?from=&limit=`) and lets players browse the
entire ladder — something the original system could not afford to offer at all.
`limit` is an allowlist (`{20, 50, 100}`) and `from` is snapped server-side to a
multiple of `limit`, so page requests collapse onto a bounded set of shared cache keys
rather than letting a caller mint arbitrary ones. `from` is also capped at `TOP_MAX_FROM`
(1,000,000) — sufficient for the demo scale (~750k seeded); in production this is raised
to the actual player count so legitimate deep access is not cut off.

**Solution (client):** the list is virtualized; only visible rows are mounted, and only
the pages in view keep polling — pages scrolled past freeze until they return to the
viewport (see §3.7).

### "Rewards should go out automatically at the end of the week."

**Solution:** a scheduled AWS EventBridge Rule fires weekly at `cron(5 0 ? * MON *)`
UTC against a secret-protected internal endpoint. Payout is computed from the frozen
previous week, written to PostgreSQL in a single transaction, and guarded so that it
can never run twice. Details in §3.

---

## 2. Architecture

```
                 ┌──────────────────────────────┐
  Browser ──────▶│ nginx (TLS, static, cache)   │
                 │        ├─ Node instance #1   │
                 │        └─ Node instance #2   │
                 │   Redis · PostgreSQL          │   EC2 t3.micro
                 └──────────────┬───────────────┘
                                │
                        MongoDB Atlas (M0)

  EventBridge Rule ──weekly──▶ POST /internal/payout
```

**Stateless by construction.** No session state, no in-memory counters, no scheduler
inside the application process. Authentication is JWT-based. Any request can be served
by any instance — the two Node containers behind nginx exist specifically to demonstrate
this, not for capacity.

### Why three data stores

Each store is chosen for its access pattern, not for coverage.

| Store | Holds | Why |
|---|---|---|
| **Redis** | Live weekly sorted set, prize pool counter, response cache, payout lock | Ordering and range queries in O(log N). Volatile, but fully reconstructible |
| **PostgreSQL** | Players, balances, `payouts`, `payout_runs`, weekly snapshots | Money lives here. ACID transactions and uniqueness constraints are non-negotiable |
| **MongoDB** | Score submission events, audit trail, analytics | High-volume append-only writes, flexible schema, no transactional requirement |

MongoDB's event log doubles as a recovery source: if Redis is lost, the ladder can be
rebuilt. Partial recovery is in fact automatic — because clients submit absolute
totals (§3.1), each player's next submission restores their own score.

A Mongo outage does not take the leaderboard down — startup and the request path do
not depend on it (CLAUDE.md invariant 21).

---

## 3. Design decisions

### 3.1 Write path: absolute totals, not deltas

Clients aggregate locally and submit their **current weekly total** every ~30s, rather
than reporting each increment.

At an estimated ~150k concurrent players, per-second reporting would mean 150k writes/s.
Batching at 30s intervals reduces this to ~5k writes/s — the same information, ~30x less
load. Scale problems are usually solved by reducing traffic to the database, not by
making the database faster.

Absolute totals are used instead of deltas because they are **idempotent by nature**.
Mobile networks retry; a duplicated delta corrupts the score permanently, while a
duplicated total is a no-op. Out-of-order arrivals are rejected for free by the same
comparison. Achieving equivalent safety with deltas would require an idempotency-key
store — additional state, on a memory-constrained box.

Score and prize pool are updated in one atomic Lua script. They are logically coupled
(the pool is 2% of total earnings), and updating them as separate commands guarantees
eventual divergence: a crash between the two leaves the pool permanently wrong. When one
value is derived from another, either update them atomically or derive one at read time.

The script is registered via `SCRIPT LOAD` and invoked with `EVALSHA`, so the body is
not transmitted on every call.

**Money is stored as integers** in the smallest unit (hundredths). Accumulating a 2%
share as floating point across millions of weekly writes drifts; by the end of the week
the pool no longer reconciles. In integer units, 2% of a delta is exactly `delta * 2` —
no division, no drift.

**Trade-off, stated openly:** submitting absolute totals means the client is authoritative
over its own earnings. This case is not an anti-cheat exercise, so the accepted mitigation
is server-side rate limiting plus a plausibility ceiling on growth per interval. In
production, earnings would be validated server-side — either through a server-authoritative
simulation or signed, sequenced event batches.

### 3.2 Composite score for tie-breaking

Redis orders equal scores lexicographically by member. That is deterministic, so ranks
don't jitter — but it means ties are resolved by player ID. In a leaderboard where the
boundary between rank 100 and 101 decides whether a player is paid, alphabetical
tie-breaking is not defensible.

Ties are instead resolved in favour of whoever reached the amount **first**:

```
score = raw_earnings × 2^14 + (10080 − minutes_elapsed_in_week)
```

The right-hand term is larger for earlier arrivals, so under descending order the earlier
player wins. Raw earnings are recovered with `floor(score / 2^14)`.

**The bit budget.** Redis scores are IEEE-754 doubles: 53 bits of exact integer range.
The choice of `k` follows one constraint — `2^k > WEEK_DURATION` — which guarantees that
one additional unit of earnings always outweighs any possible timing advantage. With
minute resolution, a week is 10,080 minutes, so `k = 14`. That leaves 39 bits for
earnings: a ceiling of ~550 billion per week.

| Resolution | Week length | k | Bits left for earnings | Max earnings |
|---|---|---|---|---|
| Second | 604,800 | 20 | 33 | ~8.6 B |
| **Minute** | **10,080** | **14** | **39** | **~550 B** |
| 10 minutes | 1,008 | 10 | 43 | ~8.8 T |

Minute resolution was chosen because idle-game economies inflate quickly and an 8.6B
ceiling is too low. If earnings ever approach the ceiling, the leaderboard currency can
be scaled (e.g. counted in thousands) without touching the ranking logic. Two players
reaching the same total within the same minute fall back to lexicographic order, which
is an acceptable residual.

Two safeguards: `minutes_elapsed` is computed **server-side** (a client sending `0`
would win every tie), and the time term is clamped to `[0, 10080]` — a clock skew or a
write landing after the boundary would otherwise push the term negative and silently
borrow a unit from the earnings bits. Bit-packed fields must always be clamped, because
overflow produces wrong answers rather than errors.

**Members remain the raw player ID.** Encoding time into the member string is an
alternative way to break ties, but it would make `ZREVRANK <playerId>` impossible — and
that single query is the core of the "find my own rank" feature.

### 3.3 Time: UTC everywhere

All week boundaries are UTC. This is not only hygiene: under a DST-observing local time,
a week is occasionally 23 or 25 hours long, which breaks the `WEEK_DURATION = 10080`
constant that the composite score depends on. In UTC, a week is always exactly 604,800
seconds. Local time is applied only when rendering.

Week keys use **ISO week-year**, not calendar year. `2027-01-01` is a Friday and belongs
to ISO week `2026-W53`; deriving the year with `getFullYear()` would produce a
nonexistent key and silently reset the ladder at New Year. Unit tests cover the boundary
dates.

Because the weekly rollover is Monday 00:00 UTC (03:00 in Turkey), the UI shows a
countdown rather than an absolute time.

### 3.4 Weekly close: three separate problems

**Freezing writes.** No lock is needed. The write path derives the week key from the
current time on every request, so writes migrate to `lb:2026-W31` on their own at the
boundary and the previous week is frozen by definition. Payout runs at 00:05 UTC to
absorb in-flight requests and clock skew. A good data model removes problems that would
otherwise need mechanisms.

**Triggering.** A scheduled AWS EventBridge Rule calls a protected internal endpoint, rather
than `node-cron` inside the application. (A *Rule*, not EventBridge *Scheduler*: Scheduler
cannot target an API destination — only event-bus Rules can — so a raw HTTPS endpoint on a
cron is driven by a scheduled Rule. Same behaviour: one weekly UTC cron, retry policy, DLQ.
See `infra/eventbridge/`.) Scheduling is decoupled from the application
lifecycle, so it survives deploys and does not fire N times when N instances run. Cost
at one invocation per week is effectively zero. The endpoint derives the target week
itself and accepts no week parameter — otherwise anyone reaching that endpoint could
replay an arbitrary week.

**Exactly-once.** A Redis lock (`SET lock:payout:<week> <uuid> NX PX ...`, released via
an atomic compare-and-delete) prevents duplicated work — but a lock is a performance
optimisation, **not a correctness guarantee**. If the job outlives its TTL, a second
worker acquires the lock while the first is still running. Correctness is enforced in
the data itself:

```sql
INSERT INTO payout_runs (week_id, ...) VALUES (...) ON CONFLICT DO NOTHING;
-- 0 rows affected → another run already claimed this week → exit
```

`payouts` is keyed on `(week_id, player_id)`, so an individual payout cannot be written
twice either. This matters concretely because EventBridge is configured with a retry
policy and a DLQ — retries make duplicate invocations a certainty, not an edge case.
Any system with retries must be idempotent; the two are inseparable.

**Execution order:**

1. Claim the week in `payout_runs` (exit if already claimed)
2. Read the frozen ladder and pool from Redis
3. Compute awards
4. Single PostgreSQL transaction: insert `payouts`, credit balances, write the top-100
   snapshot, mark the run `completed`
5. Set a TTL on the week's Redis key (14 days)

Step 4 must be one transaction — splitting the payout record from the balance credit
allows a crash to produce "recorded but unpaid," or the reverse.

Snapshotting the top 100 to PostgreSQL means the "last week's results" screen never
touches Redis, and the expired key can be reclaimed automatically.

Edge cases: with fewer than 100 ranked players, the undistributable remainder rolls into
next week's pool. With an empty pool, the run is skipped but still marked `completed`,
otherwise retries would loop indefinitely.

Payout is synchronous because 100 rows complete in milliseconds. If the reward set grew
substantially (thousands of recipients), the endpoint would return `202` and hand off to
a queue.

### 3.5 Prize distribution curve

The brief fixes the podium — 20% / 15% / 10% — and leaves the remaining 55% across ranks
4–100 to be designed. Two goals compete: rank 4 should not fall off a cliff after the
podium, and rank 100 should still be worth fighting for.

A power-law weight `1 / i^α` expresses both with a single tunable parameter.
**`α = 1.0`** (harmonic) is used.

Shares of a 1,000,000 pool, with rank 3 receiving 100,000 for reference:

| α | Rank 4 | Rank 100 | 4:100 ratio | Character |
|---|---|---|---|---|
| 0.5 | 16,900 | 3,370 | 5:1 | Flat; harsh break after the podium |
| **1.0** | **41,000** | **1,640** | **25:1** | Balanced |
| 1.5 | 79,100 | 630 | 1000:1 | Smooth podium, negligible tail |

At α = 1.0 the drop from rank 3 to rank 4 is ~2.4x — not a flaw but a **podium premium**,
consistent with the brief's own decision to privilege the top three. Rank 100 still
receives ~0.16% of the pool, which remains a meaningful target. A 1/i distribution also
matches Zipf-like expectations and reads as natural in game economies.

`α` is read from configuration, not hardcoded, so the design team can retune the curve
without a deploy.

**Rounding.** Weights are fractional but payouts are integers, so shares are floored and
the remaining units are then distributed one at a time in rank order. Total distributed
equals the pool exactly, to the smallest unit.

Largest-remainder rounding is mathematically more even but can break monotonicity —
rank 50 receiving one unit more than rank 49 looks like a bug on screen. A method that
is "fairer" in the abstract but appears wrong to the user is the wrong method.

### 3.6 Read path: shared vs. personal

The response splits along a single axis: **the top 100 is identical for all 2M players;
the personal window is not.** Conflating them means recomputing shared work per request
and forfeiting cacheability.

- `GET /api/leaderboard/top` — shared, enriched once, `public, max-age=5`, cached at nginx
- `GET /api/leaderboard/me` — personal, ~6 rows, uncacheable but cheap
- `GET /api/leaderboard` — combined, used for the initial load only

The hybrid split exists because these two goals conflict. A single combined endpoint
minimises round trips (which matters on mobile first paint), but it contains personal
data and therefore cannot be cached at any layer. Splitting lets the shared 95% of
polling traffic terminate at nginx.

Because the top-100 cache already carries names, per-request enrichment is limited to
the ~6 players in the personal window — a bounded primary-key lookup.

### 3.7 Freshness: polling, not push

The brief asks for the leaderboard to be **instant**; none of the reported complaints
describe stale numbers. Freshness requirements should be derived from user complaints,
not from the appeal of the technology.

Push was deliberately not adopted. The baseline freshness is already the 5s shared cache
TTL, so SSE would change the transport without improving staleness. The player's own
rank — the number they care about most — is already returned by the write path on every
submission. A persistent connection is state, and in a stateless architecture state is
the most expensive resource to scale: at ~10–40KB of Node memory per connection, 10k
connections consume 100–400MB on a box with ~780MB of headroom. Polling, by contrast,
scales horizontally and terminates at the edge.

The live feel is produced on the client: values animate toward their targets between
polls, and rows transition when ranks change. Polling pauses when the tab or app is
backgrounded, backs off exponentially on error, and updates optimistically when the
player's own submission returns a new rank.

If a genuine real-time requirement appears, SSE plus Redis pub/sub is the intended path.

---

## 4. Scale and measured limits

The demo is seeded with **750k players**, not 10M. Seeding 10M would consume ~970MB in
Redis alone and exhaust a t3.micro, degrading the very performance the system claims —
so the ceiling is measured and documented rather than demonstrated.

- Redis sorted set cost measured at **97.01 bytes per member** (`MEMORY USAGE ... SAMPLES 0`
  on the real seeded 750k-member key, divided by `ZCARD` — not an estimate)
- 750k members ≈ 73MB · 2M ≈ 194MB · 10M ≈ **970MB**
- Query complexity is O(log N), so **latency is flat across this range**; only memory grows
- At 10M weekly-active members, Redis moves to ElastiCache (`cache.t4g.medium`) and the
  application tier scales horizontally behind the load balancer — no code changes, since
  no instance holds state

Seed data is generated with a power-law earnings distribution rather than uniform random,
so the reward curve and the dense competition near rank 100 behave realistically. Fixed
test accounts are provided at rank ~2, ~50, **~102** (just outside the reward boundary),
and ~400,000 (to exercise the personal window and deep pagination).

**Deployment note.** The production architecture places MongoDB on Atlas M0, not on the instance: WiredTiger reserves ~256MB, which doesn't fit alongside Node, Redis and PostgreSQL in 1GB. In this demo, given the short-lived evaluation load, Mongo runs as a container on the same box with a 2GB swap file absorbing the pressure; the move to Atlas is a connection-string change, made painless by the non-blocking Mongo connection (§2/invariant 21). Mongo is the least latency-sensitive component — an append-only event log off the hot path — so it is both the natural candidate to externalise and safe to co-locate for a demo.

---

## 5. AI-assisted development

The full, dated record is `docs/ai-workflow.md` — a running log written *as the
work happened*, not reconstructed afterwards. Every claim below points back to an
entry there. The short version: AI did most of the typing; the design decisions,
and the review that caught where AI was wrong, were mine.

### Tools and where each was used

| Tool | Used for |
|---|---|
| Claude (extended dialogue) | System design forks in §3 — write path, tie-breaking, payout guarantees, read-path caching — argued out with trade-offs before any code |
| Claude Code | Implementation, test-writing, container-backed verification of Lua/SQL/Mongo, and the live EC2 bring-up. Driven against a fixed rule set (see below) |

Two habits made the AI output reviewable rather than trusted:

- **`CLAUDE.md` invariants.** 21 hard rules (money-as-integers, atomic score+pool,
  single-transaction payout, statelessness) written up front, so every suggestion was
  checked against a fixed contract instead of case-by-case judgement.
- **Executable skills.** Those rules were encoded as Claude Code skills —
  `check-invariants` (audits a diff against all 21), `new-endpoint` (enforces the
  validation → service → typed-return layering), `wtf-log` (writes the log below) — so
  the guard rails ran every session instead of relying on recall.

### How the architecture was decided

§3 was produced through back-and-forth, not a single prompt. Each fork — deltas vs.
absolute totals, in-app cron vs. external scheduler, polling vs. push, second vs. minute
score resolution — was framed with its trade-offs and the call was mine; this document is
the actual output of that process.

### Where AI output was corrected or rejected

The log's most important entries are the ones where I *didn't* accept what was proposed:

- **`INCRBYFLOAT` for the pool** — accepted at first, then rejected: float accumulation
  drifts over millions of weekly writes and the pool stops reconciling. Replaced with
  integer minor units (`delta * 2`, no division).
- **A distributed lock described as guaranteeing exactly-once payout** — it does not; TTL
  expiry can overlap a still-running job. The real guarantee was moved to a PostgreSQL
  `ON CONFLICT DO NOTHING` uniqueness constraint, the lock demoted to an optimisation.
- **"EventBridge Scheduler → API destination"** — Scheduler can't target a raw HTTPS
  endpoint; only an event-bus *Rule* can. Corrected after checking AWS docs, not the model.
- **A UTC week-key bug that would have shipped** — date-fns reads a Date's *local* fields,
  so `getISOWeek` on a non-UTC server resolved a Monday-00:00-UTC instant to the wrong
  week. Caught by a boundary unit test (`2027-01-01 → 2026-W53`) before it mattered.
- **A framing I had wrong** — I described the startup task as "make Mongo non-blocking";
  inspection showed Mongo already was, and Redis/Postgres were *not* fail-fast. The actual
  work was the reverse of the request.
- Smaller ones the log also records: a zod-v4 API (`z.prettifyError`) called on pinned
  zod 3.24 (would have thrown on first bad config), and an ioredis import that didn't
  typecheck under `NodeNext`/`verbatimModuleSyntax`.

### What was decided without AI

Product- and budget-driven calls, not technical lookups:

- **α = 1.0** for the rank 4–100 reward curve — a balance between "no cliff after the
  podium" and "rank 100 still worth fighting for" (§3.5); a design judgement, made config
  not constant.
- **Seed 750k, not 10M** — 10M would exhaust the t3.micro's Redis and degrade the very
  performance being demonstrated; the ceiling is measured and documented instead (§4).
- **Hosting topology** — Mongo on Atlas M0, not on the box (WiredTiger's ~256MB won't fit
  alongside Node/Redis/Postgres in 1GB); two Node instances behind nginx to *prove*
  statelessness, not for capacity.
- **Skipping push (SSE/WebSocket)** — no complaint was about staleness, and a persistent
  connection is state on a memory-constrained box; polling that terminates at the edge was
  the right cost (§3.7).
- **Minute score resolution** over second — an 8.6B earnings ceiling is too low for an
  idle-game economy; minute resolution buys ~550B (§3.2).

### Prompting approach

Context was kept grounded by writing the rules down once (`CLAUDE.md`) and referring code
back to numbered README sections rather than re-explaining reasoning each turn. Subtle,
expensive-when-wrong pieces (Lua scripts, migrations, the Mongo event writer) were not
trusted from review alone — they were verified by running them against ephemeral
`redis:7` / `postgres:16` / `mongo:7` Docker containers, and those runs are recorded in
the log. When a decision was a real fork, it was logged immediately (`wtf-log`) so §5
could be written from fact, not memory.

---

## 6. Running locally

Client and server are separate projects (CLAUDE.md), so each has its own
`npm install`. Redis and PostgreSQL run from Docker; MongoDB uses an Atlas
connection string (it is a secondary store — the app starts and serves without
it, §2).

**1. Infra (Redis + PostgreSQL):**

```bash
docker compose -f infra/docker-compose.yml up -d
# Postgres is published on host port 5442 (5432/5433 were taken locally); the
# DATABASE_URL below must match.
```

**2. Server:**

```bash
cd server
cp .env.example .env          # then fill in real values (see below)
npm install
npm run migrate:up            # create players / balances / payouts / snapshots
NODE_ENV=development npm run seed   # ~750k demo players, power-law earnings
npm run dev                   # http://localhost:3000
```

Minimum `.env` for local dev (Redis/Postgres from compose above, a throwaway
Mongo, and two ≥32-char secrets):

```
DATABASE_URL=postgres://leaderboard:leaderboard@localhost:5442/leaderboard
REDIS_URL=redis://localhost:6379
MONGODB_URI=mongodb+srv://<user>:<pass>@<cluster>/leaderboard
JWT_SECRET=<random 32+ chars>
INTERNAL_PAYOUT_SECRET=<random 32+ chars>
```

**3. Client:**

```bash
cd client
npm install
npm run dev                   # http://localhost:5173, /api proxied to :3000
```

**Auth / the personal window.** Player tokens are minted out-of-band — there is
no login flow. `players` has no credential column, so building real auth issuance
was out of scope for this brief; the decision is recorded in `docs/ai-workflow.md`.
In production the game client already holds the player's
JWT and the leaderboard reuses it. For evaluation, set `DEMO_MODE=true` on the
server: the client then shows a **"View as"** picker (top-right) that mints a
token for a seeded account via the demo-only `POST /api/dev/token` and drops it
into `localStorage`. Pick *Rank ~102* or *Rank ~400k* to see the "outside the
top 100" personal window (own rank + 3 above / 2 below). `DEMO_MODE` is an auth
bypass and must stay `false` in a real production build; the client mirror is
`VITE_DEMO_MODE`.

**Payout / "Last week" screen.** The weekly payout is triggered by EventBridge
in production (§3.4); locally, `POST /internal/payout` with the
`x-internal-secret` header runs it once for the just-closed week. After a run
completes, `GET /api/leaderboard/history/latest` (and the client's "Last week"
tab) is populated.

**Tests / build / lint** (each project):

```bash
npm run test && npm run build && npm run lint
```

## 7. What I would do next

- Server-side validation of earnings (see §3.1)
- A real login/token-issuance flow, replacing the `DEMO_MODE` auth bypass (§6) before
  any production use
- Regional and friends leaderboards, reusing the same key-rotation model
- Move Redis to ElastiCache and add read replicas past ~2M weekly-active players
- Load testing to confirm the extrapolation in §4 empirically
