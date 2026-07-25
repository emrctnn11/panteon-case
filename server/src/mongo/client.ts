import { MongoClient } from 'mongodb';

import type { Config } from '../config/env.js';

/**
 * Builds and connects a `MongoClient` from `config.MONGODB_URI`. A factory, not
 * a module-level singleton — same reasoning as `createDb`/`createRedisClient`:
 * tests get an isolated instance, and the connection pool is infra reuse, not
 * per-request state (CLAUDE.md invariant 17). Call once at startup and reuse
 * the returned client; the Atlas connection string already carries the target
 * database name, so no separate `MONGODB_DB_NAME` is needed.
 */
export async function createMongoClient(config: Config): Promise<MongoClient> {
  const client = new MongoClient(config.MONGODB_URI);
  await client.connect();
  return client;
}
