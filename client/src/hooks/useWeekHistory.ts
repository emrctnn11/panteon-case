import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { fetchLatestHistory } from '../api/leaderboard.ts';
import type { HistoryResult } from '../api/types.ts';

export function historyQueryKey(): readonly [string, string] {
  return ['leaderboard', 'history-latest'] as const;
}

/**
 * Latest completed week's results (README §3.4 snapshot). A settled week never
 * changes, so this does not poll — one fetch, cached; the server's own
 * `max-age=60` covers the once-a-week rollover. A 404 (no week has completed
 * yet) surfaces as an error the screen renders as an empty state, not a crash.
 */
export function useWeekHistory(
  enabled: boolean,
): UseQueryResult<HistoryResult> {
  return useQuery({
    queryKey: historyQueryKey(),
    queryFn: fetchLatestHistory,
    enabled,
    staleTime: 60_000,
    retry: false,
  });
}
