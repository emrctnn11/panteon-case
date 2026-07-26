import type { FastifyInstance } from 'fastify';
import type { Db } from 'mongodb';

import type { LeaderboardRedis } from '../../redis/client.js';
import { scoreBodySchema } from './schema.js';
import { submitScore, type ScoreServiceDeps } from './service.js';

export interface ScoreRouteOptions {
  redis: LeaderboardRedis;
  mongoDb: Db;
  mongoReady: () => boolean;
  poolMultiplier: number;
}

export interface ScoreResponse {
  applied: boolean;
  rank: number;
}

/**
 * `POST /api/score` — authenticated score write. Layer order per the
 * `new-endpoint` skill: JWT auth → zod validation → service → typed response.
 * Personal, uncacheable endpoint (README §3.6) — no `Cache-Control` header.
 */
export async function scoreRoutes(
  app: FastifyInstance,
  opts: ScoreRouteOptions,
): Promise<void> {
  const deps: ScoreServiceDeps = {
    redis: opts.redis,
    mongoDb: opts.mongoDb,
    mongoReady: opts.mongoReady,
    logMongoError: (err) =>
      app.log.error({ err }, 'mongo event log write failed'),
  };

  app.post(
    '/api/score',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const parsed = scoreBodySchema.safeParse(request.body);
      if (!parsed.success) {
        await reply.code(400).send({
          error: 'invalid_body',
          issues: parsed.error.issues,
        });
        return;
      }

      const playerId = request.user.sub;
      const result: ScoreResponse = await submitScore(
        deps,
        new Date(),
        playerId,
        parsed.data.rawEarnings,
        opts.poolMultiplier,
      );

      return result;
    },
  );
}
