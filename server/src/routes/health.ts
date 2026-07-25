import type { FastifyInstance } from 'fastify';

/**
 * Liveness probe. Intentionally trivial and stateless — usable by any instance
 * behind nginx, and by tests via `app.inject`.
 */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => {
    return { status: 'ok' } as const;
  });
}
