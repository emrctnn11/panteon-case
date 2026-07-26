import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { fetchMe } from '../api/leaderboard.ts';
import type { MeResult } from '../api/types.ts';
import { ME_POLL_INTERVAL_MS } from '../config/env.ts';
import { useAuthToken } from '../lib/auth.ts';

/**
 * Exported so a future score-submission mutation can optimistically patch
 * this cache entry with the rank the write path returns (README §3.1),
 * rather than waiting on the next poll — the 15s poll here only needs to
 * catch neighbors entering/leaving the window.
 */
export function meQueryKey(): readonly [string, string] {
  return ['leaderboard', 'me'] as const;
}

/** Personal rank + surrounding window (README §3.6) — uncacheable, ~6 rows. */
export function usePlayerWindow(): UseQueryResult<MeResult> {
  const token = useAuthToken();

  return useQuery({
    queryKey: meQueryKey(),
    queryFn: () => {
      if (token === null) {
        throw new Error('usePlayerWindow: queryFn ran without a token');
      }
      return fetchMe(token);
    },
    enabled: token !== null,
    refetchInterval: ME_POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
  });
}
