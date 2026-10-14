/**
 * Simulations-Engine für Stellen/Transitions-Netze mit Kapazitäten,
 * Test- und Inhibitorkanten sowie zeitbehafteten Transitionen.
 *
 * Zeitsemantik (kompatibel zum Original-HPSim):
 *  - Die Simulation läuft in Schritten der Länge Δt („Zeitbasis“).
 *  - Ist eine Transition aktiviert, startet ihr Zeitgeber mit der Verzögerung
 *    (sofort = 0, deterministisch = Verzögerung, exponentiell/gleichverteilt = Zufallswert).
 *  - Pro Schritt wird der Zeitgeber aktivierter Transitionen um Δt verringert.
 *  - Ist der Zeitgeber abgelaufen (≤ 0), schaltet die Transition.
 *  - Wird eine Transition deaktiviert, verfällt ihr Zeitgeber (Neustart bei erneuter Aktivierung).
 *  - Alle schaltbereiten Transitionen schalten im selben Schritt; Konflikte werden
 *    gemäß der Konfliktstrategie aufgelöst. Erzeugte Marken stehen erst im nächsten Schritt zur Verfügung.
 */
import type { CapacityRule, ConflictPolicy, Id, NetDoc, TimingModel } from '../model/types';
import { Rng, randomSeed } from './rng';

export const ARC_NORMAL = 0;
export const ARC_TEST = 1;
export const ARC_INHIBITOR = 2;

export interface InArc {
  arcId: Id;
  place: number;
  weight: number;
  kind: 0 | 1 | 2;
}

export interface OutArc {
  arcId: Id;
  place: number;
  weight: number;
}

export interface CTransition {
  id: Id;
  name: string;
  inputs: InArc[];
  outputs: OutArc[];
  timing: TimingModel;
  delay: number;
  delayMax: number;
  priority: number;
  /** Verbrauch pro Stelle (nur normale Kanten) */
  consume: Map<number, number>;
  /** Produktion pro Stelle */
  produce: Map<number, number>;
}

export interface CompiledNet {
  placeIds: Id[];
  placeNames: string[];
  capacity: number[];
  initial: number[];
  transitions: CTransition[];
  placeIndex: Map<Id, number>;
  transIndex: Map<Id, number>;
  capacityRule: CapacityRule;
}

export interface SimState {
  marking: number[];
  time: number;
  step: number;
  /** verbleibende Verzögerung je Transition, null = Zeitgeber läuft nicht */
  timers: (number | null)[];
  /** Gesamtdauer des laufenden Zeitgebers (für Fortschrittsanzeige) */
  timerTotals: (number | null)[];
  fired: number[];
  consumed: number[];
  inflow: number[];
  rng: number;
  /** ∫ Markierung dt (für zeitgewichteten Mittelwert) */
  integral: number[];
  minMarking: number[];
  maxMarking: number[];
}

export interface FiringRecord {
  t: number;
  consumed: OutArc[];
  produced: OutArc[];
}

export type SimEvent =
  | { kind: 'fire'; t: number }
  | { kind: 'conflict'; place: number; candidates: number[]; winners: number[]; type: 'branch' | 'meet' | 'resource' }
  | { kind: 'deadlock' }
  | { kind: 'limit'; which: 'time' | 'steps' };

export type StepStatus = 'ok' | 'deadlock' | 'time-limit' | 'step-limit';

export interface StepResult {
  state: SimState;
  firings: FiringRecord[];
  events: SimEvent[];
  status: StepStatus;
}

export interface StepOptions {
  timeStep: number;
  conflict: ConflictPolicy;
  maxTime: number;
  maxSteps: number;
}

