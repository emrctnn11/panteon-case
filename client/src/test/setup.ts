import '@testing-library/jest-dom/vitest';

/**
 * Node 20's own experimental global `localStorage` shadows jsdom's, but is a
 * no-op stub without `--localstorage-file` — `getItem` throws on `undefined`.
 * A minimal in-memory polyfill sidesteps the conflict; nothing here needs
 * cross-origin or persistence semantics, just get/set/remove.
 */
class MemoryStorage {
  private readonly store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

Object.defineProperty(globalThis, 'localStorage', {
  value: new MemoryStorage(),
  configurable: true,
});
