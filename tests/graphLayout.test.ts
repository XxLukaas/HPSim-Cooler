import { describe, expect, it } from 'vitest';
import { analyze } from '../src/analysis/analyze';
import { layoutReachGraph, NODE_W } from '../src/analysis/graphLayout';
import { EXAMPLES } from '../src/examples';
import { formatMarkValue, stateMarking, stateVisuals } from '../src/store/analysisStore';

const build = (id: string) => EXAMPLES.find((e) => e.id === id)!.build();

describe('Schichtenlayout des Zustandsgraphen', () => {
  it('ordnet Zustände nach Tiefe an und überlappt keine Knoten', () => {
    const r = analyze(build('philosophen'));
    const L = layoutReachGraph(r.graph);
    const n = r.graph.states.length;
    expect(L.x).toHaveLength(n);
    // Anfangszustand liegt oben
    for (let s = 1; s < n; s++) expect(L.y[s]).toBeGreaterThan(L.y[0]);
    // tiefere Zustände liegen nie höher als flachere
    for (let a = 0; a < n; a++)
      for (let b = 0; b < n; b++) if (r.graph.depth[a] < r.graph.depth[b]) expect(L.y[a]).toBeLessThan(L.y[b]);
    // keine zwei Knoten an derselben Stelle (Mindestabstand in x bei gleicher Zeile)
    const seen = new Set<string>();
    for (let s = 0; s < n; s++) {
      const key = `${Math.round(L.x[s])}:${Math.round(L.y[s])}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
    for (let s = 0; s < n; s++) {
      expect(L.x[s]).toBeGreaterThanOrEqual(0);
      expect(L.x[s]).toBeLessThanOrEqual(L.width);
      expect(L.y[s]).toBeLessThanOrEqual(L.height);
    }
  });

  it('bricht sehr breite Schichten in mehrere Zeilen um', () => {
    const r = analyze(build('philosophen'));
    const L = layoutReachGraph(r.graph);
    const widest = Math.max(...L.layers.map((l) => l.length));
    expect(widest).toBeGreaterThan(Math.ceil(Math.sqrt(r.graph.states.length * 2)));
    // Breite bleibt deutlich unter „alle Knoten der breitesten Schicht nebeneinander“
    expect(L.width).toBeLessThan(widest * NODE_W);
  });

  it('verkraftet leere Netze', () => {
    const doc = build('mutex');
    doc.order = [];
    doc.elements = {};
    const r = analyze(doc);
    const L = layoutReachGraph(r.graph);
    expect(L.x).toHaveLength(1);
  });
});

describe('Zustandsanzeige der Analyse', () => {
  it('liefert Markierung und aktivierte Transitionen eines Zustands', () => {
    const r = analyze(build('mutex'));
    const m = stateMarking(r, 0);
    r.net.placeIds.forEach((id, p) => expect(m[id]).toBe(r.net.initial[p]));
    const vis = stateVisuals(r, 0);
    const enabled = Object.values(vis).filter((v) => v.status === 'enabled').length;
    expect(enabled).toBe(r.graph.out[0].length);
    // in einer Verklemmung ist nichts aktiviert
    const phil = analyze(build('philosophen'));
    const dead = phil.deadlocks[0];
    expect(Object.values(stateVisuals(phil, dead)).every((v) => v.status === 'disabled')).toBe(true);
  });

  it('zeigt ω für unbeschränkte Stellen', () => {
    expect(formatMarkValue(Infinity)).toBe('ω');
    expect(formatMarkValue(3)).toBe('3');
  });
});
