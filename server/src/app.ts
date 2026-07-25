import Fastify, { type FastifyInstance } from 'fastify';

import type { Config } from './config/env.js';
import { healthRoutes } from './routes/health.js';

/**
 * Builds a fully configured Fastify instance with all routes registered.
 *
 * A factory (not a module-level singleton) so tests can construct an isolated
 * app and drive it with `inject()` — no port binding, no leftover listeners,
 * no module-level mutable state (CLAUDE.md invariant 15).
 */
export async function buildApp(config: Config): Promise<FastifyInstance> {
  const app = Fastify({
    logger: config.NODE_ENV !== 'test',
  });

  await app.register(healthRoutes);

  return app;
}
