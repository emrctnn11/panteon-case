# AI workflow log

Chronological record of AI-assisted development moments. Feeds README §5.
Newest entries on top. Dated, factual, 2–3 lines each — no embellishment.

## 2026-07-25
In `server/src/config/env.ts` the env-validation error handler first used `z.prettifyError()`,
a zod v4 API absent from the pinned zod 3.24 — it would have thrown at runtime on the first bad
config. Caught before running and replaced with manual `error.issues` formatting.

## 2026-07-25
Scaffolded `server/` and `client/` as separate TS-strict/ESM projects. Chose Fastify over
Express (first-class types, schema hooks pairing with zod). Kept scope to a runnable skeleton
(health route + placeholder App) rather than wiring ioredis/pg/Mongo now, to avoid a premature
Postgres-access decision (raw pg vs Kysely vs Prisma) still marked undecided in CLAUDE.md.

## 2026-07-25
Chose to encode CLAUDE.md's rules as executable Claude Code skills rather than rely on
manual recall each session. Wrote three project skills: `check-invariants` (audits a diff
against the 20 hard invariants), `new-endpoint` (scaffolds a route in the mandatory
validation→service→typed-return layer order), and `wtf-log` (this log's own writer).
