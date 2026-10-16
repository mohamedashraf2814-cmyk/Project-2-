/** Safe localStorage wrapper. Never throws; falls back to memory when storage is blocked. */
const mem = new Map<string, string>();
let broken = false;

function ls(): Storage | null {
  if (broken) return null;
  try {
    const s = window.localStorage;
    const k = '__ssn_probe__';
    s.setItem(k, '1');
    s.removeItem(k);
    return s;
  } catch {
    broken = true;
    return null;
  }
}

export const PREFIX = 'ssn:v1:';

export function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = ls()?.getItem(PREFIX + key) ?? mem.get(PREFIX + key) ?? null;
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    // keep the corrupt value for inspection instead of crashing or silently deleting it
    try {
      const raw = ls()?.getItem(PREFIX + key);
      if (raw) ls()?.setItem(`${PREFIX}corrupt:${key}`, raw);
    } catch {
      /* ignore */
    }
    return fallback;
  }
}

export function writeJSON(key: string, value: unknown): boolean {
  const raw = JSON.stringify(value);
  mem.set(PREFIX + key, raw);
  try {
    ls()?.setItem(PREFIX + key, raw);
    return !broken;
  } catch {
    return false;
  }
}

export function removeKey(key: string) {
  mem.delete(PREFIX + key);
  try {
    ls()?.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
}

export function storageAvailable(): boolean {
  return ls() !== null;
}
