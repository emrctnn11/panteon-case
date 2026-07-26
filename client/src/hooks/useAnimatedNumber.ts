import { useEffect, useRef, useState } from 'react';

const DEFAULT_DURATION_MS = 800;

/**
 * Animates numeric transitions between poll updates so values count up/down
 * smoothly instead of jumping on each refetch. Purely a presentation effect —
 * the underlying value stays whatever the query returned; this never feeds
 * back into any calculation (CLAUDE.md invariant 1: money stays integer).
 */
export function useAnimatedNumber(
  target: number,
  durationMs = DEFAULT_DURATION_MS,
): number {
  const [displayValue, setDisplayValue] = useState(target);
  const displayRef = useRef(target);

  useEffect(() => {
    displayRef.current = displayValue;
  }, [displayValue]);

  useEffect(() => {
    const from = displayRef.current;
    const delta = target - from;
    if (delta === 0) {
      return;
    }

    let frame: number;
    let start: number | null = null;

    const step = (timestamp: number) => {
      if (start === null) {
        start = timestamp;
      }
      const progress = Math.min((timestamp - start) / durationMs, 1);
      setDisplayValue(Math.round(from + delta * progress));

      if (progress < 1) {
        frame = requestAnimationFrame(step);
      }
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs]);

  return displayValue;
}
