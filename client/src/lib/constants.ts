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
 * Leaderboard page size for infinite scroll — this client's chosen block size.
 * Must be a member of the server's `ALLOWED_LIMITS` allowlist
 * (routes/leaderboard/schema.ts); `from` is snapped to a multiple of it
 * server-side. Deep navigation pages in blocks of this size rather than one
 * large fetch, so each request's enrichment stays bounded (invariant 20).
 */
export const LEADERBOARD_PAGE_SIZE = 20;
