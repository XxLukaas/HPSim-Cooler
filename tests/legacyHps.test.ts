import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LegacyFormatError, importLegacyHps, parseLegacyObjects } from '../src/io/legacyHps';
import { compileNet, initialState, timedStep } from '../src/sim/engine';
import type { ArcEl, PlaceEl, TransitionEl } from '../src/model/types';

const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures/legacy', name));
const FILES = ['time_sample.hps', 'demo_net.hps', 'prozess_connect.hps', 'prozess_simple_connect.hps'];

describe('Import des Original-HPSim-Formats (*.hps)', () => {
  it.each(FILES)('liest %s vollständig bis zu den Dokumenteinstellungen', (name) => {
    const { objects, settings } = parseLegacyObjects(fixture(name));
    expect(objects.length).toBeGreaterThan(10);
    expect(settings).not.toBeNull();
    expect(settings!.grid).toBe(10);
    expect(settings!.sampleTime).toBe(1);
  });

  it.each(FILES)('erzeugt aus %s ein gültiges, simulierbares Netz', (name) => {
    const { doc } = importLegacyHps(fixture(name), name);
    const els = Object.values(doc.elements);
    const places = els.filter((e) => e.type === 'place');
    const transitions = els.filter((e) => e.type === 'transition');
    const arcs = els.filter((e): e is ArcEl => e.type === 'arc');
    expect(places.length).toBeGreaterThan(0);
    expect(transitions.length).toBeGreaterThan(0);
    for (const a of arcs) {
      const s = doc.elements[a.source];
      const t = doc.elements[a.target];
      expect(s).toBeDefined();
      expect(t).toBeDefined();
      expect(s.type).not.toBe(t.type);
    }
    const net = compileNet(doc);
    let s = initialState(net, 42);
    for (let i = 0; i < 200; i++) {
      const r = timedStep(net, s, { timeStep: 1, conflict: 'classic', maxSteps: 0, maxTime: 0 });
      s = r.state;
      expect(s.marking.every((v) => v >= 0)).toBe(true);
      if (r.status === 'deadlock') break;
    }
  });

  it('übernimmt Namen, Marken, Zeitmodelle und Kantentypen aus time_sample.hps', () => {
    const { doc, stats } = importLegacyHps(fixture('time_sample.hps'));
    expect(stats).toEqual({ places: 11, transitions: 7, arcs: 18, decor: 9 });
    const byName = (n: string) => Object.values(doc.elements).find((e) => 'name' in e && e.name === n);
    const puffer = byName('Puffer') as PlaceEl;
    expect(puffer.type).toBe('place');
    expect(puffer.tokens).toBe(0);
    expect(puffer.capacity).toBe(1);
    const messzeit = byName('Meßzeit') as PlaceEl;
    expect(messzeit.type).toBe('place');
    const t8 = byName('T8') as TransitionEl;
    expect(t8.timing).toBe('exponential');
    expect(t8.delay).toBe(10);
    expect((byName('T1') as TransitionEl).timing).toBe('deterministic');
    expect((byName('Start') as TransitionEl).timing).toBe('immediate');
    const testArcs = Object.values(doc.elements).filter((e): e is ArcEl => e.type === 'arc' && e.kind === 'test');
    expect(testArcs).toHaveLength(1);
    expect(testArcs[0].source).toBe(messzeit.id);
    const texts = Object.values(doc.elements).filter((e) => e.type === 'text').map((e) => (e.type === 'text' ? e.text : ''));
    expect(texts).toContain('Erzeuger');
    expect(texts).toContain('überwachter Prozeß');
    expect(doc.settings.sim.maxTime).toBe(1000);
  });

  it('meldet beschädigte Dateien mit verständlicher Fehlermeldung statt abzustürzen', () => {
    const data = fixture('time_sample.hps');
    expect(() => importLegacyHps(data.subarray(0, 300))).toThrow(LegacyFormatError);
    expect(() => importLegacyHps(new Uint8Array([1, 2]))).toThrow(LegacyFormatError);
    const garbage = new Uint8Array(500).map((_, i) => (i * 37) % 251);
    expect(() => importLegacyHps(garbage)).toThrow(LegacyFormatError);
  });
});
