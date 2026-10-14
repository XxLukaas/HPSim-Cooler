import type { CompiledNet } from '../sim/engine';
import { ARC_NORMAL } from '../sim/engine';

export interface NetMatrices {
  /** pre[p][t]: Marken, die t aus p verbraucht */
  pre: number[][];
  /** post[p][t]: Marken, die t in p erzeugt */
  post: number[][];
  /** Inzidenzmatrix C = Post − Pre */
  c: number[][];
  /** Test- und Inhibitorkanten (gehen nicht in C ein) */
  test: number[][];
  inhibitor: number[][];
}

export function buildMatrices(net: CompiledNet): NetMatrices {
  const P = net.placeIds.length;
  const T = net.transitions.length;
  const zero = () => Array.from({ length: P }, () => new Array<number>(T).fill(0));
  const pre = zero();
  const post = zero();
  const test = zero();
  const inhibitor = zero();
  net.transitions.forEach((tr, t) => {
    for (const a of tr.inputs) {
      if (a.kind === ARC_NORMAL) pre[a.place][t] += a.weight;
      else if (a.kind === 1) test[a.place][t] += a.weight;
      else inhibitor[a.place][t] += a.weight;
    }
    for (const a of tr.outputs) post[a.place][t] += a.weight;
  });
  const c = pre.map((row, p) => row.map((v, t) => post[p][t] - v));
  return { pre, post, c, test, inhibitor };
}

/** Textexport im Stil der „Export Net“-Funktion des Original-HPSim. */
export function netAsText(net: CompiledNet, title: string): string {
  const { c, test, inhibitor } = buildMatrices(net);
  const lines: string[] = [];
  const pad = (s: string, n: number) => s.padStart(n);
  const w = Math.max(4, ...net.transitions.map((t) => t.name.length)) + 1;
  const pw = Math.max(6, ...net.placeNames.map((n) => n.length)) + 1;
  lines.push(`// Petri-Netz: ${title}`);
  lines.push(`// Erzeugt mit HPSim Studio am ${new Date().toLocaleString('de-DE')}`);
  lines.push('');
  lines.push('// Stellen (Name; Anfangsmarkierung; Kapazität, 0 = unbegrenzt):');
  net.placeNames.forEach((n, p) => lines.push(`${n};${net.initial[p]};${net.capacity[p]}`));
  lines.push('');
  lines.push('// Transitionen (Name; Zeitmodell; Verzögerung; Obergrenze; Priorität):');
  net.transitions.forEach((t) => lines.push(`${t.name};${t.timing};${t.delay};${t.delayMax};${t.priority}`));
  lines.push('');
  lines.push('// Inzidenzmatrix C = Post − Pre (Zeilen: Stellen, Spalten: Transitionen):');
  lines.push(pad('', pw) + net.transitions.map((t) => pad(t.name, w)).join(''));
  c.forEach((row, p) => lines.push(pad(net.placeNames[p], pw) + row.map((v) => pad(String(v), w)).join('')));
  lines.push('');
  lines.push('// Markierungsvektor M0:');
  lines.push('(' + net.initial.join(', ') + ')');
  lines.push('');
  lines.push('// Kantentyp-Matrix (0 = keine, 1 = normal, 2 = Inhibitor, 3 = Test):');
  lines.push(pad('', pw) + net.transitions.map((t) => pad(t.name, w)).join(''));
  net.placeNames.forEach((name, p) => {
    const row = net.transitions.map((tr, t) => {
      if (inhibitor[p][t]) return 2;
      if (test[p][t]) return 3;
      if (tr.inputs.some((a) => a.place === p) || tr.outputs.some((a) => a.place === p)) return 1;
      return 0;
    });
    lines.push(pad(name, pw) + row.map((v) => pad(String(v), w)).join(''));
  });
  lines.push('');
  lines.push('// Zeitmodell-Vektor (1 = sofort, 2 = deterministisch, 3 = exponentiell, 4 = gleichverteilt):');
  const code = { immediate: 1, deterministic: 2, exponential: 3, uniform: 4 } as const;
  lines.push('(' + net.transitions.map((t) => code[t.timing]).join(', ') + ')');
  return lines.join('\r\n') + '\r\n';
}
