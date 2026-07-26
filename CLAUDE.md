# CLAUDE.md

Weekly leaderboard system for an idle/clicker game. Stateless Node.js + TypeScript backend,
React + TypeScript client, deployed on a single AWS EC2 t3.micro.

**Architectural rationale lives in `README.md`.** Read it once at the start of a session.
Do not restate its reasoning in code comments — reference the section instead (e.g. `// see README §3.2`).

---

## Repo layout

Client and server are **separate projects** (hard requirement from the brief).

```
server/    Node.js + TypeScript API
client/    React + TypeScript SPA
infra/     nginx config, docker-compose, EventBridge setup, deploy notes
docs/      ai-workflow.md, design notes
```

Never place client code under `server/` or vice versa. No shared build step; if a type must be
shared, duplicate it or copy it explicitly — do not introduce a monorepo tool.

## Commands

```bash
# server/
npm run dev            # local dev
npm run build          # tsc build
npm run test           # unit tests
npm run seed           # generate demo players
npm run lint

# client/
npm run dev
npm run build
npm run test
```

Keep this section updated as scripts are added.

---

## Stack decisions

Locked:

- **Runtime:** Node.js 20+, TypeScript strict mode, ESM
- **Redis client:** `ioredis` (`defineCommand` for Lua scripts — registers via `EVALSHA` automatically)
- **Data stores:** Redis (live ranking + cache), PostgreSQL (money, payouts), MongoDB Atlas (event log)
- **Client polling:** TanStack Query (`refetchInterval`, background pause, retry/backoff built in)
- **Client build:** Vite

Not yet decided — **ask before choosing**, do not pick silently:

- HTTP framework (Fastify vs Express)
- Postgres access (raw `pg` vs Kysely vs Prisma)
- Migration tool
- Validation library (likely `zod`)
- Test runner (likely Vitest)
- Styling approach
- List virtualization library

---

## Hard invariants

These encode decisions that are expensive or impossible to reverse later. **Never violate one
without explicitly flagging it and getting confirmation.**

### Money and scores

1. **Money is always integers in the smallest unit (hundredths).** Never `INCRBYFLOAT`, never
   float arithmetic on currency, never `parseFloat` on a monetary value.
2. **The composite score formula is fixed:** `raw × 2^14 + (10080 − minutesElapsed)`.
   `SHIFT = 16384`, `WEEK_MINUTES = 10080`. Decode with `Math.floor(score / SHIFT)`.
3. **The time term must be clamped to `[0, 10080]`.** An unclamped negative term silently
   corrupts the earnings bits.
4. **`minutesElapsed` is computed server-side only.** Never accept it from the request body.
5. **Sorted set members are the raw player ID.** Nothing appended, nothing encoded. `ZREVRANK`
   on a bare player ID must always work.

### Redis

6. **Score write and pool increment happen in one Lua script.** Never as two commands.
7. **Rank lookup and window fetch happen in one Lua script.** Never as two commands — the rank
   can shift in between and the window may not contain the player.
8. **Reject non-increasing scores** (`GT` semantics). This is what makes retries safe.
9. **The week key is derived server-side from the current time**, never taken from a request.
   Use ISO week-year (`getISOWeekYear`), never `getFullYear()`.
10. **All time handling is UTC.** Local time only at render.

### Payout

11. **Every payout run starts with `INSERT INTO payout_runs ... ON CONFLICT DO NOTHING`** and
    exits if zero rows were affected. The Redis lock is an optimisation, not the guarantee.
12. **Payout writes happen in a single Postgres transaction** — payouts, balances, snapshot,
    and run status together or not at all.
13. **The payout endpoint derives its own target week.** No week parameter is accepted.
14. **`payouts` is keyed on `(week_id, player_id)`.** Never drop that constraint.

### Statelessness

15. **No in-memory state that outlives a request.** No module-level caches, counters, sessions,
    timers, or `setInterval`. Anything persistent goes to Redis or Postgres.
16. **No scheduler inside the application process.** Scheduling is EventBridge's job.
17. Any request must be serviceable by any instance. Two Node containers run behind nginx
    specifically to prove this — don't write code that would break if a second one started.

### Read path

18. **Never use SQL `OFFSET` for ranked pagination.** Ranking comes from Redis, always.
19. **Shared and personal responses stay separate endpoints.** `/top` must remain cacheable —
    never leak per-player data into it.
20. **Enrichment is bounded.** Only ever look up profiles for the ~100 cached + ~6 window rows.

### Mongo (secondary store)

21. **Redis and Postgres are required at startup — they are the source of truth.**
    MongoDB must never block startup or fail a request; it is a secondary
    observation store (see README §2, "Why three data stores").

---

## Conventions

- TypeScript `strict: true`. No `any`. No non-null assertions without a comment explaining why.
- Errors: no silent catches. Either handle meaningfully or let it propagate to the error handler.
- Validate all external input at the boundary; internal functions assume valid input.
- Config comes from environment variables, parsed and validated once at startup. Never
  `process.env` deep in business logic. The payout curve exponent `α` is config, not a constant.
- No secrets in code or committed files.
- Lua scripts live in their own `.lua` files, not inline template strings.
- Prefer small, single-purpose modules. If a file passes ~250 lines, propose a split.

### React

- Components must be reusable and composable — this is an explicit grading criterion.
- Presentational components take data via props and stay free of fetching logic.
- Data fetching lives in hooks (`useLeaderboard`, `usePlayerWindow`), not in components.
- The row component is shared between the top-100 list and the personal window. Do not write
  two near-identical row components.
- Must work on mobile. Test narrow viewports as you go, not at the end.

---

## Working agreement

- **Plan before writing.** For anything beyond a small edit, state the approach and wait.
- **Small, reviewable diffs.** One concern at a time. Do not refactor unrelated code alongside
  a feature.
- **No unrequested dependencies.** Propose and justify first.
- **No speculative abstractions.** No plugin systems, no generic repository layers, no config
  options nothing reads. Build what is needed now.
- **Do not invent requirements.** If the brief or README is ambiguous, ask — the ambiguity is
  usually a real design decision, not an oversight.
- **Never claim something is tested or working without running it.**
- If an invariant above blocks a request, say so explicitly rather than working around it.

---

## Testing priorities

Coverage is not the goal; these specific areas are, because they are subtle and expensive
when wrong:

1. **ISO week-year boundaries** — `2027-01-01` must resolve to `2026-W53`.
2. **Composite score encode/decode round-trip**, including clamping at both ends and the
   maximum representable earnings value.
3. **Tie-breaking order** — equal earnings, different arrival times; and higher earnings with
   the worst possible arrival time must still outrank lower earnings.
4. **Idempotency** — replaying the same total is a no-op; an out-of-order lower total is rejected.
5. **Payout curve** — distributed total equals the pool exactly, and awards are monotonically
   non-increasing by rank.
6. **Payout run guard** — invoking the endpoint twice pays out once.
7. **Fewer than 100 ranked players**, and an empty pool.

---

## AI workflow log — maintain this as we go

`docs/ai-workflow.md` feeds README §5, which is a graded criterion. It cannot be reconstructed
afterwards, so it has to be written while the work happens.

**Append an entry whenever any of these occur:**

- I reject or correct a suggestion you made — record what was proposed, why it was wrong, and
  what replaced it.
- You flag a problem I hadn't considered.
- We choose between real alternatives — record the options and the deciding reason.
- I make a call on product or budget grounds rather than technical ones.

Keep entries to two or three lines, dated, factual. No embellishment — this document's value
is that it is true, and it will be read by someone who can ask follow-up questions about it.
