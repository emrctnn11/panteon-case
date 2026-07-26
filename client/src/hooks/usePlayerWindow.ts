import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { fetchMe } from '../api/leaderboard.ts';
import type { MeResult } from '../api/types.ts';
import { ME_POLL_INTERVAL_MS } from '../config/env.ts';
import { getTokenSub, useAuthToken } from '../lib/auth.ts';

/**
 * Keyed on the player id so switching identity (the demo "View as" picker) is a
 * distinct cache entry and refetches immediately, instead of serving the
 * previous player's window until the next poll. Exported so a future
 * score-submission mutation can optimistically patch this entry with the rank
 * the write path returns (README §3.1) — the 15s poll only needs to catch
 * neighbors entering/leaving the window.
 */
export function meQueryKey(
  playerId: string | null,
): readonly [string, string, string] {
  return ['leaderboard', 'me', playerId ?? ''] as const;
}

/** Personal rank + surrounding window (README §3.6) — uncacheable, ~6 rows. */
export function usePlayerWindow(): UseQueryResult<MeResult> {
  const token = useAuthToken();
  const playerId = getTokenSub(token);

  return useQuery({
    queryKey: meQueryKey(playerId),
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
