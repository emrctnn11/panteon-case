import { buildApp } from './app.js';
import { loadConfig } from './config/env.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const app = await buildApp(config);

  // Bind on all interfaces so the process is reachable inside the container.
  await app.listen({ port: config.PORT, host: '0.0.0.0' });
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console -- last-resort logger before Fastify exists
  console.error('Fatal startup error:', err);
  process.exit(1);
});
