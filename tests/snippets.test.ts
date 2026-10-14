import { describe, expect, it } from 'vitest';
import { createDoc } from '../src/model/defaults';
import { addElements, canConnect } from '../src/model/ops';
import { instantiateSnippet, SNIPPETS } from '../src/editor/snippets';
import { compileNet, initialState, timedStep } from '../src/sim/engine';

describe('Bausteine', () => {
  it.each(SNIPPETS.map((s) => [s.id, s] as const))('%s erzeugt ein gültiges, simulierbares Teilnetz', (_id, sn) => {
    const doc = createDoc();
    const els = instantiateSnippet(doc, sn, 500, 300);
    addElements(doc, els);
    const ids = new Set(els.map((e) => e.id));
    expect(ids.size).toBe(els.length);
    for (const el of els) {
      if (el.type !== 'arc') continue;
      expect(ids.has(el.source) && ids.has(el.target)).toBe(true);
      const s = doc.elements[el.source];
      const t = doc.elements[el.target];
      expect(s.type).not.toBe(t.type);
    }
    const net = compileNet(doc);
    let st = initialState(net, 1);
    for (let i = 0; i < 20; i++) st = timedStep(net, st, { timeStep: 1, conflict: 'random', maxTime: 0, maxSteps: 0 }).state;
    expect(st.marking.every((m) => m >= 0)).toBe(true);
  });

  it('vergibt beim zweiten Einfügen eindeutige Namen', () => {
    const doc = createDoc();
    const sn = SNIPPETS[0];
    addElements(doc, instantiateSnippet(doc, sn, 0, 0));
    const second = instantiateSnippet(doc, sn, 0, 400);
    addElements(doc, second);
    const names = Object.values(doc.elements).filter((e) => 'name' in e).map((e) => ('name' in e ? e.name : ''));
    expect(new Set(names).size).toBe(names.length);
    // Duplikat-Kanten sind ausgeschlossen
    const arc = second.find((e) => e.type === 'arc');
    if (arc && arc.type === 'arc') expect(canConnect(doc, arc.source, arc.target).ok).toBe(false);
  });
});
