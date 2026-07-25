import type { FastifyInstance } from 'fastify';

import { scoreBodySchema } from './schema.js';
import { submitScore, type ScoreServiceDeps } from './service.js';

export interface ScoreRouteOptions extends ScoreServiceDeps {
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
        opts,
        new Date(),
        playerId,
        parsed.data.rawEarnings,
        opts.poolMultiplier,
      );

      return result;
    },
  );
}
