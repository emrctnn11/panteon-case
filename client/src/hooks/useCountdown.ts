import { useEffect, useState } from 'react';

export interface Countdown {
  totalMs: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

function toCountdown(totalMs: number): Countdown {
  const clamped = Math.max(totalMs, 0);
  const totalSeconds = Math.floor(clamped / 1000);
  return {
    totalMs: clamped,
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

/**
 * `weekEndsAt` is a UTC ISO instant from the server (README §3.3). The
 * countdown is a duration against the browser's own clock, so it renders
 * correctly in local time without any timezone handling of its own.
 */
export function useCountdown(weekEndsAt: string): Countdown {
  const target = new Date(weekEndsAt).getTime();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  return toCountdown(target - now);
}
