import { describe, expect, it } from 'vitest';
import { createArc, createDoc, createPlace, createRect, createTransition, nextName } from '../src/model/defaults';
import { arcPolyline, contentBounds, nodeBoundaryPoint, pointAlong, polylineLength } from '../src/model/geometry';
import {
  addElements,
  alignElements,
  canConnect,
  cloneElements,
  deleteElements,
  distributeElements,
  expandGroups,
  groupElements,
  moveElements,
  reorder,
  reverseArcs,
  rotateTransitions,
  ungroupElements,
} from '../src/model/ops';
import type { ArcEl, NetDoc, PlaceEl, TransitionEl } from '../src/model/types';
import { autoLabelSlots } from '../src/editor/labels';

function small(): { doc: NetDoc; p1: PlaceEl; p2: PlaceEl; t1: TransitionEl; a1: ArcEl; a2: ArcEl } {
  const doc = createDoc();
  const p1 = createPlace(doc, { x: 0, y: 0 });
  addElements(doc, [p1]);
  const p2 = createPlace(doc, { x: 200, y: 0 });
  addElements(doc, [p2]);
  const t1 = createTransition(doc, { x: 100, y: 0 });
  addElements(doc, [t1]);
  const a1 = createArc(p1.id, t1.id, { points: [{ x: 50, y: 40 }] });
  const a2 = createArc(t1.id, p2.id);
  addElements(doc, [a1, a2]);
  return { doc, p1, p2, t1, a1, a2 };
}

describe('Benennung', () => {
  it('vergibt fortlaufende Namen', () => {
    const { doc } = small();
    expect(nextName(doc, 'P')).toBe('P3');
    expect(nextName(doc, 'T')).toBe('T2');
  });
});

describe('Verbindungsregeln', () => {
  it('erlaubt nur Stelle↔Transition und keine Duplikate', () => {
    const { doc, p1, p2, t1 } = small();
    expect(canConnect(doc, p1.id, p2.id).ok).toBe(false);
    expect(canConnect(doc, p1.id, t1.id).ok).toBe(false); // existiert schon
    expect(canConnect(doc, t1.id, p1.id).ok).toBe(true);
    expect(canConnect(doc, p1.id, p1.id).ok).toBe(false);
    expect(canConnect(doc, p1.id, 'gibt-es-nicht').ok).toBe(false);
  });
});

describe('Löschen', () => {
  it('löscht anhängende Kanten mit', () => {
    const { doc, t1 } = small();
    const removed = deleteElements(doc, [t1.id]);
    expect(removed.size).toBe(3);
    expect(Object.values(doc.elements).some((e) => e.type === 'arc')).toBe(false);
    expect(doc.order).toHaveLength(2);
  });
});

describe('Verschieben', () => {
  it('bewegt Knickpunkte nur, wenn beide Enden bewegt werden', () => {
    const { doc, p1, t1, a1 } = small();
    moveElements(doc, [p1.id], 10, 0);
    expect((doc.elements[a1.id] as ArcEl).points[0]).toEqual({ x: 50, y: 40 });
    moveElements(doc, [p1.id, t1.id], 10, 5);
    expect((doc.elements[a1.id] as ArcEl).points[0]).toEqual({ x: 60, y: 45 });
    expect((doc.elements[p1.id] as PlaceEl).x).toBe(20);
  });
});

describe('Kopieren', () => {
  it('kopiert Kanten nur mit beiden Enden und vergibt neue Namen', () => {
    const { doc, p1, t1, a1, a2 } = small();
    const copies = cloneElements(doc, [p1, t1, a1, a2], { x: 30, y: 30 });
    expect(copies.filter((c) => c.type === 'arc')).toHaveLength(1);
    const names = copies.filter((c): c is PlaceEl | TransitionEl => 'name' in c).map((c) => c.name);
    expect(names).toEqual(['P3', 'T2']);
    const arc = copies.find((c) => c.type === 'arc') as ArcEl;
    expect(arc.source).not.toBe(p1.id);
    expect(arc.points[0]).toEqual({ x: 80, y: 70 });
  });

  it('macht eigene Namen eindeutig', () => {
    const doc = createDoc();
    const p = createPlace(doc, { x: 0, y: 0 }, { name: 'Puffer' });
    addElements(doc, [p]);
    const [copy] = cloneElements(doc, [p], { x: 0, y: 0 });
    expect((copy as PlaceEl).name).toBe('Puffer 2');
  });
});

