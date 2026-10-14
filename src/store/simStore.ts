/**
 * Simulationssitzungen je Dokument-Tab sowie die Ablaufsteuerung
 * (Einzelschritt, Lauf mit Animation, Schnelllauf, Schritt zurück, Token-Spiel).
 */
import { create } from 'zustand';
import type { TransVisual } from '../editor/NetRender';
import type { NetDoc } from '../model/types';
import {
  compileNet,
  formatNumber,
  initialState,
  isEnabled,
  fireManually,
  randomInterleavingStep,
  timedStep,
  type CompiledNet,
  type FiringRecord,
  type SimEvent,
  type SimState,
  type StepResult,
  type StepStatus,
} from '../sim/engine';
import { MarkingHistory } from '../sim/history';
import { randomSeed } from '../sim/rng';
import { toast, updateDoc, useApp } from './appStore';

export type LogKind = 'fire' | 'manual' | 'conflict' | 'deadlock' | 'limit' | 'info' | 'warn';

export interface LogEntry {
  id: number;
  step: number;
  time: number;
  kind: LogKind;
  text: string;
  /** IDs beteiligter Elemente (zum Hervorheben) */
  refs: string[];
}

export interface AnimationBatch {
  id: number;
  start: number;
  duration: number;
  consumed: { arcId: string; weight: number }[];
  produced: { arcId: string; weight: number }[];
}

export type RunMode = 'stopped' | 'running' | 'fast' | 'replay';

export interface SimSession {
  tabId: string;
  doc: NetDoc;
  net: CompiledNet;
  state: SimState;
  past: SimState[];
  history: MarkingHistory;
  log: LogEntry[];
  run: RunMode;
  /** Schritte pro Sekunde im normalen Lauf */
  speed: number;
  animate: boolean;
  status: StepStatus | null;
  display: number[];
  anim: AnimationBatch | null;
  lastFired: number[];
  seed: number;
  version: number;
  /** Laufende Wiedergabe einer Schaltfolge (Analyse → „nachspielen“) */
  replay: number[] | null;
}

interface SimStore {
  sessions: Record<string, SimSession>;
}

export const useSim = create<SimStore>(() => ({ sessions: {} }));
const getS = useSim.getState;
const setS = useSim.setState;

const MAX_PAST = 400;
const MAX_LOG = 3000;
let logCounter = 0;
let animCounter = 0;

function structureKey(net: CompiledNet): string {
  return net.placeIds.join('|') + '#' + net.transitions.map((t) => t.id).join('|');
}

function newSession(tabId: string, doc: NetDoc, prev?: SimSession): SimSession {
  const net = compileNet(doc);
  const seed = doc.settings.sim.seed ?? randomSeed();
  const state = initialState(net, seed);
  const history = new MarkingHistory();
  history.push(0, 0, state.marking, null, true);
  return {
    tabId,
    doc,
    net,
    state,
    past: [],
    history,
    log: [
      {
        id: ++logCounter,
        step: 0,
        time: 0,
        kind: 'info',
        text: `Simulation bereit: ${net.placeIds.length} Stellen, ${net.transitions.length} Transitionen.`,
        refs: [],
      },
    ],
    run: 'stopped',
    speed: prev?.speed ?? 4,
    animate: prev?.animate ?? true,
    status: null,
    display: [...state.marking],
    anim: null,
    lastFired: [],
    seed,
    version: 0,
    replay: null,
  };
}

function patch(tabId: string, fn: (s: SimSession) => Partial<SimSession>): void {
  setS((st) => {
    const cur = st.sessions[tabId];
    if (!cur) return st;
    return { sessions: { ...st.sessions, [tabId]: { ...cur, ...fn(cur), version: cur.version + 1 } } };
  });
}

export function getSession(tabId: string | null | undefined): SimSession | null {
  return tabId ? getS().sessions[tabId] ?? null : null;
}

