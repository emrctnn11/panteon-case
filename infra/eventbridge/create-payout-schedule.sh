#!/usr/bin/env bash
#
# Provisions the weekly payout trigger (README §3.4).
#
# Design note — Rule, not Scheduler:
#   README §3.4 says "EventBridge Scheduler". EventBridge *Scheduler* cannot
#   target an API destination — only event-bus Rules and Pipes can (AWS
#   "API destinations as targets" docs); a Scheduler target rejects an
#   api-destination ARN as "not in correct format". To POST to a raw HTTPS
#   endpoint on a cron we therefore use a scheduled *Rule*, the documented
#   pattern. Behaviour is identical: one cron(5 0 ? * MON *) UTC invocation per
#   week, with a retry policy and a DLQ. README §3.4 wording should be updated.
#
# What it creates (all idempotent — re-running reuses resources by name):
#   1. Connection      — holds the x-internal-secret header (stored in Secrets Manager)
#   2. API destination — POST <endpoint>, authorized by the Connection
#   3. SQS DLQ         — undelivered invocations land here (README §3.4)
#   4. IAM role        — lets the rule invoke the API destination
#   5. Scheduled Rule  — cron(5 0 ? * MON *) UTC → the API destination target
#
# Prerequisites:
#   - awscli v2, authenticated with permissions for events / iam / sqs / sts
#   - env INTERNAL_PAYOUT_SECRET — the same secret the server validates
#                                  (http/internalAuth.ts); never committed
#   - env INVOCATION_ENDPOINT    — public HTTPS URL of POST /internal/payout
#                                  (e.g. https://<subdomain>.duckdns.org/internal/payout)
# Optional env:
#   - AWS_REGION   (default us-east-1 — must be an API-destination-supported region)
#   - NAME_PREFIX  (default panteon-payout)

set -euo pipefail

: "${INTERNAL_PAYOUT_SECRET:?set INTERNAL_PAYOUT_SECRET (the shared secret the server checks)}"
: "${INVOCATION_ENDPOINT:?set INVOCATION_ENDPOINT (https URL of POST /internal/payout)}"

AWS_REGION="${AWS_REGION:-us-east-1}"
NAME_PREFIX="${NAME_PREFIX:-panteon-payout}"
export AWS_DEFAULT_REGION="$AWS_REGION"

CONNECTION_NAME="${NAME_PREFIX}-connection"
APIDEST_NAME="${NAME_PREFIX}-apidest"
RULE_NAME="${NAME_PREFIX}-weekly"
ROLE_NAME="${NAME_PREFIX}-invoke-role"
DLQ_NAME="${NAME_PREFIX}-dlq"
SCHEDULE="cron(5 0 ? * MON *)"   # Mon 00:05 UTC — EventBridge cron is always UTC (README §3.3)

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
RULE_ARN="arn:aws:events:${AWS_REGION}:${ACCOUNT_ID}:rule/${RULE_NAME}"

# Temp dir for the secret + policy documents: 0700, removed on exit. The secret
# is passed via file://, never on the command line, so it never appears in `ps`.
umask 077
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "==> region=${AWS_REGION} account=${ACCOUNT_ID} prefix=${NAME_PREFIX}"

# 1. Connection — API_KEY auth adds the header `x-internal-secret: <secret>`.
cat >"$WORK/auth.json" <<JSON
{ "ApiKeyAuthParameters": { "ApiKeyName": "x-internal-secret", "ApiKeyValue": "${INTERNAL_PAYOUT_SECRET}" } }
JSON

if CONNECTION_ARN="$(aws events describe-connection --name "$CONNECTION_NAME" \
      --query ConnectionArn --output text 2>/dev/null)"; then
  echo "==> connection exists, refreshing auth: $CONNECTION_ARN"
  aws events update-connection --name "$CONNECTION_NAME" \
    --authorization-type API_KEY \
    --auth-parameters "file://$WORK/auth.json" >/dev/null
else
  CONNECTION_ARN="$(aws events create-connection --name "$CONNECTION_NAME" \
    --authorization-type API_KEY \
    --auth-parameters "file://$WORK/auth.json" \
    --query ConnectionArn --output text)"
  echo "==> connection created: $CONNECTION_ARN"
fi

# Wait for the Connection to become AUTHORIZED (secret provisioning is async).
for _ in $(seq 1 30); do
  STATE="$(aws events describe-connection --name "$CONNECTION_NAME" --query ConnectionState --output text)"
  [ "$STATE" = "AUTHORIZED" ] && break
  echo "    connection state=$STATE, waiting..."
  sleep 2
done
[ "$STATE" = "AUTHORIZED" ] || { echo "connection did not reach AUTHORIZED (state=$STATE)" >&2; exit 1; }

