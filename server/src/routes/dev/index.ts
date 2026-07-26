import type { FastifyInstance } from 'fastify';

import { devTokenBodySchema } from './schema.js';

/**
 * Demo-only auth helper. Registered by `buildApp` **only when `DEMO_MODE` is
 * true** (config default false), so it does not exist in a production build.
 *
 * Its whole reason to exist: player JWTs are minted out-of-band (there is no
 * login flow — see `http/auth.ts`), so a reviewer has no way to authenticate as
 * a player and exercise `/me` / the personal window. This mints a token for a
 * requested seeded id. It is deliberately an auth bypass — acceptable for the
 * evaluation deployment, never for real players.
 */
export async function devRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/dev/token', async (request, reply) => {
    const parsed = devTokenBodySchema.safeParse(request.body);
    if (!parsed.success) {
      await reply.code(400).send({
        error: 'invalid_body',
        issues: parsed.error.issues,
      });
      return;
    }

    // Same `sub` claim shape the auth plugin verifies; short-lived so a leaked
    // demo token doesn't linger.
    const token = app.jwt.sign(
      { sub: parsed.data.playerId },
      { expiresIn: '2h' },
    );
    return { token };
  });
}
