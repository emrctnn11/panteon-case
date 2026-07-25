---
name: new-endpoint
description: >-
  Scaffolds a new HTTP endpoint for the server using the project's mandatory layer
  order — zod input validation at the boundary, business logic in a separate service,
  error handling that propagates, and an explicit typed return. Use whenever adding a
  route/endpoint to server/, or when the user says "new endpoint", "yeni endpoint",
  "add a route". Exists to stop each endpoint being written a little differently.
---

# new-endpoint

Produce every endpoint with the **same skeleton**, so no two endpoints diverge in
shape. The layer order is fixed: **zod validation at the boundary → business logic in a
separate service → error handling that propagates → explicit typed return.**

## Preflight (do these before writing anything)

1. **Framework must be chosen.** Read `server/package.json`. If neither Fastify nor
   Express is a dependency, **stop and ask the user which one** — `CLAUDE.md` locks this
   as an "ask before choosing" decision. Do not pick silently. Adapt the skeleton to
   whichever is chosen.
2. **First-time libs.** Validation is expected to be `zod` and the test runner `Vitest`
   (`CLAUDE.md` says "likely"). If either is being introduced for the first time, confirm
   briefly before adding it as a dependency.
3. **Know the route.** Confirm method + path and whether it is **shared** (like
   `/api/leaderboard/top`) or **personal** (like `/api/leaderboard/me`) — see README §3.6.
   This changes cacheability (invariant #19).

## The skeleton (4 layers)

Generate these as small, single-purpose files (`CLAUDE.md`: split near ~250 lines).
Names below are the shape; match existing `server/` conventions if they already exist.

1. **`schema.ts` — boundary validation only.**
   - A `zod` schema per input surface used (`params`, `query`, `body`).
   - Derive types with `z.infer<typeof …>`.
   - Validation happens **only here**. Internal functions assume valid input
     (`CLAUDE.md` Conventions). Never re-validate deep in business logic.

2. **`service.ts` — pure business logic, HTTP-unaware.**
   - Takes the typed, already-validated input; returns a typed result.
   - This is where Redis / Postgres access lives. Relevant invariants to honour here:
     - Redis score-write + pool-increment in **one Lua script** (#6); rank + window in
       **one Lua script** (#7); Lua lives in its own `.lua` file, not an inline string.
     - Week key derived server-side via `getISOWeekYear`, UTC only (#9, #10).
     - Money as integer hundredths, never float (#1).
     - No SQL `OFFSET` for ranked pagination — ranking comes from Redis (#18).
     - No module-level state / timers / scheduler (#15, #16).
   - No `any`. No non-null assertions without a justifying comment.

3. **Handler / route — thin glue.**
   - `parse → validate (schema) → call service → build typed response`.
   - Errors: **no silent catches.** Either handle meaningfully or let them propagate to
     the central error handler (`CLAUDE.md` Errors).

4. **Explicit typed return.**
   - Define and use a response type. No leaking `any` out of the handler.
   - **If the route is shared/`/top`:** set `Cache-Control: public, max-age=5` and make
     sure **no per-player data** enters the response — shared and personal stay separate
     endpoints (#19). Enrichment stays bounded to cached + window rows (#20).

## After scaffolding

- Remind the user to run **`check-invariants`** on the resulting diff.
- Suggest a Vitest test hitting the testing priorities that apply (idempotency,
  tie-breaking, ISO-week boundaries) when the endpoint touches scores/payout.

## Rules

- Never place this code outside `server/`. Client and server are separate projects.
- Do not invent requirements or add speculative abstractions — build only the route asked
  for (`CLAUDE.md` Working agreement).
