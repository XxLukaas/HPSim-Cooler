/**
 * Zentraler Anwendungszustand: geöffnete Dokumente (Tabs) mit eigener
 * Rückgängig-Historie, Auswahl, Ansicht, Werkzeug und UI-Zustand.
 */
import { produce, type Draft } from 'immer';
import { create } from 'zustand';
import { createDoc, newId } from '../model/defaults';
import { contentBounds } from '../model/geometry';
import { cloneElements, deleteElements, expandGroups } from '../model/ops';
import type { Element, Id, NetDoc } from '../model/types';

export type Tool = 'select' | 'pan' | 'place' | 'transition' | 'arc' | 'text' | 'rect' | 'ellipse' | 'line' | 'poly';
export type Mode = 'edit' | 'sim' | 'analysis';
export type Theme = 'dark' | 'light';

/** Bildschirmkoordinate = Weltkoordinate · zoom + (x, y) */
export interface View {
  x: number;
  y: number;
  zoom: number;
}

export interface DocTab {
  id: string;
  doc: NetDoc;
  fileName: string | null;
  /** Dokumentstand der letzten Speicherung (für „ungespeichert“-Markierung) */
  savedDoc: NetDoc | null;
  past: NetDoc[];
  future: NetDoc[];
  selection: Id[];
  view: View;
  mode: Mode;
  /** Ansicht beim nächsten Messen der Zeichenfläche einpassen */
  fitPending: boolean;
}

export type ToastKind = 'info' | 'success' | 'warning' | 'error';

export interface Toast {
  id: string;
  kind: ToastKind;
  title: string;
  message?: string;
  action?: { label: string; run: () => void };
  duration: number;
}

export type BottomTab = 'log' | 'chart' | 'stats' | 'trace';
export type LeftTab = 'explorer' | 'issues';
export type AnalysisTab = 'overview' | 'graph' | 'invariants' | 'matrix';

export interface DialogRequest {
  id: string;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  extraLabel?: string;
  danger?: boolean;
  resolve: (result: 'confirm' | 'cancel' | 'extra') => void;
}

export interface UiState {
  theme: Theme;
  leftOpen: boolean;
  rightOpen: boolean;
  bottomOpen: boolean;
  leftTab: LeftTab;
  bottomTab: BottomTab;
  analysisTab: AnalysisTab;
  bottomHeight: number;
  rightWidth: number;
  leftWidth: number;
  showStart: boolean;
  helpTopic: string | null;
  commandPalette: boolean;
  shortcutsOpen: boolean;
  settingsOpen: boolean;
  tutorialStep: number | null;
  viewport: { w: number; h: number };
  cursor: { x: number; y: number } | null;
  minimap: boolean;
  hint: string | null;
  /** Hervorgehobene Elemente (z. B. beim Überfahren von Protokolleinträgen) */
  highlight: string[];
}

export interface AppState {
  tabs: DocTab[];
  activeId: string | null;
  tool: Tool;
  toolLocked: boolean;
  clipboard: Element[] | null;
  ui: UiState;
  toasts: Toast[];
  dialog: DialogRequest | null;
  /** Basisdokument einer laufenden Interaktion (z. B. Ziehen) */
  transientBase: NetDoc | null;
}

const MAX_HISTORY = 300;

function loadTheme(): Theme {
  try {
    const t = localStorage.getItem('hpsim-studio:theme');
    if (t === 'light' || t === 'dark') return t;
    if (window.matchMedia?.('(prefers-color-scheme: light)').matches) return 'light';
  } catch {
    /* ohne Speicher weiter */
  }
  return 'dark';
}

const initialUi: UiState = {
  theme: typeof window !== 'undefined' ? loadTheme() : 'dark',
  leftOpen: true,
  rightOpen: true,
  bottomOpen: true,
  leftTab: 'explorer',
  bottomTab: 'log',
  analysisTab: 'overview',
  bottomHeight: 270,
  rightWidth: 320,
  leftWidth: 250,
  showStart: true,
  helpTopic: null,
  commandPalette: false,
  shortcutsOpen: false,
  settingsOpen: false,
  tutorialStep: null,
  viewport: { w: 1000, h: 700 },
  cursor: null,
  minimap: true,
  hint: null,
  highlight: [],
};

