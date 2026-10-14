import { describe, expect, it } from 'vitest';
import { assignSlots, defaultSeries, downsampleSteps, indexAtTime, niceTicks, rangeTicks, stepPath } from '../src/panels/sim/chartData';

describe('Diagramm-Hilfsfunktionen', () => {
  it('erzeugt schöne ganzzahlige Ticks', () => {
    expect(niceTicks(7)).toEqual([0, 2, 4, 6, 8]);
    expect(niceTicks(0)).toEqual([0, 1]);
    expect(niceTicks(1)).toEqual([0, 1]);
    expect(rangeTicks(0, 100, 5)).toEqual([0, 20, 40, 60, 80, 100]);
    expect(rangeTicks(5, 5)).toEqual([5]);
  });

  it('bevorzugt veränderliche Stellen', () => {
    expect(defaultSeries(['a', 'b', 'c'], [0, 1, 0], [0, 3, 2], 2)).toEqual(['b', 'c']);
  });

  it('behält Farbplätze bei, wenn sich die Auswahl ändert', () => {
    const first = assignSlots(['a', 'b', 'c'], new Map());
    const second = assignSlots(['c', 'd'], first);
    expect(second.get('c')).toBe(first.get('c'));
    expect(second.get('d')).toBe(0);
  });

  it('dünnt aus, ohne Spitzen zu verlieren', () => {
    const times = Array.from({ length: 10000 }, (_, i) => i);
    const values = times.map((i) => (i === 5003 ? 99 : i % 3));
    const pts = downsampleSteps(times, values, 100);
    expect(pts.length).toBeLessThanOrEqual(400);
    expect(Math.max(...pts.map((p) => p.v))).toBe(99);
  });

  it('findet den Index zu einer Zeit', () => {
    const t = [0, 1, 2, 5, 9];
    expect(indexAtTime(t, -1)).toBe(-1);
    expect(indexAtTime(t, 0)).toBe(0);
    expect(indexAtTime(t, 4.9)).toBe(2);
    expect(indexAtTime(t, 100)).toBe(4);
  });

  it('baut einen Treppenpfad', () => {
    const d = stepPath([{ t: 0, v: 0 }, { t: 1, v: 2 }], (t) => t * 10, (v) => 100 - v * 10, 30);
    expect(d).toBe('M0.0,100.0H10.0V80.0H30.0');
  });
});