export function compileNet(doc: NetDoc): CompiledNet {
  const placeIds: Id[] = [];
  const placeNames: string[] = [];
  const capacity: number[] = [];
  const initial: number[] = [];
  const placeIndex = new Map<Id, number>();
  const transIndex = new Map<Id, number>();
  const transitions: CTransition[] = [];
  for (const id of doc.order) {
    const el = doc.elements[id];
    if (el?.type === 'place') {
      placeIndex.set(id, placeIds.length);
      placeIds.push(id);
      placeNames.push(el.name);
      capacity.push(Math.max(0, Math.floor(el.capacity)));
      initial.push(Math.max(0, Math.floor(el.tokens)));
    }
  }
  for (const id of doc.order) {
    const el = doc.elements[id];
    if (el?.type === 'transition') {
      transIndex.set(id, transitions.length);
      transitions.push({
        id,
        name: el.name,
        inputs: [],
        outputs: [],
        timing: el.timing,
        delay: Math.max(0, el.delay),
        delayMax: Math.max(0, el.delayMax),
        priority: el.priority,
        consume: new Map(),
        produce: new Map(),
      });
    }
  }
  for (const id of doc.order) {
    const el = doc.elements[id];
    if (el?.type !== 'arc') continue;
    const w = Math.max(1, Math.floor(el.weight));
    if (placeIndex.has(el.source) && transIndex.has(el.target)) {
      const p = placeIndex.get(el.source)!;
      const t = transitions[transIndex.get(el.target)!];
      const kind = el.kind === 'test' ? ARC_TEST : el.kind === 'inhibitor' ? ARC_INHIBITOR : ARC_NORMAL;
      t.inputs.push({ arcId: el.id, place: p, weight: w, kind });
      if (kind === ARC_NORMAL) t.consume.set(p, (t.consume.get(p) ?? 0) + w);
    } else if (transIndex.has(el.source) && placeIndex.has(el.target)) {
      const p = placeIndex.get(el.target)!;
      const t = transitions[transIndex.get(el.source)!];
      t.outputs.push({ arcId: el.id, place: p, weight: w });
      t.produce.set(p, (t.produce.get(p) ?? 0) + w);
    }
  }
  return {
    placeIds,
    placeNames,
    capacity,
    initial,
    transitions,
    placeIndex,
    transIndex,
    capacityRule: doc.settings.sim.capacityRule,
  };
}

export function initialState(net: CompiledNet, seed: number | null = null): SimState {
  const P = net.placeIds.length;
  const T = net.transitions.length;
  return {
    marking: [...net.initial],
    time: 0,
    step: 0,
    timers: new Array<number | null>(T).fill(null),
    timerTotals: new Array<number | null>(T).fill(null),
    fired: new Array<number>(T).fill(0),
    consumed: new Array<number>(T).fill(0),
    inflow: new Array<number>(P).fill(0),
    rng: seed ?? randomSeed(),
    integral: new Array<number>(P).fill(0),
    minMarking: [...net.initial],
    maxMarking: [...net.initial],
  };
}

export function cloneState(s: SimState): SimState {
  return {
    marking: [...s.marking],
    time: s.time,
    step: s.step,
    timers: [...s.timers],
    timerTotals: [...s.timerTotals],
    fired: [...s.fired],
    consumed: [...s.consumed],
    inflow: [...s.inflow],
    rng: s.rng,
    integral: [...s.integral],
    minMarking: [...s.minMarking],
    maxMarking: [...s.maxMarking],
  };
}

/**
 * Prüft, ob eine Transition unter der Markierung m schalten darf.
 * `pending` enthält Marken, die im laufenden Schritt bereits erzeugt,
 * aber noch nicht verfügbar sind (zählen nur für die Kapazität).
 */
export function isEnabled(net: CompiledNet, t: number, m: number[], pending?: number[]): boolean {
  const tr = net.transitions[t];
  for (const a of tr.inputs) {
    const tokens = m[a.place];
    if (a.kind === ARC_INHIBITOR) {
      if (tokens >= a.weight) return false;
    } else if (tokens < a.weight) {
      return false;
    }
  }
  // Mehrfachverbrauch derselben Stelle (normal + Test auf dieselbe Stelle) berücksichtigen
  for (const [p, w] of tr.consume) {
    if (m[p] < w) return false;
  }
  for (const [p, w] of tr.produce) {
    const cap = net.capacity[p];
    if (cap <= 0) continue;
    const extra = pending ? pending[p] : 0;
    const after =
      net.capacityRule === 'weak' ? m[p] + extra - (tr.consume.get(p) ?? 0) + w : m[p] + extra + w;
    if (after > cap) return false;
  }
  return true;
}