/** Legt die Sitzung an bzw. passt sie an das aktuelle Dokument an. */
export function ensureSession(tabId: string, doc: NetDoc): SimSession {
  const cur = getS().sessions[tabId];
  if (cur && cur.doc === doc) return cur;
  if (cur) {
    const net = compileNet(doc);
    if (structureKey(net) === structureKey(cur.net)) {
      patch(tabId, () => ({ doc, net }));
      return getS().sessions[tabId];
    }
    stopTimers(tabId);
    const fresh = newSession(tabId, doc, cur);
    fresh.log.push({ id: ++logCounter, step: 0, time: 0, kind: 'warn', text: 'Die Netzstruktur wurde geändert – Simulation zurückgesetzt.', refs: [] });
    setS((st) => ({ sessions: { ...st.sessions, [tabId]: fresh } }));
    return fresh;
  }
  const s = newSession(tabId, doc);
  setS((st) => ({ sessions: { ...st.sessions, [tabId]: s } }));
  return s;
}

export function dropSession(tabId: string): void {
  stopTimers(tabId);
  setS((st) => {
    const sessions = { ...st.sessions };
    delete sessions[tabId];
    return { sessions };
  });
}

// ───────────────────────────── Protokoll ─────────────────────────────

function describeEvents(net: CompiledNet, res: StepResult, kind: LogKind, prevState: SimState): LogEntry[] {
  const out: LogEntry[] = [];
  const s = res.state;
  const time = kind === 'manual' ? prevState.time : prevState.time;
  for (const ev of res.events) {
    out.push(describeEvent(net, ev, res.firings, s.step, time, kind));
  }
  return out.filter(Boolean);
}

function describeEvent(net: CompiledNet, ev: SimEvent, firings: FiringRecord[], step: number, time: number, kind: LogKind): LogEntry {
  const base = { id: ++logCounter, step, time };
  const tn = (t: number) => net.transitions[t].name;
  const pn = (p: number) => net.placeNames[p];
  switch (ev.kind) {
    case 'fire': {
      const f = firings.find((x) => x.t === ev.t);
      const parts: string[] = [];
      if (f?.consumed.length) parts.push('nimmt ' + f.consumed.map((a) => `${a.weight}× ${pn(a.place)}`).join(', '));
      if (f?.produced.length) parts.push('legt ' + f.produced.map((a) => `${a.weight}× ${pn(a.place)}`).join(', '));
      const refs = [net.transitions[ev.t].id, ...(f ? [...f.consumed, ...f.produced].map((a) => net.placeIds[a.place]) : [])];
      return { ...base, kind, text: `${tn(ev.t)} schaltet${parts.length ? ' – ' + parts.join('; ') : ''}`, refs };
    }
    case 'conflict': {
      const kindText = ev.type === 'branch' ? 'Zweig-Konflikt' : ev.type === 'meet' ? 'Treff-Konflikt' : 'Konflikt';
      const losers = ev.candidates.filter((t) => !ev.winners.includes(t));
      return {
        ...base,
        kind: 'conflict',
        text: `${kindText} um „${pn(ev.place)}“: ${ev.winners.map(tn).join(', ')} gewinnt gegen ${losers.map(tn).join(', ')}`,
        refs: [net.placeIds[ev.place], ...ev.candidates.map((t) => net.transitions[t].id)],
      };
    }
    case 'deadlock':
      return { ...base, kind: 'deadlock', text: 'Verklemmung: Keine Transition ist mehr aktiviert.', refs: [] };
    case 'limit':
      return {
        ...base,
        kind: 'limit',
        text: ev.which === 'time' ? 'Zeitlimit erreicht – Simulation angehalten.' : 'Schrittlimit erreicht – Simulation angehalten.',
        refs: [],
      };
  }
}

function appendLog(log: LogEntry[], entries: LogEntry[]): LogEntry[] {
  if (!entries.length) return log;
  const next = log.concat(entries);
  return next.length > MAX_LOG ? next.slice(next.length - MAX_LOG) : next;
}

// ───────────────────────────── Schritte ─────────────────────────────

function animationFor(sess: SimSession, res: StepResult, interval: number): AnimationBatch | null {
  if (!sess.animate || !res.firings.length) return null;
  const duration = Math.min(700, interval * 0.85);
  if (duration < 70) return null;
  return {
    id: ++animCounter,
    start: performance.now(),
    duration,
    consumed: res.firings.flatMap((f) => f.consumed.map((a) => ({ arcId: a.arcId, weight: a.weight }))),
    produced: res.firings.flatMap((f) => f.produced.map((a) => ({ arcId: a.arcId, weight: a.weight }))),
  };
}

