import { describe, expect, it } from 'vitest';
import { EXAMPLES } from '../src/examples';
import { validateNet } from '../src/analysis/validate';
import { analyze } from '../src/analysis/analyze';
import { compileNet, initialState, timedStep } from '../src/sim/engine';

describe('Beispielnetze', () => {
  it('haben eindeutige IDs', () => {
    const ids = EXAMPLES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(EXAMPLES.map((e) => [e.id, e] as const))('%s ist gültig und simulierbar', (_id, ex) => {
    const doc = ex.build();
    expect(doc.meta.title.length).toBeGreaterThan(3);
    expect(ex.build()).not.toBe(doc);
    for (const id of doc.order) {
      const el = doc.elements[id];
      if (el.type !== 'arc') continue;
      const s = doc.elements[el.source];
      const t = doc.elements[el.target];
      expect(s && t).toBeTruthy();
      expect(s.type).not.toBe(t.type);
    }
    expect(validateNet(doc).filter((i) => i.level === 'error')).toEqual([]);
    const net = compileNet(doc);
    let s = initialState(net, 3);
    for (let i = 0; i < 60; i++) {
      const r = timedStep(net, s, { timeStep: doc.settings.sim.timeStep, conflict: doc.settings.sim.conflict, maxTime: 0, maxSteps: 0 });
      s = r.state;
      expect(s.marking.every((m) => m >= 0)).toBe(true);
      if (r.status === 'deadlock') break;
    }
  });

  it('die Philosophen können verklemmen, der Mutex nicht', () => {
    const phil = analyze(EXAMPLES.find((e) => e.id === 'philosophen')!.build(), 20000);
    expect(phil.properties.find((p) => p.key === 'deadlock')!.verdict).toBe('no');
    const mutex = analyze(EXAMPLES.find((e) => e.id === 'mutex')!.build());
    expect(mutex.properties.find((p) => p.key === 'deadlock')!.verdict).toBe('yes');
    expect(mutex.properties.find((p) => p.key === 'safe')!.verdict).toBe('yes');
  });

  it('der Glücksspielautomat erhält die Münzsumme (P-Invariante)', () => {
    const r = analyze(EXAMPLES.find((e) => e.id === 'erstes-netz')!.build());
    expect(r.pInv.vectors.some((v) => v.every((x) => x === 1))).toBe(true);
  });
});
