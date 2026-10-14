/**
 * Reine Hilfsfunktionen für den Explorer: Elementliste aufbauen, Suche
 * (unabhängig von Groß-/Kleinschreibung und Akzenten), Trefferstellen,
 * Zeilen für die virtualisierte Liste.
 *
 * Bewusst ohne React, damit alles einfach testbar bleibt.
 */
import type { ArcKind, Element, Id, NetDoc, TimingModel } from '../../model/types';

export type GroupKey = 'places' | 'transitions' | 'arcs' | 'drawings';

export const GROUP_ORDER: GroupKey[] = ['places', 'transitions', 'arcs', 'drawings'];

export const GROUP_TITLES: Record<GroupKey, string> = {
  places: 'Stellen',
  transitions: 'Transitionen',
  arcs: 'Kanten',
  drawings: 'Zeichnungen',
};

/** Hinweis für leere Gruppen (ohne Suche). */
export const GROUP_HINTS: Record<GroupKey, { text: string; key?: string }> = {
  places: { text: 'Noch keine Stellen – Werkzeug „Stelle“', key: 'P' },
  transitions: { text: 'Noch keine Transitionen – Werkzeug „Transition“', key: 'T' },
  arcs: { text: 'Noch keine Kanten – Werkzeug „Kante“', key: 'K' },
  drawings: { text: 'Keine Zeichnungen (Text, Rechteck, Linie …)' },
};

export type DrawingShape = 'rect' | 'roundrect' | 'ellipse' | 'line' | 'arrow' | 'polyline' | 'polygon' | 'text';

interface BaseItem {
  id: Id;
  /** Angezeigter Haupttext */
  label: string;
  /** true, wenn der Name leer ist und ein Ersatztext angezeigt wird */
  unnamed: boolean;
  /** Zusatzinfo (gedämpft), z. B. Notiz */
  detail: string;
  /** Normalisierter Suchtext */
  haystack: string;
}

export interface PlaceItem extends BaseItem {
  kind: 'place';
  tokens: number;
  capacity: number;
  color: string | null;
}

export interface TransitionItem extends BaseItem {
  kind: 'transition';
  timing: TimingModel;
  timingText: string;
  /** ausführliche Zeitangabe (Tooltip) */
  timingHint: string;
  priority: number;
  color: string | null;
}

export interface ArcItem extends BaseItem {
  kind: 'arc';
  arcKind: ArcKind;
  weight: number;
  /** Quelle oder Ziel fehlen */
  broken: boolean;
  /** Richtung: Stelle → Transition (input) oder Transition → Stelle (output) */
  direction: 'input' | 'output' | 'unknown';
  color: string | null;
}

export interface DrawingItem extends BaseItem {
  kind: 'drawing';
  shape: DrawingShape;
}

export type ExplorerItem = PlaceItem | TransitionItem | ArcItem | DrawingItem;

export type ExplorerModel = Record<GroupKey, ExplorerItem[]>;

// ───────────────────────────── Suche ─────────────────────────────

const COMBINING = /[̀-ͯ]/g;

/** Normalisiert Text für die Suche: klein, ohne Akzente/Umlautpunkte, ß → ss. */
export function normalizeText(s: string): string {
  if (!s) return '';
  return s.normalize('NFD').replace(COMBINING, '').toLowerCase().replace(/ß/g, 'ss').replace(/\s+/g, ' ');
}

/** Zerlegt eine Suchanfrage in normalisierte Suchbegriffe (alle müssen passen). */
export function parseQuery(query: string): string[] {
  return normalizeText(query.trim())
    .split(' ')
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 12);
}

export function matchesTerms(haystack: string, terms: readonly string[]): boolean {
  for (const t of terms) if (!haystack.includes(t)) return false;
  return true;
}

/**
 * Liefert die Trefferbereiche [start, ende) im ORIGINALtext, damit sie
 * hervorgehoben werden können – auch wenn „a“ ein „ä“ trifft oder „ss“ ein „ß“.
 */
