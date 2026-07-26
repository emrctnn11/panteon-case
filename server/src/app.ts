import Fastify, { type FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import type { Db } from 'mongodb';

import type { Config } from './config/env.js';
import type { Database } from './db/schema.js';
import { authPlugin } from './http/auth.js';
import { internalAuthPlugin } from './http/internalAuth.js';
import type { LeaderboardRedis } from './redis/client.js';
import { healthRoutes } from './routes/health.js';
import { historyRoutes } from './routes/history/index.js';
import { leaderboardRoutes } from './routes/leaderboard/index.js';
import { payoutRoutes } from './routes/payout/index.js';
import { scoreRoutes } from './routes/score/index.js';

export interface AppDeps {
  redis: LeaderboardRedis;
  mongoDb: Db;
  /** Live Mongo readiness (see `createMongoEventStore`) — lets the score path
   * skip the event-log write when Mongo is down instead of stalling (invariant 21). */
  mongoReady: () => boolean;
  db: Kysely<Database>;
}

/**
 * Builds a fully configured Fastify instance with all routes registered.
 *
 * A factory (not a module-level singleton) so tests can construct an isolated
 * app and drive it with `inject()` — no port binding, no leftover listeners,
 * no module-level mutable state (CLAUDE.md invariant 15). `deps` carries the
 * already-connected Redis/Mongo clients (built once in `index.ts`, same
 * "factory not singleton" reasoning as `createRedisClient`/`createMongoClient`
 * — the connection pool is infra reuse, not per-request state, invariant 17).
 */
export async function buildApp(
  config: Config,
  deps: AppDeps,
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: config.NODE_ENV !== 'test',
  });

  await app.register(authPlugin, config);
  await app.register(internalAuthPlugin, config);
  await app.register(healthRoutes);
  await app.register(scoreRoutes, {
    redis: deps.redis,
    mongoDb: deps.mongoDb,
    mongoReady: deps.mongoReady,
    poolMultiplier: config.SCORE_POOL_MULTIPLIER,
  });
  await app.register(leaderboardRoutes, {
    redis: deps.redis,
    db: deps.db,
  });
  await app.register(payoutRoutes, {
    redis: deps.redis,
    db: deps.db,
    alpha: config.PAYOUT_CURVE_ALPHA,
  });
  await app.register(historyRoutes, {
    db: deps.db,
  });

  return app;
}
