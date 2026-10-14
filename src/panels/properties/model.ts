/**
 * Reine Hilfsfunktionen des Eigenschaftenbereichs (ohne React), damit sie
 * leicht testbar sind: Verbindungen eines Knotens, Auswahl-Zusammenfassung,
 * Texte zu Zeitverhalten und Kantentypen.
 */
import type { ArcEl, ArcKind, Element, ElementType, Id, NetDoc, TimingModel } from '../../model/types';
import { isNode } from '../../model/types';

/** Obergrenzen für Eingaben (schützen vor absurden Werten). */
export const MAX_TOKENS = 1_000_000_000;
export const MAX_DELAY = 1e9;
export const MAX_WEIGHT = 1_000_000;

export interface Connection {
  arcId: Id;
  nodeId: Id;
  name: string;
  nodeType: 'place' | 'transition';
  weight: number;
  kind: ArcKind;
}

/** Vorbereich (eingehende Kanten) und Nachbereich (ausgehende Kanten) eines Knotens. */
export function connectionsOf(doc: NetDoc, nodeId: Id): { pre: Connection[]; post: Connection[] } {
  const pre: Connection[] = [];
  const post: Connection[] = [];
  for (const id of doc.order) {
    const el = doc.elements[id];
    if (el?.type !== 'arc') continue;
    if (el.target === nodeId) {
      const n = doc.elements[el.source];
      if (isNode(n)) pre.push({ arcId: el.id, nodeId: n.id, name: n.name, nodeType: n.type, weight: el.weight, kind: el.kind });
    } else if (el.source === nodeId) {
      const n = doc.elements[el.target];
      if (isNode(n)) post.push({ arcId: el.id, nodeId: n.id, name: n.name, nodeType: n.type, weight: el.weight, kind: el.kind });
    }
  }
  return { pre, post };
}

export const TYPE_LABELS: Record<ElementType, { one: string; many: string }> = {
  place: { one: 'Stelle', many: 'Stellen' },
  transition: { one: 'Transition', many: 'Transitionen' },
  arc: { one: 'Kante', many: 'Kanten' },
  rect: { one: 'Rechteck', many: 'Rechtecke' },
  line: { one: 'Linie', many: 'Linien' },
  poly: { one: 'Linienzug', many: 'Linienzüge' },
  text: { one: 'Text', many: 'Texte' },
};

export const TYPE_ORDER: ElementType[] = ['place', 'transition', 'arc', 'rect', 'line', 'poly', 'text'];

export function countLabel(type: ElementType, n: number): string {
  const l = TYPE_LABELS[type];
  return `${n.toLocaleString('de-DE')} ${n === 1 ? l.one : l.many}`;
}

/** Bezeichnung eines einzelnen Elements (berücksichtigt Ellipse/Polygon). */
export function elementLabel(el: Element): string {
  if (el.type === 'rect') return el.shape === 'ellipse' ? 'Ellipse' : el.shape === 'roundrect' ? 'Rechteck (abgerundet)' : 'Rechteck';
  if (el.type === 'poly') return el.closed ? 'Polygon' : 'Linienzug';
  if (el.type === 'transition') return 'Transition';
  return TYPE_LABELS[el.type].one;
}

export type SelectionGroups = Record<ElementType, Id[]>;

/** Teilt eine Auswahl nach Elementtyp auf (fehlende Elemente werden ignoriert). */
export function groupSelection(doc: NetDoc, ids: readonly Id[]): SelectionGroups {
  const res: SelectionGroups = { place: [], transition: [], arc: [], rect: [], line: [], poly: [], text: [] };
  for (const id of ids) {
    const el = doc.elements[id];
    if (el) res[el.type].push(id);
  }
  return res;
}

/** Gemeinsamer Wert aller Einträge oder `undefined`, wenn sie sich unterscheiden (bzw. leer sind). */
export function commonValue<T>(values: readonly T[]): T | undefined {
  if (!values.length) return undefined;
  const first = values[0];
  for (let i = 1; i < values.length; i++) if (values[i] !== first) return undefined;
  return first;
}

/** Gibt es einen anderen Knoten gleichen Typs mit diesem Namen? */
export function isDuplicateName(doc: NetDoc, id: Id, name: string): boolean {
  const self = doc.elements[id];
  if (!self) return false;
  const n = name.trim();
  if (!n) return false;
  for (const oid of doc.order) {
    if (oid === id) continue;
    const el = doc.elements[oid];
    if (el && el.type === self.type && 'name' in el && el.name.trim() === n) return true;
  }
  return false;
}

export interface DocStats {
  places: number;
  transitions: number;
  arcs: number;
  decor: number;
  tokens: number;
  timed: number;
}

export function docStats(doc: NetDoc): DocStats {
  const s: DocStats = { places: 0, transitions: 0, arcs: 0, decor: 0, tokens: 0, timed: 0 };
  for (const id of doc.order) {
    const el = doc.elements[id];
    if (!el) continue;
    switch (el.type) {
      case 'place':
        s.places++;
        s.tokens += Number.isFinite(el.tokens) ? Math.max(0, el.tokens) : 0;
        break;
      case 'transition':
        s.transitions++;
        if (el.timing !== 'immediate') s.timed++;
        break;
      case 'arc':
        s.arcs++;
        break;
      default:
        s.decor++;
    }
  }
  return s;
}

