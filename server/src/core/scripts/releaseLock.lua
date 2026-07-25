--[[
  releaseLock.lua — atomic compare-and-delete for the payout lock.

  A plain DEL is unsafe here: if this worker's lock outlives its TTL, another
  worker may have already acquired the same key by the time this one gets
  around to releasing it, and a bare DEL would delete *their* lock. Comparing
  the stored token first and only deleting on a match keeps release scoped to
  the lock this worker actually holds. This is an optimisation only — the
  real exactly-once guarantee is the `payout_runs` ON CONFLICT DO NOTHING
  guard (CLAUDE.md invariant 11, README §3.4).

  KEYS[1]  lock key     e.g. lock:payout:2026-W30
  ARGV[1]  token         the uuid this worker set when it acquired the lock

  Returns 1 if the lock was released, 0 if it didn't match (already expired
  and/or held by someone else) or never existed.
]]

if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
else
  return 0
end
