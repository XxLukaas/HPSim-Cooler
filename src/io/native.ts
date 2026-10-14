/**
 * Eigenes Dateiformat (*.hpsim, JSON). Beim Laden wird jedes Feld geprüft und
 * notfalls durch einen Standardwert ersetzt – fehlerhafte Dateien führen so nie
 * zu einem Absturz, sondern höchstens zu Warnungen.
 */
import { createDoc, DEFAULT_SETTINGS } from '../model/defaults';
import type {
  ArcEl,
  DashStyle,
  DocSettings,
  Element,
  LineEl,
  NetDoc,
  PlaceEl,
  Point,
  PolyEl,
  RectEl,
  TextEl,
  TransitionEl,
} from '../model/types';

export const FILE_EXTENSION = '.hpsim';

export class NativeFormatError extends Error {}

export function serializeDoc(doc: NetDoc): string {
  return JSON.stringify(doc, null, 1);
}

type Raw = Record<string, unknown>;

const isObj = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);

function num(v: unknown, def: number, min = -1e9, max = 1e9): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

function int(v: unknown, def: number, min = 0, max = 1e9): number {
  return Math.round(num(v, def, min, max));
}

function str(v: unknown, def = '', maxLen = 10000): string {
  return typeof v === 'string' ? v.slice(0, maxLen) : def;
}

function bool(v: unknown, def: boolean): boolean {
  return typeof v === 'boolean' ? v : def;
}

function color(v: unknown, def: string | null): string | null {
  if (v === null) return null;
  if (typeof v === 'string' && /^(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)|[a-zA-Z]+)?$/.test(v)) return v;
  return def;
}

function point(v: unknown): Point | null {
  if (!isObj(v)) return null;
  const x = num(v.x, NaN);
  const y = num(v.y, NaN);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function points(v: unknown): Point[] {
  return Array.isArray(v) ? v.map(point).filter((p): p is Point => p !== null).slice(0, 10000) : [];
}

function dash(v: unknown): DashStyle {
  return v === 'dashed' || v === 'dotted' || v === 'dashdot' ? v : 'solid';
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], def: T): T {
  return allowed.includes(v as T) ? (v as T) : def;
}

