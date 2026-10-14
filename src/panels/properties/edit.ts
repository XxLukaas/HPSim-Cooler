/**
 * Änderungs-Helfer des Eigenschaftenbereichs. Jede Änderung läuft über
 * `updateDoc` (ein Rückgängig-Schritt). Schnell aufeinanderfolgende Änderungen
 * desselben Werts (Farbwähler, Schieberegler) werden zu einem einzigen Schritt
 * zusammengefasst.
 */
import type { Draft } from 'immer';
import { contentBounds, rectContains } from '../../model/geometry';
import type { Element, ElementType, Id, NetDoc } from '../../model/types';
import {
  activeTab,
  beginTransient,
  centerOn,
  commitTransient,
  setSelection,
  setUi,
  updateDoc,
  updateFromBase,
  useApp,
} from '../../store/appStore';

export type ElOf<T extends ElementType> = Extract<Element, { type: T }>;

/** Ändert ein Element eines bestimmten Typs (fehlt es oder hat es einen anderen Typ, passiert nichts). */
export function editEl<T extends ElementType>(id: Id, type: T, fn: (el: Draft<ElOf<T>>) => void): void {
  flushCoalesced();
  updateDoc((d) => {
    const el = d.elements[id];
    if (el && el.type === type) fn(el as Draft<ElOf<T>>);
  });
}

/** Ändert alle Elemente eines Typs aus `ids` in einem Rückgängig-Schritt. */
export function editMany<T extends ElementType>(ids: readonly Id[], type: T, fn: (el: Draft<ElOf<T>>) => void): void {
  flushCoalesced();
  updateDoc((d) => {
    for (const id of ids) {
      const el = d.elements[id];
      if (el && el.type === type) fn(el as Draft<ElOf<T>>);
    }
  });
}

export function editDoc(fn: (d: Draft<NetDoc>) => void): void {
  flushCoalesced();
  updateDoc(fn);
}

// ───────────── Zusammengefasste Änderungen ─────────────

let pending: { key: string; tabId: string; timer: ReturnType<typeof setTimeout> } | null = null;

/** Schließt eine laufende zusammengefasste Änderung ab (erzeugt den Rückgängig-Schritt). */
export function flushCoalesced(): void {
  const p = pending;
  if (!p) return;
  pending = null;
  clearTimeout(p.timer);
  if (useApp.getState().activeId === p.tabId) commitTransient();
  else useApp.setState({ transientBase: null });
}

/**
 * Wendet eine Änderung sofort an, fasst aber Folgeänderungen mit gleichem
 * Schlüssel (innerhalb von `delay` ms) zu einem einzigen Rückgängig-Schritt zusammen.
 */
export function coalescedEdit(key: string, fn: (d: Draft<NetDoc>) => void, delay = 450): void {
  const st = useApp.getState();
  const tab = activeTab(st);
  if (!tab) return;
  if (pending && (pending.key !== key || pending.tabId !== tab.id)) flushCoalesced();
  if (!pending) {
    if (useApp.getState().transientBase) {
      // Eine andere Interaktion läuft gerade – dann als normale Änderung
      updateDoc(fn);
      return;
    }
    beginTransient();
  }
  updateFromBase(fn);
  if (pending) clearTimeout(pending.timer);
  pending = { key, tabId: tab.id, timer: setTimeout(flushCoalesced, delay) };
}

export function hasPendingEdit(): boolean {
  return pending !== null;
}

// ───────────── Auswahl & Hervorhebung ─────────────

let ownHighlight = false;

/** Hebt Elemente auf der Zeichenfläche hervor (z. B. beim Überfahren eines Chips). */
export function highlight(ids: Id[]): void {
  ownHighlight = ids.length > 0;
  setUi({ highlight: ids });
}

/** Entfernt nur eine selbst gesetzte Hervorhebung. */
export function clearOwnHighlight(): void {
  if (!ownHighlight) return;
  ownHighlight = false;
  setUi({ highlight: [] });
}

/** Wählt Elemente aus und holt sie in den sichtbaren Bereich, falls sie außerhalb liegen. */
export function selectAndShow(ids: Id[]): void {
  clearOwnHighlight();
  setSelection(ids);
  try {
    const st = useApp.getState();
    const tab = activeTab(st);
    if (!tab) return;
    const b = contentBounds(tab.doc, ids);
    if (!b) return;
    const { view } = tab;
    const { viewport } = st.ui;
    const z = view.zoom > 0 ? view.zoom : 1;
    const visible = { x: -view.x / z, y: -view.y / z, w: viewport.w / z, h: viewport.h / z };
    if (!rectContains(visible, b)) centerOn(ids);
  } catch {
    /* Ansicht unverändert lassen */
  }
}
