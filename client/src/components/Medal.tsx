/**
 * Rank badge shared by the podium, the top-3 leaderboard rows, and the
 * "Last week" winners (CLAUDE.md React conventions: reuse, don't duplicate).
 * Ranks 1–3 get a metallic medal; any other rank renders as a plain number,
 * so the same component drops into every row without a branch at the call site.
 */
const MEDAL_STYLES: Record<number, string> = {
  1: 'bg-gradient-to-b from-amber-300 to-amber-500 text-amber-950 ring-amber-200/60',
  2: 'bg-gradient-to-b from-slate-200 to-slate-400 text-slate-900 ring-slate-100/60',
  3: 'bg-gradient-to-b from-orange-300 to-orange-600 text-orange-950 ring-orange-200/60',
};

export interface MedalProps {
  /** 1-based rank. */
  rank: number;
  size?: 'sm' | 'lg';
}

export function Medal({ rank, size = 'sm' }: MedalProps) {
  const medalStyle = MEDAL_STYLES[rank];
  const dimension = size === 'lg' ? 'h-11 w-11 text-lg' : 'h-7 w-7 text-xs';

  if (medalStyle) {
    return (
      <span
        className={`inline-flex ${dimension} shrink-0 items-center justify-center rounded-full font-bold shadow ring-2 ${medalStyle}`}
      >
        {rank}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex ${dimension} shrink-0 items-center justify-center font-mono font-medium text-slate-500`}
    >
      {rank}
    </span>
  );
}
