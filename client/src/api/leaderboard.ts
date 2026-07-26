import { apiFetch } from './http.ts';
import type { HistoryResult, MeResult, TopResult } from './types.ts';

export function fetchTop(from: number, limit: number): Promise<TopResult> {
  const params = new URLSearchParams({
    from: String(from),
    limit: String(limit),
  });
  return apiFetch<TopResult>(`/api/leaderboard/top?${params}`);
}

export function fetchMe(token: string): Promise<MeResult> {
  return apiFetch<MeResult>('/api/leaderboard/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

/**
 * Latest completed week's frozen results. The week id is resolved server-side
 * (the client never derives an ISO week key — README §3.3) and the endpoint
 * 404s until the first payout has run.
 */
export function fetchLatestHistory(): Promise<HistoryResult> {
  return apiFetch<HistoryResult>('/api/leaderboard/history/latest');
}

/**
 * Demo-only: mint a player JWT for a seeded id so the personal window can be
 * exercised without a login flow. Backed by the server's `DEMO_MODE`-gated
 * `POST /api/dev/token`; absent in a production build.
 */
export function fetchDemoToken(playerId: string): Promise<{ token: string }> {
  return apiFetch<{ token: string }>('/api/dev/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId }),
  });
}
