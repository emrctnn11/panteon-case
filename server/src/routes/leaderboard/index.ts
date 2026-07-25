import type { FastifyInstance } from 'fastify';

import { topQuerySchema } from './schema.js';
import {
  getCombined,
  getMe,
  getTop,
  type LeaderboardServiceDeps,
} from './service.js';

export type LeaderboardRouteOptions = LeaderboardServiceDeps;

const TOP_CACHE_CONTROL = 'public, max-age=5';

/**
 * `GET /api/leaderboard/top`, `/me`, and the combined `/api/leaderboard`
 * (README §3.6). Shared vs. personal stay on separate routes so `/top` can
 * be cached and `/me`/`/leaderboard` never are (invariant 19).
 */
export async function leaderboardRoutes(
  app: FastifyInstance,
  opts: LeaderboardRouteOptions,
): Promise<void> {
  app.get('/api/leaderboard/top', async (request, reply) => {
    const parsed = topQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      await reply.code(400).send({
        error: 'invalid_query',
        issues: parsed.error.issues,
      });
      return;
    }

    const result = await getTop(
      opts,
      new Date(),
      parsed.data.from,
      parsed.data.limit,
    );
    await reply.header('Cache-Control', TOP_CACHE_CONTROL).send(result);
  });

  app.get(
    '/api/leaderboard/me',
    { preHandler: [app.authenticate] },
    async (request) => {
      return getMe(opts, new Date(), request.user.sub);
    },
  );

  app.get(
    '/api/leaderboard',
    { preHandler: [app.authenticate] },
    async (request) => {
      return getCombined(opts, new Date(), request.user.sub);
    },
  );
}
