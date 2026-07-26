import { useAnimatedNumber } from '../hooks/useAnimatedNumber.ts';
import { formatEarnings } from '../lib/format.ts';

export interface PoolIndicatorProps {
  /** Integer minor units (README §3.1). */
  pool: number;
}

export function PoolIndicator({ pool }: PoolIndicatorProps) {
  const animatedPool = useAnimatedNumber(pool);

  return (
    <div className="rounded-lg bg-slate-800/60 px-4 py-3">
      <div className="text-xs tracking-wide text-slate-400 uppercase">
        Prize pool
      </div>
      <div className="font-mono text-lg font-semibold text-emerald-300 tabular-nums">
        {formatEarnings(animatedPool)}
      </div>
    </div>
  );
}
