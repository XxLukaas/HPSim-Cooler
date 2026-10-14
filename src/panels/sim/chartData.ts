/**
 * Reine Hilfsfunktionen für das Markendiagramm (getestet in tests/simpanel.test.ts).
 */

/** Validierte kategoriale Palette (Reihenfolge = CVD-Sicherheit, siehe dataviz-Skill). */
export const SERIES_LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
export const SERIES_DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];
export const MAX_SERIES = SERIES_LIGHT.length;

/** „Schöne“ Achsenteilung für den Bereich [0, max]. */
export function niceTicks(max: number, count = 5, integer = true): number[] {
  if (!Number.isFinite(max) || max <= 0) return [0, 1];
  const raw = max / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  let step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  if (integer) step = Math.max(1, Math.round(step));
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + step * 1e-9; v += step) ticks.push(Math.round(v * 1e9) / 1e9);
  return ticks;
}

/** Ticks für einen beliebigen Bereich [min, max] (Zeitachse). */
export function rangeTicks(min: number, max: number, count = 6): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (max <= min) return [min];
  const raw = (max - min) / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 1e-9; v += step) ticks.push(Math.round(v * 1e9) / 1e9);
  return ticks;
}

/**
 * Wählt standardmäßig darzustellende Stellen: zuerst solche, deren Markenzahl
 * sich verändert hat, dann die übrigen – höchstens `max` Stück.
 */
export function defaultSeries(placeIds: string[], minMarking: number[], maxMarking: number[], max = 6): string[] {
  const changed: string[] = [];
  const rest: string[] = [];
  placeIds.forEach((id, i) => ((maxMarking[i] ?? 0) !== (minMarking[i] ?? 0) ? changed : rest).push(id));
  return [...changed, ...rest].slice(0, max);
}

/** Vergibt jeder Stelle eine feste Farbposition (Farbe folgt dem Element, nicht dem Rang). */
export function assignSlots(selected: string[], previous: Map<string, number>): Map<string, number> {
  const res = new Map<string, number>();
  const used = new Set<number>();
  for (const id of selected) {
    const s = previous.get(id);
    if (s !== undefined && !used.has(s)) {
      res.set(id, s);
      used.add(s);
    }
  }
  for (const id of selected) {
    if (res.has(id)) continue;
    let s = 0;
    while (used.has(s)) s++;
    res.set(id, s);
    used.add(s);
  }
  return res;
}

export interface SeriesPoint {
  t: number;
  v: number;
}

/**
 * Reduziert eine Treppenkurve auf höchstens ~2·buckets Punkte, ohne Spitzen zu
 * verlieren (je Abschnitt: erster Wert, Minimum, Maximum, letzter Wert).
 */
export function downsampleSteps(times: number[], values: ArrayLike<number>, buckets = 600): SeriesPoint[] {
  const n = Math.min(times.length, values.length);
  if (n <= buckets * 2) {
    const out: SeriesPoint[] = [];
    for (let i = 0; i < n; i++) out.push({ t: times[i], v: values[i] });
    return out;
  }
  const out: SeriesPoint[] = [];
  const size = n / buckets;
  for (let b = 0; b < buckets; b++) {
    const from = Math.floor(b * size);
    const to = Math.min(n, Math.floor((b + 1) * size));
    if (to <= from) continue;
    let minI = from;
    let maxI = from;
    for (let i = from; i < to; i++) {
      if (values[i] < values[minI]) minI = i;
      if (values[i] > values[maxI]) maxI = i;
    }
    const idx = [...new Set([from, minI, maxI, to - 1])].sort((a, c) => a - c);
    for (const i of idx) out.push({ t: times[i], v: values[i] });
  }
  return out;
}

/** Index des letzten Eintrags mit times[i] ≤ t (binäre Suche); -1 wenn keiner. */
export function indexAtTime(times: number[], t: number): number {
  let lo = 0;
  let hi = times.length - 1;
  if (hi < 0 || t < times[0]) return -1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (times[mid] <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Pfad (SVG „d“) einer Treppenkurve. */
export function stepPath(points: SeriesPoint[], x: (t: number) => number, y: (v: number) => number, xEnd?: number): string {
  if (!points.length) return '';
  let d = `M${x(points[0].t).toFixed(1)},${y(points[0].v).toFixed(1)}`;
  for (let i = 1; i < points.length; i++) {
    d += `H${x(points[i].t).toFixed(1)}V${y(points[i].v).toFixed(1)}`;
  }
  if (xEnd !== undefined) d += `H${xEnd.toFixed(1)}`;
  return d;
}
