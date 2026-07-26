import { useCountdown } from '../hooks/useCountdown.ts';

export interface WeekCountdownProps {
  /** UTC ISO instant of the next Monday 00:00 UTC rollover. */
  weekEndsAt: string;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function WeekCountdown({ weekEndsAt }: WeekCountdownProps) {
  const { days, hours, minutes, seconds } = useCountdown(weekEndsAt);

  return (
    <div className="rounded-lg bg-slate-800/60 px-4 py-3">
      <div className="text-xs tracking-wide text-slate-400 uppercase">
        Resets in
      </div>
      <div className="font-mono text-lg font-semibold text-slate-100 tabular-nums">
        {days > 0 ? `${days}d ` : ''}
        {pad(hours)}:{pad(minutes)}:{pad(seconds)}
      </div>
    </div>
  );
}
