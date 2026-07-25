import type { FastifyInstance } from 'fastify';

import {
  runPayout,
  type PayoutResult,
  type PayoutServiceDeps,
} from './service.js';

export interface PayoutRouteOptions extends PayoutServiceDeps {
  alpha: number;
}

/**
 * `POST /internal/payout` — EventBridge-triggered weekly close (README §3.4).
 * Synchronous: 100 rows complete in milliseconds, no queue hand-off needed
 * at this scale.
 */
export async function payoutRoutes(
  app: FastifyInstance,
  opts: PayoutRouteOptions,
): Promise<void> {
  app.post(
    '/internal/payout',
    { preHandler: [app.authenticateInternal] },
    async (): Promise<PayoutResult> => {
      return runPayout(opts, new Date(), opts.alpha);
    },
  );
}