# 2. API destination — the HTTPS endpoint + method, bound to the Connection.
if APIDEST_ARN="$(aws events describe-api-destination --name "$APIDEST_NAME" \
      --query ApiDestinationArn --output text 2>/dev/null)"; then
  echo "==> api-destination exists, updating: $APIDEST_ARN"
  aws events update-api-destination --name "$APIDEST_NAME" \
    --connection-arn "$CONNECTION_ARN" \
    --invocation-endpoint "$INVOCATION_ENDPOINT" \
    --http-method POST >/dev/null
else
  APIDEST_ARN="$(aws events create-api-destination --name "$APIDEST_NAME" \
    --connection-arn "$CONNECTION_ARN" \
    --invocation-endpoint "$INVOCATION_ENDPOINT" \
    --http-method POST \
    --invocation-rate-limit-per-second 1 \
    --query ApiDestinationArn --output text)"
  echo "==> api-destination created: $APIDEST_ARN"
fi

# 3. SQS DLQ (create-queue is idempotent for the same name) + a resource policy
#    letting *this rule* deliver failed invocations to it.
QUEUE_URL="$(aws sqs create-queue --queue-name "$DLQ_NAME" --query QueueUrl --output text)"
DLQ_ARN="$(aws sqs get-queue-attributes --queue-url "$QUEUE_URL" \
  --attribute-names QueueArn --query 'Attributes.QueueArn' --output text)"

DLQ_POLICY='{"Version":"2012-10-17","Statement":[{"Sid":"AllowWeeklyPayoutRuleDLQ","Effect":"Allow","Principal":{"Service":"events.amazonaws.com"},"Action":"sqs:SendMessage","Resource":"'"$DLQ_ARN"'","Condition":{"ArnEquals":{"aws:SourceArn":"'"$RULE_ARN"'"}}}]}'
# set-queue-attributes' shorthand can't carry a JSON value (commas), so pass a
# file whose Policy field is the stringified policy (quotes escaped).
printf '{"Policy":"%s"}' "${DLQ_POLICY//\"/\\\"}" >"$WORK/dlq-attrs.json"
aws sqs set-queue-attributes --queue-url "$QUEUE_URL" --attributes "file://$WORK/dlq-attrs.json"
echo "==> dlq ready: $DLQ_ARN"

# 4. IAM role the rule assumes to invoke the API destination.
TRUST='{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"events.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
if ROLE_ARN="$(aws iam get-role --role-name "$ROLE_NAME" --query 'Role.Arn' --output text 2>/dev/null)"; then
  echo "==> role exists: $ROLE_ARN"
else
  ROLE_ARN="$(aws iam create-role --role-name "$ROLE_NAME" \
    --assume-role-policy-document "$TRUST" \
    --description "Lets the weekly payout rule invoke the payout API destination" \
    --query 'Role.Arn' --output text)"
  echo "==> role created: $ROLE_ARN"
fi
PERM='{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":"events:InvokeApiDestination","Resource":"'"$APIDEST_ARN"'"}]}'
aws iam put-role-policy --role-name "$ROLE_NAME" \
  --policy-name invoke-api-destination --policy-document "$PERM"

# 5. Scheduled rule (default event bus — schedule expressions require it) + target.
aws events put-rule --name "$RULE_NAME" \
  --schedule-expression "$SCHEDULE" \
  --state ENABLED \
  --description "Weekly payout trigger (README §3.4) — Mon 00:05 UTC" >/dev/null

# Input is an empty body: the endpoint derives its own week and takes no
# parameters (invariant 13). RetryPolicy + DeadLetterConfig per README §3.4;
# retries are exactly why the payout must be idempotent (payout_runs guard).
TARGETS='[{"Id":"payout-endpoint","Arn":"'"$APIDEST_ARN"'","RoleArn":"'"$ROLE_ARN"'","Input":"{}","RetryPolicy":{"MaximumRetryAttempts":5,"MaximumEventAgeInSeconds":3600},"DeadLetterConfig":{"Arn":"'"$DLQ_ARN"'"}}]'
aws events put-targets --rule "$RULE_NAME" --targets "$TARGETS" >/dev/null
echo "==> rule + target set: $RULE_ARN"

cat <<SUMMARY

Done. Weekly payout trigger is live:
  schedule     ${SCHEDULE}  (UTC)
  endpoint     ${INVOCATION_ENDPOINT}
  connection   ${CONNECTION_ARN}
  apidest      ${APIDEST_ARN}
  rule         ${RULE_ARN}
  dlq          ${DLQ_ARN}

Verify:
  aws events list-targets-by-rule --rule ${RULE_NAME}
  aws events describe-connection --name ${CONNECTION_NAME} --query ConnectionState
  # After a scheduled run, check delivery:
  aws cloudwatch get-metric-statistics --namespace AWS/Events \\
    --metric-name Invocations --dimensions Name=RuleName,Value=${RULE_NAME} \\
    --start-time \$(date -u -d '1 day ago' +%FT%TZ) --end-time \$(date -u +%FT%TZ) \\
    --period 86400 --statistics Sum
SUMMARY