/** Wendet ein Schrittergebnis auf die Sitzung an (Historie, Protokoll, Animation). */
function applyResult(tabId: string, res: StepResult, kind: LogKind, interval: number, logFirings = true): void {
  const sess = getSession(tabId);
  if (!sess) return;
  const anim = animationFor(sess, res, interval);
  let display = res.state.marking;
  if (anim) {
    // Während der Animation: Eingangsmarken sind schon unterwegs, Ausgangsmarken noch nicht angekommen
    display = [...sess.state.marking];
    for (const f of res.firings) for (const a of f.consumed) display[a.place] -= a.weight;
    const finalMarking = res.state.marking;
    const animId = anim.id;
    const t = setTimeout(() => {
      const cur = getSession(tabId);
      if (cur?.anim?.id === animId) patch(tabId, () => ({ display: [...finalMarking], anim: null }));
    }, anim.duration);
    animTimers.set(tabId, t);
  }
  sess.history.push(res.state.step, res.state.time, res.state.marking, res.firings.map((f) => f.t));
  const entries = logFirings ? describeEvents(sess.net, res, kind, sess.state) : describeEvents(sess.net, { ...res, events: res.events.filter((e) => e.kind !== 'fire') }, kind, sess.state);
  patch(tabId, (s) => ({
    past: [...s.past.slice(-MAX_PAST + 1), s.state],
    state: res.state,
    status: res.status,
    display,
    anim,
    lastFired: res.firings.map((f) => f.t),
    log: appendLog(s.log, entries),
  }));
}

function stepOptions(doc: NetDoc) {
  const sim = doc.settings.sim;
  return { timeStep: sim.timeStep, conflict: sim.conflict, maxTime: sim.maxTime, maxSteps: sim.maxSteps };
}

function finishAnimation(tabId: string): void {
  const t = animTimers.get(tabId);
  if (t) clearTimeout(t);
  animTimers.delete(tabId);
  const sess = getSession(tabId);
  if (sess?.anim) patch(tabId, (s) => ({ anim: null, display: [...s.state.marking] }));
}

export function simStep(tabId: string): StepStatus | null {
  const sess = getSession(tabId);
  if (!sess) return null;
  finishAnimation(tabId);
  const res = timedStep(sess.net, sess.state, stepOptions(sess.doc));
  applyResult(tabId, res, 'fire', sess.run === 'running' ? 1000 / sess.speed : 650);
  return res.status;
}

export function simFire(tabId: string, transitionId: string): boolean {
  const sess = getSession(tabId);
  if (!sess) return false;
  const t = sess.net.transIndex.get(transitionId);
  if (t === undefined) return false;
  finishAnimation(tabId);
  const res = fireManually(sess.net, sess.state, t);
  if (!res) {
    toast('info', `${sess.net.transitions[t].name} ist nicht aktiviert`, 'Wähle die Transition aus, um im Eigenschaftenbereich zu sehen, was fehlt.');
    return false;
  }
  applyResult(tabId, res, 'manual', 650);
  if (res.status === 'deadlock') toast('warning', 'Verklemmung erreicht', 'Keine Transition ist mehr aktiviert.');
  return true;
}

export function simRandomStep(tabId: string): void {
  const sess = getSession(tabId);
  if (!sess) return;
  finishAnimation(tabId);
  const res = randomInterleavingStep(sess.net, sess.state, sess.doc.settings.sim.conflict === 'priority');
  if (!res.firings.length) {
    patch(tabId, (s) => ({ status: 'deadlock', log: appendLog(s.log, describeEvents(s.net, res, 'manual', s.state)) }));
    toast('warning', 'Verklemmung', 'Keine Transition ist aktiviert.');
    return;
  }
  applyResult(tabId, res, 'manual', 650);
}

export function simBack(tabId: string): void {
  const sess = getSession(tabId);
  if (!sess || !sess.past.length) return;
  stopTimers(tabId);
  const prev = sess.past[sess.past.length - 1];
  sess.history.truncateAfter(prev.step);
  patch(tabId, (s) => ({
    state: prev,
    past: s.past.slice(0, -1),
    display: [...prev.marking],
    anim: null,
    status: null,
    lastFired: [],
    run: 'stopped',
    replay: null,
  }));
}

