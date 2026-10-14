/**
 * Schichtenlayout für den Erreichbarkeitsgraphen: Zustände werden nach ihrer
 * Entfernung (BFS-Tiefe) vom Anfangszustand in Zeilen angeordnet, die
 * Reihenfolge innerhalb einer Zeile wird per Baryzentrum-Verfahren so
 * gewählt, dass sich möglichst wenige Kanten kreuzen.
 */
import type { ReachGraph } from './reachability';

export interface GraphLayout {
  x: number[];
  y: number[];
  width: number;
  height: number;
  layers: number[][];
}

export const NODE_W = 64;
export const NODE_H = 30;
export function layoutReachGraph(g: ReachGraph, nodeW = NODE_W, spacious = false): GraphLayout {
  // Mit Kantenbeschriftungen braucht der Graph mehr Luft
  const GAP_X = spacious ? 64 : 26;
  const GAP_Y = spacious ? 96 : 70;
  const n = g.states.length;
  let maxDepth = 0;
  for (let s = 0; s < n; s++) if (g.depth[s] > maxDepth) maxDepth = g.depth[s];
  const layers: number[][] = Array.from({ length: maxDepth + 1 }, () => []);
  for (let s = 0; s < n; s++) layers[g.depth[s]].push(s);

  // Vorgänger/Nachfolger (ohne Schleifen und Mehrfachkanten)
  const preds: number[][] = Array.from({ length: n }, () => []);
  const succs: number[][] = Array.from({ length: n }, () => []);
  for (const e of g.edges) {
    if (e.from === e.to) continue;
    preds[e.to].push(e.from);
    succs[e.from].push(e.to);
  }

  const pos = new Float64Array(n);
  const assign = () => layers.forEach((l) => l.forEach((s, i) => (pos[s] = i - (l.length - 1) / 2)));
  assign();
  const bary = (s: number, nb: number[][]) => {
    const list = nb[s];
    if (!list.length) return pos[s];
    let sum = 0;
    for (const v of list) sum += pos[v];
    return sum / list.length;
  };
  // Einige Durchläufe abwärts und aufwärts genügen für übersichtliche Bilder
  const sweeps = n > 2000 ? 1 : 4;
  for (let it = 0; it < sweeps; it++) {
    for (let d = 1; d < layers.length; d++) {
      const key = new Map(layers[d].map((s) => [s, bary(s, preds)]));
      layers[d].sort((a, b) => key.get(a)! - key.get(b)! || a - b);
      layers[d].forEach((s, i) => (pos[s] = i - (layers[d].length - 1) / 2));
    }
    for (let d = layers.length - 2; d >= 0; d--) {
      const key = new Map(layers[d].map((s) => [s, bary(s, succs)]));
      layers[d].sort((a, b) => key.get(a)! - key.get(b)! || a - b);
      layers[d].forEach((s, i) => (pos[s] = i - (layers[d].length - 1) / 2));
    }
  }

  // Sehr breite Schichten in mehrere versetzte Zeilen umbrechen, damit der Graph
  // nicht extrem flach wird
  const perRow = Math.max(6, Math.ceil(Math.sqrt(n * 2)));
  const widest = Math.max(1, ...layers.map((l) => Math.min(l.length, perRow)));
  const width = widest * (nodeW + GAP_X) + (nodeW + GAP_X) / 2;
  const x = new Array<number>(n).fill(0);
  const y = new Array<number>(n).fill(0);
  const SUB_GAP = Math.round(GAP_Y * 0.62);
  let top = 30;
  layers.forEach((l) => {
    const rows = Math.ceil(l.length / perRow);
    for (let r = 0; r < rows; r++) {
      const row = l.slice(r * perRow, (r + 1) * perRow);
      const shift = rows > 1 && r % 2 === 1 ? (nodeW + GAP_X) / 2 : 0;
      row.forEach((s, i) => {
        x[s] = width / 2 + (i - (row.length - 1) / 2) * (nodeW + GAP_X) + shift;
        y[s] = top + r * SUB_GAP;
      });
    }
    top += (rows - 1) * SUB_GAP + GAP_Y;
  });
  return { x, y, width, height: top - GAP_Y + 30, layers };
}
