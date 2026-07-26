import { useCountdown } from '../hooks/useCountdown.ts';
import { StatCard } from './StatCard.tsx';

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
    <StatCard label="Resets in" icon="⏱">
      {days > 0 ? `${days}d ` : ''}
      {pad(hours)}:{pad(minutes)}:{pad(seconds)}
    </StatCard>
  );
}
