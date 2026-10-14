/**
 * Automatisches Anordnen eines Netzes (Schichtenlayout nach Sugiyama):
 *  1. Zyklen aufbrechen – Stellen mit Anfangsmarken gelten als Startpunkte,
 *     Kanten in sie hinein zählen als „Rückfluss“.
 *  2. Spalten per längstem Weg; der Fluss läuft von links nach rechts.
 *  3. Lange Kanten erhalten Hilfsknoten, damit sie zwischen den Knoten
 *     hindurch statt quer über sie laufen.
 *  4. Reihenfolge je Spalte per Baryzentrum (Kreuzungen minimieren),
 *     dann Zeilen so wählen, dass Kanten möglichst waagerecht verlaufen.
 *  5. Rückflusskanten werden ober- oder unterhalb vorbeigeführt.
 * Unverbundene Teilnetze werden untereinander gestapelt.
 */
import type { Draft } from 'immer';
import { distToPolyline, elementBounds, rectsIntersect, snap } from './geometry';
import { moveElements } from './ops';
import type { Id, NetDoc, Point, Rect } from './types';

const COL_GAP = 120;
const ROW_GAP = 90;
const COMPONENT_GAP = 110;

interface LayoutOptions {
  /** nur diese Knoten anordnen (Standard: alle Stellen und Transitionen) */
  ids?: Id[];
}

interface Edge {
  arc: Id;
  s: number;
  t: number;
}

interface ComponentLayout {
  col: Map<number, number>;
  row: Map<number, number>;
  rows: number;
  /** Zwischenpunkte (Spalte, Zeile) langer Kanten in Pfeilrichtung */
  chains: Map<number, { col: number; row: number }[]>;
  /** Kanten, die gegen den Fluss laufen */
  reversed: Set<number>;
}

