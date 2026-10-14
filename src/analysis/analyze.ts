/**
 * Gesamtanalyse eines Netzes mit verständlichen Erklärungen.
 */
import type { NetDoc } from '../model/types';
import { ARC_INHIBITOR, ARC_NORMAL, ARC_TEST, compileNet, type CompiledNet } from '../sim/engine';
import { placeInvariants, transitionInvariants, type InvariantResult } from './invariants';
import { buildMatrices, type NetMatrices } from './matrix';
import { buildReachabilityGraph, OMEGA, pathTo, stronglyConnectedComponents, type ReachGraph } from './reachability';

export type Verdict = 'yes' | 'no' | 'unknown' | 'info';

export interface Witness {
  label: string;
  /** Schaltfolge (Transitionsindizes) vom Anfangszustand */
  sequence: number[];
  state: number;
}

export interface PropertyResult {
  key: string;
  title: string;
  verdict: Verdict;
  summary: string;
  detail: string;
  help: string;
  witness?: Witness;
}

export interface StructureInfo {
  stateMachine: boolean;
  markedGraph: boolean;
  freeChoice: boolean;
  pure: boolean;
  ordinary: boolean;
  hasTestArcs: boolean;
  hasInhibitorArcs: boolean;
  hasCapacities: boolean;
  timed: boolean;
  conflicts: { place: number; transitions: number[] }[];
  sources: number[];
  sinks: number[];
}

export interface AnalysisReport {
  net: CompiledNet;
  matrices: NetMatrices;
  graph: ReachGraph;
  pInv: InvariantResult;
  tInv: InvariantResult;
  bounds: number[];
  deadlocks: number[];
  deadTransitions: number[];
  liveTransitions: number[] | null;
  scc: number[];
  structure: StructureInfo;
  properties: PropertyResult[];
  durationMs: number;
}

export function analyzeStructure(net: CompiledNet): StructureInfo {
  const P = net.placeIds.length;
  const T = net.transitions.length;
  const preOf = net.transitions.map((tr) => new Set(tr.inputs.filter((a) => a.kind === ARC_NORMAL).map((a) => a.place)));
  const postOf = net.transitions.map((tr) => new Set(tr.outputs.map((a) => a.place)));
  const placeIn: number[][] = Array.from({ length: P }, () => []);
  const placeOut: number[][] = Array.from({ length: P }, () => []);
  net.transitions.forEach((tr, t) => {
    for (const a of tr.inputs) if (a.kind === ARC_NORMAL) placeOut[a.place].push(t);
    for (const a of tr.outputs) placeIn[a.place].push(t);
  });
  const ordinary = net.transitions.every((tr) => tr.inputs.every((a) => a.weight === 1) && tr.outputs.every((a) => a.weight === 1));
  const stateMachine = T > 0 && net.transitions.every((_, t) => preOf[t].size === 1 && postOf[t].size === 1) && ordinary;
  const markedGraph = P > 0 && placeIn.every((l) => l.length === 1) && placeOut.every((l) => l.length === 1) && ordinary;
  let freeChoice = true;
  for (let a = 0; a < T && freeChoice; a++) {
    for (let b = a + 1; b < T; b++) {
      const shared = [...preOf[a]].some((p) => preOf[b].has(p));
      if (!shared) continue;
      const same = preOf[a].size === preOf[b].size && [...preOf[a]].every((p) => preOf[b].has(p));
      if (!same) {
        freeChoice = false;
        break;
      }
    }
  }
  const pure = net.transitions.every((_, t) => [...preOf[t]].every((p) => !postOf[t].has(p)));
  const conflicts = placeOut
    .map((ts, place) => ({ place, transitions: ts }))
    .filter((c) => c.transitions.length > 1);
  return {
    stateMachine,
    markedGraph,
    freeChoice,
    pure,
    ordinary,
    hasTestArcs: net.transitions.some((tr) => tr.inputs.some((a) => a.kind === ARC_TEST)),
    hasInhibitorArcs: net.transitions.some((tr) => tr.inputs.some((a) => a.kind === ARC_INHIBITOR)),
    hasCapacities: net.capacity.some((c) => c > 0),
    timed: net.transitions.some((tr) => tr.timing !== 'immediate'),
    conflicts,
    sources: net.transitions.map((tr, t) => (tr.inputs.length === 0 ? t : -1)).filter((t) => t >= 0),
    sinks: net.transitions.map((tr, t) => (tr.outputs.length === 0 ? t : -1)).filter((t) => t >= 0),
  };
}