/** Setzt die Simulation auf die Anfangsmarkierung zurück (fester Startwert → gleiche Zufallsfolge). */
export function simReset(tabId: string): void {
  const sess = getSession(tabId);
  if (!sess) return;
  stopTimers(tabId);
  const fresh = newSession(tabId, sess.doc, sess);
  setS((st) => ({ sessions: { ...st.sessions, [tabId]: fresh } }));
}

/** Übernimmt die aktuelle Markierung als neue Anfangsmarkierung ins Dokument. */
export function adoptMarking(tabId: string): void {
  const sess = getSession(tabId);
  if (!sess) return;
  const marking = sess.state.marking;
  const ids = sess.net.placeIds;
  updateDoc((d) => {
    ids.forEach((id, i) => {
      const el = d.elements[id];
      if (el?.type === 'place') el.tokens = marking[i];
    });
  }, tabId);
  toast('success', 'Markierung übernommen', 'Die aktuelle Markierung ist jetzt die Anfangsmarkierung.');
}

/** Setzt die aktuelle Markenzahl einer Stelle (nur in der Simulation). */
export function setCurrentTokens(tabId: string, placeId: string, tokens: number): void {
  const sess = getSession(tabId);
  if (!sess) return;
  const p = sess.net.placeIndex.get(placeId);
  if (p === undefined) return;
  finishAnimation(tabId);
  const value = Math.max(0, Math.min(1e9, Math.floor(tokens)));
  const state = { ...sess.state, marking: [...sess.state.marking] };
  state.marking[p] = value;
  patch(tabId, (s) => ({
    past: [...s.past.slice(-MAX_PAST + 1), s.state],
    state,
    display: [...state.marking],
    log: appendLog(s.log, [
      { id: ++logCounter, step: state.step, time: state.time, kind: 'info', text: `Marken in „${sess.net.placeNames[p]}“ manuell auf ${value} gesetzt.`, refs: [placeId] },
    ]),
  }));
}

export function setSpeed(tabId: string, speed: number): void {
  patch(tabId, () => ({ speed: Math.max(0.25, Math.min(60, speed)) }));
}

export function setAnimate(tabId: string, animate: boolean): void {
  patch(tabId, () => ({ animate }));
}

export function clearLog(tabId: string): void {
  patch(tabId, () => ({ log: [] }));
}

// ───────────────────────────── Ablaufsteuerung ─────────────────────────────

const runTimers = new Map<string, ReturnType<typeof setTimeout>>();
const animTimers = new Map<string, ReturnType<typeof setTimeout>>();
const rafs = new Map<string, number>();

function stopTimers(tabId: string): void {
  const t = runTimers.get(tabId);
  if (t) clearTimeout(t);
  runTimers.delete(tabId);
  const r = rafs.get(tabId);
  if (r) cancelAnimationFrame(r);
  rafs.delete(tabId);
  const a = animTimers.get(tabId);
  if (a) clearTimeout(a);
  animTimers.delete(tabId);
}

function announceStop(status: StepStatus, sess: SimSession): void {
  const where = `Schritt ${formatNumber(sess.state.step)}, Zeit ${formatNumber(sess.state.time)} ${sess.doc.settings.sim.timeUnit}`;
  if (status === 'deadlock') toast('warning', 'Verklemmung erreicht', `Keine Transition ist mehr aktiviert (${where}).`);
  else if (status === 'step-limit') toast('info', 'Schrittlimit erreicht', where);
  else if (status === 'time-limit') toast('info', 'Zeitlimit erreicht', where);
}

export function simPause(tabId: string): void {
  stopTimers(tabId);
  const sess = getSession(tabId);
  if (!sess) return;
  if (sess.anim) finishAnimation(tabId);
  if (sess.run !== 'stopped') patch(tabId, (s) => ({ run: 'stopped', display: [...s.state.marking], anim: null, replay: null }));
}

export function simRun(tabId: string, mode: 'running' | 'fast'): void {
  const sess = getSession(tabId);
  if (!sess) return;
  stopTimers(tabId);
  if (sess.status === 'deadlock') {
    toast('info', 'Verklemmung', 'Setze die Simulation zurück, um erneut zu starten.');
    return;
  }
  patch(tabId, () => ({ run: mode, status: null, replay: null }));
  if (mode === 'running') runLoop(tabId);
  else fastLoop(tabId);
}

