import type {
  ArcEl,
  ArcKind,
  DocSettings,
  Id,
  LineEl,
  NetDoc,
  PlaceEl,
  Point,
  PolyEl,
  RectEl,
  TextEl,
  TransitionEl,
} from './types';

let idCounter = 0;

/** Erzeugt eine kurze, praktisch eindeutige ID. */
export function newId(prefix: string): Id {
  idCounter = (idCounter + 1) % 1_000_000;
  let rnd = '';
  try {
    const buf = new Uint32Array(2);
    globalThis.crypto.getRandomValues(buf);
    rnd = buf[0].toString(36) + buf[1].toString(36).slice(0, 3);
  } catch {
    rnd = Math.random().toString(36).slice(2, 10);
  }
  return `${prefix}_${rnd}${idCounter.toString(36)}`;
}

export const PLACE_SIZES = [
  { label: 'Sehr klein', r: 11 },
  { label: 'Klein', r: 14 },
  { label: 'Normal', r: 18 },
  { label: 'Groß', r: 24 },
  { label: 'Sehr groß', r: 32 },
] as const;

export const TRANSITION_SIZES = [
  { label: 'Sehr klein', w: 8, h: 22 },
  { label: 'Klein', w: 10, h: 28 },
  { label: 'Normal', w: 12, h: 36 },
  { label: 'Groß', w: 16, h: 48 },
  { label: 'Sehr groß', w: 20, h: 64 },
] as const;

export const DEFAULT_SETTINGS: DocSettings = {
  background: null,
  grid: { visible: true, size: 10, snapNet: true, snapDecor: true },
  sim: {
    timeStep: 1,
    timeUnit: 'ZE',
    maxTime: 0,
    maxSteps: 0,
    conflict: 'random',
    capacityRule: 'strong',
    seed: null,
  },
};

export function createDoc(title = 'Unbenanntes Netz'): NetDoc {
  const now = new Date().toISOString();
  return {
    format: 'hpsim-studio',
    version: 1,
    meta: { title, description: '', author: '', created: now, modified: now },
    elements: {},
    order: [],
    settings: structuredClone(DEFAULT_SETTINGS),
  };
}

/** Nächster freier Name nach dem Muster Präfix + Zahl (z. B. P3). */
export function nextName(doc: NetDoc, prefix: string): string {
  let max = 0;
  const re = new RegExp(`^${prefix}(\\d+)$`);
  for (const id of doc.order) {
    const el = doc.elements[id];
    if (!el || !('name' in el)) continue;
    const m = re.exec(el.name);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}${max + 1}`;
}

export function createPlace(doc: NetDoc, pos: Point, patch: Partial<PlaceEl> = {}): PlaceEl {
  return {
    type: 'place',
    id: newId('p'),
    groupId: null,
    name: nextName(doc, 'P'),
    x: pos.x,
    y: pos.y,
    r: 18,
    tokens: 0,
    capacity: 0,
    showName: true,
    showCapacity: false,
    nameOffset: null,
    capOffset: null,
    color: null,
    note: '',
    ...patch,
  };
}

export function createTransition(doc: NetDoc, pos: Point, patch: Partial<TransitionEl> = {}): TransitionEl {
  return {
    type: 'transition',
    id: newId('t'),
    groupId: null,
    name: nextName(doc, 'T'),
    x: pos.x,
    y: pos.y,
    w: 12,
    h: 36,
    timing: 'immediate',
    delay: 1,
    delayMax: 2,
    priority: 0,
    showName: true,
    showDelay: true,
    nameOffset: null,
    delayOffset: null,
    color: null,
    note: '',
    ...patch,
  };
}

export function createArc(source: Id, target: Id, patch: Partial<ArcEl> = {}): ArcEl {
  return {
    type: 'arc',
    id: newId('a'),
    groupId: null,
    source,
    target,
    weight: 1,
    kind: 'normal' as ArcKind,
    points: [],
    showWeight: false,
    labelOffset: null,
    color: null,
    note: '',
    ...patch,
  };
}

const SHAPE_DEFAULTS = {
  stroke: '#7c8aa5',
  strokeWidth: 1.5,
  dash: 'solid' as const,
  fill: '#3b82f6',
  filled: false,
  opacity: 1,
};

export function createRect(x: number, y: number, w: number, h: number, patch: Partial<RectEl> = {}): RectEl {
  return {
    type: 'rect',
    id: newId('r'),
    groupId: null,
    x,
    y,
    w,
    h,
    shape: 'roundrect',
    radius: 12,
    ...SHAPE_DEFAULTS,
    ...patch,
  };
}

export function createLine(x1: number, y1: number, x2: number, y2: number, patch: Partial<LineEl> = {}): LineEl {
  return {
    type: 'line',
    id: newId('l'),
    groupId: null,
    x1,
    y1,
    x2,
    y2,
    stroke: SHAPE_DEFAULTS.stroke,
    strokeWidth: 1.5,
    dash: 'solid',
    arrowEnd: false,
    arrowStart: false,
    opacity: 1,
    ...patch,
  };
}

export function createPoly(points: Point[], patch: Partial<PolyEl> = {}): PolyEl {
  return {
    type: 'poly',
    id: newId('y'),
    groupId: null,
    points,
    closed: false,
    ...SHAPE_DEFAULTS,
    ...patch,
  };
}

export function createText(x: number, y: number, text = 'Text', patch: Partial<TextEl> = {}): TextEl {
  return {
    type: 'text',
    id: newId('x'),
    groupId: null,
    x,
    y,
    text,
    fontSize: 16,
    fontFamily: 'Inter',
    bold: false,
    italic: false,
    underline: false,
    color: '',
    align: 'left',
    background: null,
    ...patch,
  };
}
