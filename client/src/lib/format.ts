const formatter = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Presentation-only: integer minor units (hundredths) → a display string.
 * Never used for arithmetic — money stays integer everywhere upstream of
 * this (CLAUDE.md invariant 1).
 */
export function formatEarnings(minorUnits: number): string {
  return formatter.format(minorUnits / 100);
}

const compactFormatter = new Intl.NumberFormat(undefined, {
  notation: 'compact',
  maximumFractionDigits: 1,
});

/**
 * Compact whole-unit rendering (e.g. `606.1K`, `6M`) for tight spots — podium
 * tiles and narrow rows where the full 2-decimal string would overflow on
 * mobile. Same presentation-only contract as `formatEarnings`: never fed back
 * into any calculation.
 */
export function formatCompactEarnings(minorUnits: number): string {
  return compactFormatter.format(minorUnits / 100);
}