function runLoop(tabId: string): void {
  const sess = getSession(tabId);
  if (!sess || sess.run !== 'running') return;
  let status: StepStatus | null;
  try {
    status = simStep(tabId);
  } catch (err) {
    stopWithError(tabId, err);
    return;
  }
  const after = getSession(tabId);
  if (!after) return;
  if (status && status !== 'ok') {
    patch(tabId, () => ({ run: 'stopped' }));
    announceStop(status, after);
    return;
  }
  runTimers.set(
    tabId,
    setTimeout(() => runLoop(tabId), 1000 / after.speed),
  );
}

function fastLoop(tabId: string): void {
  const startWall = performance.now();
  const startStep = getSession(tabId)?.state.step ?? 0;
  const frame = () => {
    const sess = getSession(tabId);
    if (!sess || sess.run !== 'fast') return;
    const opts = stepOptions(sess.doc);
    let state = sess.state;
    let status: StepStatus = 'ok';
    const entries: LogEntry[] = [];
    const t0 = performance.now();
    let lastFired: number[] = [];
    let past = sess.past;
    try {
      while (performance.now() - t0 < 14) {
        const res = timedStep(sess.net, state, opts);
        sess.history.push(res.state.step, res.state.time, res.state.marking, res.firings.map((f) => f.t));
        for (const ev of res.events) {
          if (ev.kind !== 'fire') entries.push(describeEvent(sess.net, ev, res.firings, res.state.step, state.time, 'fire'));
        }
        state = res.state;
        lastFired = res.firings.map((f) => f.t);
        status = res.status;
        if (status !== 'ok') break;
      }
    } catch (err) {
      stopWithError(tabId, err);
      return;
    }
    past = [...past.slice(-MAX_PAST + 1), sess.state];
    const conflictEntries = entries.filter((e) => e.kind === 'conflict').slice(-20);
    const otherEntries = entries.filter((e) => e.kind !== 'conflict');
    patch(tabId, (s) => ({
      state,
      past,
      display: [...state.marking],
      lastFired,
      status: status === 'ok' ? null : status,
      log: appendLog(s.log, [...conflictEntries, ...otherEntries]),
    }));
    if (status !== 'ok') {
      const s = getSession(tabId)!;
      const secs = (performance.now() - startWall) / 1000;
      patch(tabId, (x) => ({
        run: 'stopped',
        log: appendLog(x.log, [
          {
            id: ++logCounter,
            step: state.step,
            time: state.time,
            kind: 'info',
            text: `Schnelllauf: ${formatNumber(state.step - startStep)} Schritte in ${formatNumber(secs)} s.`,
            refs: [],
          },
        ]),
      }));
      announceStop(status, s);
      return;
    }
    rafs.set(tabId, requestAnimationFrame(frame));
  };
  rafs.set(tabId, requestAnimationFrame(frame));
}

function stopWithError(tabId: string, err: unknown): void {
  stopTimers(tabId);
  patch(tabId, (s) => ({
    run: 'stopped',
    log: appendLog(s.log, [
      { id: ++logCounter, step: s.state.step, time: s.state.time, kind: 'warn', text: `Fehler in der Simulation: ${err instanceof Error ? err.message : String(err)}`, refs: [] },
    ]),
  }));
  toast('error', 'Simulation angehalten', err instanceof Error ? err.message : String(err));
}

