/**
 * Erreichbarkeits- bzw. Überdeckungsgraph (Karp-Miller) eines Netzes.
 * Zeitverhalten wird ignoriert (zugrunde liegendes zeitloses Netz).
 * ω (unbeschränkt) wird als Infinity dargestellt.
 */
import type { CompiledNet } from '../sim/engine';
import { ARC_INHIBITOR, ARC_NORMAL } from '../sim/engine';

export const OMEGA = Infinity;

export interface ReachEdge {
  from: number;
  to: number;
  t: number;
}

export interface ReachGraph {
  states: number[][];
  edges: ReachEdge[];
  /** ausgehende Kanten je Zustand */
  out: number[][];
  parent: (number | null)[];
  parentEdge: (number | null)[];
  depth: number[];
  /** true, wenn das Zustandslimit erreicht wurde (Graph unvollständig) */
  truncated: boolean;
  /** true, wenn ω-Markierungen auftreten (Netz unbeschränkt) */
  hasOmega: boolean;
  /** Ergebnis nur näherungsweise (Inhibitorkanten mit unbeschränkten Stellen) */
  approximate: boolean;
  maxStates: number;
}

export function enabledOmega(net: CompiledNet, t: number, m: number[]): boolean {
  const tr = net.transitions[t];
  for (const a of tr.inputs) {
    const v = m[a.place];
    if (a.kind === ARC_INHIBITOR) {
      if (v >= a.weight) return false;
    } else if (v < a.weight) return false;
  }
  for (const [p, w] of tr.consume) if (m[p] < w) return false;
  for (const [p, w] of tr.produce) {
    const cap = net.capacity[p];
    if (cap <= 0 || m[p] === OMEGA) continue;
    const after = net.capacityRule === 'weak' ? m[p] - (tr.consume.get(p) ?? 0) + w : m[p] + w;
    if (after > cap) return false;
  }
  return true;
}

export function fireOmega(net: CompiledNet, t: number, m: number[]): number[] {
  const res = [...m];
  const tr = net.transitions[t];
  for (const a of tr.inputs) if (a.kind === ARC_NORMAL && res[a.place] !== OMEGA) res[a.place] -= a.weight;
  for (const a of tr.outputs) if (res[a.place] !== OMEGA) res[a.place] += a.weight;
  return res;
}

const keyOf = (m: number[]) => m.map((v) => (v === OMEGA ? 'w' : String(v))).join(',');

export function buildReachabilityGraph(net: CompiledNet, maxStates = 5000, initial?: number[]): ReachGraph {
  const m0 = initial ? [...initial] : [...net.initial];
  const states: number[][] = [m0];
  const index = new Map<string, number>([[keyOf(m0), 0]]);
  const edges: ReachEdge[] = [];
  const out: number[][] = [[]];
  const parent: (number | null)[] = [null];
  const parentEdge: (number | null)[] = [null];
  const depth = [0];
  const queue = [0];
  let truncated = false;
  let hasOmega = false;
  const hasInhibitor = net.transitions.some((tr) => tr.inputs.some((a) => a.kind === ARC_INHIBITOR));
  const T = net.transitions.length;

  let head = 0;
  while (head < queue.length) {
    const s = queue[head++];
    const m = states[s];
    for (let t = 0; t < T; t++) {
      if (!enabledOmega(net, t, m)) continue;
      let next = fireOmega(net, t, m);
      // Karp-Miller-Beschleunigung: überdeckt die neue Markierung einen Vorfahren echt?
      let anc: number | null = s;
      while (anc !== null) {
        const a = states[anc];
        let geq = true;
        let gt = false;
        for (let p = 0; p < next.length; p++) {
          if (next[p] < a[p]) {
            geq = false;
            break;
          }
          if (next[p] > a[p]) gt = true;
        }
        if (geq && gt) {
          next = next.map((v, p) => (v > a[p] && net.capacity[p] <= 0 ? OMEGA : v));
          hasOmega = hasOmega || next.some((v) => v === OMEGA);
        }
        anc = parent[anc];
      }
      const key = keyOf(next);
      let target = index.get(key);
      if (target === undefined) {
        if (states.length >= maxStates) {
          truncated = true;
          continue;
        }
        target = states.length;
        states.push(next);
        index.set(key, target);
        out.push([]);
        parent.push(s);
        parentEdge.push(edges.length);
        depth.push(depth[s] + 1);
        queue.push(target);
      }
      out[s].push(edges.length);
      edges.push({ from: s, to: target, t });
    }
  }
  return {
    states,
    edges,
    out,
    parent,
    parentEdge,
    depth,
    truncated,
    hasOmega,
    approximate: hasOmega && hasInhibitor,
    maxStates,
  };
}

/** Schaltfolge vom Anfangszustand zu einem Zustand (über den BFS-Baum = kürzester Weg). */
export function pathTo(g: ReachGraph, state: number): number[] {
  const seq: number[] = [];
  let s: number | null = state;
  while (s !== null && g.parentEdge[s] !== null) {
    const e = g.edges[g.parentEdge[s]!];
    seq.push(e.t);
    s = g.parent[s];
  }
  return seq.reverse();
}

/** Stark zusammenhängende Komponenten (Tarjan, iterativ). */
export function stronglyConnectedComponents(n: number, out: number[][], edges: ReachEdge[]): number[] {
  const comp = new Array<number>(n).fill(-1);
  const idx = new Array<number>(n).fill(-1);
  const low = new Array<number>(n).fill(0);
  const onStack = new Array<boolean>(n).fill(false);
  const stack: number[] = [];
  let counter = 0;
  let compCount = 0;
  for (let root = 0; root < n; root++) {
    if (idx[root] !== -1) continue;
    const work: [number, number][] = [[root, 0]];
    while (work.length) {
      const frame = work[work.length - 1];
      const [v, i] = frame;
      if (i === 0) {
        idx[v] = low[v] = counter++;
        stack.push(v);
        onStack[v] = true;
      }
      if (i < out[v].length) {
        frame[1]++;
        const w = edges[out[v][i]].to;
        if (idx[w] === -1) {
          work.push([w, 0]);
        } else if (onStack[w]) {
          low[v] = Math.min(low[v], idx[w]);
        }
      } else {
        work.pop();
        if (work.length) {
          const parentV = work[work.length - 1][0];
          low[parentV] = Math.min(low[parentV], low[v]);
        }
        if (low[v] === idx[v]) {
          let w: number;
          do {
            w = stack.pop()!;
            onStack[w] = false;
            comp[w] = compCount;
          } while (w !== v);
          compCount++;
        }
      }
    }
  }
  return comp;
}
