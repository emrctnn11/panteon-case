---
name: check-invariants
description: >-
  Audits the latest code diff against the 20 hard invariants in CLAUDE.md and
  reports any violation by its number. Use after writing or changing server/client
  code, before committing, or whenever the user asks to "check invariants",
  "invariant kontrol", "did I break a rule", or review a diff for the money/score/
  Redis/payout/statelessness/read-path rules. Read-only: it reports, it does not fix.
---

# check-invariants

Denetle the current diff against **all 20 hard invariants** defined in `CLAUDE.md`.
The invariant text lives in `CLAUDE.md` — this skill does **not** copy it (that would
drift). Read `CLAUDE.md` fresh each run and treat it as the single source of truth.
The red-flag hints below are only detection aids; if a hint ever conflicts with
`CLAUDE.md`, **`CLAUDE.md` wins**.

## Steps

1. **Get the diff.**
   - Run `git diff` and `git diff --staged`.
   - If both are empty, fall back to `git diff HEAD~1 HEAD` (the last commit).
   - If there is still nothing to review, tell the user "no diff to check" and stop.

2. **Read the source of truth.** Read the **"Hard invariants"** section of `CLAUDE.md`
   in full. These are the 20 rules you are checking — verbatim, numbered 1–20.

3. **Scan the diff against each invariant 1–20.** Only judge lines that the diff adds
   or changes. Use these red-flag hints to find candidates, then confirm against the
   actual CLAUDE.md rule before reporting:

   **Money and scores**
   - **#1** — `INCRBYFLOAT`, `parseFloat` on a monetary value, float math on currency,
     money not stored as integer hundredths.
   - **#2** — score formula altered; magic numbers other than `SHIFT = 16384` /
     `WEEK_MINUTES = 10080`; decode not using `Math.floor(score / SHIFT)`.
   - **#3** — time term not clamped to `[0, 10080]` (missing `Math.max(0, Math.min(10080, …))`);
     a raw `10080 - minutesElapsed` that can go negative.
   - **#4** — `minutesElapsed` (or elapsed time) read from the request body / query.
   - **#5** — sorted-set member is not the bare player ID (anything appended/encoded);
     something other than a raw ID passed to `ZREVRANK` / `ZADD`.

   **Redis**
   - **#6** — score write and pool increment as two separate commands instead of one
     Lua script (e.g. a `ZADD` and an `INCRBY` not inside the same `.lua`).
   - **#7** — rank lookup and window fetch as two separate commands (`ZREVRANK` then a
     separate `ZREVRANGE`) instead of one Lua script.
   - **#8** — score write not using `GT` semantics; non-increasing scores accepted.
   - **#9** — `getFullYear()` used for the week key (must be `getISOWeekYear`); week key
     taken from a request instead of derived server-side.
   - **#10** — local-time handling outside of render (non-UTC date math).

   **Payout**
   - **#11** — payout run missing the opening
     `INSERT INTO payout_runs ... ON CONFLICT DO NOTHING` guard, or not exiting when zero
     rows were affected; relying on the Redis lock as the guarantee.
   - **#12** — payout writes (payouts, balances, snapshot, run status) split across
     multiple transactions instead of one.
   - **#13** — payout endpoint accepting a week parameter instead of deriving its own.
   - **#14** — `payouts` unique key on `(week_id, player_id)` dropped or changed.

   **Statelessness**
   - **#15** — module-level cache/counter/session/timer, `setInterval`, `setTimeout` that
     outlives a request, in-memory state surviving between requests.
   - **#16** — a scheduler/cron inside the app process (rather than EventBridge).
   - **#17** — code that assumes a single instance (local state a second container
     couldn't share).

   **Read path**
   - **#18** — SQL `OFFSET` used for ranked pagination (ranking must come from Redis).
   - **#19** — per-player data added to the `/top` (shared) response, or `/top` made
     uncacheable; shared and personal endpoints merged.
   - **#20** — profile enrichment not bounded to the ~100 cached + ~6 window rows
     (an unbounded lookup over many players).

4. **Report.** One line per violation, most-severe first:

   ```
   ❌ Invariant #N — <one-sentence what's wrong> — <file>:<line>
      <short why it matters>
   ```

   - Uncertain / can't fully verify from the diff: `⚠️ Invariant #N şüpheli — <reason>`.
   - Nothing wrong: `✅ 20/20 temiz` (state which invariants were actually exercised by
     the diff vs. not applicable).

## Rules

- **Report only. Do not edit or fix code** — that is a separate, explicit step the user
  must ask for.
- Do not report an invariant the diff doesn't touch as "passing" with false confidence;
  distinguish *checked and clean* from *not applicable*.
- Prefer `file:line` anchors so findings are clickable.
