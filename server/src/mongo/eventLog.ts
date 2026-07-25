import type { Db } from 'mongodb';

/**
 * Append-only event log (README §2 — audit trail / analytics, no transactional
 * requirement). Starts with the one event type the write path actually produces;
 * a `type` discriminator lets future event kinds share the same collection
 * without a schema migration (Mongo's flexible-schema strength).
 */
export interface ScoreSubmissionEvent {
  type: 'score_submission';
  playerId: string;
  weekId: string;
  rawEarnings: number;
  minutesElapsed: number;
  applied: boolean;
  rank: number;
  occurredAt: Date;
}

const COLLECTION = 'events';

/**
 * Writes one or more events in a single round-trip. "Batch" here means the
 * caller passing multiple documents in one call (e.g. a payout run logging
 * ~100 events at once) — not a cross-request in-memory buffer, which CLAUDE.md
 * invariant 15 rules out (no module-level state that outlives a request). A
 * single score-submission call is just the `events.length === 1` case of the
 * same API.
 *
 * `ordered: false`: one rejected document (e.g. a validation error) must not
 * block the rest of the batch from being written — this is an audit log, not
 * a transactional write. Errors are not swallowed; they propagate to the
 * caller (CLAUDE.md convention — no silent catches).
 */
export async function logEvents(
  db: Db,
  events: readonly ScoreSubmissionEvent[],
): Promise<void> {
  if (events.length === 0) {
    return;
  }
  await db
    .collection<ScoreSubmissionEvent>(COLLECTION)
    .insertMany([...events], {
      ordered: false,
    });
}
