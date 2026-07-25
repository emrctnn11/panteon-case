--[[
  readWindow.lua — atomic rank lookup + surrounding window.

  Rank and window must come from a single snapshot (CLAUDE.md invariant 7, README
  §3.6): between a separate ZREVRANK and ZREVRANGE a concurrent write can shift the
  player's rank, and the returned window might not contain the player at all. Redis
  runs this script atomically, so both are read from the same state.

  KEYS[1]  week sorted set   e.g. lb:2026-W30
  ARGV[1]  player id         bare member (invariant 5)
  ARGV[2]  rows above        e.g. 3
  ARGV[3]  rows below        e.g. 2

  Returns { rank, start, entries }
    rank     player's 0-based rank (ZREVRANK)
    start    0-based rank of the first window row, so the caller derives each row's
             absolute rank as start + i
    entries  flat [member, score, member, score, ...] from ZREVRANGE WITHSCORES,
             at most (above + 1 + below) rows — a bounded enrichment set (invariant 20)
  Returns nil if the player has no score this week.
]]

local key = KEYS[1]
local member = ARGV[1]
local above = tonumber(ARGV[2])
local below = tonumber(ARGV[3])

local rank = redis.call('ZREVRANK', key, member)
-- `rank` is false when the member is absent; rank 0 is truthy in Lua, so this only
-- short-circuits on a genuine miss.
if not rank then
  return nil
end

-- Clamp the low end: a negative index counts back from the end of the set, which
-- would return the wrong window for players near the top.
local start = rank - above
if start < 0 then
  start = 0
end
-- The high end needs no clamp; Redis truncates a stop past the last element.
local stop = rank + below

local entries = redis.call('ZREVRANGE', key, start, stop, 'WITHSCORES')

return { rank, start, entries }
