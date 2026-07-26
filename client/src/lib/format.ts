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
