import { useEffect, useState } from 'react';

/**
 * Liefert `value` verzögert, sobald es sich `delay` ms nicht mehr geändert hat.
 * Bei `delay <= 0` wird der Wert sofort durchgereicht (kleine Netze bleiben
 * immer aktuell, große Netze rechnen nicht bei jedem Ziehschritt neu).
 */
export function useSettled<T>(value: T, delay: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    if (delay <= 0) {
      setSettled(value);
      return;
    }
    const t = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return delay <= 0 ? value : settled;
}

/** Wert dauerhaft im Browser merken (nur Komfort – Fehler werden ignoriert). */
export function readPref<T>(key: string, fallback: T, valid: (v: unknown) => v is T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    const v: unknown = JSON.parse(raw);
    return valid(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

export function writePref(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Speicher nicht verfügbar – egal */
  }
}