/** Spielt eine Schaltfolge (Transitionsindizes) ab dem Anfangszustand ab. */
export function replaySequence(tabId: string, sequence: number[], label = 'Schaltfolge'): void {
  const sess = getSession(tabId);
  if (!sess) return;
  simReset(tabId);
  patch(tabId, (s) => ({
    run: 'replay',
    replay: [...sequence],
    log: appendLog(s.log, [{ id: ++logCounter, step: 0, time: 0, kind: 'info', text: `${label}: ${sequence.length} Schritt(e) werden abgespielt.`, refs: [] }]),
  }));
  const next = () => {
    const cur = getSession(tabId);
    if (!cur || cur.run !== 'replay' || !cur.replay) return;
    if (!cur.replay.length) {
      patch(tabId, () => ({ run: 'stopped', replay: null }));
      toast('success', `${label} abgespielt`);
      return;
    }
    const [t, ...rest] = cur.replay;
    finishAnimation(tabId);
    const res = fireManually(cur.net, cur.state, t);
    if (!res) {
      patch(tabId, () => ({ run: 'stopped', replay: null }));
      toast('warning', 'Wiedergabe abgebrochen', `${cur.net.transitions[t]?.name ?? '?'} ist nicht aktiviert.`);
      return;
    }
    patch(tabId, () => ({ replay: rest }));
    applyResult(tabId, res, 'manual', 900);
    runTimers.set(tabId, setTimeout(next, 900));
  };
  runTimers.set(tabId, setTimeout(next, 300));
}

// ───────────────────────────── Darstellung ─────────────────────────────

/** Visualisierungszustand aller Transitionen (aktiviert, wartend, geschaltet …). */
export function transitionVisuals(sess: SimSession): Record<string, TransVisual> {
  const res: Record<string, TransVisual> = {};
  // Während einer Animation zählt, was gerade zu sehen ist (Marken noch unterwegs)
  const m = sess.anim ? sess.display : sess.state.marking;
  const fired = new Set(sess.lastFired);
  sess.net.transitions.forEach((tr, t) => {
    const timer = sess.state.timers[t];
    const total = sess.state.timerTotals[t];
    let status: TransVisual['status'];
    let progress: number | null = null;
    const enabled = isEnabled(sess.net, t, m);
    if (fired.has(t) && sess.anim) status = 'fired';
    else if (!enabled) status = 'disabled';
    else if (timer !== null && timer > 1e-9) {
      status = 'waiting';
      progress = total && total > 0 ? 1 - timer / total : 0;
    } else if (timer !== null || tr.timing === 'immediate') status = 'ready';
    else status = 'enabled';
    if (status === 'ready' && tr.timing === 'immediate') status = 'enabled';
    res[tr.id] = { status, progress, fired: sess.state.fired[t] };
  });
  // Konflikte: aktivierte Transitionen, die zusammen mehr Marken bräuchten, als vorhanden sind
  const demand = new Map<number, { total: number; ts: number[] }>();
  sess.net.transitions.forEach((tr, t) => {
    const v = res[tr.id];
    if (v.status === 'disabled') return;
    for (const [p, w] of tr.consume) {
      const d = demand.get(p) ?? { total: 0, ts: [] };
      d.total += w;
      d.ts.push(t);
      demand.set(p, d);
    }
  });
  for (const [p, d] of demand) {
    if (d.ts.length > 1 && d.total > m[p]) for (const t of d.ts) res[sess.net.transitions[t].id].conflict = true;
  }
  return res;
}

export function displayMarking(sess: SimSession): Record<string, number> {
  const res: Record<string, number> = {};
  sess.net.placeIds.forEach((id, p) => (res[id] = Math.max(0, sess.display[p] ?? 0)));
  return res;
}

// Simulation automatisch verwalten: beim Wechsel in den Simulationsmodus Sitzung anlegen,
// beim Verlassen anhalten; Dokumentänderungen übernehmen.
let installed = false;
export function installSimSync(): () => void {
  if (installed) return () => undefined;
  installed = true;
  const unsub = useApp.subscribe((s, prev) => {
    if (s.tabs === prev.tabs && s.activeId === prev.activeId) return;
    for (const tab of s.tabs) {
      const sess = getS().sessions[tab.id];
      if (tab.mode === 'sim') {
        if (!sess || sess.doc !== tab.doc) ensureSession(tab.id, tab.doc);
      } else if (sess && sess.run !== 'stopped') {
        simPause(tab.id);
      }
    }
    // Hintergrund-Tabs anhalten
    if (s.activeId !== prev.activeId && prev.activeId) {
      const old = getS().sessions[prev.activeId];
      if (old && old.run !== 'stopped') simPause(prev.activeId);
    }
    // Sitzungen geschlossener Tabs entfernen
    for (const id of Object.keys(getS().sessions)) {
      if (!s.tabs.some((t) => t.id === id)) dropSession(id);
    }
  });
  return () => {
    installed = false;
    unsub();
  };
}