/** Ordnet die Knoten an und legt Kantenverläufe neu fest. Gibt die Zahl der Knoten zurück. */
export function autoLayout(doc: NetDoc | Draft<NetDoc>, opts: LayoutOptions = {}): number {
  const only = opts.ids ? new Set(opts.ids) : null;
  const nodes: Id[] = [];
  for (const id of doc.order) {
    const el = doc.elements[id];
    if (el && (el.type === 'place' || el.type === 'transition') && (!only || only.has(id))) nodes.push(id);
  }
  if (!nodes.length) return 0;
  const index = new Map(nodes.map((id, i) => [id, i]));
  const N = nodes.length;
  const edges: Edge[] = [];
  const adj: number[][] = Array.from({ length: N }, () => []);
  for (const id of doc.order) {
    const el = doc.elements[id];
    if (el?.type !== 'arc') continue;
    const s = index.get(el.source);
    const t = index.get(el.target);
    if (s === undefined || t === undefined || s === t) continue;
    edges.push({ arc: id, s, t });
    adj[s].push(t);
    adj[t].push(s);
  }
  const marked = (i: number) => {
    const el = doc.elements[nodes[i]];
    return el?.type === 'place' && el.tokens > 0;
  };

  // Alte Lage merken, damit das Netz nicht „wegspringt“
  let minX = Infinity;
  let minY = Infinity;
  for (const id of nodes) {
    const el = doc.elements[id] as { x: number; y: number };
    minX = Math.min(minX, el.x);
    minY = Math.min(minY, el.y);
  }
  if (!Number.isFinite(minX)) minX = 0;
  if (!Number.isFinite(minY)) minY = 0;

  // Zusammenhangskomponenten (ungerichtet), größte zuerst
  const comp = new Array<number>(N).fill(-1);
  const members: number[][] = [];
  for (let i = 0; i < N; i++) {
    if (comp[i] >= 0) continue;
    const c = members.length;
    const list = [i];
    comp[i] = c;
    for (let h = 0; h < list.length; h++) {
      for (const w of adj[list[h]]) {
        if (comp[w] < 0) {
          comp[w] = c;
          list.push(w);
        }
      }
    }
    members.push(list);
  }
  const order = members.map((_, c) => c).sort((a, b) => members[b].length - members[a].length);
  const edgesOf: number[][] = members.map(() => []);
  edges.forEach((e, k) => edgesOf[comp[e.s]].push(k));

  const x = new Array<number>(N).fill(0);
  const y = new Array<number>(N).fill(0);
  const bends = new Map<number, Point[]>();
  const backEdges = new Set<number>();
  let offsetY = 0;
  for (const c of order) {
    const mem = members[c];
    const L = layoutComponent(mem, edges, edgesOf[c], marked);
    for (const v of mem) {
      x[v] = L.col.get(v)! * COL_GAP;
      y[v] = offsetY + L.row.get(v)! * ROW_GAP;
    }
    for (const [k, chain] of L.chains) bends.set(k, chain.map((p) => ({ x: p.col * COL_GAP, y: offsetY + p.row * ROW_GAP })));
    for (const k of L.reversed) backEdges.add(k);
    offsetY += L.rows * ROW_GAP + COMPONENT_GAP;
  }

  const grid = doc.settings.grid.size || 10;
  nodes.forEach((id, i) => {
    const el = doc.elements[id];
    if (!el || (el.type !== 'place' && el.type !== 'transition')) return;
    el.x = snap(minX + x[i], grid);
    el.y = snap(minY + y[i], grid);
    el.nameOffset = null;
    if (el.type === 'place') el.capOffset = null;
    else {
      el.delayOffset = null;
      // Fluss von links nach rechts: senkrechte Balken
      if (el.w > el.h) [el.w, el.h] = [el.h, el.w];
    }
  });

  // Kantenverläufe
  const pos = (i: number): Point => {
    const el = doc.elements[nodes[i]] as { x: number; y: number };
    return { x: el.x, y: el.y };
  };
  const lanes = new Map<string, number>();
  const pairs = new Set(edges.map((e) => `${e.s}>${e.t}`));
  edges.forEach((e, k) => {
    const a = doc.elements[e.arc];
    if (a?.type !== 'arc') return;
    a.labelOffset = null;
    a.points = [];
    const s = pos(e.s);
    const t = pos(e.t);
    const backwards = backEdges.has(k);
    const chain = bends.get(k);
    if (chain) {
      // Lange Kanten laufen über ihre Hilfsknoten zwischen den anderen Knoten hindurch
      const pts = chain.map((p) => ({ x: snap(minX + p.x, grid), y: snap(minY + p.y, grid) }));
      a.points = backwards ? pts.reverse() : pts;
      if (a.points.every((p) => Math.abs(p.y - s.y) < 1) && Math.abs(t.y - s.y) < 1) {
        // gerade Linie: Knicke überflüssig – gegenläufige Kanten aber leicht versetzen
        a.points = backwards ? a.points.map((p) => ({ x: p.x, y: p.y + 24 })) : [];
      }
      return;
    }
    // Gegenläufiges Kantenpaar zwischen denselben Knoten: leicht versetzt statt deckungsgleich
    if (backwards && pairs.has(`${e.t}>${e.s}`)) {
      a.points = [{ x: snap((s.x + t.x) / 2, grid), y: snap(Math.max(s.y, t.y) + 30, grid) }];
      return;
    }
    const lo = Math.min(s.x, t.x);
    const hi = Math.max(s.x, t.x);
    const between: Point[] = [];
    for (let j = 0; j < N; j++) {
      if (j === e.s || j === e.t || comp[j] !== comp[e.s]) continue;
      const q = pos(j);
      if (q.x > lo + 1 && q.x < hi - 1) between.push(q);
    }
    const blocked = between.some((q) => distToPolyline(q, [s, t]).d < 28);
    if (!blocked) return;
    const ys = [s.y, t.y, ...between.map((q) => q.y)];
    const top = Math.min(...ys) - ROW_GAP * 0.55;
    const bottom = Math.max(...ys) + ROW_GAP * 0.55;
    const mid = (s.y + t.y) / 2;
    const above = mid - top <= bottom - mid;
    const key = `${comp[e.s]}:${above ? 'a' : 'b'}`;
    const lane = lanes.get(key) ?? 0;
    lanes.set(key, lane + 1);
    const ly = above ? top - (lane % 6) * 14 : bottom + (lane % 6) * 14;
    const dx = backwards ? 0 : 30;
    a.points = [
      { x: s.x + (t.x >= s.x ? dx : -dx), y: ly },
      { x: t.x - (t.x >= s.x ? dx : -dx), y: ly },
    ];
  });

  // Zeichenobjekte, die jetzt Knoten verdecken würden, zur Seite schieben
  if (!only) {
    let box: Rect | null = null;
    for (const id of nodes) {
      const el = doc.elements[id] as { x: number; y: number };
      const r = { x: el.x - 60, y: el.y - 48, w: 120, h: 96 };
      box = box ? unite(box, r) : r;
    }
    if (box) {
      const cy = box.y + box.h / 2;
      for (const id of doc.order) {
        const el = doc.elements[id];
        if (!el || el.type === 'place' || el.type === 'transition' || el.type === 'arc') continue;
        const b = elementBounds(doc as NetDoc, el);
        if (!rectsIntersect(b, box)) continue;
        const up = b.y + b.h / 2 <= cy;
        const dy = up ? box.y - (b.y + b.h) - 8 : box.y + box.h - b.y + 8;
        moveElements(doc as NetDoc, [id], 0, dy);
      }
    }
  }
  return N;
}

