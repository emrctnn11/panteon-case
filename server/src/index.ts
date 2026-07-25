import { buildApp } from './app.js';
import { loadConfig } from './config/env.js';
import { createDb } from './db/client.js';
import { createMongoClient } from './mongo/client.js';
import { createRedisClient } from './redis/client.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const redis = createRedisClient(config);
  const mongoClient = await createMongoClient(config);
  const db = createDb(config);
  const app = await buildApp(config, {
    redis,
    mongoDb: mongoClient.db(),
    db,
  });

  // Bind on all interfaces so the process is reachable inside the container.
  await app.listen({ port: config.PORT, host: '0.0.0.0' });
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console -- last-resort logger before Fastify exists
  console.error('Fatal startup error:', err);
  process.exit(1);
});