export function highlightRanges(text: string, terms: readonly string[]): [number, number][] {
  if (!text || !terms.length) return [];
  // Normalisierten Text zeichenweise aufbauen und jedem Zeichen seinen Ursprung merken
  let norm = '';
  const origin: number[] = [];
  let i = 0;
  for (const ch of text) {
    const n = normalizeText(ch);
    for (let k = 0; k < n.length; k++) {
      norm += n[k];
      origin.push(i);
    }
    i += ch.length;
  }
  const ranges: [number, number][] = [];
  for (const term of terms) {
    if (!term) continue;
    let from = 0;
    let guard = 0;
    while (from <= norm.length - term.length && guard++ < 200) {
      const at = norm.indexOf(term, from);
      if (at < 0) break;
      const start = origin[at];
      const lastOrigin = origin[at + term.length - 1];
      // Ende = hinter dem letzten Originalzeichen (inkl. Surrogatpaar)
      const cp = text.codePointAt(lastOrigin) ?? 0;
      const end = lastOrigin + (cp > 0xffff ? 2 : 1);
      ranges.push([start, end]);
      from = at + Math.max(1, term.length);
    }
  }
  if (!ranges.length) return ranges;
  ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged: [number, number][] = [ranges[0]];
  for (let r = 1; r < ranges.length; r++) {
    const last = merged[merged.length - 1];
    if (ranges[r][0] <= last[1]) last[1] = Math.max(last[1], ranges[r][1]);
    else merged.push(ranges[r]);
  }
  return merged;
}

/** Zerlegt Text in Teile mit Markierung für die Trefferhervorhebung. */
export function splitHighlights(text: string, terms: readonly string[]): { text: string; hit: boolean }[] {
  const ranges = highlightRanges(text, terms);
  if (!ranges.length) return [{ text, hit: false }];
  const parts: { text: string; hit: boolean }[] = [];
  let pos = 0;
  for (const [s, e] of ranges) {
    if (s > pos) parts.push({ text: text.slice(pos, s), hit: false });
    parts.push({ text: text.slice(s, e), hit: true });
    pos = e;
  }
  if (pos < text.length) parts.push({ text: text.slice(pos), hit: false });
  return parts;
}

// ───────────────────────────── Beschriftungen ─────────────────────────────

const fmt = (v: number): string => {
  if (!Number.isFinite(v)) return '∞';
  if (Number.isInteger(v)) return v.toLocaleString('de-DE');
  return v.toLocaleString('de-DE', { maximumFractionDigits: 3 });
};

/** Kurze Zeitangabe einer Transition: „sofort“, „⏱ 2“, „exp(1,5)“, „U[1; 3]“. */
export function timingText(timing: TimingModel, delay: number, delayMax: number): string {
  switch (timing) {
    case 'deterministic':
      return `⏱ ${fmt(delay)}`;
    case 'exponential':
      return `exp(${fmt(delay)})`;
    case 'uniform':
      return `U[${fmt(delay)}; ${fmt(delayMax)}]`;
    case 'immediate':
    default:
      return 'sofort';
  }
}

/** Ausführliche Zeitangabe für Tooltips. */
export function timingTitle(timing: TimingModel, delay: number, delayMax: number): string {
  switch (timing) {
    case 'deterministic':
      return `Feste Verzögerung: ${fmt(delay)} Zeiteinheiten`;
    case 'exponential':
      return `Exponentialverteilte Verzögerung, Mittelwert ${fmt(delay)}`;
    case 'uniform':
      return `Gleichverteilte Verzögerung zwischen ${fmt(delay)} und ${fmt(delayMax)}`;
    case 'immediate':
    default:
      return 'Schaltet sofort, sobald sie aktiviert ist';
  }
}

export const ARC_KIND_LABEL: Record<ArcKind, string> = {
  normal: 'Kante',
  test: 'Testkante',
  inhibitor: 'Inhibitorkante',
};

/** Erste Zeile eines Textes, gekürzt. */
export function shortText(s: string, max = 42): string {
  const first = (s ?? '').split(/\r?\n/).find((l) => l.trim()) ?? '';
  const t = first.trim().replace(/\s+/g, ' ');
  return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t;
}

function size(w: number, h: number): string {
  return `${Math.round(Math.abs(w))}×${Math.round(Math.abs(h))}`;
}

