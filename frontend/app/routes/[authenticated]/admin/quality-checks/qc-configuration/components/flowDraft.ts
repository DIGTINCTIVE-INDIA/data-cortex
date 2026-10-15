/**
 * A step-1 form that survives going to step 2 and coming back.
 *
 * Creating a database check writes the check as soon as step 1 is submitted, so step 2
 * (field rules) already has a real check to attach to. Going back to step 1 therefore
 * has to mean "edit that check", not "start another one" -- otherwise the first form
 * comes back empty and saving it a second time creates a duplicate.
 *
 * sessionStorage, not localStorage: a draft is part of one sitting. A new tab or a new
 * session starts clean, and nothing lingers on a shared machine.
 */
const PREFIX = "dc:flow:";
const POINTER = (flow: string) => `${PREFIX}${flow}:last`;
const KEY = (flow: string, id: string) => `${PREFIX}${flow}:${id}`;

export type Draft<T> = { id: string; values: T };

const safe = <R>(fn: () => R, fallback: R): R => {
  try {
    return fn();
  } catch {
    // Storage can be unavailable (private mode, blocked site data). The flow still
    // works without it -- it just cannot be resumed.
    return fallback;
  }
};

export function saveDraft<T>(flow: string, id: string, values: T) {
  safe(() => {
    sessionStorage.setItem(KEY(flow, id), JSON.stringify(values));
    sessionStorage.setItem(POINTER(flow), id);
  }, undefined);
}

export function readDraft<T>(flow: string, id: string): Draft<T> | null {
  return safe(() => {
    const raw = sessionStorage.getItem(KEY(flow, id));
    return raw ? { id, values: JSON.parse(raw) as T } : null;
  }, null);
}

/** The draft most recently saved, for when the browser's own Back button returns here. */
export function readLastDraft<T>(flow: string): Draft<T> | null {
  const id = safe(() => sessionStorage.getItem(POINTER(flow)), null);
  return id ? readDraft<T>(flow, id) : null;
}

/** Called when the flow is finished, so a completed check is not offered for editing. */
export function clearDraft(flow: string, id: string) {
  safe(() => {
    sessionStorage.removeItem(KEY(flow, id));
    if (sessionStorage.getItem(POINTER(flow)) === id) sessionStorage.removeItem(POINTER(flow));
  }, undefined);
}
