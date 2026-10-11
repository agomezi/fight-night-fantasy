// What each screen last loaded, kept in memory while the app runs. A screen
// coming back into view shows this straight away and refreshes behind it, so
// skeletons only appear the first time. Cleared when the player signs out, so
// nothing carries over to the next account.

const store = new Map<string, unknown>();

export function readCache<T>(key: string | null | undefined): T | undefined {
  return key ? (store.get(key) as T | undefined) : undefined;
}

export function writeCache<T>(key: string | null | undefined, value: T): T {
  if (key) store.set(key, value);
  return value;
}

export function clearCache(): void {
  store.clear();
}
