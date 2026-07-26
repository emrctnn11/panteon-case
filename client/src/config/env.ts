export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

export const TOP_POLL_INTERVAL_MS = Number(
  import.meta.env.VITE_TOP_POLL_INTERVAL_MS ?? 5000,
);

export const ME_POLL_INTERVAL_MS = Number(
  import.meta.env.VITE_ME_POLL_INTERVAL_MS ?? 15000,
);

/**
 * Shows the demo "View as" picker, which drives the server's demo-only
 * `POST /api/dev/token` (server-side `DEMO_MODE`). On for this evaluation build;
 * set `VITE_DEMO_MODE=false` for a real production client so the picker is gone.
 */
export const DEMO_MODE = (import.meta.env.VITE_DEMO_MODE ?? 'true') !== 'false';
