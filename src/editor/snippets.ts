/**
 * Bausteine: typische Netzmuster, die mit einem Klick eingefügt werden.
 * Koordinaten sind relativ zu (0, 0); beim Einfügen wird verschoben.
 */
import { createArc, createDoc, createPlace, createText, createTransition } from '../model/defaults';
import { addElements, cloneElements } from '../model/ops';
import type { Element, NetDoc, PlaceEl, TransitionEl, ArcEl } from '../model/types';

export interface Snippet {
  id: string;
  title: string;
  description: string;
  build: () => Element[];
}

/** Kleiner Baukasten für relative Muster */
class B {
  doc: NetDoc = createDoc();
  p(name: string, x: number, y: number, tokens = 0, capacity = 0): PlaceEl {
    const el = createPlace(this.doc, { x, y }, { name, tokens, capacity, showCapacity: capacity > 0 });
    addElements(this.doc, [el]);
    return el;
  }
  t(name: string, x: number, y: number, patch: Partial<TransitionEl> = {}): TransitionEl {
    const el = createTransition(this.doc, { x, y }, { name, ...patch });
    addElements(this.doc, [el]);
    return el;
  }
  a(from: { id: string }, to: { id: string }, patch: Partial<ArcEl> = {}): void {
    addElements(this.doc, [createArc(from.id, to.id, patch)]);
  }
  note(text: string, x: number, y: number): void {
    addElements(this.doc, [createText(x, y, text, { fontSize: 13, color: '' })]);
  }
  get elements(): Element[] {
    return this.doc.order.map((id) => this.doc.elements[id]);
  }
}

