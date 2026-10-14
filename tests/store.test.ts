import { beforeEach, describe, expect, it } from 'vitest';
import { createArc, createDoc, createPlace, createTransition } from '../src/model/defaults';
import { addElements } from '../src/model/ops';
import type { PlaceEl } from '../src/model/types';
import {
  activeTab,
  beginTransient,
  closeTabNow,
  commitTransient,
  copySelection,
  deleteSelection,
  openDocument,
  pasteElements,
  redo,
  setMode,
  setSelection,
  undo,
  updateDoc,
  updateFromBase,
  useApp,
} from '../src/store/appStore';
import { ensureSession, getSession, simBack, simFire, simReset, simStep } from '../src/store/simStore';

function resetStore() {
  for (const t of useApp.getState().tabs) closeTabNow(t.id);
  useApp.setState({ clipboard: null, transientBase: null });
}

function net() {
  const doc = createDoc('Test');
  const p = createPlace(doc, { x: 0, y: 0 }, { tokens: 1 });
  addElements(doc, [p]);
  const q = createPlace(doc, { x: 200, y: 0 });
  addElements(doc, [q]);
  const t = createTransition(doc, { x: 100, y: 0 });
  addElements(doc, [t, createArc(p.id, t.id), createArc(t.id, q.id)]);
  return { doc, p, q, t };
}

describe('Dokumentverwaltung mit Rückgängig/Wiederholen', () => {
  beforeEach(resetStore);

  it('macht Änderungen rückgängig und wiederholt sie', () => {
    const { doc, p } = net();
    openDocument(doc);
    updateDoc((d) => {
      (d.elements[p.id] as PlaceEl).tokens = 5;
    });
    expect((activeTab()!.doc.elements[p.id] as PlaceEl).tokens).toBe(5);
    undo();
    expect((activeTab()!.doc.elements[p.id] as PlaceEl).tokens).toBe(1);
    redo();
    expect((activeTab()!.doc.elements[p.id] as PlaceEl).tokens).toBe(5);
  });

  it('fasst Zwischenschritte beim Ziehen zu einem Historieneintrag zusammen', () => {
    const { doc, p } = net();
    openDocument(doc);
    beginTransient();
    for (let i = 1; i <= 10; i++) {
      updateFromBase((d) => {
        (d.elements[p.id] as PlaceEl).x = i * 10;
      });
    }
    commitTransient();
    expect(activeTab()!.past).toHaveLength(1);
    expect((activeTab()!.doc.elements[p.id] as PlaceEl).x).toBe(100);
    undo();
    expect((activeTab()!.doc.elements[p.id] as PlaceEl).x).toBe(0);
  });

  it('fängt Fehler in Änderungsfunktionen ab, ohne das Dokument zu beschädigen', () => {
    const { doc } = net();
    openDocument(doc);
    const before = activeTab()!.doc;
    const ok = updateDoc(() => {
      throw new Error('kaputt');
    });
    expect(ok).toBe(false);
    expect(activeTab()!.doc).toBe(before);
  });

  it('kopiert, fügt ein und löscht die Auswahl', () => {
    const { doc, p, t } = net();
    openDocument(doc);
    setSelection([p.id, t.id]);
    expect(copySelection()).toBe(2);
    pasteElements();
    expect(Object.keys(activeTab()!.doc.elements)).toHaveLength(7); // 5 + Stelle + Transition (+ Kante p→t)
    deleteSelection();
    expect(Object.keys(activeTab()!.doc.elements)).toHaveLength(5);
  });
});

describe('Simulationssitzung', () => {
  beforeEach(resetStore);

  it('schaltet, geht zurück und setzt zurück', () => {
    const { doc, t } = net();
    const id = openDocument(doc);
    setMode('sim');
    const sess = ensureSession(id, activeTab()!.doc);
    expect(sess.state.marking).toEqual([1, 0]);
    expect(simFire(id, t.id)).toBe(true);
    expect(getSession(id)!.state.marking).toEqual([0, 1]);
    simBack(id);
    expect(getSession(id)!.state.marking).toEqual([1, 0]);
    simStep(id);
    expect(getSession(id)!.state.step).toBe(1);
    simReset(id);
    expect(getSession(id)!.state.step).toBe(0);
    expect(getSession(id)!.log.length).toBeGreaterThan(0);
  });

  it('behält den Zustand bei Änderungen ohne Strukturwechsel', () => {
    const { doc, t } = net();
    const id = openDocument(doc);
    ensureSession(id, activeTab()!.doc);
    simFire(id, t.id);
    updateDoc((d) => {
      const tr = d.elements[t.id];
      if (tr.type === 'transition') tr.name = 'Neu';
    });
    const s = ensureSession(id, activeTab()!.doc);
    expect(s.state.marking).toEqual([0, 1]);
    expect(s.net.transitions[0].name).toBe('Neu');
  });
});
