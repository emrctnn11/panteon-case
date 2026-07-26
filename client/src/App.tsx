import { LeaderboardList } from './components/LeaderboardList.tsx';

export function App() {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-slate-100">
      <h1 className="mb-4 text-2xl font-bold">Weekly Leaderboard</h1>
      <LeaderboardList />
    </main>
  );
}
