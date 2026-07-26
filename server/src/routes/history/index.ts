import type { FastifyInstance } from 'fastify';

import { historyParamsSchema } from './schema.js';
import {
  getLatestWeekHistory,
  getWeekHistory,
  type HistoryServiceDeps,
} from './service.js';

export type HistoryRouteOptions = HistoryServiceDeps;

/**
 * Once `payout_runs.status` is `completed`, a week's snapshot never changes
 * again — a far longer cache than `/top`'s 5s live-data TTL is safe here.
 * Not specified in README; a judgment call, flagged as such.
 */
const HISTORY_CACHE_CONTROL = 'public, max-age=3600, immutable';

/**
 * `/latest` resolves to a *different* week each time payout runs, so it can't be
 * `immutable` like a specific week — a short shared TTL, enough to absorb the
 * poll traffic of a "Last week" screen without pinning a stale week past rollover.
 */
const LATEST_CACHE_CONTROL = 'public, max-age=60';

/**
 * `GET /api/leaderboard/history/:weekId` — shared/public, no auth (README
 * §3.4's "last week's results" screen). Reuses `db` only; no Redis involved.
 */
export async function historyRoutes(
  app: FastifyInstance,
  opts: HistoryRouteOptions,
): Promise<void> {
  // Registered before the parametric `:weekId` route: Fastify prioritises static
  // segments, but keeping `/latest` first states the intent that it is not a weekId.
  app.get('/api/leaderboard/history/latest', async (_request, reply) => {
    const result = await getLatestWeekHistory(opts);
    if (result === null) {
      await reply.code(404).send({ error: 'not_found' });
      return;
    }
    await reply.header('Cache-Control', LATEST_CACHE_CONTROL).send(result);
  });

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
