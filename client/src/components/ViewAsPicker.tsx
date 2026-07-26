import { useState } from 'react';

import { fetchDemoToken } from '../api/leaderboard.ts';
import { DEMO_PLAYERS } from '../lib/constants.ts';
import {
  clearAuthToken,
  getTokenSub,
  setAuthToken,
  useAuthToken,
} from '../lib/auth.ts';

/**
 * Demo-only control (README §6): "view as" a seeded account so the personal
 * window can be seen without a login flow. Selecting an account mints a token
 * via the `DEMO_MODE`-gated endpoint and stores it; the auth store is reactive,
 * so `usePlayerWindow` picks it up and the window appears. Rendered only when
 * `DEMO_MODE` is on (see `App`); it is not part of the real product surface.
 */
export function ViewAsPicker() {
  const token = useAuthToken();
  const activeId = getTokenSub(token);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(false);

  async function handleChange(nextId: string) {
    setError(false);
    if (nextId === '') {
      clearAuthToken();
      return;
    }
    setIsLoading(true);
    try {
      const { token: minted } = await fetchDemoToken(nextId);
      setAuthToken(minted);
    } catch {
      setError(true);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <label className="flex items-center gap-2 text-xs text-slate-400">
      <span className="whitespace-nowrap">👤 View as</span>
      <select
        value={activeId ?? ''}
        disabled={isLoading}
        onChange={(event) => void handleChange(event.target.value)}
        className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-slate-200 disabled:opacity-50"
      >
        <option value="">Nobody (signed out)</option>
        {DEMO_PLAYERS.map((player) => (
          <option key={player.id} value={player.id}>
            {player.label} — {player.hint}
          </option>
        ))}
      </select>
      {isLoading && <span className="text-slate-500">…</span>}
      {error && <span className="text-red-400">failed</span>}
    </label>
  );
}
