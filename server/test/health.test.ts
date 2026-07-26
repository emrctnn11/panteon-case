import { describe, expect, it } from 'vitest';

import { buildApp, type AppDeps } from '../src/app.js';
import { loadConfig } from '../src/config/env.js';

// Health never touches Redis/Mongo/Postgres, so these stand-ins are never
// called — only their shape needs to satisfy AppDeps.
const noopDeps = {
  redis: {},
  mongoDb: {},
  mongoReady: () => false,
  db: {},
} as unknown as AppDeps;

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const app = await buildApp(
      loadConfig({
        NODE_ENV: 'test',
        DATABASE_URL: 'postgres://test:test@localhost:5432/test',
        REDIS_URL: 'redis://localhost:6379',
        MONGODB_URI: 'mongodb://localhost:27017/test',
        JWT_SECRET: 'test-secret-at-least-32-characters-long',
        INTERNAL_PAYOUT_SECRET: 'test-internal-secret-at-least-32-chars',
      }),
      noopDeps,
    );
    try {
      const res = await app.inject({ method: 'GET', url: '/health' });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ status: 'ok' });
    } finally {
      await app.close();
    }
  });
});