export function enabledTransitions(net: CompiledNet, m: number[]): number[] {
  const res: number[] = [];
  for (let t = 0; t < net.transitions.length; t++) if (isEnabled(net, t, m)) res.push(t);
  return res;
}

export interface EnablingCondition {
  ok: boolean;
  text: string;
}

/** Erklärt in Klartext, warum eine Transition (nicht) schalten kann. */
export function explainEnabling(net: CompiledNet, t: number, s: SimState, timeUnit = 'ZE'): EnablingCondition[] {
  const tr = net.transitions[t];
  const res: EnablingCondition[] = [];
  const m = s.marking;
  if (!tr.inputs.length) {
    res.push({ ok: true, text: 'Keine Eingangsstellen – die Transition ist immer aktiviert (Quelle).' });
  }
  for (const a of tr.inputs) {
    const name = net.placeNames[a.place];
    const tokens = m[a.place];
    if (a.kind === ARC_INHIBITOR) {
      res.push({
        ok: tokens < a.weight,
        text: `Inhibitorkante: „${name}“ hat ${tokens} Marke(n), erlaubt sind höchstens ${a.weight - 1}.`,
      });
    } else {
      res.push({
        ok: tokens >= a.weight,
        text: `${a.kind === ARC_TEST ? 'Testkante' : 'Eingang'}: „${name}“ hat ${tokens} Marke(n), benötigt ${a.weight}.`,
      });
    }
  }
  for (const [p, w] of tr.produce) {
    const cap = net.capacity[p];
    if (cap <= 0) continue;
    const after = net.capacityRule === 'weak' ? m[p] - (tr.consume.get(p) ?? 0) + w : m[p] + w;
    res.push({
      ok: after <= cap,
      text: `Kapazität: „${net.placeNames[p]}“ hätte danach ${after} von max. ${cap} Marken.`,
    });
  }
  const timer = s.timers[t];
  if (tr.timing !== 'immediate') {
    if (timer === null) {
      res.push({ ok: true, text: `Zeitverhalten: ${timingLabel(tr.timing)} – der Zeitgeber startet, sobald die Transition aktiviert ist.` });
    } else if (timer > 1e-9) {
      res.push({
        ok: false,
        text: `Verzögerung läuft: noch ${formatNumber(timer)} ${timeUnit} bis zum Schalten.`,
      });
    } else {
      res.push({ ok: true, text: 'Verzögerung abgelaufen – schaltet im nächsten Schritt.' });
    }
  }
  return res;
}

export function timingLabel(t: TimingModel): string {
  switch (t) {
    case 'immediate':
      return 'Sofort';
    case 'deterministic':
      return 'Deterministisch';
    case 'exponential':
      return 'Exponentialverteilt';
    case 'uniform':
      return 'Gleichverteilt';
  }
}

/**
 * Zahl im deutschen Format; Tausender werden mit schmalem Leerzeichen getrennt
 * („7 075“ statt „7.075“), damit sie nicht mit Dezimalzahlen verwechselt werden.
 */
export function formatNumber(v: number, digits = 2): string {
  if (!Number.isFinite(v)) return v === Infinity ? '∞' : String(v);
  const s = Number.isInteger(v) ? v.toLocaleString('de-DE') : v.toLocaleString('de-DE', { maximumFractionDigits: digits });
  return s.replace(/\./g, '\u202f');
}

function sampleDelay(tr: CTransition, rng: Rng): number {
  switch (tr.timing) {
    case 'immediate':
      return 0;
    case 'deterministic':
      return tr.delay;
    case 'exponential':
      return rng.exponential(tr.delay);
    case 'uniform':
      return rng.uniform(tr.delay, tr.delayMax);
  }
}

function fireInto(net: CompiledNet, t: number, m: number[], pending: number[], s: SimState): FiringRecord {
  const tr = net.transitions[t];
  const consumed: OutArc[] = [];
  const produced: OutArc[] = [];
  for (const a of tr.inputs) {
    if (a.kind !== ARC_NORMAL) continue;
    m[a.place] -= a.weight;
    s.consumed[t] += a.weight;
    consumed.push({ arcId: a.arcId, place: a.place, weight: a.weight });
  }
  for (const a of tr.outputs) {
    pending[a.place] += a.weight;
    s.inflow[a.place] += a.weight;
    produced.push(a);
  }
  s.fired[t] += 1;
  return { t, consumed, produced };
}