export const useApp = create<AppState>(() => ({
  tabs: [],
  activeId: null,
  tool: 'select',
  toolLocked: false,
  clipboard: null,
  ui: initialUi,
  toasts: [],
  dialog: null,
  transientBase: null,
}));

const get = useApp.getState;
const set = useApp.setState;

// ───────────────────────────── Hilfsfunktionen ─────────────────────────────

export function activeTab(state: AppState = get()): DocTab | null {
  return state.tabs.find((t) => t.id === state.activeId) ?? null;
}

export function isDirty(tab: DocTab): boolean {
  return tab.doc !== tab.savedDoc;
}

function patchTab(id: string, patch: Partial<DocTab> | ((t: DocTab) => Partial<DocTab>)): void {
  set((s) => ({
    tabs: s.tabs.map((t) => (t.id === id ? { ...t, ...(typeof patch === 'function' ? patch(t) : patch) } : t)),
  }));
}

function touch(doc: NetDoc): NetDoc {
  return produce(doc, (d) => {
    d.meta.modified = new Date().toISOString();
  });
}

// ───────────────────────────── Tabs ─────────────────────────────

export function openDocument(doc: NetDoc, fileName: string | null = null, saved = false): string {
  const id = newId('tab');
  const tab: DocTab = {
    id,
    doc,
    fileName,
    savedDoc: saved ? doc : null,
    past: [],
    future: [],
    selection: [],
    view: { x: 0, y: 0, zoom: 1 },
    mode: 'edit',
    fitPending: true,
  };
  set((s) => ({ tabs: [...s.tabs, tab], activeId: id, ui: { ...s.ui, showStart: false } }));
  return id;
}

export function newDocument(): string {
  const n = get().tabs.filter((t) => t.doc.meta.title.startsWith('Neues Netz')).length;
  return openDocument(createDoc(n ? `Neues Netz ${n + 1}` : 'Neues Netz'));
}

export function setActive(id: string): void {
  set((s) => ({ activeId: id, ui: { ...s.ui, showStart: false } }));
}

export function closeTabNow(id: string): void {
  set((s) => {
    const idx = s.tabs.findIndex((t) => t.id === id);
    const tabs = s.tabs.filter((t) => t.id !== id);
    let activeId = s.activeId;
    if (activeId === id) activeId = tabs[Math.min(idx, tabs.length - 1)]?.id ?? null;
    return { tabs, activeId, ui: { ...s.ui, showStart: tabs.length === 0 ? true : s.ui.showStart } };
  });
}

export function markSaved(id: string, fileName?: string): void {
  patchTab(id, (t) => ({ savedDoc: t.doc, fileName: fileName ?? t.fileName }));
}

// ───────────────────────────── Dokumentänderungen ─────────────────────────────

/**
 * Ändert das aktive Dokument. Jede Änderung landet in der Rückgängig-Historie.
 * Fehler in der Änderungsfunktion werden abgefangen, das Dokument bleibt dann unverändert.
 */
export function updateDoc(fn: (d: Draft<NetDoc>) => void, tabId?: string): boolean {
  const tab = tabId ? get().tabs.find((t) => t.id === tabId) : activeTab();
  if (!tab) return false;
  let next: NetDoc;
  try {
    next = produce(tab.doc, fn);
  } catch (err) {
    reportError(err, 'Änderung konnte nicht ausgeführt werden');
    return false;
  }
  if (next === tab.doc) return false;
  next = touch(next);
  patchTab(tab.id, (t) => ({
    doc: next,
    past: [...t.past.slice(-MAX_HISTORY + 1), t.doc],
    future: [],
    selection: t.selection.filter((sid) => next.elements[sid]),
  }));
  return true;
}

/** Beginnt eine fortlaufende Änderung (z. B. Ziehen): Zwischenschritte erzeugen keine Historieneinträge. */
export function beginTransient(): void {
  const tab = activeTab();
  if (tab && !get().transientBase) set({ transientBase: tab.doc });
}

