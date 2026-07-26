import { useAnimatedNumber } from '../hooks/useAnimatedNumber.ts';
import { PAID_RANK_COUNT } from '../lib/constants.ts';
import { formatEarnings } from '../lib/format.ts';

export interface LeaderboardRowProps {
  /** 0-based rank, as returned by the API. */
  rank: number;
  displayName: string;
  rawEarnings: number;
  isMe?: boolean;
}

/**
 * Shared between the top-100 list and the personal window (CLAUDE.md React
 * conventions) — do not write a second, near-identical row component.
 */
export function LeaderboardRow({
  rank,
  displayName,
  rawEarnings,
  isMe = false,
}: LeaderboardRowProps) {
  const animatedEarnings = useAnimatedNumber(rawEarnings);
  const isPaidRank = rank < PAID_RANK_COUNT;

  return (
    <div
      className={[
        'flex h-12 items-center justify-between gap-3 border-b border-slate-800/60 px-4',
        isMe ? 'bg-indigo-500/10 ring-1 ring-inset ring-indigo-400/40' : '',
        isPaidRank ? '' : 'opacity-60',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="w-10 shrink-0 text-right font-mono text-sm text-slate-400">
          {rank + 1}
        </span>
        <span className="truncate text-sm font-medium text-slate-100">
          {displayName}
        </span>
        {isMe && (
          <span className="shrink-0 rounded-full bg-indigo-500/20 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-indigo-300 uppercase">
            You
          </span>
        )}
      </div>
      <span className="shrink-0 font-mono text-sm text-slate-200 tabular-nums">
        {formatEarnings(animatedEarnings)}
      </span>
    </div>
  );
}