function updateExtremes(s: SimState): void {
  for (let p = 0; p < s.marking.length; p++) {
    if (s.marking[p] < s.minMarking[p]) s.minMarking[p] = s.marking[p];
    if (s.marking[p] > s.maxMarking[p]) s.maxMarking[p] = s.marking[p];
  }
}

/** Ein zeitgesteuerter Simulationsschritt. Der Eingabezustand wird nicht verändert. */
export function timedStep(net: CompiledNet, input: SimState, opts: StepOptions): StepResult {
  const s = cloneState(input);
  const rng = new Rng(s.rng);
  const T = net.transitions.length;
  const m = s.marking;
  const events: SimEvent[] = [];
  const firings: FiringRecord[] = [];

  // 1. Aktivierung bestimmen und Zeitgeber verwalten
  const enabled: boolean[] = new Array(T);
  const ready: number[] = [];
  for (let t = 0; t < T; t++) {
    enabled[t] = isEnabled(net, t, m);
    if (!enabled[t]) {
      s.timers[t] = null;
      s.timerTotals[t] = null;
      continue;
    }
    if (s.timers[t] === null) {
      const d = sampleDelay(net.transitions[t], rng);
      s.timers[t] = d;
      s.timerTotals[t] = d;
    }
    if ((s.timers[t] as number) <= 1e-9) ready.push(t);
  }

  // 2. Schaltbereite Transitionen gemäß Konfliktstrategie schalten
  const pending = new Array<number>(net.placeIds.length).fill(0);
  const firedNow = new Set<number>();
  if (ready.length) {
    let candidates: number[];
    if (opts.conflict === 'classic') {
      candidates = resolveClassic(net, ready, rng, events);
    } else {
      candidates = rng.shuffle([...ready]);
      if (opts.conflict === 'priority') {
        candidates.sort((a, b) => net.transitions[b].priority - net.transitions[a].priority);
      }
    }
    const blocked: number[] = [];
    for (const t of candidates) {
      if (isEnabled(net, t, m, pending)) {
        firings.push(fireInto(net, t, m, pending, s));
        events.push({ kind: 'fire', t });
        firedNow.add(t);
        s.timers[t] = null;
        s.timerTotals[t] = null;
      } else {
        blocked.push(t);
      }
    }
    if (blocked.length) {
      // Ressourcenkonflikte protokollieren (gemeinsame Eingangsstellen)
      for (const b of blocked) {
        const shared = net.transitions[b].inputs.find((a) => a.kind === ARC_NORMAL && m[a.place] < a.weight);
        if (!shared) continue;
        const winners = [...firedNow].filter((w) => net.transitions[w].consume.has(shared.place));
        if (winners.length) {
          events.push({ kind: 'conflict', type: 'resource', place: shared.place, candidates: [b, ...winners], winners });
        }
      }
    }
  }

  // 3. Erzeugte Marken verfügbar machen
  for (let p = 0; p < m.length; p++) m[p] += pending[p];

  // 4. Zeitgeber herunterzählen (nur für weiterhin wartende Transitionen)
  const dt = opts.timeStep > 0 ? opts.timeStep : 1;
  for (let t = 0; t < T; t++) {
    if (!enabled[t] || firedNow.has(t)) continue;
    const timer = s.timers[t];
    if (timer !== null && timer > 1e-9) s.timers[t] = timer - dt;
  }

  // 5. Zeit und Statistik fortschreiben (die neue Markierung gilt bis zum nächsten Schritt)
  for (let p = 0; p < m.length; p++) s.integral[p] += m[p] * dt;
  s.time += dt;
  s.step += 1;
  updateExtremes(s);
  s.rng = rng.state;

  let status: StepStatus = 'ok';
  if (!anyEnabled(net, m)) {
    status = 'deadlock';
    events.push({ kind: 'deadlock' });
  } else if (opts.maxSteps > 0 && s.step >= opts.maxSteps) {
    status = 'step-limit';
    events.push({ kind: 'limit', which: 'steps' });
  } else if (opts.maxTime > 0 && s.time >= opts.maxTime - 1e-9) {
    status = 'time-limit';
    events.push({ kind: 'limit', which: 'time' });
  }
  return { state: s, firings, events, status };
}