export const SNIPPETS: Snippet[] = [
  {
    id: 'sequence',
    title: 'Sequenz',
    description: 'Zwei Schritte nacheinander: P → T → P → T → P',
    build: () => {
      const b = new B();
      const p1 = b.p('Start', 0, 0, 1);
      const t1 = b.t('Schritt1', 100, 0);
      const p2 = b.p('Zwischen', 200, 0);
      const t2 = b.t('Schritt2', 300, 0);
      const p3 = b.p('Ende', 400, 0);
      b.a(p1, t1);
      b.a(t1, p2);
      b.a(p2, t2);
      b.a(t2, p3);
      return b.elements;
    },
  },
  {
    id: 'conflict',
    title: 'Verzweigung (Konflikt)',
    description: 'Eine Marke, zwei Transitionen – nur eine kann schalten',
    build: () => {
      const b = new B();
      const p = b.p('Auswahl', 0, 60, 1);
      const ta = b.t('A', 120, 0);
      const tb = b.t('B', 120, 120);
      const pa = b.p('Weg A', 240, 0);
      const pb = b.p('Weg B', 240, 120);
      b.a(p, ta);
      b.a(p, tb);
      b.a(ta, pa);
      b.a(tb, pb);
      return b.elements;
    },
  },
  {
    id: 'fork-join',
    title: 'Nebenläufigkeit (Fork/Join)',
    description: 'Aufspalten in zwei parallele Zweige und wieder zusammenführen',
    build: () => {
      const b = new B();
      const p0 = b.p('Start', 0, 60, 1);
      const fork = b.t('Fork', 100, 60);
      const a1 = b.p('A1', 200, 0);
      const b1 = b.p('B1', 200, 120);
      const ta = b.t('Arbeit A', 300, 0);
      const tb = b.t('Arbeit B', 300, 120);
      const a2 = b.p('A2', 400, 0);
      const b2 = b.p('B2', 400, 120);
      const join = b.t('Join', 500, 60);
      const p9 = b.p('Fertig', 600, 60);
      b.a(p0, fork);
      b.a(fork, a1);
      b.a(fork, b1);
      b.a(a1, ta);
      b.a(b1, tb);
      b.a(ta, a2);
      b.a(tb, b2);
      b.a(a2, join);
      b.a(b2, join);
      b.a(join, p9);
      return b.elements;
    },
  },
  {
    id: 'loop',
    title: 'Kreislauf',
    description: 'Zwei Zustände, die sich zyklisch abwechseln',
    build: () => {
      const b = new B();
      const on = b.p('Aus', 0, 0, 1);
      const t1 = b.t('einschalten', 120, -60, { w: 36, h: 12 });
      const off = b.p('An', 240, 0);
      const t2 = b.t('ausschalten', 120, 60, { w: 36, h: 12 });
      b.a(on, t1);
      b.a(t1, off);
      b.a(off, t2);
      b.a(t2, on);
      return b.elements;
    },
  },
  {
    id: 'buffer',
    title: 'Puffer mit Kapazität',
    description: 'Erzeugen und Verbrauchen über einen begrenzten Zwischenspeicher',
    build: () => {
      const b = new B();
      const src = b.t('erzeugen', 0, 0, { timing: 'deterministic', delay: 2 });
      const buf = b.p('Puffer', 120, 0, 0, 3);
      const snk = b.t('verbrauchen', 240, 0, { timing: 'deterministic', delay: 3 });
      b.a(src, buf);
      b.a(buf, snk);
      return b.elements;
    },
  },
  {
    id: 'mutex',
    title: 'Wechselseitiger Ausschluss',
    description: 'Zwei Prozesse teilen sich eine Ressource (Semaphor)',
    build: () => {
      const b = new B();
      const w1 = b.p('wartet 1', 0, 0, 1);
      const e1 = b.t('betreten 1', 100, 0);
      const k1 = b.p('kritisch 1', 200, 0);
      const l1 = b.t('verlassen 1', 300, 0);
      const sem = b.p('frei', 150, 110, 1);
      const w2 = b.p('wartet 2', 0, 220, 1);
      const e2 = b.t('betreten 2', 100, 220);
      const k2 = b.p('kritisch 2', 200, 220);
      const l2 = b.t('verlassen 2', 300, 220);
      b.a(w1, e1);
      b.a(e1, k1);
      b.a(k1, l1);
      b.a(l1, w1, { points: [{ x: 300, y: -60 }, { x: 0, y: -60 }] });
      b.a(w2, e2);
      b.a(e2, k2);
      b.a(k2, l2);
      b.a(l2, w2, { points: [{ x: 300, y: 280 }, { x: 0, y: 280 }] });
      b.a(sem, e1);
      b.a(sem, e2);
      b.a(l1, sem);
      b.a(l2, sem);
      return b.elements;
    },
  },
  {
    id: 'sync',
    title: 'Synchronisation',
    description: 'Eine Transition wartet auf zwei Voraussetzungen',
    build: () => {
      const b = new B();
      const a = b.p('Teil A', 0, 0, 1);
      const c = b.p('Teil B', 0, 120, 1);
      const t = b.t('montieren', 120, 60);
      const r = b.p('Produkt', 240, 60);
      b.a(a, t);
      b.a(c, t);
      b.a(t, r);
      return b.elements;
    },
  },
  {
    id: 'inhibitor',
    title: 'Vorrang per Inhibitorkante',
    description: 'B darf nur schalten, wenn „Alarm“ leer ist',
    build: () => {
      const b = new B();
      const alarm = b.p('Alarm', 0, 0);
      const job = b.p('Auftrag', 0, 120, 1);
      const t = b.t('bearbeiten', 120, 120);
      const done = b.p('erledigt', 240, 120);
      b.a(alarm, t, { kind: 'inhibitor' });
      b.a(job, t);
      b.a(t, done);
      return b.elements;
    },
  },
];

/** Erzeugt die Elemente eines Bausteins zentriert um (cx, cy) mit eindeutigen Namen. */
export function instantiateSnippet(doc: NetDoc, snippet: Snippet, cx: number, cy: number): Element[] {
  const els = snippet.build();
  // Mittelpunkt des Bausteins bestimmen
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const el of els) {
    if (el.type === 'place' || el.type === 'transition' || el.type === 'text') {
      minX = Math.min(minX, el.x);
      maxX = Math.max(maxX, el.x);
      minY = Math.min(minY, el.y);
      maxY = Math.max(maxY, el.y);
    }
  }
  const ox = Math.round((cx - (minX + maxX) / 2) / 10) * 10;
  const oy = Math.round((cy - (minY + maxY) / 2) / 10) * 10;
  return cloneElements(doc, els, { x: ox, y: oy });
}
