import { useAnimatedNumber } from '../hooks/useAnimatedNumber.ts';
import { formatEarnings } from '../lib/format.ts';
import { StatCard } from './StatCard.tsx';

export interface PoolIndicatorProps {
  /** Integer minor units (README §3.1). */
  pool: number;
}

export function PoolIndicator({ pool }: PoolIndicatorProps) {
  const animatedPool = useAnimatedNumber(pool);

  return (
    <StatCard label="Prize pool" icon="💰" accentClassName="text-emerald-300">
      {formatEarnings(animatedPool)}
    </StatCard>
  );
}
