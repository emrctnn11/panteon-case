import { useState } from 'react';

import { LastWeekResults } from './components/LastWeekResults.tsx';
import { LeaderboardList } from './components/LeaderboardList.tsx';
import { SegmentedTabs } from './components/SegmentedTabs.tsx';
import { ViewAsPicker } from './components/ViewAsPicker.tsx';
import { DEMO_MODE } from './config/env.ts';

type TabId = 'this-week' | 'last-week';

const TABS = [
  { id: 'this-week', label: 'This week' },
  { id: 'last-week', label: 'Last week' },
] as const satisfies readonly { id: TabId; label: string }[];

export function App() {
  const [tab, setTab] = useState<TabId>('this-week');

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 text-slate-100">
      <div className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-6 sm:py-10">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Weekly Leaderboard
          </h1>
          <p className="text-sm text-slate-400">
            Earn the most this week to climb the ranks and win a share of the
            pool.
          </p>
        </header>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <SegmentedTabs
            tabs={TABS}
            value={tab}
            onChange={setTab}
            ariaLabel="Leaderboard week"
          />
          {DEMO_MODE && <ViewAsPicker />}
        </div>

        {/* Mounting only the active view stops the hidden one from polling
            (README §3.7); TanStack caches by query key, so switching back is cheap. */}
        {tab === 'this-week' ? <LeaderboardList /> : <LastWeekResults active />}
      </div>
    </main>
  );
}
