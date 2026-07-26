import { sql } from 'kysely';
import type { Kysely } from 'kysely';

import { buildApp } from './app.js';
import { loadConfig } from './config/env.js';
import { withTimeout } from './core/withTimeout.js';
import { createDb } from './db/client.js';
import type { Database } from './db/schema.js';
import { createMongoEventStore } from './mongo/client.js';
import { createRedisClient, type LeaderboardRedis } from './redis/client.js';

const STARTUP_CHECK_TIMEOUT_MS = 5000;

/**
 * Redis (live ranking) and Postgres (money) are the source of truth (README §2)
 * — the process must not accept traffic without them (invariant 21). Both clients
 * connect lazily, so probe each here and let a failure propagate to `main().catch`
 * (→ exit 1) before `listen`. Mongo is deliberately not checked: it's a secondary
 * store and must never gate startup.
 */
async function verifyRequiredStores(
  redis: LeaderboardRedis,
  db: Kysely<Database>,
): Promise<void> {
  await withTimeout(redis.ping(), STARTUP_CHECK_TIMEOUT_MS, 'Redis ping');
  await withTimeout(
    sql`select 1`.execute(db),
    STARTUP_CHECK_TIMEOUT_MS,
    'Postgres check',
  );
}

async function main(): Promise<void> {
  const config = loadConfig();
  const redis = createRedisClient(config);
  const db = createDb(config);

  await verifyRequiredStores(redis, db);

  // Secondary store — connects in the background, never blocks listen (invariant 21).
  const mongo = createMongoEventStore(config);

  const app = await buildApp(config, {
    redis,
    db,
    mongoDb: mongo.db,
    mongoReady: mongo.isReady,
  });

  // Bind on all interfaces so the process is reachable inside the container.
  await app.listen({ port: config.PORT, host: '0.0.0.0' });
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console -- last-resort logger before Fastify exists
  console.error('Fatal startup error:', err);
  process.exit(1);
});