export function drawingInfo(el: Element): { shape: DrawingShape; label: string; detail: string } | null {
  switch (el.type) {
    case 'rect': {
      const shape: DrawingShape = el.shape === 'ellipse' ? 'ellipse' : el.shape === 'roundrect' ? 'roundrect' : 'rect';
      const name = shape === 'ellipse' ? 'Ellipse' : shape === 'roundrect' ? 'Abgerundetes Rechteck' : 'Rechteck';
      return { shape, label: name, detail: size(el.w, el.h) };
    }
    case 'line': {
      const arrow = el.arrowEnd || el.arrowStart;
      const len = Math.round(Math.hypot(el.x2 - el.x1, el.y2 - el.y1));
      return { shape: arrow ? 'arrow' : 'line', label: arrow ? 'Pfeil' : 'Linie', detail: `${Number.isFinite(len) ? len : 0} px` };
    }
    case 'poly': {
      const n = Array.isArray(el.points) ? el.points.length : 0;
      return { shape: el.closed ? 'polygon' : 'polyline', label: el.closed ? 'Polygon' : 'Linienzug', detail: `${n} Punkte` };
    }
    case 'text': {
      const t = shortText(el.text);
      return { shape: 'text', label: t ? `„${t}“` : 'Leerer Text', detail: 'Text' };
    }
    default:
      return null;
  }
}

// ───────────────────────────── Modell ─────────────────────────────

const collator = (() => {
  try {
    return new Intl.Collator('de', { numeric: true, sensitivity: 'base' });
  } catch {
    return null;
  }
})();

