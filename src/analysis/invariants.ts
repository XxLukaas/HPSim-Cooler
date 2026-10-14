/**
 * Minimale semipositive P- und T-Invarianten mit dem Farkas-Algorithmus.
 *  - P-Invariante y:  yᵀ · C = 0, y ≥ 0  (gewichtete Markensumme bleibt konstant)
 *  - T-Invariante x:  C · x = 0, x ≥ 0  (Schaltfolge, die zur Ausgangsmarkierung zurückführt)
 */

export interface InvariantResult {
  /** Jede Invariante als Vektor (Länge = Anzahl Stellen bzw. Transitionen) */
  vectors: number[][];
  /** Berechnung wurde wegen Größenbeschränkung abgebrochen */
  incomplete: boolean;
}

function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

function normalize(row: number[]): number[] {
  let g = 0;
  for (const v of row) if (v) g = gcd(g, v);
  return g > 1 ? row.map((v) => v / g) : row;
}

const MAX_ROWS = 4000;
const MAX_VALUE = 2 ** 40;

/**
 * Berechnet die minimalen semipositiven Lösungen von  vᵀ · A = 0  (A: n × m).
 */
export function farkas(a: number[][], n: number, m: number): InvariantResult {
  // Zeilen: [A-Zeile | Einheitsvektor]
  let rows: { d: number[]; v: number[] }[] = [];
  for (let i = 0; i < n; i++) {
    const v = new Array<number>(n).fill(0);
    v[i] = 1;
    rows.push({ d: [...(a[i] ?? new Array(m).fill(0))], v });
  }
  let incomplete = false;
  for (let col = 0; col < m; col++) {
    const next: { d: number[]; v: number[] }[] = [];
    const pos: typeof rows = [];
    const neg: typeof rows = [];
    for (const r of rows) {
      if (r.d[col] === 0) next.push(r);
      else if (r.d[col] > 0) pos.push(r);
      else neg.push(r);
    }
    for (const p of pos) {
      for (const q of neg) {
        const fp = -q.d[col];
        const fq = p.d[col];
        const d = p.d.map((v, i) => v * fp + q.d[i] * fq);
        const v = p.v.map((x, i) => x * fp + q.v[i] * fq);
        const g = [...d, ...v].reduce((acc, x) => (x ? gcd(acc, x) : acc), 0);
        const dn = g > 1 ? d.map((x) => x / g) : d;
        const vn = g > 1 ? v.map((x) => x / g) : v;
        if (vn.some((x) => x > MAX_VALUE)) {
          incomplete = true;
          continue;
        }
        next.push({ d: dn, v: vn });
        if (next.length > MAX_ROWS) {
          incomplete = true;
          break;
        }
      }
      if (next.length > MAX_ROWS) break;
    }
    // Nicht-minimale Träger entfernen
    rows = removeNonMinimal(next);
    if (rows.length > MAX_ROWS) {
      rows = rows.slice(0, MAX_ROWS);
      incomplete = true;
    }
  }
  const vectors = rows.map((r) => normalize(r.v)).filter((v) => v.some((x) => x !== 0));
  // Duplikate entfernen
  const seen = new Set<string>();
  const unique = vectors.filter((v) => {
    const k = v.join(',');
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return { vectors: removeNonMinimalVectors(unique), incomplete };
}

function support(v: number[]): Set<number> {
  const s = new Set<number>();
  v.forEach((x, i) => {
    if (x !== 0) s.add(i);
  });
  return s;
}

function isSubset(a: Set<number>, b: Set<number>): boolean {
  if (a.size > b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

function removeNonMinimal(rows: { d: number[]; v: number[] }[]): { d: number[]; v: number[] }[] {
  const supports = rows.map((r) => support(r.v));
  const keys = rows.map((r) => normalize(r.v).join(','));
  return rows.filter((_, i) => {
    for (let j = 0; j < rows.length; j++) {
      if (i === j) continue;
      if (!isSubset(supports[j], supports[i])) continue;
      if (supports[j].size < supports[i].size) return false;
      if (j < i && keys[j] === keys[i]) return false;
    }
    return true;
  });
}

function removeNonMinimalVectors(vs: number[][]): number[][] {
  return removeNonMinimal(vs.map((v) => ({ d: [], v }))).map((r) => r.v);
}

/** P-Invarianten zur Inzidenzmatrix C (|P| × |T|). */
export function placeInvariants(c: number[][], places: number, transitions: number): InvariantResult {
  return farkas(c, places, transitions);
}

/** T-Invarianten zur Inzidenzmatrix C (|P| × |T|). */
export function transitionInvariants(c: number[][], places: number, transitions: number): InvariantResult {
  const ct = Array.from({ length: transitions }, (_, t) => Array.from({ length: places }, (_, p) => c[p][t]));
  return farkas(ct, transitions, places);
}
