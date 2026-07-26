import { API_BASE_URL } from '../config/env.ts';

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown) {
    super(`API request failed with status ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

/** Thin fetch wrapper. Retry/backoff is TanStack Query's job, not this layer's. */
export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, init);

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    throw new ApiError(response.status, body);
  }

  return (await response.json()) as T;
}
