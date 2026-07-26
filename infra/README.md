# infra/

Deployment artefacts for the leaderboard system (topology in README §2).

| Path | What | Status |
|---|---|---|
| `eventbridge/` | Weekly payout trigger — scheduled Rule → API destination → `POST /internal/payout` | ✅ built |
| `nginx/` | TLS termination, static serving, 5s `/top` cache, two Node upstreams | ⬜ not yet |
| `docker-compose.yml` | nginx + 2× Node + Redis + PostgreSQL on the t3.micro | ⬜ not yet |

Only the EventBridge trigger is provisioned so far. See `eventbridge/README.md` to run it.
