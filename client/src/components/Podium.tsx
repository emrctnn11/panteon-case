import { formatCompactEarnings } from '../lib/format.ts';
import { Medal } from './Medal.tsx';

export interface PodiumEntry {
  /** 1-based rank (1, 2 or 3). */
  rank: number;
  displayName: string;
  rawEarnings: number;
  /**
   * Pre-formatted prize string. Source-agnostic on purpose: the live board
   * passes a pool-share preview (podium %s are brief constants), the "Last
   * week" screen passes the exact settled amount from `/history`. The podium
   * never computes an award itself, so the reward curve stays single-sourced.
   */
  awardLabel?: string;
  isMe?: boolean;
}

// Visual order puts the winner centre and tallest: 2nd · 1st · 3rd.
const SLOT_ORDER = [2, 1, 3] as const;

const PLINTH_HEIGHT: Record<number, string> = {
  1: 'h-20',
  2: 'h-14',
  3: 'h-10',
};

const PLINTH_TINT: Record<number, string> = {
  1: 'from-amber-500/25 to-amber-500/5 border-amber-400/30',
  2: 'from-slate-400/20 to-slate-400/5 border-slate-300/25',
  3: 'from-orange-500/20 to-orange-500/5 border-orange-400/25',
};

/**
 * Top-3 spotlight. Presentational — takes up to three entries via props and
 * renders nothing for missing slots (a week with fewer than 3 ranked players).
 * Reused by the live board and the "Last week" results (CLAUDE.md: reuse).
 */
export function Podium({ entries }: { entries: PodiumEntry[] }) {
  const byRank = new Map(entries.map((entry) => [entry.rank, entry]));

  return (
    <div className="flex items-end justify-center gap-2 sm:gap-4">
      {SLOT_ORDER.map((rank) => {
        const entry = byRank.get(rank);
        if (!entry) {
          return <div key={rank} className="w-24 sm:w-28" aria-hidden />;
        }
        return (
          <div
            key={rank}
            className="flex w-24 flex-col items-center gap-2 sm:w-28"
          >
            <Medal rank={rank} size="lg" />
            <div
              className={[
                'w-full truncate text-center text-sm font-semibold',
                entry.isMe ? 'text-indigo-300' : 'text-slate-100',
              ].join(' ')}
              title={entry.displayName}
            >
              {entry.displayName}
              {entry.isMe && (
                <span className="ml-1 text-indigo-400">(you)</span>
              )}
            </div>
            <div className="font-mono text-xs text-slate-400 tabular-nums">
              {formatCompactEarnings(entry.rawEarnings)}
            </div>
            <div
              className={[
                'flex w-full items-center justify-center rounded-t-lg border-t border-x bg-gradient-to-b',
                PLINTH_HEIGHT[rank],
                PLINTH_TINT[rank],
              ].join(' ')}
            >
              {entry.awardLabel && (
                <span className="font-mono text-xs font-semibold text-emerald-300 tabular-nums">
                  {entry.awardLabel}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