function compareLabels(a: ExplorerItem, b: ExplorerItem): number {
  if (a.unnamed !== b.unnamed) return a.unnamed ? 1 : -1;
  const c = collator ? collator.compare(a.label, b.label) : a.label < b.label ? -1 : a.label > b.label ? 1 : 0;
  return c || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

const num = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Baut die gruppierten Explorer-Einträge aus einem Dokument (robust gegenüber kaputten Daten). */
export function buildExplorerModel(doc: NetDoc | null | undefined): ExplorerModel {
  const model: ExplorerModel = { places: [], transitions: [], arcs: [], drawings: [] };
  if (!doc || !doc.elements || !Array.isArray(doc.order)) return model;
  const seen = new Set<Id>();
  const nameOf = (id: Id): string | null => {
    const el = doc.elements[id];
    if (!el || (el.type !== 'place' && el.type !== 'transition')) return null;
    return str(el.name).trim() || '(ohne Namen)';
  };
  for (const id of doc.order) {
    if (seen.has(id)) continue;
    seen.add(id);
    const el = doc.elements[id];
    if (!el || typeof el !== 'object') continue;
    switch (el.type) {
      case 'place': {
        const name = str(el.name).trim();
        const note = str(el.note);
        model.places.push({
          kind: 'place',
          id,
          label: name || '(ohne Namen)',
          unnamed: !name,
          detail: shortText(note, 60),
          haystack: normalizeText(`${name} ${note}`),
          tokens: Math.max(0, Math.floor(num(el.tokens))),
          capacity: Math.max(0, Math.floor(num(el.capacity))),
          color: el.color ?? null,
        });
        break;
      }
      case 'transition': {
        const name = str(el.name).trim();
        const note = str(el.note);
        const timing: TimingModel = el.timing ?? 'immediate';
        const tt = timingText(timing, num(el.delay), num(el.delayMax));
        model.transitions.push({
          kind: 'transition',
          id,
          label: name || '(ohne Namen)',
          unnamed: !name,
          detail: shortText(note, 60),
          haystack: normalizeText(`${name} ${note}`),
          timing,
          timingText: tt,
          timingHint: timingTitle(timing, num(el.delay), num(el.delayMax)),
          priority: num(el.priority),
          color: el.color ?? null,
        });
        break;
      }
      case 'arc': {
        const s = nameOf(el.source);
        const t = nameOf(el.target);
        const label = `${s ?? '?'} → ${t ?? '?'}`;
        const srcType = doc.elements[el.source]?.type;
        const direction = srcType === 'place' ? 'input' : srcType === 'transition' ? 'output' : 'unknown';
        const kind: ArcKind = el.kind === 'test' || el.kind === 'inhibitor' ? el.kind : 'normal';
        const note = str(el.note);
        model.arcs.push({
          kind: 'arc',
          id,
          label,
          unnamed: false,
          detail: shortText(note, 60),
          haystack: normalizeText(`${label} ${kind !== 'normal' ? ARC_KIND_LABEL[kind] : ''} ${note}`),
          arcKind: kind,
          weight: Math.max(1, Math.floor(num(el.weight, 1))),
          broken: s === null || t === null,
          direction,
          color: el.color ?? null,
        });
        break;
      }
      case 'rect':
      case 'line':
      case 'poly':
      case 'text': {
        const info = drawingInfo(el);
        if (!info) break;
        const full = el.type === 'text' ? str(el.text) : '';
        model.drawings.push({
          kind: 'drawing',
          id,
          label: info.label,
          unnamed: false,
          detail: info.detail,
          haystack: normalizeText(`${info.label} ${full}`),
          shape: info.shape,
        });
        break;
      }
      default:
        break;
    }
  }
  model.places.sort(compareLabels);
  model.transitions.sort(compareLabels);
  model.arcs.sort(compareLabels);
  return model;
}

export function modelSize(model: ExplorerModel): number {
  return model.places.length + model.transitions.length + model.arcs.length + model.drawings.length;
}

/** Filtert das Modell nach Suchbegriffen. Ohne Begriffe wird das Modell unverändert zurückgegeben. */
export function filterModel(model: ExplorerModel, terms: readonly string[]): ExplorerModel {
  if (!terms.length) return model;
  return {
    places: model.places.filter((i) => matchesTerms(i.haystack, terms)),
    transitions: model.transitions.filter((i) => matchesTerms(i.haystack, terms)),
    arcs: model.arcs.filter((i) => matchesTerms(i.haystack, terms)),
    drawings: model.drawings.filter((i) => matchesTerms(i.haystack, terms)),
  };
}

// ───────────────────────────── Zeilen & virtuelles Scrollen ─────────────────────────────

export type Row =
  | { type: 'group'; key: string; group: GroupKey; count: number; total: number; collapsed: boolean }
  | { type: 'item'; key: string; group: GroupKey; item: ExplorerItem }
  | { type: 'hint'; key: string; group: GroupKey };

export const ROW_HEIGHT: Record<Row['type'], number> = { group: 32, item: 28, hint: 28 };

/**
 * Erzeugt die flache Zeilenliste: Gruppenkopf, darunter die Einträge.
 * Während einer Suche werden Gruppen ohne Treffer ausgeblendet.
 */
export function buildRows(full: ExplorerModel, filtered: ExplorerModel, collapsed: ReadonlySet<GroupKey>, searching: boolean): Row[] {
  const rows: Row[] = [];
  for (const g of GROUP_ORDER) {
    const items = filtered[g];
    if (searching && items.length === 0) continue;
    const isCollapsed = collapsed.has(g);
    rows.push({ type: 'group', key: `g:${g}`, group: g, count: items.length, total: full[g].length, collapsed: isCollapsed });
    if (isCollapsed) continue;
    if (!items.length) {
      rows.push({ type: 'hint', key: `h:${g}`, group: g });
      continue;
    }
    for (const item of items) rows.push({ type: 'item', key: item.id, group: g, item });
  }
  return rows;
}

export interface RowLayout {
  /** Oberkante jeder Zeile; offsets[rows.length] = Gesamthöhe */
  offsets: number[];
  total: number;
}

export function layoutRows(rows: readonly Row[], padTop = 4, padBottom = 12): RowLayout {
  const offsets = new Array<number>(rows.length + 1);
  let y = padTop;
  for (let i = 0; i < rows.length; i++) {
    offsets[i] = y;
    y += ROW_HEIGHT[rows[i].type];
  }
  offsets[rows.length] = y;
  return { offsets, total: y + padBottom };
}

/** Index der Zeile, die die Position y enthält (binäre Suche). */
export function rowAt(offsets: readonly number[], count: number, y: number): number {
  if (count <= 0) return 0;
  let lo = 0;
  let hi = count - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (offsets[mid] <= y) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Sichtbarer Zeilenbereich [start, end) inklusive Überhang. */
export function visibleRange(layout: RowLayout, count: number, scrollTop: number, height: number, overscan = 8): [number, number] {
  if (count <= 0) return [0, 0];
  const first = rowAt(layout.offsets, count, Math.max(0, scrollTop));
  const last = rowAt(layout.offsets, count, Math.max(0, scrollTop + Math.max(height, 0)));
  return [Math.max(0, first - overscan), Math.min(count, last + 1 + overscan)];
}

/** Index des Gruppenkopfes, zu dem die Zeile gehört (oder -1). */
export function groupHeaderIndex(rows: readonly Row[], index: number): number {
  for (let i = Math.min(index, rows.length - 1); i >= 0; i--) if (rows[i].type === 'group') return i;
  return -1;
}
