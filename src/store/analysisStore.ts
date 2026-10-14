/**
 * Zustand des Analysemodus je Tab: letzter Analysebericht, gewählter Zustand
 * im Erreichbarkeitsgraphen und das Zustandslimit.
 */
import { create } from 'zustand';
import { analyze, type AnalysisReport } from '../analysis/analyze';
import { OMEGA } from '../analysis/reachability';
import type { TransVisual } from '../editor/NetRender';
import type { NetDoc } from '../model/types';
import { activeTab, setMode, toast, useApp } from './appStore';
import { ensureSession, replaySequence } from './simStore';

export interface AnalysisSession {
  /** Dokumentstand, auf dem `report` beruht */
  doc: NetDoc;
  report: AnalysisReport | null;
  running: boolean;
  error: string | null;
  maxStates: number;
  /** im Zustandsgraphen gewählter Zustand (wird auf der Zeichenfläche gezeigt) */
  selected: number | null;
}

interface AnalysisStore {
  sessions: Record<string, AnalysisSession>;
}

export const useAnalysis = create<AnalysisStore>(() => ({ sessions: {} }));

const get = useAnalysis.getState;
const set = useAnalysis.setState;

export const STATE_LIMITS = [1000, 5000, 20000, 100000] as const;
export const DEFAULT_LIMIT = 5000;

function patch(tabId: string, p: Partial<AnalysisSession>): void {
  set((s) => {
    const cur = s.sessions[tabId];
    if (!cur) return s;
    return { sessions: { ...s.sessions, [tabId]: { ...cur, ...p } } };
  });
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();

/** Startet die Analyse (asynchron, damit die Oberfläche „läuft …“ zeigen kann). */
export function runAnalysis(tabId: string, doc: NetDoc, maxStates?: number): void {
  const prev = get().sessions[tabId];
  const limit = maxStates ?? prev?.maxStates ?? DEFAULT_LIMIT;
  set((s) => ({
    sessions: {
      ...s.sessions,
      [tabId]: {
        doc,
        report: prev?.report ?? null,
        running: true,
        error: null,
        maxStates: limit,
        selected: prev && prev.doc === doc ? prev.selected : null,
      },
    },
  }));
  const old = timers.get(tabId);
  if (old) clearTimeout(old);
  timers.set(
    tabId,
    setTimeout(() => {
      timers.delete(tabId);
      try {
        const report = analyze(doc, limit);
        const cur = get().sessions[tabId];
        if (!cur || cur.doc !== doc) return;
        const selected = cur.selected !== null && cur.selected < report.graph.states.length ? cur.selected : null;
        patch(tabId, { report, running: false, error: null, selected });
      } catch (err) {
        console.error(err);
        patch(tabId, { running: false, error: err instanceof Error ? err.message : String(err), report: null });
      }
    }, 30),
  );
}

export function selectState(tabId: string, state: number | null): void {
  patch(tabId, { selected: state });
}

/** Geht im Zustandsgraphen vom gewählten Zustand über die Transition zum Nachfolger. */
export function stepAnalysisState(tabId: string, transitionId: string): void {
  const sess = get().sessions[tabId];
  const r = sess?.report;
  if (!sess || !r || sess.selected === null) return;
  const t = r.net.transitions.findIndex((tr) => tr.id === transitionId);
  const e = (r.graph.out[sess.selected] ?? []).map((i) => r.graph.edges[i]).find((ed) => ed.t === t);
  if (e) patch(tabId, { selected: e.to });
  else toast('info', `„${r.net.transitions[t]?.name ?? '?'}“ ist in diesem Zustand nicht aktiviert`);
}

export function dropAnalysis(tabId: string): void {
  if (!get().sessions[tabId]) return;
  set((s) => {
    const next = { ...s.sessions };
    delete next[tabId];
    return { sessions: next };
  });
}

/** Wechselt in die Simulation und spielt eine Schaltfolge vom Anfangszustand aus ab. */
export function playWitness(sequence: number[], label: string): void {
  const tab = activeTab();
  if (!tab) return;
  if (!sequence.length) {
    toast('info', label, 'Der Zustand ist bereits der Anfangszustand – es gibt nichts abzuspielen.');
    setMode('sim');
    return;
  }
  setMode('sim');
  ensureSession(tab.id, tab.doc);
  // Kurz warten, bis der Simulationsmodus aufgebaut ist
  setTimeout(() => replaySequence(tab.id, sequence, label), 60);
}

/** Markierung eines Zustands als Stellen-ID → Marken (ω als Infinity). */
export function stateMarking(report: AnalysisReport, state: number): Record<string, number> {
  const m = report.graph.states[state];
  const res: Record<string, number> = {};
  report.net.placeIds.forEach((id, p) => (res[id] = m?.[p] ?? 0));
  return res;
}

/** Aktivierte Transitionen eines Zustands für die Darstellung auf der Zeichenfläche. */
export function stateVisuals(report: AnalysisReport, state: number): Record<string, TransVisual> {
  const enabled = new Set<number>();
  for (const e of report.graph.out[state] ?? []) enabled.add(report.graph.edges[e].t);
  const res: Record<string, TransVisual> = {};
  report.net.transitions.forEach((tr, t) => {
    res[tr.id] = { status: enabled.has(t) ? 'enabled' : 'disabled', progress: null, fired: 0 };
  });
  return res;
}

export function formatMarkValue(v: number): string {
  return v === OMEGA ? 'ω' : String(v);
}

// Sitzungen geschlossener Tabs entfernen
useApp.subscribe((s, prev) => {
  if (s.tabs === prev.tabs) return;
  for (const id of Object.keys(get().sessions)) if (!s.tabs.some((t) => t.id === id)) dropAnalysis(id);
});
