# EventBridge — weekly payout trigger

Provisions the automatic weekly payout trigger described in **README §3.4**: a cron
that calls the secret-protected `POST /internal/payout` endpoint once a week, with
retries and a dead-letter queue.

```
EventBridge scheduled Rule  ──cron(5 0 ? * MON *) UTC──▶  API destination
   (default event bus)                                    │  (POST, +x-internal-secret
   retry policy + DLQ (SQS)  ◀──failed invocations──┐     │   header via Connection)
                                                     └─────┴──▶ https://<host>/internal/payout
```

## Why a Rule, not EventBridge Scheduler

README §3.4 names "EventBridge Scheduler". Scheduler **cannot target an API
destination** — only event-bus **Rules** and Pipes can invoke one ([AWS: API
destinations as targets](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-api-destinations.html));
a Scheduler target rejects an api-destination ARN as "not in correct format". To POST
to a raw HTTPS endpoint on a schedule, the documented pattern is a **scheduled Rule**
with an API destination target. Behaviour is identical (one weekly UTC cron, retry
policy, DLQ), so this is a mechanism correction, not a design change — **README §3.4's
wording should be updated to "scheduled EventBridge Rule".**

## Prerequisites

- `awscli` v2, authenticated, with permissions for `events:*`, `iam:*` (role +
  inline policy), `sqs:*`, and `sts:GetCallerIdentity`.
- A region that supports API destinations (default `us-east-1`; full list in the AWS
  doc above).
- The endpoint must be **publicly reachable over HTTPS with a trusted certificate**
  (API destinations require this) and respond within **5 seconds** — EventBridge times
  out slower requests. The payout is ~100 rows / milliseconds (README §3.4), so this is
  comfortable; if recipients ever grow to thousands, switch the endpoint to `202` +
  queue as README §3.4 already anticipates.

## Run

```bash
export INTERNAL_PAYOUT_SECRET='<same secret the server validates>'   # never commit
export INVOCATION_ENDPOINT='https://<subdomain>.duckdns.org/internal/payout'
export AWS_REGION='us-east-1'            # optional
./create-payout-schedule.sh
```

The script is idempotent — re-running refreshes the auth/endpoint and reuses existing
resources by name. Rotating the secret is just a re-run with the new value.

## nginx routing (handled in the nginx layer, not here)

The API destination hits the public host, so nginx must:

- proxy `/internal/payout` to the Node upstream, **passing the `x-internal-secret`
  header through** (nginx forwards custom request headers by default);
- **not cache** `/internal/` (unlike `/api/leaderboard/top`); and
- optionally restrict `/internal/` further (the shared secret is the guard per README
  §3.4; an IP allowlist is not possible here because EventBridge egress IPs are not
  fixed — rely on the secret).

## Verify

```bash
# Endpoint side (bypasses EventBridge — confirms the secret + handler work):
curl -si -X POST https://<host>/internal/payout -H 'x-internal-secret: <secret>'
#   200 {"status":"completed"|"already_run"|...}   401 → secret mismatch

# AWS side:
aws events list-targets-by-rule --rule panteon-payout-weekly
aws events describe-connection --name panteon-payout-connection --query ConnectionState  # AUTHORIZED
# After a scheduled fire, non-zero FailedInvocations or DLQ depth means delivery failed:
aws sqs get-queue-attributes --queue-url <dlq-url> --attribute-names ApproximateNumberOfMessages
```

Retries make **duplicate invocations a certainty**, which is exactly why the endpoint is
idempotent (`payout_runs` `ON CONFLICT DO NOTHING`, invariant 11) — a redelivered event
pays out at most once.

## Teardown

```bash
aws events remove-targets --rule panteon-payout-weekly --ids payout-endpoint
aws events delete-rule --name panteon-payout-weekly
aws iam delete-role-policy --role-name panteon-payout-invoke-role --policy-name invoke-api-destination
aws iam delete-role --role-name panteon-payout-invoke-role
aws events delete-api-destination --name panteon-payout-apidest
aws events delete-connection --name panteon-payout-connection
aws sqs delete-queue --queue-url <dlq-url>
```
