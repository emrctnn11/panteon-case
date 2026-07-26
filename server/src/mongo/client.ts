import { MongoClient } from 'mongodb';
import type { Db } from 'mongodb';

import type { Config } from '../config/env.js';

/**
 * Owns the `MongoClient` and exposes its live readiness. A factory, not a
 * module-level singleton — same reasoning as `createDb`/`createRedisClient`:
 * tests get an isolated instance, and the connection pool is infra reuse, not
 * per-request state (CLAUDE.md invariant 17). Call once at startup and reuse
 * the returned store; the Atlas connection string already carries the target
 * database name, so no separate `MONGODB_DB_NAME` is needed.
 */
export interface MongoEventStore {
  db: Db;
  /** True only while a writable Mongo server is currently reachable. Event-log
   * writers check this to skip the write when Mongo is known-down, instead of
   * waiting out the server-selection timeout on the hot path (README §2). */
  isReady: () => boolean;
  close: () => Promise<void>;
}

/**
 * Builds a `MongoEventStore` from `config.MONGODB_URI`.
 *
 * `.connect()` is started but not awaited: Mongo is a secondary observation
 * store and must never block startup (CLAUDE.md invariant 21). The driver
 * connects lazily on first operation regardless, so this only removes the
 * startup gate — it doesn't change steady-state behavior. A failure here is
 * logged, not swallowed, since it's still useful signal even though it isn't
 * fatal.
 *
 * Readiness is tracked from the driver's SDAM topology events so a request
 * never has to discover Mongo is down by timing out. `serverSelectionTimeoutMS`
 * is lowered as defense-in-depth: it bounds any write that races ahead of the
 * first topology event, so even the miss case can't stall the score path.
 */
export function createMongoEventStore(config: Config): MongoEventStore {
  const client = new MongoClient(config.MONGODB_URI, {
    serverSelectionTimeoutMS: 2000,
  });

  let ready = false;
  client.on('topologyDescriptionChanged', (event) => {
    ready = event.newDescription.hasDataBearingServers;
  });

  client.connect().catch((err: unknown) => {
    // eslint-disable-next-line no-console -- no app logger exists this early in startup
    console.error('Mongo connection failed (non-fatal, secondary store):', err);
  });

  return {
    db: client.db(),
    isReady: () => ready,
    close: () => client.close(),
  };
}
