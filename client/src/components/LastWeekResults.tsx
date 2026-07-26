import { useWeekHistory } from '../hooks/useWeekHistory.ts';
import { formatEarnings } from '../lib/format.ts';
import type { HistoryEntry } from '../api/types.ts';
import { LeaderboardRow } from './LeaderboardRow.tsx';
import { Podium, type PodiumEntry } from './Podium.tsx';

/** Settled prize as a display string; `amount_minor` is BIGINT-as-string. */
function awardLabel(entry: HistoryEntry): string {
  return formatEarnings(Number(entry.amountMinor));
}

function toPodiumEntry(entry: HistoryEntry): PodiumEntry {
  return {
    rank: entry.rank,
    displayName: entry.displayName,
    rawEarnings: Number(entry.earningsMinor),
    awardLabel: awardLabel(entry),
  };
}

/**
 * "Last week" results — winners and the exact prizes they were paid, read from
 * the frozen snapshot via `/history/latest` (never Redis; README §3.4). Only
 * fetches when its tab is active. ≤100 rows, so a plain list, no virtualization.
 * Reuses `Podium` and `LeaderboardRow` rather than restating either.
 */
export function LastWeekResults({ active }: { active: boolean }) {
  const { data, isLoading, isError } = useWeekHistory(active);

  if (isLoading) {
    return (
      <div className="p-6 text-center text-sm text-slate-400">
        Loading last week…
      </div>
    );
  }

  // A 404 (no completed week yet) or an empty settled week both land here as
  // "nothing to show", distinct from a live-data failure the user can retry.
  if (isError || !data || data.entries.length === 0) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-8 text-center">
        <div className="text-3xl">🏁</div>
        <p className="mt-3 text-sm text-slate-300">No settled week yet.</p>
        <p className="mt-1 text-xs text-slate-500">
          Last week's winners and prizes appear here once the weekly payout
          runs.
        </p>
      </div>
    );
  }

  const podiumEntries = data.entries.slice(0, 3).map(toPodiumEntry);
  const rest = data.entries.slice(3);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col items-center gap-1">
        <span className="text-xs font-medium tracking-wide text-slate-400 uppercase">
          {data.weekId} · Winners
        </span>
      </div>

      <Podium entries={podiumEntries} />

      {rest.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-800">
          {rest.map((entry) => (
            <LeaderboardRow
              key={entry.playerId}
              rank={entry.rank - 1}
              displayName={entry.displayName}
              rawEarnings={Number(entry.earningsMinor)}
              awardLabel={awardLabel(entry)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
