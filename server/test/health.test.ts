import { describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config/env.js';

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const app = await buildApp(
      loadConfig({
        NODE_ENV: 'test',
        DATABASE_URL: 'postgres://test:test@localhost:5432/test',
        REDIS_URL: 'redis://localhost:6379',
        MONGODB_URI: 'mongodb://localhost:27017/test',
      }),
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
