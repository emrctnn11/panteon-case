import type { FastifyInstance } from 'fastify';

import { historyParamsSchema } from './schema.js';
import { getWeekHistory, type HistoryServiceDeps } from './service.js';

export type HistoryRouteOptions = HistoryServiceDeps;

/**
 * Once `payout_runs.status` is `completed`, a week's snapshot never changes
 * again — a far longer cache than `/top`'s 5s live-data TTL is safe here.
 * Not specified in README; a judgment call, flagged as such.
 */
const HISTORY_CACHE_CONTROL = 'public, max-age=3600, immutable';

/**
 * `GET /api/leaderboard/history/:weekId` — shared/public, no auth (README
 * §3.4's "last week's results" screen). Reuses `db` only; no Redis involved.
 */
export async function historyRoutes(
  app: FastifyInstance,
  opts: HistoryRouteOptions,
): Promise<void> {
  app.get('/api/leaderboard/history/:weekId', async (request, reply) => {
    const parsed = historyParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      await reply.code(400).send({
        error: 'invalid_params',
        issues: parsed.error.issues,
      });
      return;
    }

    const result = await getWeekHistory(opts, parsed.data.weekId);
    if (result === null) {
      await reply.code(404).send({ error: 'not_found' });
      return;
    }

    await reply.header('Cache-Control', HISTORY_CACHE_CONTROL).send(result);
  });
}
