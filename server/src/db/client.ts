import { CamelCasePlugin, Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';

import type { Config } from '../config/env.js';
import type { Database } from './schema.js';

/**
 * Builds a `Kysely<Database>` over a `pg.Pool` — a factory, not a module-level
 * singleton, so tests can spin up an isolated instance (same reasoning as
 * `buildApp` in `app.ts`). Call once at startup and reuse the instance; the
 * pool itself is infra reuse, not per-request state, so this doesn't break
 * "any instance can serve any request" (CLAUDE.md invariant 17).
 */
export function createDb(config: Config): Kysely<Database> {
  return new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new Pool({ connectionString: config.DATABASE_URL }),
    }),
    plugins: [new CamelCasePlugin()],
  });
}
