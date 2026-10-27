/**
 * Work in progress kept in the browser's own storage, so a refresh, a closed tab or a crash
 * does not lose a long field-rules table.
 *
 * localStorage: it survives closing the browser. Entries expire after a week, and a
 * finished save clears its entry, so nothing lingers. Every call is wrapped because storage
 * can be unavailable (private mode, blocked site data); the page then simply works without
 * a cache.
 */
const PREFIX = "dc:cache:";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function readCache<T>(key: string, isValid?: (value: unknown) => boolean): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;

    const { savedAt, value } = JSON.parse(raw) as { savedAt: number; value: unknown };

    if (Date.now() - savedAt > WEEK_MS || (isValid && !isValid(value))) {
      localStorage.removeItem(PREFIX + key);
      return null;
    }

    return value as T;
  } catch {
    return null;
  }
}

export function writeCache(key: string, value: unknown) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ savedAt: Date.now(), value }));
  } catch {
    // Storage full or blocked: carry on without the cache.
  }
}

export function clearCache(key: string) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    // Nothing to clear.
  }
}
