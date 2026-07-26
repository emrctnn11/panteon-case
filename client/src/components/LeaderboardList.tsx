import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useMemo, useRef, useState } from 'react';

import { useLeaderboard } from '../hooks/useLeaderboard.ts';
import { usePlayerWindow } from '../hooks/usePlayerWindow.ts';
import {
  LEADERBOARD_PAGE_SIZE,
  PAID_RANK_COUNT,
  PODIUM_SHARES,
} from '../lib/constants.ts';
import { formatEarnings } from '../lib/format.ts';
import type { LeaderboardEntry } from '../api/types.ts';
import { LeaderboardRow } from './LeaderboardRow.tsx';
import { Podium, type PodiumEntry } from './Podium.tsx';
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
  const windowRef = useRef<HTMLDivElement>(null);
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

  // Top-3 spotlight. Award labels are a *live preview* off the current pool
  // using the brief's fixed podium %s (PODIUM_SHARES) — not the α-curve, which
  // the client never computes (lib/constants.ts). `pool` may not have loaded on
  // the very first render, so the label is omitted until it has.
  const podiumEntries = useMemo<PodiumEntry[]>(() => {
    return entries.slice(0, 3).map((entry: LeaderboardEntry, index) => {
      // `slice(0, 3)` bounds index to 0–2; the `?? 0` only satisfies
      // noUncheckedIndexedAccess and is never actually reached.
      const share = PODIUM_SHARES[index] ?? 0;
      return {
        rank: entry.rank + 1,
        displayName: entry.displayName,
        rawEarnings: entry.rawEarnings,
        isMe: entry.rank === myRank,
        awardLabel:
          pool === undefined
            ? undefined
            : formatEarnings(Math.floor(pool * share)),
      };
    });
  }, [entries, pool, myRank]);

  // In the loaded list → scroll the row into view; otherwise (outside the top,
  // or not yet paged in) the player only appears in the personal window below,
  // so jump there instead. Both targets always exist when myRank is known.
  const scrollToMe = () => {
    if (myRank === null) {
      return;
    }
    if (isMyRankInTop) {
      virtualizer.scrollToIndex(myRank, { align: 'center' });
    } else {
      windowRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
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
            title={
              isMyRankInTop ? 'Scroll to your row' : 'Scroll to your window'
            }
            className="rounded-xl border border-indigo-400/30 bg-indigo-500/20 px-4 py-3 text-sm font-medium text-indigo-200 transition-colors hover:bg-indigo-500/30"
          >
            Jump to my rank
          </button>
        )}
      </div>

      {podiumEntries.length > 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-3 pt-5 pb-4">
          <Podium entries={podiumEntries} />
        </div>
      )}

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
        <div className="text-center text-xs text-slate-400">Loading more…</div>
      )}

      {!isMyRankInTop && me.data && me.data.entries.length > 0 && (
        <div
          ref={windowRef}
          className="rounded-lg border border-indigo-400/30 bg-indigo-500/5"
        >
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
