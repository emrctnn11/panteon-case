/**
 * Demo player seeder. Stub for now — the real generator (power-law earnings,
 * fixed test accounts near ranks ~2 / ~50 / ~102 / ~400k, see README §4) lands
 * with the Redis ranking feature.
 */
async function seed(): Promise<void> {
  // eslint-disable-next-line no-console -- CLI script output
  console.log('seed: not implemented yet');
}

seed().catch((err: unknown) => {
  // eslint-disable-next-line no-console -- CLI script output
  console.error('seed failed:', err);
  process.exit(1);
});
