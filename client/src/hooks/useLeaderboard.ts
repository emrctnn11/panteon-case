import { useQueries } from '@tanstack/react-query';

import { fetchTop } from '../api/leaderboard.ts';
import type { LeaderboardEntry } from '../api/types.ts';
import { TOP_POLL_INTERVAL_MS } from '../config/env.ts';
import { LEADERBOARD_PAGE_SIZE } from '../lib/constants.ts';

export function topPageQueryKey(
  from: number,
): readonly [string, string, number] {
  return ['leaderboard', 'top', from] as const;
}

export interface UseLeaderboardArgs {
  /** Number of pages loaded so far (≥ 1). Grown by the list as the user scrolls. */
  pageCount: number;
  /** Page indices currently in (or adjacent to) the viewport — only these poll. */
  visiblePages: ReadonlySet<number>;
}

export interface UseLeaderboardResult {
  entries: LeaderboardEntry[];
  pool: number | undefined;
  weekEndsAt: string | undefined;
  isLoading: boolean;
  isError: boolean;
  /** The last loaded page is full, so a further page may exist. */
  hasNextPage: boolean;
  /** The last requested page is still in flight. */
  isFetchingNextPage: boolean;
}

/**
 * Shared `/top` leaderboard as rank-based pages (README §3.6). Each page is an
 * independent query keyed by its `from` offset, so only the pages the user can
 * see refetch on the poll interval — deep pages scrolled past freeze until they
 * scroll back into view (README §3.7: freshness follows what the user is
 * looking at). A single infinite query would refetch every loaded page instead.
 *
 * The offset is snapped to a page multiple and page size is validated
 * server-side (schema.ts), so two users on the same page share one cache key.
 */
export function useLeaderboard({
  pageCount,
  visiblePages,
}: UseLeaderboardArgs): UseLeaderboardResult {
  const results = useQueries({
    queries: Array.from({ length: pageCount }, (_unused, pageIndex) => {
      const from = pageIndex * LEADERBOARD_PAGE_SIZE;
      return {
        queryKey: topPageQueryKey(from),
        queryFn: () => fetchTop(from, LEADERBOARD_PAGE_SIZE),
        refetchInterval: visiblePages.has(pageIndex)
          ? TOP_POLL_INTERVAL_MS
          : false,
        refetchIntervalInBackground: false,
      };
    }),
  });

  const entries = results.flatMap((result) => result.data?.entries ?? []);
  const firstPage = results[0]?.data;
  const lastResult = results[results.length - 1];
  const lastPage = lastResult?.data;

  return {
    entries,
    pool: firstPage?.pool,
    weekEndsAt: firstPage?.weekEndsAt,
    isLoading: results[0]?.isLoading ?? true,
    isError: results.some((result) => result.isError),
    // A page shorter than the page size (empty included) is the end of the list
    // — no total count in the response, so it's inferred from page fullness.
    hasNextPage:
      lastPage !== undefined &&
      lastPage.entries.length === LEADERBOARD_PAGE_SIZE,
    isFetchingNextPage: lastResult?.isFetching ?? false,
  };
}
