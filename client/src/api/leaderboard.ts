import { apiFetch } from './http.ts';
import type { MeResult, TopResult } from './types.ts';

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
