import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useMemo, useRef, useState } from 'react';

import { useLeaderboard } from '../hooks/useLeaderboard.ts';
import { usePlayerWindow } from '../hooks/usePlayerWindow.ts';
import { LEADERBOARD_PAGE_SIZE, PAID_RANK_COUNT } from '../lib/constants.ts';
import { LeaderboardRow } from './LeaderboardRow.tsx';
import { PoolIndicator } from './PoolIndicator.tsx';
import { WeekCountdown } from './WeekCountdown.tsx';

const ROW_HEIGHT_PX = 48;
const LIST_HEIGHT_PX = 480;
const OVERSCAN = 8;

/**
 * Virtualized leaderboard with rank-based infinite scroll (README §3.6) + the
 * personal window transition. Rows load in `LEADERBOARD_PAGE_SIZE` blocks as
 * the user scrolls; every row renders through the shared `LeaderboardRow` —
 * never two row components. Only pages in view poll (README §3.7); the set is
 * derived from the virtualizer and fed back into the data hook.
 */
export function LeaderboardList() {
  const parentRef = useRef<HTMLDivElement>(null);
  const [pageCount, setPageCount] = useState(1);
  const [visiblePages, setVisiblePages] = useState<ReadonlySet<number>>(
    () => new Set([0]),
  );

  const {
    entries,
    pool,
    weekEndsAt,
    isError,
    hasNextPage,
    isFetchingNextPage,
  } = useLeaderboard({ pageCount, visiblePages });
  const me = usePlayerWindow();

  const myRank = me.data?.rank ?? null;
  const isMyRankInTop = myRank !== null && myRank < entries.length;

  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT_PX,
    overscan: OVERSCAN,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const firstVisibleIndex = virtualItems[0]?.index ?? 0;
  const lastVisibleIndex = virtualItems.at(-1)?.index ?? 0;

  // Keep the polled-page set in sync with the viewport (+ the next page down):
  // pages scrolled out of view stop refetching until they return (README §3.7).
  useEffect(() => {
    const firstPage = Math.floor(firstVisibleIndex / LEADERBOARD_PAGE_SIZE);
    const lastPage = Math.floor(lastVisibleIndex / LEADERBOARD_PAGE_SIZE) + 1;
    setVisiblePages((prev) => {
      const next = new Set<number>();
      for (let page = firstPage; page <= lastPage; page += 1) {
        next.add(page);
      }
      const unchanged =
        prev.size === next.size && [...next].every((page) => prev.has(page));
      return unchanged ? prev : next;
    });
  }, [firstVisibleIndex, lastVisibleIndex]);

  // Grow the loaded-page count when the viewport nears the end. The guard on
  // `hasNextPage` (last page is full) means an exact page-multiple list loads
  // one trailing empty page, sees it, and stops — no infinite "loading more".
  useEffect(() => {
    if (hasNextPage && lastVisibleIndex >= entries.length - 1 - OVERSCAN) {
      setPageCount((count) => count + 1);
    }
  }, [hasNextPage, lastVisibleIndex, entries.length]);

  const rewardStatus = useMemo(() => {
    if (myRank === null || myRank < PAID_RANK_COUNT) {
      return null;
    }
    return { ranksToGo: myRank - PAID_RANK_COUNT + 1 };
  }, [myRank]);

  const scrollToMe = () => {
    if (myRank !== null && myRank < entries.length) {
      virtualizer.scrollToIndex(myRank, { align: 'center' });
    }
  };

  if (isError && entries.length === 0) {
    return (
      <div className="p-4 text-sm text-red-400">
        Couldn't load the leaderboard. Retrying in the background…
      </div>
    );
  }

  if (pool === undefined || weekEndsAt === undefined) {
    return (
      <div className="p-4 text-sm text-slate-400">Loading leaderboard…</div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3">
        <PoolIndicator pool={pool} />
        <WeekCountdown weekEndsAt={weekEndsAt} />
        {myRank !== null && (
          <button
            type="button"
            onClick={scrollToMe}
            disabled={!isMyRankInTop}
            className="rounded-lg bg-indigo-500/20 px-4 py-3 text-sm font-medium text-indigo-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Jump to my rank
          </button>
        )}
      </div>

      <div
        ref={parentRef}
        style={{ height: LIST_HEIGHT_PX }}
        className="overflow-y-auto rounded-lg border border-slate-800"
      >
        <div
          style={{ height: virtualizer.getTotalSize(), position: 'relative' }}
        >
          {virtualItems.map((virtualRow) => {
            const entry = entries[virtualRow.index];
            if (!entry) {
              return null;
            }
            return (
              <div
                key={entry.playerId}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: virtualRow.size,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <LeaderboardRow
                  rank={entry.rank}
                  displayName={entry.displayName}
                  rawEarnings={entry.rawEarnings}
                  isMe={entry.rank === myRank}
                />
              </div>
            );
          })}
        </div>
      </div>

      {isFetchingNextPage && (
        <div className="text-center text-xs text-slate-400">
          Loading more…
        </div>
      )}

      {!isMyRankInTop && me.data && me.data.entries.length > 0 && (
        <div className="rounded-lg border border-indigo-400/30 bg-indigo-500/5">
          <div className="flex items-center gap-2 px-4 pt-3 text-xs tracking-wide text-indigo-300 uppercase">
            <span>Your window</span>
            {rewardStatus && (
              <span className="normal-case text-slate-400">
                {rewardStatus.ranksToGo} rank
                {rewardStatus.ranksToGo === 1 ? '' : 's'} to the reward boundary
              </span>
            )}
          </div>
          {me.data.entries.map((entry) => (
            <LeaderboardRow
              key={entry.playerId}
              rank={entry.rank}
              displayName={entry.displayName}
              rawEarnings={entry.rawEarnings}
              isMe={entry.rank === myRank}
            />
          ))}
        </div>
      )}
    </div>
  );
}
