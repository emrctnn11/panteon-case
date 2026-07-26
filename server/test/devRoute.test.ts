import { describe, expect, it } from 'vitest';

import { buildApp, type AppDeps } from '../src/app.js';
import { loadConfig } from '../src/config/env.js';

const baseEnv = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://test:test@localhost:5432/test',
  REDIS_URL: 'redis://localhost:6379',
  MONGODB_URI: 'mongodb://localhost:27017/test',
  JWT_SECRET: 'test-secret-at-least-32-characters-long',
  INTERNAL_PAYOUT_SECRET: 'test-internal-secret-at-least-32-chars',
};

// The dev route touches none of the stores; empty fakes are enough.
const deps = {
  redis: {} as unknown as AppDeps['redis'],
  mongoDb: {} as unknown as AppDeps['mongoDb'],
  mongoReady: () => false,
  db: {} as unknown as AppDeps['db'],
} satisfies AppDeps;

async function post(demoMode: 'true' | 'false', body: unknown) {
  const config = loadConfig({ ...baseEnv, DEMO_MODE: demoMode });
  const app = await buildApp(config, deps);
  try {
    return await app.inject({
      method: 'POST',
      url: '/api/dev/token',
      payload: body,
    });
  } finally {
    await app.close();
  }
}

describe('POST /api/dev/token', () => {
  it('does not exist when DEMO_MODE is off', async () => {
    const res = await post('false', { playerId: 'p000001' });
    expect(res.statusCode).toBe(404);
  });

  it('mints a token whose sub is the requested player when DEMO_MODE is on', async () => {
    const res = await post('true', { playerId: 'test-rank-102' });
    expect(res.statusCode).toBe(200);

    const { token } = res.json() as { token: string };
    expect(typeof token).toBe('string');

    // A JWT's payload is the middle base64url segment; decode and check `sub`.
    const payloadSegment = token.split('.')[1] ?? '';
    const payload = JSON.parse(
      Buffer.from(payloadSegment, 'base64url').toString('utf8'),
    ) as { sub: string };
    expect(payload.sub).toBe('test-rank-102');
  });

  it('rejects a missing playerId', async () => {
    const res = await post('true', {});
    expect(res.statusCode).toBe(400);
  });
});
