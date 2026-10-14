import { describe, expect, it } from 'vitest';
import {
  compileNet,
  enabledTransitions,
  explainEnabling,
  fireManually,
  initialState,
  isEnabled,
  randomInterleavingStep,
  timedStep,
  type StepOptions,
} from '../src/sim/engine';
import { MarkingHistory } from '../src/sim/history';
import { NetBuilder } from './helpers';

const OPTS: StepOptions = { timeStep: 1, conflict: 'random', maxTime: 0, maxSteps: 0 };

describe('Schaltregel', () => {
  it('aktiviert eine Transition nur mit genügend Marken (Kantengewicht)', () => {
    const b = new NetBuilder().place('P1', 1).place('P2').trans('T1').arc('P1', 'T1', 2).arc('T1', 'P2');
    const net = compileNet(b.doc);
    expect(isEnabled(net, 0, [1, 0])).toBe(false);
    expect(isEnabled(net, 0, [2, 0])).toBe(true);
  });

  it('beachtet Testkanten (lesen, nicht verbrauchen)', () => {
    const b = new NetBuilder().place('P1', 1).place('P2').trans('T1').arc('P1', 'T1', 1, 'test').arc('T1', 'P2');
    const net = compileNet(b.doc);
    const r = fireManually(net, initialState(net, 1), 0)!;
    expect(r.state.marking).toEqual([1, 1]);
  });

  it('beachtet Inhibitorkanten (nur schalten, wenn die Stelle leer ist)', () => {
    const b = new NetBuilder().place('P1', 1).place('P2').trans('T1').arc('P1', 'T1', 1, 'inhibitor').arc('T1', 'P2');
    const net = compileNet(b.doc);
    expect(isEnabled(net, 0, [1, 0])).toBe(false);
    expect(isEnabled(net, 0, [0, 0])).toBe(true);
  });

  it('beachtet Kapazitäten mit starker und schwacher Schaltregel', () => {
    const b = new NetBuilder().place('P1', 2, 2).trans('T1').arc('P1', 'T1').arc('T1', 'P1');
    b.doc.settings.sim.capacityRule = 'strong';
    expect(isEnabled(compileNet(b.doc), 0, [2])).toBe(false);
    b.doc.settings.sim.capacityRule = 'weak';
    expect(isEnabled(compileNet(b.doc), 0, [2])).toBe(true);
  });

  it('erklärt, warum eine Transition nicht schaltet', () => {
    const b = new NetBuilder().place('Lager', 0).place('Ziel', 3, 3).trans('T1').arc('Lager', 'T1').arc('T1', 'Ziel');
    const net = compileNet(b.doc);
    const reasons = explainEnabling(net, 0, initialState(net, 1));
    expect(reasons.filter((r) => !r.ok).map((r) => r.text).join(' ')).toMatch(/Lager.*0 Marke/);
    expect(reasons.some((r) => !r.ok && /Kapazität/.test(r.text))).toBe(true);
  });
});