function normalizeElement(raw: unknown, warnings: string[]): Element | null {
  if (!isObj(raw)) return null;
  const id = str(raw.id);
  if (!id) return null;
  const groupId = typeof raw.groupId === 'string' ? raw.groupId : null;
  switch (raw.type) {
    case 'place': {
      const el: PlaceEl = {
        type: 'place',
        id,
        groupId,
        name: str(raw.name, 'P', 200),
        x: num(raw.x, 0),
        y: num(raw.y, 0),
        r: num(raw.r, 18, 4, 200),
        tokens: int(raw.tokens, 0),
        capacity: int(raw.capacity, 0),
        showName: bool(raw.showName, true),
        showCapacity: bool(raw.showCapacity, false),
        nameOffset: point(raw.nameOffset),
        capOffset: point(raw.capOffset),
        color: color(raw.color, null),
        note: str(raw.note),
      };
      return el;
    }
    case 'transition': {
      const el: TransitionEl = {
        type: 'transition',
        id,
        groupId,
        name: str(raw.name, 'T', 200),
        x: num(raw.x, 0),
        y: num(raw.y, 0),
        w: num(raw.w, 12, 2, 400),
        h: num(raw.h, 36, 2, 400),
        timing: oneOf(raw.timing, ['immediate', 'deterministic', 'exponential', 'uniform'] as const, 'immediate'),
        delay: num(raw.delay, 1, 0, 1e12),
        delayMax: num(raw.delayMax, 2, 0, 1e12),
        priority: Math.round(num(raw.priority, 0, -1e6, 1e6)),
        showName: bool(raw.showName, true),
        showDelay: bool(raw.showDelay, true),
        nameOffset: point(raw.nameOffset),
        delayOffset: point(raw.delayOffset),
        color: color(raw.color, null),
        note: str(raw.note),
      };
      return el;
    }
    case 'arc': {
      const el: ArcEl = {
        type: 'arc',
        id,
        groupId: null,
        source: str(raw.source),
        target: str(raw.target),
        weight: int(raw.weight, 1, 1),
        kind: oneOf(raw.kind, ['normal', 'test', 'inhibitor'] as const, 'normal'),
        points: points(raw.points),
        showWeight: bool(raw.showWeight, false),
        labelOffset: point(raw.labelOffset),
        color: color(raw.color, null),
        note: str(raw.note),
      };
      return el;
    }
    case 'rect': {
      const el: RectEl = {
        type: 'rect',
        id,
        groupId,
        x: num(raw.x, 0),
        y: num(raw.y, 0),
        w: num(raw.w, 100, 0),
        h: num(raw.h, 60, 0),
        shape: oneOf(raw.shape, ['rect', 'roundrect', 'ellipse'] as const, 'rect'),
        radius: num(raw.radius, 10, 0, 1000),
        stroke: str(color(raw.stroke, '') ?? ''),
        strokeWidth: num(raw.strokeWidth, 1.5, 0, 40),
        dash: dash(raw.dash),
        fill: str(color(raw.fill, '#3b82f6') ?? '#3b82f6'),
        filled: bool(raw.filled, false),
        opacity: num(raw.opacity, 1, 0, 1),
      };
      return el;
    }
    case 'line': {
      const el: LineEl = {
        type: 'line',
        id,
        groupId,
        x1: num(raw.x1, 0),
        y1: num(raw.y1, 0),
        x2: num(raw.x2, 100),
        y2: num(raw.y2, 0),
        stroke: str(color(raw.stroke, '') ?? ''),
        strokeWidth: num(raw.strokeWidth, 1.5, 0.5, 40),
        dash: dash(raw.dash),
        arrowEnd: bool(raw.arrowEnd, false),
        arrowStart: bool(raw.arrowStart, false),
        opacity: num(raw.opacity, 1, 0, 1),
      };
      return el;
    }
    case 'poly': {
      const pts = points(raw.points);
      if (pts.length < 2) {
        warnings.push('Ein Linienzug mit weniger als zwei Punkten wurde entfernt.');
        return null;
      }
      const el: PolyEl = {
        type: 'poly',
        id,
        groupId,
        points: pts,
        closed: bool(raw.closed, false),
        stroke: str(color(raw.stroke, '') ?? ''),
        strokeWidth: num(raw.strokeWidth, 1.5, 0, 40),
        dash: dash(raw.dash),
        fill: str(color(raw.fill, '#3b82f6') ?? '#3b82f6'),
        filled: bool(raw.filled, false),
        opacity: num(raw.opacity, 1, 0, 1),
      };
      return el;
    }
    case 'text': {
      const el: TextEl = {
        type: 'text',
        id,
        groupId,
        x: num(raw.x, 0),
        y: num(raw.y, 0),
        text: str(raw.text, 'Text', 20000),
        fontSize: num(raw.fontSize, 16, 4, 300),
        fontFamily: str(raw.fontFamily, 'Inter', 100) || 'Inter',
        bold: bool(raw.bold, false),
        italic: bool(raw.italic, false),
        underline: bool(raw.underline, false),
        color: str(color(raw.color, '') ?? ''),
        align: oneOf(raw.align, ['left', 'center', 'right'] as const, 'left'),
        background: color(raw.background, null),
      };
      return el;
    }
    default:
      warnings.push(`Unbekannter Elementtyp „${String(raw.type)}“ wurde übersprungen.`);
      return null;
  }
}