export function updateTransient(fn: (d: Draft<NetDoc>) => void): void {
  const tab = activeTab();
  if (!tab) return;
  if (!get().transientBase) set({ transientBase: tab.doc });
  try {
    const next = produce(tab.doc, fn);
    if (next !== tab.doc) patchTab(tab.id, { doc: next });
  } catch (err) {
    reportError(err, 'Änderung konnte nicht ausgeführt werden');
  }
}

/** Wendet eine Änderung auf das Basisdokument der laufenden Interaktion an (ohne Historie). */
export function updateFromBase(fn: (d: Draft<NetDoc>) => void): void {
  const tab = activeTab();
  if (!tab) return;
  let base = get().transientBase;
  if (!base) {
    base = tab.doc;
    set({ transientBase: base });
  }
  try {
    const next = produce(base, fn);
    if (next !== tab.doc) patchTab(tab.id, { doc: next });
  } catch (err) {
    reportError(err, 'Änderung konnte nicht ausgeführt werden');
  }
}

export function commitTransient(): void {
  const base = get().transientBase;
  const tab = activeTab();
  set({ transientBase: null });
  if (!tab || !base || base === tab.doc) return;
  const next = touch(tab.doc);
  patchTab(tab.id, (t) => ({ doc: next, past: [...t.past.slice(-MAX_HISTORY + 1), base], future: [] }));
}

export function cancelTransient(): void {
  const base = get().transientBase;
  const tab = activeTab();
  set({ transientBase: null });
  if (tab && base) patchTab(tab.id, { doc: base });
}

export function undo(): void {
  const tab = activeTab();
  if (!tab || !tab.past.length) return;
  const prev = tab.past[tab.past.length - 1];
  patchTab(tab.id, (t) => ({
    doc: prev,
    past: t.past.slice(0, -1),
    future: [t.doc, ...t.future].slice(0, MAX_HISTORY),
    selection: t.selection.filter((id) => prev.elements[id]),
  }));
}

export function redo(): void {
  const tab = activeTab();
  if (!tab || !tab.future.length) return;
  const next = tab.future[0];
  patchTab(tab.id, (t) => ({
    doc: next,
    past: [...t.past, t.doc].slice(-MAX_HISTORY),
    future: t.future.slice(1),
    selection: t.selection.filter((id) => next.elements[id]),
  }));
}

/** Ersetzt das Dokument (z. B. nach „Neu laden“) als rückgängig machbare Änderung. */
export function replaceDoc(doc: NetDoc): void {
  const tab = activeTab();
  if (!tab) return;
  patchTab(tab.id, (t) => ({ doc, past: [...t.past, t.doc].slice(-MAX_HISTORY), future: [], selection: [] }));
}

// ───────────────────────────── Auswahl ─────────────────────────────

export function setSelection(ids: Iterable<Id>, tabId?: string): void {
  const tab = tabId ? get().tabs.find((t) => t.id === tabId) : activeTab();
  if (!tab) return;
  const expanded = [...expandGroups(tab.doc, ids)].filter((id) => tab.doc.elements[id]);
  const same = expanded.length === tab.selection.length && expanded.every((id, i) => tab.selection[i] === id);
  if (!same) patchTab(tab.id, { selection: expanded });
}

export function toggleSelection(id: Id): void {
  const tab = activeTab();
  if (!tab) return;
  const group = expandGroups(tab.doc, [id]);
  const has = tab.selection.includes(id);
  const next = has ? tab.selection.filter((s) => !group.has(s)) : [...tab.selection, ...[...group].filter((g) => !tab.selection.includes(g))];
  patchTab(tab.id, { selection: next });
}

export function selectAll(): void {
  const tab = activeTab();
  if (tab) patchTab(tab.id, { selection: [...tab.doc.order] });
}

export function clearSelection(): void {
  const tab = activeTab();
  if (tab && tab.selection.length) patchTab(tab.id, { selection: [] });
}

export function deleteSelection(): void {
  const tab = activeTab();
  if (!tab || !tab.selection.length || tab.mode !== 'edit') return;
  const ids = tab.selection;
  updateDoc((d) => {
    deleteElements(d as NetDoc, ids);
  });
  patchTab(tab.id, { selection: [] });
}

// ───────────────────────────── Zwischenablage ─────────────────────────────

const CLIP_MIME = 'hpsim-studio/elements';

