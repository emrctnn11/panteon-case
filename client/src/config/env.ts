export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

export const TOP_POLL_INTERVAL_MS = Number(
  import.meta.env.VITE_TOP_POLL_INTERVAL_MS ?? 5000,
);

export const ME_POLL_INTERVAL_MS = Number(
  import.meta.env.VITE_ME_POLL_INTERVAL_MS ?? 15000,
);
