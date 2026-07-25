import { timingSafeEqual } from 'node:crypto';

import fastifyPlugin from 'fastify-plugin';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import type { Config } from '../config/env.js';

const SECRET_HEADER = 'x-internal-secret';

declare module 'fastify' {
  interface FastifyInstance {
    authenticateInternal: (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => Promise<void>;
  }
}

/**
 * A different trust boundary from `http/auth.ts`'s player JWTs — there is no
 * player identity here, just an infra caller (EventBridge Scheduler, which
 * supports setting a static header on its HTTP target). Compared with
 * `timingSafeEqual` rather than `===` to avoid a timing side-channel on the
 * secret; lengths are checked first since `timingSafeEqual` throws (rather
 * than returning `false`) on mismatched buffer lengths.
 */
export const internalAuthPlugin = fastifyPlugin(
  async function internalAuthPlugin(app: FastifyInstance, config: Config) {
    const expected = Buffer.from(config.INTERNAL_PAYOUT_SECRET);

    app.decorate(
      'authenticateInternal',
      async function authenticateInternal(
        request: FastifyRequest,
        reply: FastifyReply,
      ) {
        const header = request.headers[SECRET_HEADER];
        const provided = Buffer.from(typeof header === 'string' ? header : '');

        const matches =
          provided.length === expected.length &&
          timingSafeEqual(provided, expected);

        if (!matches) {
          await reply.code(401).send({ error: 'unauthorized' });
        }
      },
    );
  },
);