function anyEnabled(net: CompiledNet, m: number[]): boolean {
  for (let t = 0; t < net.transitions.length; t++) if (isEnabled(net, t, m)) return true;
  return false;
}

/**
 * Konfliktauflösung wie im Original-HPSim: Teilen sich mehrere schaltbereite
 * Transitionen eine Eingangsstelle (Zweig-Konflikt) oder eine Ausgangsstelle
 * (Treff-Konflikt), darf nur eine zufällig gewählte davon schalten.
 */
function resolveClassic(net: CompiledNet, ready: number[], rng: Rng, events: SimEvent[]): number[] {
  const alive = new Set(ready);
  const byPlace = (getPlaces: (t: number) => number[], type: 'branch' | 'meet') => {
    const map = new Map<number, number[]>();
    for (const t of alive) {
      for (const p of getPlaces(t)) {
        if (!map.has(p)) map.set(p, []);
        map.get(p)!.push(t);
      }
    }
    for (const [p, ts] of map) {
      const live = ts.filter((t) => alive.has(t));
      if (live.length < 2) continue;
      const winner = live[rng.int(live.length)];
      for (const t of live) if (t !== winner) alive.delete(t);
      events.push({ kind: 'conflict', type, place: p, candidates: live, winners: [winner] });
    }
  };
  byPlace((t) => net.transitions[t].inputs.filter((a) => a.kind === ARC_NORMAL).map((a) => a.place), 'branch');
  byPlace((t) => net.transitions[t].outputs.map((a) => a.place), 'meet');
  return ready.filter((t) => alive.has(t));
}

/** Schaltet eine Transition sofort (manuelles Token-Spiel). Gibt null zurück, wenn sie nicht aktiviert ist. */
export function fireManually(net: CompiledNet, input: SimState, t: number): StepResult | null {
  if (!isEnabled(net, t, input.marking)) return null;
  const s = cloneState(input);
  const pending = new Array<number>(net.placeIds.length).fill(0);
  const rec = fireInto(net, t, s.marking, pending, s);
  for (let p = 0; p < s.marking.length; p++) s.marking[p] += pending[p];
  s.timers[t] = null;
  s.timerTotals[t] = null;
  // Zeitgeber von Transitionen, die nun nicht mehr aktiviert sind, verfallen lassen
  for (let i = 0; i < net.transitions.length; i++) {
    if (s.timers[i] !== null && !isEnabled(net, i, s.marking)) {
      s.timers[i] = null;
      s.timerTotals[i] = null;
    }
  }
  s.step += 1;
  updateExtremes(s);
  const status: StepStatus = anyEnabled(net, s.marking) ? 'ok' : 'deadlock';
  const events: SimEvent[] = [{ kind: 'fire', t }];
  if (status === 'deadlock') events.push({ kind: 'deadlock' });
  return { state: s, firings: [rec], events, status };
}

/** Klassisches (zeitloses) Token-Spiel: eine zufällig gewählte aktivierte Transition schaltet. */
export function randomInterleavingStep(net: CompiledNet, input: SimState, usePriority: boolean): StepResult {
  const en = enabledTransitions(net, input.marking);
  if (!en.length) {
    return { state: cloneState(input), firings: [], events: [{ kind: 'deadlock' }], status: 'deadlock' };
  }
  const rng = new Rng(input.rng);
  let pool = en;
  if (usePriority) {
    const maxPrio = Math.max(...en.map((t) => net.transitions[t].priority));
    pool = en.filter((t) => net.transitions[t].priority === maxPrio);
  }
  const t = pool[rng.int(pool.length)];
  const res = fireManually(net, { ...input, rng: rng.state }, t)!;
  return res;
}
