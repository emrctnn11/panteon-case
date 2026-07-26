/**
 * Demo player seeder — 750k players with a power-law earnings distribution
 * (README §4), plus fixed test accounts near ranks ~2, ~50, ~102, and
 * ~400,000. Ends by measuring the *real* Redis memory cost of the seeded
 * sorted set (`MEMORY USAGE`), since README §4's per-member byte figure
 * should be a measurement, not a guess.
 *
 * This is a one-time bulk load, not a simulated live submission, so it does
 * not go through `writeScore.lua`: that script's coupling of score-write and
 * pool-increment (invariant 6) exists to keep a *player's* earnings delta and
 * the pool moving together. Seeding has no prior total to delta against and
 * intentionally never touches the pool key — the pool is a real-money figure
 * that should only ever move through the real write path.
 */
import { loadConfig } from '../config/env.js';
import { createDb } from '../db/client.js';
import { createRedisClient } from '../redis/client.js';
import { encodeScore } from '../core/score.js';
import { weekKey } from '../core/week.js';
import {
  fixedAccountEarnings,
  generateBulkEarnings,
} from './powerLawEarnings.js';

const TOTAL_PLAYERS = 750_000;
const FIXED_RANKS = [2, 50, 102, 400_000] as const;
const WEEK_MINUTES = 10_080;
const DB_BATCH_SIZE = 2_000;
const REDIS_BATCH_SIZE = 5_000;

interface SeedPlayer {
  playerId: string;
  displayName: string;
  rawEarnings: number;
  minutesElapsed: number;
}

function fixedAccountId(rank: number): string {
  return `test-rank-${rank}`;
}

function bulkPlayerId(index: number): string {
  return `p${String(index + 1).padStart(6, '0')}`;
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function buildPlayers(): SeedPlayer[] {
  const bulkCount = TOTAL_PLAYERS - FIXED_RANKS.length;
  const bulkSorted = generateBulkEarnings(bulkCount);

  const players: SeedPlayer[] = bulkSorted.map((rawEarnings, index) => ({
    playerId: bulkPlayerId(index),
    displayName: `Player ${String(index + 1).padStart(6, '0')}`,
    rawEarnings,
    // Spread arrivals across the week; a real population doesn't all submit at minute 0.
    minutesElapsed: Math.floor(Math.random() * (WEEK_MINUTES + 1)),
  }));

  for (const rank of FIXED_RANKS) {
    players.push({
      playerId: fixedAccountId(rank),
      displayName: `Test Rank ${rank}`,
      rawEarnings: fixedAccountEarnings(bulkSorted, rank),
      // minutesElapsed = 0 maximizes the tie-break term, so a fixed account
      // never loses its intended slot to a same-earnings bulk player.
      minutesElapsed: 0,
    });
  }

  return players;
}

async function insertPlayers(
  db: ReturnType<typeof createDb>,
  players: readonly SeedPlayer[],
): Promise<void> {
  for (const batch of chunk(players, DB_BATCH_SIZE)) {
    await db
      .insertInto('players')
      .values(
        batch.map((p) => ({
          playerId: p.playerId,
          displayName: p.displayName,
        })),
      )
      .onConflict((oc) => oc.column('playerId').doNothing())
      .execute();

    await db
      .insertInto('balances')
      .values(batch.map((p) => ({ playerId: p.playerId, balanceMinor: 0 })))
      .onConflict((oc) => oc.column('playerId').doNothing())
      .execute();
  }
}

async function writeScoresToRedis(
  redis: ReturnType<typeof createRedisClient>,
  key: string,
  players: readonly SeedPlayer[],
): Promise<void> {
  await redis.del(key);

  for (const batch of chunk(players, REDIS_BATCH_SIZE)) {
    const pipeline = redis.pipeline();
    for (const p of batch) {
      pipeline.zadd(
        key,
        encodeScore(p.rawEarnings, p.minutesElapsed),
        p.playerId,
      );
    }
    const results = await pipeline.exec();
    if (results === null) {
      throw new Error(
        'redis pipeline returned null (connection closed mid-batch)',
      );
    }
    for (const [err] of results) {
      if (err) {
        throw err;
      }
    }
  }
}

async function measureMemoryPerMember(
  redis: ReturnType<typeof createRedisClient>,
  key: string,
): Promise<void> {
  const [usage, card] = await Promise.all([
    redis.call('memory', 'usage', key, 'SAMPLES', '0'),
    redis.zcard(key),
  ]);
  const usageBytes = Number(usage);
  const bytesPerMember = usageBytes / card;

  // eslint-disable-next-line no-console -- CLI script output
  console.log(
    `Redis key ${key}: ${card} members, ${usageBytes} bytes total, ` +
      `${bytesPerMember.toFixed(2)} bytes/member (MEMORY USAGE SAMPLES 0)`,
  );
}

async function seed(): Promise<void> {
  const config = loadConfig();
  if (config.NODE_ENV === 'production') {
    throw new Error(
      'refusing to run the demo seeder against a production environment',
    );
  }

  const db = createDb(config);
  const redis = createRedisClient(config);

  try {
    // eslint-disable-next-line no-console -- CLI script output
    console.log(`generating ${TOTAL_PLAYERS} players (power-law earnings)...`);
    const players = buildPlayers();

    // eslint-disable-next-line no-console -- CLI script output
    console.log('inserting players + balances into Postgres...');
    await insertPlayers(db, players);

    const now = new Date();
    const key = weekKey(now);

    // eslint-disable-next-line no-console -- CLI script output
    console.log(`writing scores to Redis (${key})...`);
    await writeScoresToRedis(redis, key, players);

    await measureMemoryPerMember(redis, key);
  } finally {
    await db.destroy();
    redis.disconnect();
  }
}

seed().catch((err: unknown) => {
  // eslint-disable-next-line no-console -- CLI script output
  console.error('seed failed:', err);
  process.exit(1);
});
