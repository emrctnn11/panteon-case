import { readFileSync } from 'node:fs';

import { Redis, type Result, type Callback } from 'ioredis';

import type { Config } from '../config/env.js';

/**
 * `writeScore`/`readWindow` are registered as custom commands (CLAUDE.md stack
 * decision: ioredis `defineCommand`, invoked via `EVALSHA` automatically). The
 * script bodies live in `core/scripts/*.lua`; this path is relative to the
 * *compiled* location of this file, so it resolves under both `tsx` (running
 * from `src/`) and the built `dist/` tree — provided the `.lua` files are
 * copied alongside during build (`scripts/copy-lua.mjs`, wired into `npm run build`).
 */
function readLua(name: string): string {
  return readFileSync(
    new URL(`../core/scripts/${name}`, import.meta.url),
    'utf8',
  );
}

/** Result of `writeScore.lua`: `[applied, rank]`. See the script header for field meaning. */
export type WriteScoreReply = [applied: number, rank: number];

/** Result of `readWindow.lua`: `[rank, start, entries]`, or `null` if the player has no score. */
export type ReadWindowReply =
  [rank: number, start: number, entries: string[]] | null;

declare module 'ioredis' {
  interface RedisCommander<Context> {
    writeScore(
      scoreboardKey: string,
      poolKey: string,
      playerId: string,
      newScore: number,
      poolMultiplier: number,
      callback?: Callback<WriteScoreReply>,
    ): Result<WriteScoreReply, Context>;

    readWindow(
      scoreboardKey: string,
      playerId: string,
      above: number,
      below: number,
      callback?: Callback<ReadWindowReply>,
    ): Result<ReadWindowReply, Context>;
  }
}

export type LeaderboardRedis = Redis;

/**
 * Builds an `ioredis` client wired to `config.REDIS_URL` with the leaderboard's
 * Lua commands registered. A factory, not a module-level singleton — same
 * reasoning as `buildApp`/`createDb`: tests get an isolated instance, and the
 * connection itself is infra reuse, not per-request state (invariant 17).
 */
export function createRedisClient(config: Config): LeaderboardRedis {
  const client = new Redis(config.REDIS_URL);

  client.defineCommand('writeScore', {
    numberOfKeys: 2,
    lua: readLua('writeScore.lua'),
  });
  client.defineCommand('readWindow', {
    numberOfKeys: 1,
    lua: readLua('readWindow.lua'),
  });

  return client;
}