export function copySelection(): number {
  const tab = activeTab();
  if (!tab || !tab.selection.length) return 0;
  const els = tab.selection.map((id) => tab.doc.elements[id]).filter(Boolean);
  set({ clipboard: structuredClone(els) });
  try {
    void navigator.clipboard?.writeText(JSON.stringify({ type: CLIP_MIME, elements: els })).catch(() => undefined);
  } catch {
    /* Systemzwischenablage optional */
  }
  return els.length;
}

export function cutSelection(): void {
  if (copySelection()) deleteSelection();
}

let pasteCount = 0;

export function pasteElements(source?: Element[]): void {
  const tab = activeTab();
  const els = source ?? get().clipboard;
  if (!tab || !els?.length || tab.mode !== 'edit') return;
  pasteCount++;
  const offset = 30 * (pasteCount % 6 || 1);
  const copies = cloneElements(tab.doc, els, { x: offset, y: offset });
  if (!copies.length) return;
  updateDoc((d) => {
    for (const el of copies) {
      d.elements[el.id] = el as Draft<Element>;
      d.order.push(el.id);
    }
  });
  setSelection(copies.map((c) => c.id));
}

export function tryParseClipboardText(text: string): Element[] | null {
  try {
    const data = JSON.parse(text);
    if (data?.type === CLIP_MIME && Array.isArray(data.elements)) return data.elements as Element[];
  } catch {
    /* kein HPSim-Inhalt */
  }
  return null;
}

export function duplicateSelection(): void {
  const tab = activeTab();
  if (!tab || !tab.selection.length) return;
  pasteElements(tab.selection.map((id) => tab.doc.elements[id]).filter(Boolean));
}

// ───────────────────────────── Ansicht ─────────────────────────────

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 6;

export function setView(view: View, tabId?: string): void {
  const id = tabId ?? get().activeId;
  if (!id) return;
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.zoom));
  patchTab(id, { view: { x: view.x, y: view.y, zoom } });
}

export function zoomAt(factor: number, screen?: { x: number; y: number }): void {
  const tab = activeTab();
  if (!tab) return;
  const { viewport } = get().ui;
  const sp = screen ?? { x: viewport.w / 2, y: viewport.h / 2 };
  const v = tab.view;
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * factor));
  const wx = (sp.x - v.x) / v.zoom;
  const wy = (sp.y - v.y) / v.zoom;
  setView({ zoom, x: sp.x - wx * zoom, y: sp.y - wy * zoom });
}

export function fitView(tabId?: string, maxZoom = 1.5): void {
  const id = tabId ?? get().activeId;
  const tab = get().tabs.find((t) => t.id === id);
  if (!tab) return;
  const { viewport } = get().ui;
  const b = contentBounds(tab.doc);
  if (!b) {
    patchTab(tab.id, { fitPending: false });
    setView({ x: Math.round(viewport.w / 2 - 400), y: Math.round(viewport.h / 2 - 260), zoom: 1 }, tab.id);
    return;
  }
  const pad = 60;
  if (tab.fitPending) patchTab(tab.id, { fitPending: false });
  const zoom = Math.min(maxZoom, Math.max(MIN_ZOOM, Math.min((viewport.w - pad * 2) / Math.max(b.w, 1), (viewport.h - pad * 2) / Math.max(b.h, 1))));
  setView(
    {
      zoom,
      x: viewport.w / 2 - (b.x + b.w / 2) * zoom,
      y: viewport.h / 2 - (b.y + b.h / 2) * zoom,
    },
    tab.id,
  );
}

export function centerOn(ids: Id[]): void {
  const tab = activeTab();
  if (!tab) return;
  const b = contentBounds(tab.doc, ids);
  if (!b) return;
  const { viewport } = get().ui;
  const zoom = tab.view.zoom;
  setView({ zoom, x: viewport.w / 2 - (b.x + b.w / 2) * zoom, y: viewport.h / 2 - (b.y + b.h / 2) * zoom });
}

// ───────────────────────────── Werkzeug, Modus, UI ─────────────────────────────

export function setTool(tool: Tool, locked = false): void {
  set({ tool, toolLocked: locked });
}

