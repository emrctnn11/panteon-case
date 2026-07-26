import type { ReactNode } from 'react';

export interface StatCardProps {
  /** Small uppercase label above the value. */
  label: string;
  /** Main value — a formatted string or a richer node (e.g. a countdown). */
  children: ReactNode;
  /** Optional leading glyph/emoji for quick visual scanning. */
  icon?: ReactNode;
  /** Tailwind text-color class for the value; defaults to near-white. */
  accentClassName?: string;
}

/**
 * Compact labelled tile used across the header (prize pool, reset countdown).
 * Presentational only — takes its value via props/children and holds no
 * fetching logic (CLAUDE.md React conventions). Kept generic so the header can
 * compose several of these instead of each stat re-implementing the frame.
 */
export function StatCard({
  label,
  children,
  icon,
  accentClassName = 'text-slate-100',
}: StatCardProps) {
  return (
    <div className="flex min-w-[8.5rem] flex-1 flex-col gap-1 rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-3">
      <div className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-slate-400 uppercase">
        {icon}
        <span>{label}</span>
      </div>
      <div
        className={`font-mono text-lg font-semibold tabular-nums ${accentClassName}`}
      >
        {children}
      </div>
    </div>
  );
}
