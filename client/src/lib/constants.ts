/**
 * Top-100 paid boundary. Duplicated from server/src/core/rewards.ts (TOP_N) —
 * client and server are separate projects with no shared build step
 * (CLAUDE.md repo layout).
 *
 * This is intentionally the only reward-curve knowledge the client has: the
 * paid/unpaid boundary, not the payout curve itself. Estimating an actual
 * award amount would mean duplicating `distributeRewards`' shape client-side,
 * which risks the two drifting apart — if a payout estimate is ever needed,
 * the server should compute and return it, keeping the curve single-sourced.
 */
export const PAID_RANK_COUNT = 100;

/**
 * Podium shares of the pool for ranks 1/2/3. These are **fixed by the brief**
 * (20% / 15% / 10%), not the tunable α-curve — so, unlike the rank 4–100 curve
 * (which the client must never reproduce; see the note above), the podium split
 * is a stable brief constant and is safe to show client-side as a live preview.
 * Ranks 4–100 remain server-only, surfaced only as exact amounts via `/history`.
 */
export const PODIUM_SHARES = [0.2, 0.15, 0.1] as const;

/**
 * Leaderboard page size for infinite scroll — this client's chosen block size.
 * Must be a member of the server's `ALLOWED_LIMITS` allowlist
 * (routes/leaderboard/schema.ts); `from` is snapped to a multiple of it
 * server-side. Deep navigation pages in blocks of this size rather than one
 * large fetch, so each request's enrichment stays bounded (invariant 20).
 */
export const LEADERBOARD_PAGE_SIZE = 20;

/**
 * Fixed seeded accounts (server `FIXED_RANKS` in scripts/seed.ts) offered by the
 * demo "View as" picker so a reviewer can authenticate as a player and see the
 * personal window — including one just outside the paid top-100 and one deep in
 * the ladder, the two cases the window feature exists for.
 */
export const DEMO_PLAYERS = [
  { id: 'test-rank-2', label: 'Rank ~2', hint: 'top of the board' },
  { id: 'test-rank-50', label: 'Rank ~50', hint: 'mid top-100' },
  { id: 'test-rank-102', label: 'Rank ~102', hint: 'just outside — window' },
  { id: 'test-rank-400000', label: 'Rank ~400k', hint: 'deep window' },
] as const;