export function setMode(mode: Mode): void {
  const tab = activeTab();
  if (!tab || tab.mode === mode) return;
  // Beim Wechsel in Simulation/Analyse eine große Auswahl aufheben (wirkt sonst unruhig)
  patchTab(tab.id, { mode, selection: mode !== 'edit' && tab.selection.length > 1 ? [] : tab.selection });
  if (mode !== 'edit') set({ tool: 'select' });
  set((s) => ({
    ui: {
      ...s.ui,
      bottomOpen: mode === 'sim' ? true : s.ui.bottomOpen,
      rightOpen: mode === 'analysis' ? true : s.ui.rightOpen,
    },
  }));
}

export function setUi(patch: Partial<UiState>): void {
  set((s) => ({ ui: { ...s.ui, ...patch } }));
  if (patch.theme) {
    try {
      localStorage.setItem('hpsim-studio:theme', patch.theme);
    } catch {
      /* egal */
    }
  }
}

// ───────────────────────────── Meldungen & Dialoge ─────────────────────────────

export function toast(kind: ToastKind, title: string, message?: string, opts: Partial<Pick<Toast, 'action' | 'duration'>> = {}): void {
  const t: Toast = { id: newId('toast'), kind, title, message, duration: opts.duration ?? (kind === 'error' ? 8000 : 4200), action: opts.action };
  set((s) => ({ toasts: [...s.toasts.slice(-4), t] }));
  if (t.duration > 0) setTimeout(() => dismissToast(t.id), t.duration);
}

export function dismissToast(id: string): void {
  set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
}

export function ask(opts: Omit<DialogRequest, 'id' | 'resolve' | 'confirmLabel' | 'cancelLabel'> & { confirmLabel?: string; cancelLabel?: string }): Promise<'confirm' | 'cancel' | 'extra'> {
  return new Promise((resolve) => {
    const prev = get().dialog;
    prev?.resolve('cancel');
    set({
      dialog: {
        id: newId('dlg'),
        confirmLabel: 'OK',
        cancelLabel: 'Abbrechen',
        ...opts,
        resolve: (r) => {
          set({ dialog: null });
          resolve(r);
        },
      },
    });
  });
}

export function reportError(err: unknown, title = 'Unerwarteter Fehler'): void {
  const message = err instanceof Error ? err.message : String(err);
  console.error(title, err);
  toast('error', title, message);
}

// ───────────────────────────── Sitzung sichern/wiederherstellen ─────────────────────────────

const SESSION_KEY = 'hpsim-studio:session';

interface SavedSession {
  version: 1;
  active: number;
  tabs: { doc: NetDoc; fileName: string | null; view: View; dirty: boolean }[];
}

export function saveSession(): void {
  const s = get();
  try {
    const data: SavedSession = {
      version: 1,
      active: Math.max(0, s.tabs.findIndex((t) => t.id === s.activeId)),
      tabs: s.tabs.map((t) => ({ doc: t.doc, fileName: t.fileName, view: t.view, dirty: isDirty(t) })),
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(data));
  } catch {
    /* Speicher voll oder nicht verfügbar – kein Absturz */
  }
}

export function readSavedSession(): SavedSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SavedSession;
    if (data?.version !== 1 || !Array.isArray(data.tabs)) return null;
    return data;
  } catch {
    return null;
  }
}

export function restoreTabs(tabs: { doc: NetDoc; fileName: string | null; view: View; dirty: boolean }[], active: number): void {
  const restored: DocTab[] = tabs.map((t) => ({
    id: newId('tab'),
    doc: t.doc,
    fileName: t.fileName,
    savedDoc: t.dirty ? null : t.doc,
    past: [],
    future: [],
    selection: [],
    view: t.view ?? { x: 0, y: 0, zoom: 1 },
    mode: 'edit',
    fitPending: !t.view,
  }));
  if (!restored.length) return;
  set((s) => ({
    tabs: [...s.tabs, ...restored],
    activeId: restored[Math.min(active, restored.length - 1)].id,
    ui: { ...s.ui, showStart: false },
  }));
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

/** Speichert die Sitzung automatisch (verzögert) bei jeder Änderung an Tabs. */
export function installAutosave(): () => void {
  return useApp.subscribe((s, prev) => {
    if (s.tabs === prev.tabs && s.activeId === prev.activeId) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(saveSession, 800);
  });
}