function unite(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

function layoutComponent(mem: number[], edges: Edge[], compEdges: number[], marked: (i: number) => boolean): ComponentLayout {
  // ── 1. Richtung festlegen: Kanten in markierte Stellen hinein gelten als Rückfluss
  const reversed = new Set<number>();
  for (const k of compEdges) if (marked(edges[k].t) && !marked(edges[k].s)) reversed.add(k);
  const from = (k: number) => (reversed.has(k) ? edges[k].t : edges[k].s);
  const to = (k: number) => (reversed.has(k) ? edges[k].s : edges[k].t);
  const outE = new Map<number, number[]>();
  const inDeg = new Map<number, number>();
  for (const v of mem) {
    outE.set(v, []);
    inDeg.set(v, 0);
  }
  for (const k of compEdges) {
    outE.get(from(k))!.push(k);
    inDeg.set(to(k), inDeg.get(to(k))! + 1);
  }
  // Restliche Zyklen per Tiefensuche aufbrechen
  const starts = [...mem].sort((a, b) => {
    const ra = inDeg.get(a) === 0 ? 0 : marked(a) ? 1 : 2;
    const rb = inDeg.get(b) === 0 ? 0 : marked(b) ? 1 : 2;
    return ra - rb || a - b;
  });
  const state = new Map<number, number>();
  const flip: number[] = [];
  for (const s of starts) {
    if (state.get(s)) continue;
    const stack: { v: number; i: number }[] = [{ v: s, i: 0 }];
    state.set(s, 1);
    while (stack.length) {
      const top = stack[stack.length - 1];
      const list = outE.get(top.v)!;
      if (top.i < list.length) {
        const k = list[top.i++];
        const w = to(k);
        const st = state.get(w) ?? 0;
        if (st === 1) flip.push(k);
        else if (st === 0) {
          state.set(w, 1);
          stack.push({ v: w, i: 0 });
        }
      } else {
        state.set(top.v, 2);
        stack.pop();
      }
    }
  }
  for (const k of flip) {
    if (reversed.has(k)) reversed.delete(k);
    else reversed.add(k);
  }

  // ── 2. Spalten: längster Weg (topologisch)
  const succ = new Map<number, number[]>();
  const indeg = new Map<number, number>();
  for (const v of mem) {
    succ.set(v, []);
    indeg.set(v, 0);
  }
  for (const k of compEdges) {
    succ.get(from(k))!.push(to(k));
    indeg.set(to(k), indeg.get(to(k))! + 1);
  }
  const col = new Map<number, number>();
  const queue = mem.filter((v) => indeg.get(v) === 0);
  if (!queue.length) queue.push(mem[0]);
  for (const v of queue) col.set(v, 0);
  const deg = new Map(indeg);
  for (let h = 0; h < queue.length; h++) {
    const v = queue[h];
    for (const w of succ.get(v)!) {
      col.set(w, Math.max(col.get(w) ?? 0, col.get(v)! + 1));
      deg.set(w, deg.get(w)! - 1);
      if (deg.get(w) === 0) queue.push(w);
    }
  }
  for (const v of mem) if (!col.has(v)) col.set(v, 0);
  // Quellen direkt vor ihren ersten Nachfolger ziehen (kompakter)
  for (const v of mem) {
    const sv = succ.get(v)!;
    if (indeg.get(v) === 0 && sv.length) col.set(v, Math.max(col.get(v)!, Math.min(...sv.map((w) => col.get(w)!)) - 1));
  }

  // ── 3. Hilfsknoten für lange Kanten
  let nextId = -1;
  const dummy = new Set<number>();
  const layerOf = new Map(col);
  const lpred = new Map<number, number[]>();
  const lsucc = new Map<number, number[]>();
  const link = (a: number, b: number) => {
    if (!lsucc.has(a)) lsucc.set(a, []);
    if (!lpred.has(b)) lpred.set(b, []);
    lsucc.get(a)!.push(b);
    lpred.get(b)!.push(a);
  };
  const chainIds = new Map<number, number[]>();
  for (const k of compEdges) {
    const a = from(k);
    const b = to(k);
    const span = layerOf.get(b)! - layerOf.get(a)!;
    if (span <= 1) {
      link(a, b);
      continue;
    }
    let prev = a;
    const ids: number[] = [];
    for (let c = layerOf.get(a)! + 1; c < layerOf.get(b)!; c++) {
      const d = nextId--;
      dummy.add(d);
      layerOf.set(d, c);
      ids.push(d);
      link(prev, d);
      prev = d;
    }
    link(prev, b);
    chainIds.set(k, ids);
  }

  // ── 4. Reihenfolge je Spalte (Baryzentrum, mehrere Durchläufe)
  let maxCol = 0;
  for (const c of layerOf.values()) maxCol = Math.max(maxCol, c);
  const columns: number[][] = Array.from({ length: maxCol + 1 }, () => []);
  for (const v of [...mem, ...dummy]) columns[layerOf.get(v)!].push(v);
  const pos = new Map<number, number>();
  columns.forEach((c) => c.forEach((v, i) => pos.set(v, i)));
  const sweep = (c: number[], nb: Map<number, number[]>) => {
    const key = new Map<number, number>();
    for (const v of c) {
      const list = nb.get(v) ?? [];
      key.set(v, list.length ? list.reduce((s, w) => s + pos.get(w)!, 0) / list.length : pos.get(v)!);
    }
    c.sort((a, b) => key.get(a)! - key.get(b)! || pos.get(a)! - pos.get(b)!);
    c.forEach((v, i) => pos.set(v, i));
  };
  const iterations = mem.length > 1500 ? 2 : 8;
  for (let it = 0; it < iterations; it++) {
    for (let k = 1; k < columns.length; k++) sweep(columns[k], lpred);
    for (let k = columns.length - 2; k >= 0; k--) sweep(columns[k], lsucc);
  }

  // ── 5. Zeilen: Spalten nacheinander an ihren Nachbarn ausrichten. Jede Spalte wird per
  // gewichteter isotoner Regression so platziert, dass die Knoten möglichst nah an ihren
  // Wunschzeilen liegen, ohne Reihenfolge und Mindestabstände zu verletzen.
  const row = new Map<number, number>();
  const gapBetween = (a: number, b: number) => (dummy.has(a) || dummy.has(b) ? 0.5 : 1);
  const place = (c: number[], wants: number[], weights: number[]) => {
    const offs: number[] = [];
    let g = 0;
    c.forEach((v, i) => {
      if (i) g += gapBetween(c[i - 1], v);
      offs.push(g);
    });
    const blocks: { v: number; w: number; n: number }[] = [];
    c.forEach((_, i) => {
      blocks.push({ v: wants[i] - offs[i], w: weights[i], n: 1 });
      while (blocks.length > 1 && blocks[blocks.length - 2].v > blocks[blocks.length - 1].v) {
        const b = blocks.pop()!;
        const a = blocks[blocks.length - 1];
        const w = a.w + b.w;
        a.v = w > 0 ? (a.v * a.w + b.v * b.w) / w : (a.v + b.v) / 2;
        a.w = w;
        a.n += b.n;
      }
    });
    let i = 0;
    for (const b of blocks) for (let j = 0; j < b.n; j++, i++) row.set(c[i], Math.round((b.v + offs[i]) * 2) / 2);
  };
  const avg = (list: number[]) => {
    const known = list.filter((w) => row.has(w));
    return known.length ? known.reduce((s, w) => s + row.get(w)!, 0) / known.length : null;
  };
  const pass = (c: number[], primary: Map<number, number[]>, keepOthers: boolean) => {
    const wants: number[] = [];
    const weights: number[] = [];
    c.forEach((v, i) => {
      const a = avg(primary.get(v) ?? []);
      if (a !== null && !(keepOthers && row.has(v) && (lpred.get(v) ?? []).length)) {
        wants.push(a);
        weights.push(1);
      } else if (row.has(v)) {
        wants.push(row.get(v)!);
        weights.push(keepOthers ? 4 : 0.05);
      } else {
        wants.push(i);
        weights.push(0.001);
      }
    });
    place(c, wants, weights);
  };
  place(columns[0], columns[0].map(() => 0), columns[0].map(() => 1));
  for (let k = 1; k < columns.length; k++) pass(columns[k], lpred, false);
  // Knoten ohne Vorgänger (Quellen, markierte Startstellen) an ihren Nachfolgern ausrichten
  for (let k = columns.length - 2; k >= 0; k--) pass(columns[k], lsucc, true);
  for (let k = 1; k < columns.length; k++) pass(columns[k], lpred, false);

  // Auf 0 normieren
  let minRow = Infinity;
  let maxRow = -Infinity;
  for (const r of row.values()) {
    minRow = Math.min(minRow, r);
    maxRow = Math.max(maxRow, r);
  }
  for (const [v, r] of row) row.set(v, r - minRow);

  const chains = new Map<number, { col: number; row: number }[]>();
  for (const [k, ids] of chainIds) chains.set(k, ids.map((d) => ({ col: layerOf.get(d)!, row: row.get(d)! })));
  return { col, row, rows: maxRow - minRow + 1, chains, reversed };
}