describe('Zeitgesteuerte Simulation', () => {
  it('schaltet sofortige Transitionen im selben Schritt', () => {
    const b = new NetBuilder().place('P1', 1).place('P2').trans('T1').arc('P1', 'T1').arc('T1', 'P2');
    const net = compileNet(b.doc);
    const r = timedStep(net, initialState(net, 1), OPTS);
    expect(r.firings).toHaveLength(1);
    expect(r.state.marking).toEqual([0, 1]);
    expect(r.state.time).toBe(1);
    expect(r.status).toBe('deadlock');
  });

  it('wartet bei deterministischer Verzögerung genau delay Zeiteinheiten (wie HPSim)', () => {
    const b = new NetBuilder()
      .place('P1', 1)
      .place('P2')
      .trans('T1', { timing: 'deterministic', delay: 3 })
      .arc('P1', 'T1')
      .arc('T1', 'P2');
    const net = compileNet(b.doc);
    let s = initialState(net, 1);
    let firedAt = -1;
    for (let i = 0; i < 10 && firedAt < 0; i++) {
      const timeBefore = s.time;
      const r = timedStep(net, s, OPTS);
      if (r.firings.length) firedAt = timeBefore;
      s = r.state;
    }
    expect(firedAt).toBe(3);
  });

  it('setzt den Zeitgeber zurück, wenn die Transition deaktiviert wird', () => {
    // T2 (sofort) entzieht T1 nach dem ersten Schritt die Marke
    const b = new NetBuilder()
      .place('P1', 1)
      .place('Q', 0)
      .trans('T1', { timing: 'deterministic', delay: 5 })
      .trans('T2', { timing: 'deterministic', delay: 1 })
      .arc('P1', 'T1')
      .arc('P1', 'T2')
      .arc('T2', 'Q');
    const net = compileNet(b.doc);
    let s = initialState(net, 1);
    for (let i = 0; i < 3; i++) s = timedStep(net, s, OPTS).state;
    expect(s.marking).toEqual([0, 1]);
    expect(s.timers[0]).toBeNull();
    expect(s.fired).toEqual([0, 1]);
  });

  it('löst Konflikte auf, ohne negative Markierungen zu erzeugen', () => {
    const b = new NetBuilder().place('P', 1).place('A').place('B').trans('TA').trans('TB').arc('P', 'TA').arc('P', 'TB').arc('TA', 'A').arc('TB', 'B');
    const net = compileNet(b.doc);
    let a = 0;
    let bb = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const r = timedStep(net, initialState(net, seed), OPTS);
      expect(r.state.marking[0]).toBe(0);
      expect(r.firings).toHaveLength(1);
      if (r.state.marking[1]) a++;
      else bb++;
      expect(r.events.some((e) => e.kind === 'conflict')).toBe(true);
    }
    expect(a).toBeGreaterThan(50);
    expect(bb).toBeGreaterThan(50);
  });

  it('bevorzugt bei Konfliktstrategie „Priorität“ die höhere Priorität', () => {
    const b = new NetBuilder()
      .place('P', 1)
      .place('A')
      .place('B')
      .trans('TA', { priority: 1 })
      .trans('TB', { priority: 5 })
      .arc('P', 'TA')
      .arc('P', 'TB')
      .arc('TA', 'A')
      .arc('TB', 'B');
    const net = compileNet(b.doc);
    for (let seed = 1; seed <= 30; seed++) {
      const r = timedStep(net, initialState(net, seed), { ...OPTS, conflict: 'priority' });
      expect(r.state.marking).toEqual([0, 0, 1]);
    }
  });

  it('erlaubt im klassischen Modus nur eine Transition je gemeinsamer Stelle (Original-Verhalten)', () => {
    const b = new NetBuilder().place('P', 2).place('A').place('B').trans('TA').trans('TB').arc('P', 'TA').arc('P', 'TB').arc('TA', 'A').arc('TB', 'B');
    const net = compileNet(b.doc);
    const classic = timedStep(net, initialState(net, 3), { ...OPTS, conflict: 'classic' });
    expect(classic.firings).toHaveLength(1);
    const modern = timedStep(net, initialState(net, 3), OPTS);
    expect(modern.firings).toHaveLength(2);
  });

  it('ist mit gleichem Startwert reproduzierbar (auch mit Zufallsverzögerungen)', () => {
    const b = new NetBuilder()
      .place('P', 1)
      .trans('T1', { timing: 'exponential', delay: 4 })
      .trans('T2', { timing: 'uniform', delay: 1, delayMax: 6 })
      .arc('P', 'T1')
      .arc('T1', 'P')
      .arc('P', 'T2')
      .arc('T2', 'P');
    const net = compileNet(b.doc);
    const run = (seed: number) => {
      let s = initialState(net, seed);
      for (let i = 0; i < 300; i++) s = timedStep(net, s, OPTS).state;
      return s.fired.join(',');
    };
    expect(run(7)).toBe(run(7));
    expect(run(7)).not.toBe(run(8));
  });

  it('meldet Schritt- und Zeitlimits', () => {
    const b = new NetBuilder().place('P', 1).trans('T').arc('P', 'T').arc('T', 'P');
    const net = compileNet(b.doc);
    let s = initialState(net, 1);
    let status = 'ok';
    for (let i = 0; i < 20 && status === 'ok'; i++) {
      const r = timedStep(net, s, { ...OPTS, maxSteps: 5 });
      s = r.state;
      status = r.status;
    }
    expect(status).toBe('step-limit');
    expect(s.step).toBe(5);
  });

  it('berechnet die zeitgewichtete mittlere Markierung', () => {
    const b = new NetBuilder().place('P', 1).place('Q').trans('T', { timing: 'deterministic', delay: 2 }).arc('P', 'T').arc('T', 'Q').trans('U', { timing: 'deterministic', delay: 2 }).arc('Q', 'U').arc('U', 'P');
    const net = compileNet(b.doc);
    let s = initialState(net, 1);
    for (let i = 0; i < 400; i++) s = timedStep(net, s, OPTS).state;
    const avgP = s.integral[0] / s.time;
    expect(avgP).toBeGreaterThan(0.4);
    expect(avgP).toBeLessThan(0.6);
  });
});

describe('Token-Spiel', () => {
  it('schaltet manuell nur aktivierte Transitionen', () => {
    const b = new NetBuilder().place('P1', 0).place('P2').trans('T1').arc('P1', 'T1').arc('T1', 'P2');
    const net = compileNet(b.doc);
    expect(fireManually(net, initialState(net, 1), 0)).toBeNull();
  });

  it('wählt beim Zufallsschritt eine aktivierte Transition', () => {
    const b = new NetBuilder().place('P', 1).trans('A').trans('B').arc('P', 'A').arc('A', 'P').arc('P', 'B').arc('B', 'P');
    const net = compileNet(b.doc);
    let s = initialState(net, 5);
    for (let i = 0; i < 100; i++) s = randomInterleavingStep(net, s, false).state;
    expect(s.fired[0] + s.fired[1]).toBe(100);
    expect(s.fired[0]).toBeGreaterThan(20);
    expect(enabledTransitions(net, s.marking)).toEqual([0, 1]);
  });
});

describe('Markierungsverlauf', () => {
  it('dünnt lange Verläufe aus und exportiert CSV', () => {
    const h = new MarkingHistory(100);
    for (let i = 0; i < 1000; i++) h.push(i, i * 0.5, [i, 2 * i], i % 2 ? [0] : null);
    expect(h.length).toBeLessThanOrEqual(101);
    expect(h.decimated).toBe(true);
    const csv = h.toCsv(['P1', 'P;2'], ['T1']);
    expect(csv.split('\r\n')[0]).toBe('Schritt;Zeit;P1;"P;2";Geschaltet');
  });
});