const list = (names: string[], max = 6) =>
  names.length <= max ? names.join(', ') : `${names.slice(0, max).join(', ')} und ${names.length - max} weitere`;

export function analyze(doc: NetDoc, maxStates = 5000): AnalysisReport {
  const started = performance.now();
  const net = compileNet(doc);
  const matrices = buildMatrices(net);
  const P = net.placeIds.length;
  const T = net.transitions.length;
  const graph = buildReachabilityGraph(net, maxStates);
  const pInv = placeInvariants(matrices.c, P, T);
  const tInv = transitionInvariants(matrices.c, P, T);
  const structure = analyzeStructure(net);
  const complete = !graph.truncated;
  const tName = (t: number) => net.transitions[t].name;
  const pName = (p: number) => net.placeNames[p];

  const bounds = new Array<number>(P).fill(0);
  for (const m of graph.states) for (let p = 0; p < P; p++) bounds[p] = Math.max(bounds[p], m[p]);

  const deadlocks: number[] = [];
  graph.out.forEach((o, s) => {
    if (o.length === 0) deadlocks.push(s);
  });

  const firedSomewhere = new Set(graph.edges.map((e) => e.t));
  const deadTransitions = net.transitions.map((_, t) => t).filter((t) => !firedSomewhere.has(t));

  const scc = stronglyConnectedComponents(graph.states.length, graph.out, graph.edges);
  let liveTransitions: number[] | null = null;
  if (complete && !graph.hasOmega) {
    let compCount = 0;
    for (const c of scc) if (c + 1 > compCount) compCount = c + 1;
    const terminal = new Array<boolean>(compCount).fill(true);
    for (const e of graph.edges) if (scc[e.from] !== scc[e.to]) terminal[scc[e.from]] = false;
    const inside: Set<number>[] = Array.from({ length: compCount }, () => new Set());
    for (const e of graph.edges) if (scc[e.from] === scc[e.to]) inside[scc[e.from]].add(e.t);
    const terminals = terminal.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
    liveTransitions = net.transitions.map((_, t) => t).filter((t) => terminals.every((c) => inside[c].has(t)));
  }

  const properties: PropertyResult[] = [];
  const stateInfo = `${graph.states.length.toLocaleString('de-DE')} Zustände, ${graph.edges.length.toLocaleString('de-DE')} Übergänge`;

  // Beschränktheit
  {
    const unbounded = bounds.map((b, p) => (b === OMEGA ? p : -1)).filter((p) => p >= 0);
    const k = Math.max(0, ...bounds.filter((b) => b !== OMEGA));
    let verdict: Verdict;
    let summary: string;
    let detail: string;
    if (unbounded.length) {
      verdict = 'no';
      summary = 'Nein – das Netz ist unbeschränkt.';
      detail = `In ${list(unbounded.map(pName))} können beliebig viele Marken entstehen (ω im Überdeckungsgraphen).`;
    } else if (!complete) {
      verdict = 'unknown';
      summary = `Unbekannt – bisher höchstens ${k} Marke(n) je Stelle gefunden.`;
      detail = `Der Zustandsraum ist größer als das Limit von ${graph.maxStates.toLocaleString('de-DE')} Zuständen.`;
    } else {
      verdict = 'yes';
      summary = `Ja – ${k}-beschränkt.`;
      detail = `Keine Stelle enthält jemals mehr als ${k} Marke(n).`;
    }
    properties.push({
      key: 'bounded',
      title: 'Beschränktheit',
      verdict,
      summary,
      detail,
      help: 'Ein Netz ist beschränkt, wenn die Markenzahl jeder Stelle in allen erreichbaren Zuständen eine feste Obergrenze k nicht überschreitet.',
    });
    properties.push({
      key: 'safe',
      title: 'Sicherheit (1-beschränkt)',
      verdict: unbounded.length || (complete && k > 1) ? 'no' : complete ? 'yes' : k > 1 ? 'no' : 'unknown',
      summary: unbounded.length || k > 1 ? `Nein – bis zu ${unbounded.length ? '∞' : k} Marken in einer Stelle.` : complete ? 'Ja – jede Stelle trägt höchstens eine Marke.' : 'Unbekannt.',
      detail: 'Sichere Netze modellieren oft Zustände („an/aus“), bei denen eine Stelle entweder markiert ist oder nicht.',
      help: 'Ein Netz heißt sicher, wenn jede Stelle in jedem erreichbaren Zustand höchstens eine Marke enthält.',
    });
  }

  // Verklemmungsfreiheit
  {
    let verdict: Verdict;
    let summary: string;
    let detail = '';
    let witness: Witness | undefined;
    if (deadlocks.length) {
      verdict = 'no';
      const d = deadlocks[0];
      const seq = pathTo(graph, d);
      summary = `Nein – ${deadlocks.length} toter Zustand${deadlocks.length > 1 ? 'e' : ''} erreichbar.`;
      detail = seq.length
        ? `Kürzeste Schaltfolge in eine Verklemmung: ${seq.map(tName).join(' → ')}`
        : 'Bereits im Anfangszustand ist keine Transition aktiviert.';
      witness = { label: 'Verklemmung nachspielen', sequence: seq, state: d };
      if (graph.hasOmega) detail += ' (Überdeckungsgraph – Ergebnis näherungsweise)';
    } else if (!complete) {
      verdict = 'unknown';
      summary = 'Unbekannt – im untersuchten Teil keine Verklemmung gefunden.';
    } else {
      verdict = 'yes';
      summary = 'Ja – in jedem erreichbaren Zustand kann mindestens eine Transition schalten.';
    }
    properties.push({
      key: 'deadlock',
      title: 'Verklemmungsfreiheit',
      verdict,
      summary,
      detail,
      witness,
      help: 'Eine Verklemmung (Deadlock) ist ein erreichbarer Zustand, in dem keine einzige Transition mehr schalten kann – das System „hängt“.',
    });
  }

  // Tote Transitionen
  properties.push({
    key: 'dead',
    title: 'Tote Transitionen',
    verdict: deadTransitions.length ? (complete ? 'no' : 'unknown') : 'yes',
    summary: deadTransitions.length
      ? `${deadTransitions.length} Transition(en) können nie schalten: ${list(deadTransitions.map(tName))}.`
      : 'Keine – jede Transition kann mindestens einmal schalten.',
    detail: deadTransitions.length && !complete ? 'Da der Zustandsraum nicht vollständig untersucht wurde, könnten sie in unbekannten Zuständen doch schalten.' : '',
    help: 'Eine Transition ist tot, wenn sie in keinem erreichbaren Zustand aktiviert ist. Tote Transitionen deuten oft auf Modellierungsfehler hin.',
  });

  // Lebendigkeit
  {
    let verdict: Verdict;
    let summary: string;
    let detail = '';
    if (liveTransitions === null) {
      verdict = 'unknown';
      summary = graph.hasOmega ? 'Für unbeschränkte Netze nicht entscheidbar mit dem Überdeckungsgraphen.' : 'Unbekannt – Zustandsraum zu groß.';
    } else if (liveTransitions.length === T && T > 0) {
      verdict = 'yes';
      summary = 'Ja – jede Transition kann aus jedem erreichbaren Zustand heraus wieder schalten.';
    } else {
      verdict = 'no';
      const notLive = net.transitions.map((_, t) => t).filter((t) => !liveTransitions!.includes(t));
      summary = `Nein – nicht lebendig: ${list(notLive.map(tName))}.`;
      detail = liveTransitions.length ? `Lebendig sind: ${list(liveTransitions.map(tName))}.` : '';
    }
    properties.push({
      key: 'live',
      title: 'Lebendigkeit',
      verdict,
      summary,
      detail,
      help: 'Ein Netz ist lebendig, wenn jede Transition von jedem erreichbaren Zustand aus irgendwann wieder schalten kann. Lebendige Netze sind insbesondere verklemmungsfrei.',
    });
  }

  // Reversibilität
  {
    let verdict: Verdict = 'unknown';
    let summary = 'Unbekannt – Zustandsraum unvollständig oder unbeschränkt.';
    if (complete && !graph.hasOmega) {
      const all = scc.every((c) => c === scc[0]);
      verdict = all ? 'yes' : 'no';
      summary = all
        ? 'Ja – der Anfangszustand ist von jedem erreichbaren Zustand aus wieder erreichbar.'
        : 'Nein – es gibt Zustände, aus denen das Netz nie in den Anfangszustand zurückkehrt.';
    }
    properties.push({
      key: 'reversible',
      title: 'Reversibilität',
      verdict,
      summary,
      detail: '',
      help: 'Ein Netz ist reversibel (rücksetzbar), wenn man von jedem erreichbaren Zustand wieder zur Anfangsmarkierung gelangen kann – typisch für zyklische Prozesse.',
    });
  }

  // Invarianten
  {
    const covered = new Array<boolean>(P).fill(false);
    for (const v of pInv.vectors) v.forEach((x, p) => x > 0 && (covered[p] = true));
    const allCovered = P > 0 && covered.every(Boolean);
    properties.push({
      key: 'pinv',
      title: 'P-Invarianten',
      verdict: 'info',
      summary: pInv.vectors.length
        ? `${pInv.vectors.length} minimale P-Invariante(n)${allCovered ? ' – alle Stellen überdeckt (strukturell beschränkt, konservativ).' : '.'}`
        : 'Keine P-Invarianten.',
      detail: structure.hasInhibitorArcs || structure.hasTestArcs ? 'Test- und Inhibitorkanten verändern keine Marken und gehen nicht in die Inzidenzmatrix ein.' : '',
      help: 'Eine P-Invariante gewichtet Stellen so, dass die gewichtete Markensumme bei jedem Schalten gleich bleibt (z. B. „Anzahl der Ressourcen ist konstant“).',
    });
    const tCovered = new Array<boolean>(T).fill(false);
    for (const v of tInv.vectors) v.forEach((x, t) => x > 0 && (tCovered[t] = true));
    properties.push({
      key: 'tinv',
      title: 'T-Invarianten',
      verdict: 'info',
      summary: tInv.vectors.length
        ? `${tInv.vectors.length} minimale T-Invariante(n)${T > 0 && tCovered.every(Boolean) ? ' – alle Transitionen überdeckt.' : '.'}`
        : 'Keine T-Invarianten – das Netz kann nicht in eine Markierung zurückkehren.',
      detail: '',
      help: 'Eine T-Invariante gibt an, wie oft jede Transition schalten muss, damit wieder dieselbe Markierung entsteht – sie beschreibt Zyklen des Systems.',
    });
  }

  properties.push({
    key: 'states',
    title: 'Zustandsraum',
    verdict: 'info',
    summary: `${stateInfo}${graph.truncated ? ' (Limit erreicht)' : ''}${graph.hasOmega ? ' – Überdeckungsgraph mit ω' : ''}.`,
    detail: graph.approximate ? 'Achtung: Inhibitorkanten an unbeschränkten Stellen – Ergebnisse sind nur Näherungen.' : '',
    help: 'Der Erreichbarkeitsgraph enthält alle Markierungen, die vom Anfangszustand aus durch Schalten erreichbar sind. Zeitverhalten wird dabei nicht berücksichtigt.',
  });

  return {
    net,
    matrices,
    graph,
    pInv,
    tInv,
    bounds,
    deadlocks,
    deadTransitions,
    liveTransitions,
    scc,
    structure,
    properties,
    durationMs: performance.now() - started,
  };
}