describe('Gruppen und Ebenen', () => {
  it('gruppiert, erweitert Auswahl und hebt Gruppen auf', () => {
    const { doc, p1, p2 } = small();
    const gid = groupElements(doc, [p1.id, p2.id]);
    expect(gid).toBeTruthy();
    expect([...expandGroups(doc, [p1.id])].sort()).toEqual([p1.id, p2.id].sort());
    ungroupElements(doc, [p1.id]);
    expect([...expandGroups(doc, [p1.id])]).toEqual([p1.id]);
  });

  it('ändert die Zeichenreihenfolge', () => {
    const doc = createDoc();
    const r1 = createRect(0, 0, 10, 10);
    const r2 = createRect(0, 0, 10, 10);
    const r3 = createRect(0, 0, 10, 10);
    addElements(doc, [r1, r2, r3]);
    reorder(doc, [r1.id], 'front');
    expect(doc.order).toEqual([r2.id, r3.id, r1.id]);
    reorder(doc, [r1.id], 'back');
    expect(doc.order[0]).toBe(r1.id);
    reorder(doc, [r1.id], 'forward');
    expect(doc.order).toEqual([r2.id, r1.id, r3.id]);
    reorder(doc, [r1.id], 'backward');
    expect(doc.order[0]).toBe(r1.id);
  });
});

describe('Ausrichten', () => {
  it('richtet links aus und verteilt gleichmäßig', () => {
    const doc = createDoc();
    const a = createPlace(doc, { x: 0, y: 0 });
    const b = createPlace(doc, { x: 50, y: 100 });
    const c = createPlace(doc, { x: 300, y: 200 });
    addElements(doc, [a, b, c]);
    alignElements(doc, [a.id, b.id, c.id], 'left');
    expect((doc.elements[c.id] as PlaceEl).x).toBe(0);
    distributeElements(doc, [a.id, b.id, c.id], 'v');
    expect((doc.elements[b.id] as PlaceEl).y).toBe(100);
  });

  it('dreht Transitionen und kehrt Kanten um', () => {
    const { doc, t1, a2 } = small();
    rotateTransitions(doc, [t1.id]);
    expect((doc.elements[t1.id] as TransitionEl).w).toBe(36);
    expect(reverseArcs(doc, [a2.id])).toBe(1);
    expect((doc.elements[a2.id] as ArcEl).source).not.toBe(t1.id);
  });
});

describe('Geometrie', () => {
  it('berechnet Randpunkte, Kantenverlauf und Begrenzungen', () => {
    const { doc, p1, t1, a1 } = small();
    const bp = nodeBoundaryPoint(p1, { x: 100, y: 0 });
    expect(bp.x).toBeCloseTo(18);
    const pts = arcPolyline(a1, p1, t1);
    expect(pts).toHaveLength(3);
    expect(polylineLength(pts)).toBeGreaterThan(0);
    expect(pointAlong(pts, 0)).toEqual(pts[0]);
    const b = contentBounds(doc)!;
    expect(b.x).toBeLessThan(0);
    expect(b.w).toBeGreaterThan(200);
  });

  it('legt Beschriftungen auf kantenfreie Seiten', () => {
    const doc = createDoc();
    const p = createPlace(doc, { x: 0, y: 0 });
    const t = createTransition(doc, { x: 0, y: -150 });
    addElements(doc, [p, t, createArc(t.id, p.id)]);
    const slots = autoLabelSlots(doc);
    // Kante kommt von oben → Name der Stelle nicht oben
    expect(slots.get(p.id)!.name.y).toBeGreaterThanOrEqual(0);
  });
});
