/**
 * Rejects if `promise` hasn't settled within `ms`. Used to bound startup
 * health checks (`index.ts`): ioredis retries a lost connection forever, so an
 * unbounded `ping()` would hang instead of failing fast. The timer is cleared
 * on settle so it never keeps the event loop alive.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms,
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
