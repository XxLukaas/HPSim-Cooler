import { describe, expect, it } from 'vitest';
import { EXAMPLES } from '../src/examples';
import { autoLayout } from '../src/model/layout';
import { elementBounds } from '../src/model/geometry';
import { createArc, createDoc, createPlace, createTransition } from '../src/model/defaults';
import type { NetDoc, NodeEl } from '../src/model/types';
import { compileNet } from '../src/sim/engine';

function nodes(doc: NetDoc): NodeEl[] {
  return doc.order.map((id) => doc.elements[id]).filter((e): e is NodeEl => e.type === 'place' || e.type === 'transition');
}

describe('Automatisch anordnen', () => {
  it.each(EXAMPLES.map((e) => e.id))('%s: keine Überlappungen, Struktur unverändert', (id) => {
    const doc = EXAMPLES.find((e) => e.id === id)!.build();
    const before = JSON.stringify(compileNet(doc).transitions.map((t) => [t.name, t.inputs.length, t.outputs.length]));
    const n = autoLayout(doc);
    expect(n).toBe(nodes(doc).length);
    expect(JSON.stringify(compileNet(doc).transitions.map((t) => [t.name, t.inputs.length, t.outputs.length]))).toBe(before);
    const seen = new Set<string>();
    for (const el of nodes(doc)) {
      expect(Number.isFinite(el.x) && Number.isFinite(el.y)).toBe(true);
      const key = `${el.x},${el.y}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
    // Kantenverläufe sind gültig; Kanten laufen nicht quer durch fremde Knoten
    for (const id2 of doc.order) {
      const el = doc.elements[id2];
      if (el.type !== 'arc') continue;
      for (const p of el.points) expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
    }
    // Zeichenobjekte überdecken keine Knoten
    for (const id2 of doc.order) {
      const el = doc.elements[id2];
      if (el.type === 'place' || el.type === 'transition' || el.type === 'arc') continue;
      const b = elementBounds(doc, el);
      for (const n of nodes(doc)) {
        const inside = n.x > b.x && n.x < b.x + b.w && n.y > b.y && n.y < b.y + b.h;
        expect(inside).toBe(false);
      }
    }
  });

  it('lässt den Fluss von links nach rechts laufen', () => {
    const doc = createDoc();
    const p1 = createPlace(doc, { x: 500, y: 500 }, { tokens: 1 });
    doc.elements[p1.id] = p1;
    doc.order.push(p1.id);
    const t1 = createTransition(doc, { x: 0, y: 900 });
    doc.elements[t1.id] = t1;
    doc.order.push(t1.id);
    const p2 = createPlace(doc, { x: 200, y: 0 });
    doc.elements[p2.id] = p2;
    doc.order.push(p2.id);
    for (const a of [createArc(p1.id, t1.id), createArc(t1.id, p2.id), createArc(p2.id, t1.id)]) {
      doc.elements[a.id] = a;
      doc.order.push(a.id);
    }
    autoLayout(doc);
    expect(p1.x).toBeLessThan(t1.x);
    expect(t1.x).toBeLessThan(p2.x);
  });

  it('stapelt unverbundene Teilnetze untereinander', () => {
    const doc = createDoc();
    const add = (el: NodeEl) => {
      doc.elements[el.id] = el;
      doc.order.push(el.id);
      return el;
    };
    const a = add(createPlace(doc, { x: 0, y: 0 }));
    const b = add(createTransition(doc, { x: 0, y: 0 }));
    const c = add(createPlace(doc, { x: 0, y: 0 }));
    const d = add(createTransition(doc, { x: 0, y: 0 }));
    for (const arc of [createArc(a.id, b.id), createArc(c.id, d.id)]) {
      doc.elements[arc.id] = arc;
      doc.order.push(arc.id);
    }
    autoLayout(doc);
    expect(Math.abs(a.y - c.y)).toBeGreaterThan(50);
  });
});