function normalizeSettings(raw: unknown): DocSettings {
  const d = structuredClone(DEFAULT_SETTINGS);
  if (!isObj(raw)) return d;
  d.background = color(raw.background, null);
  if (isObj(raw.grid)) {
    d.grid.visible = bool(raw.grid.visible, true);
    d.grid.size = int(raw.grid.size, 10, 2, 200);
    d.grid.snapNet = bool(raw.grid.snapNet, true);
    d.grid.snapDecor = bool(raw.grid.snapDecor, true);
  }
  if (isObj(raw.sim)) {
    d.sim.timeStep = num(raw.sim.timeStep, 1, 1e-6, 1e9);
    d.sim.timeUnit = str(raw.sim.timeUnit, 'ZE', 20) || 'ZE';
    d.sim.maxTime = num(raw.sim.maxTime, 0, 0, 1e15);
    d.sim.maxSteps = int(raw.sim.maxSteps, 0, 0, 1e12);
    d.sim.conflict = oneOf(raw.sim.conflict, ['random', 'priority', 'classic'] as const, 'random');
    d.sim.capacityRule = oneOf(raw.sim.capacityRule, ['strong', 'weak'] as const, 'strong');
    d.sim.seed = raw.sim.seed === null || raw.sim.seed === undefined ? null : int(raw.sim.seed, 1, 0, 2 ** 32 - 1);
  }
  return d;
}

/** Prüft und repariert ein (z. B. aus JSON geladenes) Dokument. */
export function normalizeDoc(raw: unknown): { doc: NetDoc; warnings: string[] } {
  if (!isObj(raw)) throw new NativeFormatError('Die Datei enthält kein HPSim-Studio-Netz.');
  if (raw.format !== 'hpsim-studio') throw new NativeFormatError('Die Datei ist kein HPSim-Studio-Netz (Formatkennung fehlt).');
  if (typeof raw.version === 'number' && raw.version > 1) {
    throw new NativeFormatError('Diese Datei wurde mit einer neueren Version von HPSim Studio erstellt.');
  }
  const warnings: string[] = [];
  const doc = createDoc();
  if (isObj(raw.meta)) {
    doc.meta.title = str(raw.meta.title, 'Netz', 300) || 'Netz';
    doc.meta.description = str(raw.meta.description, '', 50000);
    doc.meta.author = str(raw.meta.author, '', 300);
    doc.meta.created = str(raw.meta.created, doc.meta.created, 40);
    doc.meta.modified = str(raw.meta.modified, doc.meta.modified, 40);
  }
  doc.settings = normalizeSettings(raw.settings);
  const elements = isObj(raw.elements) ? raw.elements : {};
  const order = Array.isArray(raw.order) ? raw.order.filter((x): x is string => typeof x === 'string') : Object.keys(elements);
  const seen = new Set<string>();
  for (const id of order) {
    if (seen.has(id)) continue;
    seen.add(id);
    const el = normalizeElement(elements[id], warnings);
    if (!el || el.id !== id) continue;
    doc.elements[id] = el;
    doc.order.push(id);
  }
  // Elemente, die nicht in der Reihenfolge stehen, trotzdem übernehmen
  for (const id of Object.keys(elements)) {
    if (seen.has(id)) continue;
    const el = normalizeElement(elements[id], warnings);
    if (el && el.id === id) {
      doc.elements[id] = el;
      doc.order.push(id);
    }
  }
  // Kanten prüfen
  const pairs = new Set<string>();
  for (const id of [...doc.order]) {
    const el = doc.elements[id];
    if (el.type !== 'arc') continue;
    const s = doc.elements[el.source];
    const t = doc.elements[el.target];
    const valid =
      s && t && (s.type === 'place' || s.type === 'transition') && (t.type === 'place' || t.type === 'transition') && s.type !== t.type;
    const key = `${el.source}>${el.target}`;
    if (!valid || pairs.has(key)) {
      delete doc.elements[id];
      doc.order = doc.order.filter((x) => x !== id);
      warnings.push(valid ? 'Eine doppelte Kante wurde entfernt.' : 'Eine Kante mit ungültigen Endpunkten wurde entfernt.');
      continue;
    }
    pairs.add(key);
    if (el.kind !== 'normal' && s.type !== 'place') {
      el.kind = 'normal';
      warnings.push('Eine Test-/Inhibitorkante, die von einer Transition ausging, wurde in eine normale Kante umgewandelt.');
    }
  }
  return { doc, warnings: [...new Set(warnings)] };
}

export function parseNative(text: string): { doc: NetDoc; warnings: string[] } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new NativeFormatError('Die Datei ist kein gültiges JSON – sie ist vermutlich beschädigt.');
  }
  return normalizeDoc(raw);
}