/** Test- und Inhibitorkanten sind nur von einer Stelle zu einer Transition erlaubt. */
export function specialArcAllowed(doc: NetDoc, arc: ArcEl): boolean {
  return doc.elements[arc.source]?.type === 'place' && doc.elements[arc.target]?.type === 'transition';
}

export const TIMING_INFO: Record<TimingModel, { label: string; short: string; text: string; valueLabel: string }> = {
  immediate: {
    label: 'Sofort',
    short: 'Sofort',
    text: 'Schaltet im selben Simulationsschritt, in dem sie aktiviert wird – ganz ohne Wartezeit.',
    valueLabel: '',
  },
  deterministic: {
    label: 'Deterministisch',
    short: 'Fest',
    text: 'Wartet nach der Aktivierung immer genau die eingestellte Verzögerung und schaltet dann (falls sie noch aktiviert ist).',
    valueLabel: 'Verzögerung',
  },
  exponential: {
    label: 'Exponentiell',
    short: 'Expon.',
    text: 'Die Wartezeit ist zufällig und exponentialverteilt mit dem angegebenen Mittelwert – typisch für Ankünfte oder Ausfälle.',
    valueLabel: 'Mittelwert',
  },
  uniform: {
    label: 'Gleichverteilt',
    short: 'Gleichv.',
    text: 'Die Wartezeit ist zufällig: Jeder Wert zwischen Unter- und Obergrenze ist gleich wahrscheinlich.',
    valueLabel: 'Untergrenze',
  },
};

export const TIMING_ORDER: TimingModel[] = ['immediate', 'deterministic', 'exponential', 'uniform'];

export const ARC_KIND_INFO: Record<ArcKind, { label: string; text: string }> = {
  normal: {
    label: 'Normal',
    text: 'Normale Kante: Beim Schalten werden Marken entnommen (Stelle → Transition) bzw. abgelegt (Transition → Stelle). Das Gewicht gibt die Anzahl an.',
  },
  test: {
    label: 'Test',
    text: 'Testkante: Die Transition prüft nur, ob genug Marken vorhanden sind – sie verbraucht dabei keine.',
  },
  inhibitor: {
    label: 'Inhibitor',
    text: 'Inhibitorkante: Die Transition darf nur schalten, solange die Stelle weniger Marken hat als das Gewicht. Sie wirkt wie ein Verbot.',
  },
};

export const ARC_KIND_ORDER: ArcKind[] = ['normal', 'test', 'inhibitor'];

function quoted(s: string): string {
  return `„${s || '?'}“`;
}

function marks(n: number): string {
  return n === 1 ? '1 Marke' : `${n.toLocaleString('de-DE')} Marken`;
}

/** Erklärt in einem Satz, was eine konkrete Kante bewirkt. */
export function arcEffectText(doc: NetDoc, arc: ArcEl): string {
  const s = doc.elements[arc.source];
  const t = doc.elements[arc.target];
  if (!isNode(s) || !isNode(t)) return 'Diese Kante ist unvollständig – Start oder Ziel fehlt.';
  const w = Math.max(1, Math.floor(arc.weight));
  if (s.type === 'transition' && t.type === 'place') {
    return `Wenn ${quoted(s.name)} schaltet, werden ${marks(w)} in ${quoted(t.name)} gelegt.`;
  }
  if (s.type === 'place' && t.type === 'transition') {
    switch (arc.kind) {
      case 'test':
        return `${quoted(t.name)} kann nur schalten, wenn ${quoted(s.name)} mindestens ${marks(w)} hat – verbraucht wird nichts.`;
      case 'inhibitor':
        return w === 1
          ? `${quoted(t.name)} kann nur schalten, wenn ${quoted(s.name)} leer ist.`
          : `${quoted(t.name)} kann nur schalten, wenn ${quoted(s.name)} weniger als ${marks(w)} hat.`;
      default:
        return `Wenn ${quoted(t.name)} schaltet, werden ${marks(w)} aus ${quoted(s.name)} entnommen.`;
    }
  }
  return 'Kanten verbinden immer eine Stelle mit einer Transition.';
}

/** Sichere Ganzzahl im gegebenen Bereich. */
export function clampInt(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.min(max, Math.max(min, Math.round(v)));
}

/** Liest einen Wert aus dem lokalen Speicher (ohne Absturz, wenn er fehlt). */
export function readPref(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(`hpsim-studio:props:${key}`);
    if (v === '1') return true;
    if (v === '0') return false;
  } catch {
    /* kein Speicher */
  }
  return fallback;
}

export function writePref(key: string, value: boolean): void {
  try {
    localStorage.setItem(`hpsim-studio:props:${key}`, value ? '1' : '0');
  } catch {
    /* egal */
  }
}
