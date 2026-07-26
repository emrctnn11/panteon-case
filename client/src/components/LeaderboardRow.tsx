import { useAnimatedNumber } from '../hooks/useAnimatedNumber.ts';
import { PAID_RANK_COUNT } from '../lib/constants.ts';
import { formatCompactEarnings } from '../lib/format.ts';
import { Medal } from './Medal.tsx';

export interface LeaderboardRowProps {
  /** 0-based rank, as returned by the API. */
  rank: number;
  displayName: string;
  rawEarnings: number;
  isMe?: boolean;
  /**
   * Pre-formatted settled prize (e.g. `₺4,000.00`). Present only on the "Last
   * week" screen, where `/history` returns the exact amount; the live board
   * omits it. Formatted at the call site so the row stays presentational and
   * the reward curve is never reproduced here.
   */
  awardLabel?: string;
}

/**
 * Shared between the top-100 list, the personal window, and the "Last week"
 * results (CLAUDE.md React conventions) — do not write a second, near-identical
 * row component. Top-3 get a medal via the shared `Medal`; the optional
 * `awardLabel` is the only history-specific affordance.
 */
export function LeaderboardRow({
  rank,
  displayName,
  rawEarnings,
  isMe = false,
  awardLabel,
}: LeaderboardRowProps) {
  const animatedEarnings = useAnimatedNumber(rawEarnings);
  const isPaidRank = rank < PAID_RANK_COUNT;

  return (
    <div
      className={[
        'flex h-12 items-center justify-between gap-3 border-b border-slate-800/60 px-3 sm:px-4',
        isMe
          ? 'bg-indigo-500/10 ring-1 ring-inset ring-indigo-400/40'
          : 'hover:bg-slate-800/30',
        isPaidRank ? '' : 'opacity-55',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="flex min-w-0 items-center gap-3">
        <Medal rank={rank + 1} />
        <span className="truncate text-sm font-medium text-slate-100">
          {displayName}
        </span>
        {isMe && (
          <span className="shrink-0 rounded-full bg-indigo-500/20 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-indigo-300 uppercase">
            You
          </span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-4">
        <span
          className={[
            'font-mono text-sm tabular-nums',
            awardLabel ? 'text-slate-400' : 'text-slate-200',
          ].join(' ')}
        >
          {formatCompactEarnings(animatedEarnings)}
        </span>
        {awardLabel && (
          <span className="w-24 text-right font-mono text-sm font-semibold text-emerald-300 tabular-nums">
            {awardLabel}
          </span>
        )}
      </div>
    </div>
  );
}
