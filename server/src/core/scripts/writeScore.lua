--[[
  writeScore.lua — atomic composite-score write + prize-pool increment.

  Score and pool are logically coupled (the pool is a fixed share of earnings), so
  they must move together or a crash between them leaves the pool permanently wrong
  (CLAUDE.md invariant 6, README §3.1). Redis runs this whole script atomically.

  Non-increasing submissions are rejected (GT semantics, invariant 8): replaying the
  same absolute total is a no-op and an out-of-order lower total is dropped, which is
  what makes client retries safe. The comparison is on the *composite* score, not raw
  earnings — a replayed same-total arrives later in the week (smaller time term) and
  therefore has a strictly lower composite, so it is rejected for free.

  KEYS[1]  week sorted set        e.g. lb:2026-W30   (derived server-side, invariant 9)
  KEYS[2]  week pool counter      e.g. pool:2026-W30
  ARGV[1]  player id              bare member, nothing encoded (invariant 5)
  ARGV[2]  new composite score    already encoded by core/score.ts (invariants 2-4)
  ARGV[3]  pool multiplier        integer minor units of pool per earnings unit
                                   (= 2 for the 2% convention, README §3.1; config, not magic)

  Returns { applied, rank }
    applied  1 if the score was written, 0 if rejected as non-increasing
    rank     the player's current 0-based rank (ZREVRANK), returned either way so the
             write path always tells the client where it now stands (README §3.1)
]]

local key = KEYS[1]
local poolKey = KEYS[2]
local member = ARGV[1]
local newScore = tonumber(ARGV[2])
local poolMultiplier = tonumber(ARGV[3])

-- Must match core/score.ts SHIFT (2^14). Used only to decode earnings from the
-- composite score; encoding/clamping happen upstream in TypeScript. See README §3.2.
local SHIFT = 16384

local function decodeEarnings(composite)
  return math.floor(composite / SHIFT)
end

local old = redis.call('ZSCORE', key, member)

-- Reject non-increasing scores. `old` is false when the member is absent, in which
-- case this is a first submission and always applies.
if old and tonumber(old) >= newScore then
  return { 0, redis.call('ZREVRANK', key, member) }
end

local oldEarnings = 0
if old then
  oldEarnings = decodeEarnings(tonumber(old))
end
local newEarnings = decodeEarnings(newScore)

-- earningsDelta is always >= 0 here: a strictly higher composite implies at least
-- equal earnings (one earnings unit outweighs the whole time term, README §3.2).
local poolDelta = (newEarnings - oldEarnings) * poolMultiplier

redis.call('ZADD', key, newScore, member)
if poolDelta > 0 then
  -- Integer INCRBY only — never INCRBYFLOAT on money (invariant 1).
  redis.call('INCRBY', poolKey, poolDelta)
end

return { 1, redis.call('ZREVRANK', key, member) }
