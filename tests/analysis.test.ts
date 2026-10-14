import { describe, expect, it } from 'vitest';
import { analyze } from '../src/analysis/analyze';
import { placeInvariants, transitionInvariants } from '../src/analysis/invariants';
import { buildMatrices, netAsText } from '../src/analysis/matrix';
import { buildReachabilityGraph, OMEGA } from '../src/analysis/reachability';
import { validateNet } from '../src/analysis/validate';
import { compileNet } from '../src/sim/engine';
import { NetBuilder } from './helpers';

/** Klassischer wechselseitiger Ausschluss mit zwei Prozessen und einem Semaphor. */
function mutex() {
  return new NetBuilder()
    .place('idle1', 1)
    .place('crit1')
    .place('idle2', 1)
    .place('crit2')
    .place('sem', 1)
    .trans('enter1')
    .trans('leave1')
    .trans('enter2')
    .trans('leave2')
    .arc('idle1', 'enter1')
    .arc('sem', 'enter1')
    .arc('enter1', 'crit1')
    .arc('crit1', 'leave1')
    .arc('leave1', 'idle1')
    .arc('leave1', 'sem')
    .arc('idle2', 'enter2')
    .arc('sem', 'enter2')
    .arc('enter2', 'crit2')
    .arc('crit2', 'leave2')
    .arc('leave2', 'idle2')
    .arc('leave2', 'sem');
}

describe('Analyse', () => {
  it('berechnet die Inzidenzmatrix', () => {
    const net = compileNet(mutex().doc);
    const { c } = buildMatrices(net);
    expect(c[4]).toEqual([-1, 1, -1, 1]); // sem
  });

  it('findet den vollständigen Erreichbarkeitsgraphen des Mutex', () => {
    const g = buildReachabilityGraph(compileNet(mutex().doc));
    expect(g.states).toHaveLength(3);
    expect(g.truncated).toBe(false);
    expect(g.hasOmega).toBe(false);
  });

  it('erkennt Eigenschaften des Mutex: sicher, lebendig, reversibel, verklemmungsfrei', () => {
    const r = analyze(mutex().doc);
    const v = Object.fromEntries(r.properties.map((p) => [p.key, p.verdict]));
    expect(v).toMatchObject({ bounded: 'yes', safe: 'yes', deadlock: 'yes', live: 'yes', reversible: 'yes', dead: 'yes' });
    // P-Invarianten: idle1+crit1, idle2+crit2, sem+crit1+crit2
    expect(r.pInv.vectors).toHaveLength(3);
    expect(r.tInv.vectors).toHaveLength(2);
    expect(r.structure.conflicts).toHaveLength(1);
  });

  it('erkennt Unbeschränktheit (ω) und liefert einen Überdeckungsgraphen', () => {
    const b = new NetBuilder().place('P', 1).place('Q').trans('T').arc('P', 'T').arc('T', 'P').arc('T', 'Q');
    const g = buildReachabilityGraph(compileNet(b.doc));
    expect(g.hasOmega).toBe(true);
    expect(g.states.some((m) => m[1] === OMEGA)).toBe(true);
    const r = analyze(b.doc);
    expect(r.properties.find((p) => p.key === 'bounded')!.verdict).toBe('no');
  });

  it('findet Verklemmungen samt kürzester Schaltfolge', () => {
    // Zwei Prozesse belegen zwei Ressourcen in umgekehrter Reihenfolge
    const b = new NetBuilder()
      .place('A', 1)
      .place('B', 1)
      .place('p1', 1)
      .place('p2', 1)
      .place('p1a')
      .place('p2b')
      .place('done1')
      .place('done2')
      .trans('t1a')
      .trans('t1b')
      .trans('t2b')
      .trans('t2a')
      .arc('p1', 't1a')
      .arc('A', 't1a')
      .arc('t1a', 'p1a')
      .arc('p1a', 't1b')
      .arc('B', 't1b')
      .arc('t1b', 'done1')
      .arc('p2', 't2b')
      .arc('B', 't2b')
      .arc('t2b', 'p2b')
      .arc('p2b', 't2a')
      .arc('A', 't2a')
      .arc('t2a', 'done2');
    const r = analyze(b.doc);
    const d = r.properties.find((p) => p.key === 'deadlock')!;
    expect(d.verdict).toBe('no');
    expect(d.witness!.sequence.length).toBeGreaterThan(0);
  });

  it('erkennt tote Transitionen und unvollständige Analysen', () => {
    const b = new NetBuilder().place('P', 0).place('Q').trans('T').arc('P', 'T').arc('T', 'Q');
    const r = analyze(b.doc);
    expect(r.deadTransitions).toEqual([0]);
    const big = new NetBuilder().place('P', 30).place('Q').place('R').trans('T').trans('U').arc('P', 'T').arc('T', 'Q').arc('P', 'U').arc('U', 'R');
    const r2 = analyze(big.doc, 50);
    expect(r2.graph.truncated).toBe(true);
    expect(r2.properties.find((p) => p.key === 'bounded')!.verdict).toBe('unknown');
  });

  it('berechnet P- und T-Invarianten (Farkas)', () => {
    // Kreis P1 → T1 → P2 → T2 → P1
    const c = [
      [-1, 1],
      [1, -1],
    ];
    expect(placeInvariants(c, 2, 2).vectors).toEqual([[1, 1]]);
    expect(transitionInvariants(c, 2, 2).vectors).toEqual([[1, 1]]);
  });

  it('exportiert das Netz als Text im Stil des Originals', () => {
    const txt = netAsText(compileNet(mutex().doc), 'Mutex');
    expect(txt).toContain('Inzidenzmatrix');
    expect(txt).toContain('Markierungsvektor');
  });

  it('findet typische Modellierungsfehler', () => {
    const b = new NetBuilder().place('P', 5, 2).place('P').trans('T');
    const issues = validateNet(b.doc);
    expect(issues.some((i) => i.level === 'error' && /Kapazität/.test(i.message))).toBe(true);
    expect(issues.some((i) => /mehrfach|2-mal/.test(i.message))).toBe(true);
    expect(issues.some((i) => /mit nichts verbunden/.test(i.message))).toBe(true);
  });
});
