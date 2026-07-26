import { useSyncExternalStore } from 'react';

const TOKEN_STORAGE_KEY = 'playerToken';

const tokenChanged = new EventTarget();
const TOKEN_CHANGED_EVENT = 'token-changed';

/**
 * No login endpoint exists yet (tokens are minted out-of-band, see
 * server/src/http/auth.ts). The token is set manually in localStorage for now;
 * this module is the seam a real login flow will replace.
 */
export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setAuthToken(token: string): void {
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
  tokenChanged.dispatchEvent(new Event(TOKEN_CHANGED_EVENT));
}

export function clearAuthToken(): void {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  tokenChanged.dispatchEvent(new Event(TOKEN_CHANGED_EVENT));
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === TOKEN_STORAGE_KEY) {
      onChange();
    }
  };
  window.addEventListener('storage', onStorage);
  tokenChanged.addEventListener(TOKEN_CHANGED_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onStorage);
    tokenChanged.removeEventListener(TOKEN_CHANGED_EVENT, onChange);
  };
}

/** Reactive read of the stored token — re-renders on same-tab or cross-tab changes. */
export function useAuthToken(): string | null {
  return useSyncExternalStore(subscribe, getAuthToken);
}
