import { describe, expect, it } from 'vitest';
import { createLine, createPoly, createRect, createText } from '../src/model/defaults';
import { addElements } from '../src/model/ops';
import type { NetDoc } from '../src/model/types';
import {
  buildExplorerModel,
  buildRows,
  filterModel,
  groupHeaderIndex,
  highlightRanges,
  layoutRows,
  matchesTerms,
  modelSize,
  normalizeText,
  parseQuery,
  ROW_HEIGHT,
  rowAt,
  shortText,
  splitHighlights,
  timingText,
  visibleRange,
  type GroupKey,
} from '../src/panels/explorer/model';
import { NetBuilder } from './helpers';

function sample(): NetDoc {
  const b = new NetBuilder()
    .place('Bäckerei', 3, 5)
    .place('Straße')
    .place('P10')
    .place('P2', 1)
    .trans('T1')
    .trans('Ofen', { timing: 'deterministic', delay: 2.5 })
    .trans('Kunde', { timing: 'uniform', delay: 1, delayMax: 3 })
    .arc('Bäckerei', 'Ofen', 2)
    .arc('Ofen', 'Straße')
    .arc('P2', 'T1', 1, 'inhibitor')
    .arc('P10', 'Kunde', 1, 'test');
  addElements(b.doc, [
    createText(0, 0, 'Hallo Welt\nzweite Zeile'),
    createRect(0, 0, 120, 80, { shape: 'ellipse' }),
    createLine(0, 0, 30, 40, { arrowEnd: true }),
    createPoly(
      [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 2, y: 0 },
      ],
      { closed: true },
    ),
  ]);
  return b.doc;
}

describe('Suche', () => {
  it('normalisiert Umlaute, Akzente, ß und Großschreibung', () => {
    expect(normalizeText('Bäckerei')).toBe('backerei');
    expect(normalizeText('STRASSE')).toBe('strasse');
    expect(normalizeText('Straße')).toBe('strasse');
    expect(normalizeText('Café  Crème')).toBe('cafe creme');
    expect(normalizeText('')).toBe('');
  });

  it('zerlegt Anfragen in Begriffe, die alle passen müssen', () => {
    expect(parseQuery('  Ofen  T ')).toEqual(['ofen', 't']);
    expect(parseQuery('   ')).toEqual([]);
    expect(matchesTerms('backerei ofen', ['ofen', 'back'])).toBe(true);
    expect(matchesTerms('backerei ofen', ['ofen', 'kunde'])).toBe(false);
  });

  it('findet Elemente unabhängig von Umlauten', () => {
    const model = buildExplorerModel(sample());
    const hits = filterModel(model, parseQuery('backer'));
    expect(hits.places.map((p) => p.label)).toEqual(['Bäckerei']);
    // Kanten werden über die Namen ihrer Endpunkte gefunden
    expect(hits.arcs.map((a) => a.label)).toEqual(['Bäckerei → Ofen']);
    const strasse = filterModel(model, parseQuery('strasse'));
    expect(strasse.places.map((p) => p.label)).toEqual(['Straße']);
    // Texte werden über ihren Inhalt gefunden, auch in späteren Zeilen
    expect(filterModel(model, parseQuery('zweite')).drawings).toHaveLength(1);
    expect(modelSize(filterModel(model, parseQuery('gibtsnicht')))).toBe(0);
    // ohne Suchbegriffe bleibt das Modell unverändert
    expect(filterModel(model, [])).toBe(model);
  });

  it('liefert Trefferbereiche im Originaltext', () => {
    expect(highlightRanges('Bäckerei', ['back'])).toEqual([[0, 4]]);
    expect(highlightRanges('Straße', ['strasse'])).toEqual([[0, 6]]);
    expect(highlightRanges('Straße', ['ss'])).toEqual([[4, 5]]);
    expect(highlightRanges('P1 → P10', ['p1'])).toEqual([
      [0, 2],
      [5, 7],
    ]);
    // überlappende Treffer werden zusammengefasst
    expect(highlightRanges('abcdef', ['abc', 'cde'])).toEqual([[0, 5]]);
    expect(highlightRanges('abc', [])).toEqual([]);
    expect(splitHighlights('Ofen 2', ['ofen'])).toEqual([
      { text: 'Ofen', hit: true },
      { text: ' 2', hit: false },
    ]);
  });
});

