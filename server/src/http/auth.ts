import fastifyJwt from '@fastify/jwt';
import fastifyPlugin from 'fastify-plugin';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import type { Config } from '../config/env.js';

/**
 * Player JWTs are minted out-of-band (no login endpoint — see plan). This API
 * only verifies them and trusts the `sub` claim as the player id; it is never
 * read from a request body (invariant 4's "server-computed only" reasoning
 * extends to identity, not just the timestamp).
 */
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string };
    user: { sub: string };
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => Promise<void>;
  }
}

/**
 * Registers `@fastify/jwt` and an `app.authenticate` preHandler. Verification
 * failure throws inside `jwtVerify`; `@fastify/jwt` marks it a 401 and it
 * propagates to Fastify's central error handler (CLAUDE.md: no silent catches).
 * `fastify-plugin` skips encapsulation so `app.authenticate` is visible to
 * routes registered as sibling plugins, not just descendants.
 */
export const authPlugin = fastifyPlugin(async function authPlugin(
  app: FastifyInstance,
  config: Config,
) {
  await app.register(fastifyJwt, { secret: config.JWT_SECRET });

  app.decorate(
    'authenticate',
    async function authenticate(request: FastifyRequest) {
      await request.jwtVerify();
    },
  );
});