describe('Explorer-Modell', () => {
  it('gruppiert und sortiert natürlich (P2 vor P10)', () => {
    const model = buildExplorerModel(sample());
    expect(model.places.map((p) => p.label)).toEqual(['Bäckerei', 'P2', 'P10', 'Straße']);
    expect(model.transitions.map((t) => t.label)).toEqual(['Kunde', 'Ofen', 'T1']);
    expect(model.arcs).toHaveLength(4);
    expect(model.drawings).toHaveLength(4);
  });

  it('übernimmt Marken, Zeitverhalten, Kantenart und Gewicht', () => {
    const model = buildExplorerModel(sample());
    const b = model.places.find((p) => p.label === 'Bäckerei');
    expect(b?.kind === 'place' && b.tokens).toBe(3);
    expect(b?.kind === 'place' && b.capacity).toBe(5);
    const ofen = model.transitions.find((t) => t.label === 'Ofen');
    expect(ofen?.kind === 'transition' && ofen.timingText).toBe('⏱ 2,5');
    const kunde = model.transitions.find((t) => t.label === 'Kunde');
    expect(kunde?.kind === 'transition' && kunde.timingText).toBe('U[1; 3]');
    const inh = model.arcs.find((a) => a.label === 'P2 → T1');
    expect(inh?.kind === 'arc' && inh.arcKind).toBe('inhibitor');
    const w = model.arcs.find((a) => a.label === 'Bäckerei → Ofen');
    expect(w?.kind === 'arc' && w.weight).toBe(2);
    expect(w?.kind === 'arc' && w.direction).toBe('input');
    const labels = model.drawings.map((d) => d.label);
    expect(labels).toContain('„Hallo Welt“');
    expect(labels).toContain('Ellipse');
    expect(labels).toContain('Pfeil');
    expect(labels).toContain('Polygon');
  });

  it('übersteht kaputte Dokumente', () => {
    expect(modelSize(buildExplorerModel(null))).toBe(0);
    const doc = sample();
    // verwaiste ID in der Reihenfolge, Kante auf gelöschtes Element, leerer Name
    doc.order.push('gibt-es-nicht');
    const arc = Object.values(doc.elements).find((e) => e.type === 'arc');
    if (arc?.type === 'arc') arc.source = 'weg';
    const place = Object.values(doc.elements).find((e) => e.type === 'place');
    if (place?.type === 'place') {
      place.name = '';
      place.tokens = Number.NaN;
    }
    const model = buildExplorerModel(doc);
    expect(model.arcs.some((a) => a.kind === 'arc' && a.broken && a.label.startsWith('?'))).toBe(true);
    const unnamed = model.places[model.places.length - 1];
    expect(unnamed.unnamed).toBe(true);
    expect(unnamed.kind === 'place' && unnamed.tokens).toBe(0);
  });

  it('formatiert Zeitangaben und kürzt Texte', () => {
    expect(timingText('immediate', 0, 0)).toBe('sofort');
    expect(timingText('exponential', 1.5, 0)).toBe('exp(1,5)');
    expect(timingText('deterministic', Number.POSITIVE_INFINITY, 0)).toBe('⏱ ∞');
    expect(shortText('  \n  erste   Zeile \n zweite')).toBe('erste Zeile');
    expect(shortText('x'.repeat(100), 10)).toHaveLength(10);
  });
});

describe('Zeilen & virtuelles Scrollen', () => {
  it('baut Zeilen mit Gruppenköpfen, Hinweisen und eingeklappten Gruppen', () => {
    const doc = new NetBuilder().place('A').place('B').doc;
    const model = buildExplorerModel(doc);
    const rows = buildRows(model, model, new Set<GroupKey>(['arcs']), false);
    expect(rows.map((r) => r.type)).toEqual(['group', 'item', 'item', 'group', 'hint', 'group', 'group', 'hint']);
    // Während der Suche verschwinden Gruppen ohne Treffer
    const filtered = filterModel(model, ['a']);
    const searchRows = buildRows(model, filtered, new Set(), true);
    expect(searchRows.map((r) => r.type)).toEqual(['group', 'item']);
    const head = searchRows[0];
    expect(head.type === 'group' && head.count).toBe(1);
    expect(head.type === 'group' && head.total).toBe(2);
  });

  it('berechnet Positionen und den sichtbaren Bereich', () => {
    const b = new NetBuilder();
    for (let i = 0; i < 2000; i++) b.place(`P${i}`);
    const model = buildExplorerModel(b.doc);
    expect(model.places).toHaveLength(2000);
    const rows = buildRows(model, model, new Set(), false);
    const layout = layoutRows(rows, 4, 12);
    expect(layout.offsets[0]).toBe(4);
    expect(layout.offsets[1]).toBe(4 + ROW_HEIGHT.group);
    expect(layout.total).toBe(layout.offsets[rows.length] + 12);
    expect(rowAt(layout.offsets, rows.length, 0)).toBe(0);
    expect(rowAt(layout.offsets, rows.length, 4 + ROW_HEIGHT.group + 1)).toBe(1);
    const [start, end] = visibleRange(layout, rows.length, 28 * 500, 600, 5);
    expect(end - start).toBeLessThan(40);
    expect(start).toBeGreaterThan(400);
    expect(groupHeaderIndex(rows, 1500)).toBe(0);
    expect(visibleRange(layoutRows([]), 0, 0, 500)).toEqual([0, 0]);
  });
});
