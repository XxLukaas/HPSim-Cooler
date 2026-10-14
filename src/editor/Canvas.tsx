/**
 * Die interaktive Zeichenfläche: Darstellung, Werkzeuge, Auswahl, Ziehen,
 * Zoomen, Kanten zeichnen, Inline-Bearbeitung und Token-Spiel.
 */
import { CircleDot, GraduationCap, LayoutGrid, Maximize, Minus, MousePointerClick, Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { actionItem, openMenu, SEP, type MenuItem } from '../components/ContextMenu';
import { IconButton } from '../components/ui';
import { createArc, createLine, createPlace, createPoly, createRect, createText, createTransition } from '../model/defaults';
import {
  arcPolyline,
  defaultNameOffset,
  distToPolyline,
  elementBounds,
  polylineMidpoint,
  rectContains,
  rectFromPoints,
  snap,
} from '../model/geometry';
import { canConnect, moveElements } from '../model/ops';
import type { Element, Id, NetDoc, NodeEl, Point, Rect } from '../model/types';
import {
  activeTab,
  beginTransient,
  cancelTransient,
  clearSelection,
  commitTransient,
  fitView,
  setSelection,
  setTool,
  setUi,
  setView,
  toast,
  toggleSelection,
  updateDoc,
  updateFromBase,
  updateTransient,
  useApp,
  zoomAt,
  type Tool,
} from '../store/appStore';
import { displayMarking, getSession, simFire, transitionVisuals, useSim } from '../store/simStore';
import { explainEnabling, formatNumber, timingLabel } from '../sim/engine';
import { Minimap } from './Minimap';
import { NetContent, resolveLabelOffset, type RenderState } from './NetRender';
import { Handles, handlesFor, PreviewLine, SelectionBox, TokenAnimation } from './Overlays';
import { paletteFor } from './palette';

type Drag =
  | { kind: 'pan'; sx: number; sy: number; vx: number; vy: number; moved: boolean; clickId: Id | null }
  | {
      kind: 'move';
      start: Point;
      ids: Id[];
      anchor: Point;
      moved: boolean;
      clickId: Id;
      collapseTo: Id | null;
      snapNet: boolean;
      /** Mittelpunkte anderer Knoten für Hilfslinien */
      others: Point[];
    }
  | { kind: 'rubber'; start: Point; additive: boolean; base: Id[] }
  | { kind: 'arc'; source: Id; sx: number; sy: number; dragged: boolean }
  | { kind: 'handle'; elId: Id; handle: string; start: Point; orig: Element; moved: boolean }
  | { kind: 'label'; owner: Id; label: 'name' | 'secondary' | 'weight'; start: Point; orig: Point; moved: boolean }
  | { kind: 'draw'; tool: 'rect' | 'ellipse' | 'line'; start: Point };

interface Preview {
  guides?: { v: { x: number; y1: number; y2: number } | null; h: { y: number; x1: number; x2: number } | null };
  rubber?: Rect;
  arc?: { from: Point; to: Point; ok: boolean; points: Point[] };
  draw?: { tool: 'rect' | 'ellipse' | 'line'; a: Point; b: Point };
  poly?: Point[];
  hover?: Point;
}

interface Editing {
  id: Id;
  kind: 'name' | 'text';
}

const HINTS: Record<Tool, string> = {
  select: 'Klicken zum Auswählen · Ziehen zum Verschieben · Doppelklick zum Umbenennen · Rechtsklick für Optionen',
  pan: 'Ziehen, um die Ansicht zu verschieben',
  place: 'Klicke auf die Fläche, um eine Stelle zu setzen (Esc = fertig)',
  transition: 'Klicke auf die Fläche, um eine Transition zu setzen (Esc = fertig)',
  arc: 'Von einer Stelle zu einer Transition ziehen (oder umgekehrt) · ins Leere ziehen erzeugt das passende Gegenstück',
  text: 'Klicke, um einen Text zu platzieren',
  rect: 'Ziehe ein Rechteck auf',
  ellipse: 'Ziehe eine Ellipse auf',
  line: 'Ziehe eine Linie',
  poly: 'Klicke Punkte · Doppelklick oder Enter beendet · Klick auf den Startpunkt schließt das Polygon',
};

function elementAt(target: EventTarget | null): { id: Id | null; handle: string | null; label: { owner: Id; kind: 'name' | 'secondary' | 'weight' } | null } {
  const el = target instanceof Element ? target : null;
  const handle = el?.closest('[data-handle]')?.getAttribute('data-handle') ?? null;
  const labelEl = el?.closest('[data-label]');
  const label = labelEl
    ? { owner: labelEl.getAttribute('data-owner')!, kind: labelEl.getAttribute('data-label') as 'name' | 'secondary' | 'weight' }
    : null;
  const id = el?.closest('[data-id]')?.getAttribute('data-id') ?? null;
  return { id, handle, label };
}

function isNodeEl(el: Element | undefined): el is NodeEl {
  return !!el && (el.type === 'place' || el.type === 'transition');
}

export function Canvas() {
  const tab = useApp((s) => activeTab(s));
  const tool = useApp((s) => s.tool);
  const theme = useApp((s) => s.ui.theme);
  const minimap = useApp((s) => s.ui.minimap);
  const viewport = useApp((s) => s.ui.viewport);
  const sess = useSim((s) => (tab ? s.sessions[tab.id] : undefined));
  const p = paletteFor(theme);
  const hostRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const [preview, setPreview] = useState<Preview>({});
  const [editing, setEditing] = useState<Editing | null>(null);
  const [spacePan, setSpacePan] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [arcPending, setArcPending] = useState<{ source: Id; points: Point[] } | null>(null);
  const [polyDraft, setPolyDraft] = useState<Point[] | null>(null);
  const highlightIds = useApp((s) => s.ui.highlight);
  const finishPolyRef = useRef<((pts: Point[], closed: boolean) => void) | null>(null);
  // Touch: aktive Finger und laufende Zwei-Finger-Geste
  const [tip, setTip] = useState<{ id: Id; x: number; y: number } | null>(null);
  const tipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tipId = useRef<Id | null>(null);
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; mid: { x: number; y: number }; view: { x: number; y: number; zoom: number } } | null>(null);

  const doc = tab?.doc ?? null;
  const view = tab?.view ?? { x: 0, y: 0, zoom: 1 };
  const mode = tab?.mode ?? 'edit';

  // Größe der Zeichenfläche beobachten
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setUi({ viewport: { w: Math.round(r.width), h: Math.round(r.height) } });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Ansicht einpassen, sobald die Größe bekannt ist
  useEffect(() => {
    if (tab?.fitPending && viewport.w > 100) fitView(tab.id, 1);
  }, [tab?.fitPending, tab?.id, viewport.w, viewport.h]);

  // Interaktionen beim Werkzeug- oder Moduswechsel abbrechen
  useEffect(() => {
    setArcPending(null);
    setPolyDraft(null);
    setPreview({});
  }, [tool, mode, tab?.id]);

  const toWorld = useCallback(
    (clientX: number, clientY: number): Point => {
      const r = hostRef.current?.getBoundingClientRect();
      const sx = clientX - (r?.left ?? 0);
      const sy = clientY - (r?.top ?? 0);
      return { x: (sx - view.x) / view.zoom, y: (sy - view.y) / view.zoom };
    },
    [view.x, view.y, view.zoom],
  );

  const toScreen = useCallback((w: Point): Point => ({ x: w.x * view.zoom + view.x, y: w.y * view.zoom + view.y }), [view]);

  const snapPt = useCallback(
    (pt: Point, net: boolean, noSnap = false): Point => {
      if (!doc || noSnap) return pt;
      const g = doc.settings.grid;
      if (!(net ? g.snapNet : g.snapDecor)) return pt;
      return { x: snap(pt.x, g.size), y: snap(pt.y, g.size) };
    },
    [doc],
  );

  // ── Darstellung (memoisiert, damit Vorschau-Updates billig bleiben)
  const selectionSet = useMemo(() => new Set(tab?.selection ?? []), [tab?.selection]);
  const highlight = useMemo(() => new Set(highlightIds), [highlightIds]);
  const simVersion = sess?.version;
  const renderState = useMemo<RenderState>(() => {
    const st: RenderState = { selection: selectionSet, highlight };
    if (mode === 'sim' && sess) {
      st.marking = displayMarking(sess);
      st.trans = transitionVisuals(sess);
      if (sess.anim) {
        const set = new Set<string>();
        for (const c of sess.anim.consumed) set.add(c.arcId);
        for (const c of sess.anim.produced) set.add(c.arcId);
        st.activeArcs = set;
      }
    }
    return st;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionSet, highlight, mode, sess, simVersion]);
  const content = useMemo(() => (doc ? <NetContent doc={doc} p={p} state={renderState} /> : null), [doc, p, renderState]);
  const handles = useMemo(() => (doc && mode === 'edit' ? handlesFor(doc, tab?.selection ?? []) : []), [doc, mode, tab?.selection]);

  // ── Zoomen per Mausrad (nicht-passiver Listener)
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const t = activeTab();
      if (!t) return;
      const r = el.getBoundingClientRect();
      const sp = { x: e.clientX - r.left, y: e.clientY - r.top };
      const isMouseWheel = e.deltaX === 0 && Math.abs(e.deltaY) >= 40 && Number.isInteger(e.deltaY) && e.deltaMode === 0;
      if (e.ctrlKey || e.metaKey || isMouseWheel || e.deltaMode !== 0) {
        const delta = e.deltaMode === 1 ? e.deltaY * 20 : e.deltaY;
        const factor = Math.exp(-delta * (e.ctrlKey && !isMouseWheel ? 0.01 : 0.0015));
        zoomAt(factor, sp);
      } else {
        const dx = e.shiftKey ? e.deltaY : e.deltaX;
        const dy = e.shiftKey ? 0 : e.deltaY;
        setView({ ...t.view, x: t.view.x - dx, y: t.view.y - dy });
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // ── Tastatur (Leertaste = Hand, Pfeile = verschieben, Esc, Enter)
  useEffect(() => {
    const typing = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    };
    const down = (e: KeyboardEvent) => {
      if (typing(e) || editing) return;
      if (e.code === 'Space' && !e.repeat) {
        const t = activeTab();
        if (t?.mode === 'sim') return; // Leertaste = Schritt in der Simulation
        setSpacePan(true);
        e.preventDefault();
        return;
      }
      if (e.key === 'Escape') {
        if (dragRef.current) {
          if (dragRef.current.kind === 'move' || dragRef.current.kind === 'handle' || dragRef.current.kind === 'label') cancelTransient();
          dragRef.current = null;
          setPreview({});
          setDragging(false);
        } else if (arcPending || polyDraft) {
          setArcPending(null);
          setPolyDraft(null);
          setPreview({});
        } else if (useApp.getState().tool !== 'select') setTool('select');
        else clearSelection();
        return;
      }
      if (e.key === 'Enter' && polyDraft) {
        finishPolyRef.current?.(polyDraft, false);
        return;
      }
      const t = activeTab();
      if (!t || t.mode !== 'edit' || !t.selection.length) return;
      const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      const dir = arrows[e.key];
      if (dir && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        const step = e.altKey ? 1 : t.doc.settings.grid.size * (e.shiftKey ? 5 : 1);
        const ids = t.selection;
        updateDoc((d) => moveElements(d as NetDoc, ids, dir[0] * step, dir[1] * step));
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpacePan(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    const blur = () => setSpacePan(false);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arcPending, polyDraft, editing]);

  if (!tab || !doc) return <div className="canvas-host" ref={hostRef} />;

  // ─────────────────────────── Aktionen ───────────────────────────

  const createNode = (kind: 'place' | 'transition', at: Point): NodeEl => {
    const pos = snapPt(at, true);
    const el = kind === 'place' ? createPlace(doc, pos) : createTransition(doc, pos);
    updateDoc((d) => {
      d.elements[el.id] = el;
      d.order.push(el.id);
    });
    setSelection([el.id]);
    return el;
  };

  const connect = (source: Id, target: Id, points: Point[] = []): boolean => {
    const cur = activeTab()?.doc;
    if (!cur) return false;
    const check = canConnect(cur, source, target);
    if (!check.ok) {
      toast('warning', 'Verbindung nicht möglich', check.reason);
      return false;
    }
    const arc = createArc(source, target, { points });
    updateDoc((d) => {
      d.elements[arc.id] = arc;
      d.order.push(arc.id);
    });
    setSelection([arc.id]);
    return true;
  };

  /** Kante ins Leere: passendes Gegenstück anlegen und verbinden. */
  const connectToNew = (source: Id, at: Point, points: Point[]) => {
    const cur = activeTab()?.doc;
    const src = cur?.elements[source];
    if (!cur || !isNodeEl(src)) return;
    const pos = snapPt(at, true);
    const node = src.type === 'place' ? createTransition(cur, pos) : createPlace(cur, pos);
    const arc = createArc(source, node.id, { points });
    updateDoc((d) => {
      d.elements[node.id] = node;
      d.order.push(node.id);
      d.elements[arc.id] = arc;
      d.order.push(arc.id);
    });
    setSelection([node.id]);
  };

  const finishPoly = (pts: Point[], closed: boolean) => {
    setPolyDraft(null);
    setPreview({});
    if (pts.length < 2) return;
    const el = createPoly(pts, { closed, filled: closed });
    updateDoc((d) => {
      d.elements[el.id] = el;
      d.order.push(el.id);
    });
    setSelection([el.id]);
    setTool('select');
  };
  finishPolyRef.current = finishPoly;

  // ─────────────────────────── Zeiger-Ereignisse ───────────────────────────

  const pinchInfo = () => {
    const pts = [...touches.current.values()];
    const r = hostRef.current?.getBoundingClientRect();
    const mid = { x: (pts[0].x + pts[1].x) / 2 - (r?.left ?? 0), y: (pts[0].y + pts[1].y) / 2 - (r?.top ?? 0) };
    return { dist: Math.max(10, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)), mid };
  };

  const hideTip = () => {
    if (tipTimer.current) clearTimeout(tipTimer.current);
    tipId.current = null;
    setTip(null);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    hideTip();
    if (e.button === 2) return;
    if (e.pointerType === 'touch') {
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.current.size === 2) {
        // Zwei Finger: laufende Aktion abbrechen und Zoom-Geste starten
        const d = dragRef.current;
        if (d && (d.kind === 'move' || d.kind === 'handle' || d.kind === 'label')) cancelTransient();
        dragRef.current = null;
        setPreview({});
        const info = pinchInfo();
        pinch.current = { ...info, view: { ...view } };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        return;
      }
      if (touches.current.size > 2) return;
    }
    hostRef.current?.focus({ preventScroll: true });
    const w = toWorld(e.clientX, e.clientY);
    const hit = elementAt(e.target);
    const panRequested = e.button === 1 || spacePan || tool === 'pan';
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    if (panRequested || (mode !== 'edit' && !hit.id)) {
      dragRef.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, moved: false, clickId: null };
      setDragging(true);
      return;
    }

    if (mode !== 'edit') {
      // Simulation/Analyse: Klick wählt aus bzw. schaltet Transitionen, Ziehen verschiebt die Ansicht
      dragRef.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, moved: false, clickId: hit.id };
      setDragging(true);
      return;
    }

    // ── Bearbeiten
    if (polyDraft || tool === 'poly') {
      const pt = snapPt(w, false, e.altKey);
      const pts = polyDraft ?? [];
      if (pts.length >= 3 && Math.hypot(pts[0].x - pt.x, pts[0].y - pt.y) * view.zoom < 10) {
        finishPoly(pts, true);
        return;
      }
      if (e.detail >= 2) {
        finishPoly(pts, false);
        return;
      }
      setPolyDraft([...pts, pt]);
      return;
    }

    if (arcPending) {
      const target = hit.id ? doc.elements[hit.id] : undefined;
      if (isNodeEl(target) && target.id !== arcPending.source) {
        connect(arcPending.source, target.id, arcPending.points);
        setArcPending(null);
        setPreview({});
      } else if (!hit.id) {
        setArcPending({ ...arcPending, points: [...arcPending.points, snapPt(w, true, e.altKey)] });
      }
      return;
    }

    if (hit.handle && hit.id === null) {
      const sel = tab.selection[0];
      const el = sel ? doc.elements[sel] : undefined;
      if (el) {
        beginTransient();
        let handle = hit.handle;
        if (handle.startsWith('addbend:') && el.type === 'arc') {
          const idx = Number(handle.split(':')[1]);
          updateTransient((d) => {
            const a = d.elements[el.id];
            if (a?.type === 'arc') a.points.splice(idx, 0, snapPt(w, true, e.altKey));
          });
          handle = `bend:${idx}`;
        } else if (handle.startsWith('addvertex:') && el.type === 'poly') {
          const idx = Number(handle.split(':')[1]);
          updateTransient((d) => {
            const a = d.elements[el.id];
            if (a?.type === 'poly') a.points.splice(idx, 0, snapPt(w, false, e.altKey));
          });
          handle = `vertex:${idx}`;
        }
        dragRef.current = { kind: 'handle', elId: el.id, handle, start: w, orig: structuredClone(el), moved: false };
        setDragging(true);
        return;
      }
    }

    // Beschriftungen verschieben
    if (hit.label && tool === 'select') {
      const owner = doc.elements[hit.label.owner];
      if (owner) {
        let orig: Point = { x: 0, y: 0 };
        if (owner.type === 'place' || owner.type === 'transition') orig = resolveLabelOffset(doc, owner, hit.label.kind === 'name' ? 'name' : 'secondary');
        else if (owner.type === 'arc') {
          if (owner.labelOffset) orig = owner.labelOffset;
          else {
            const s = doc.elements[owner.source];
            const t = doc.elements[owner.target];
            if (isNodeEl(s) && isNodeEl(t)) {
              const mid = polylineMidpoint(arcPolyline(owner, s, t));
              orig = { x: -Math.sin(mid.angle) * 11, y: Math.cos(mid.angle) * 11 };
            }
          }
        }
        if (!tab.selection.includes(owner.id)) setSelection([owner.id]);
        beginTransient();
        dragRef.current = { kind: 'label', owner: owner.id, label: hit.label.kind, start: w, orig, moved: false };
        setDragging(true);
        return;
      }
    }

    const target = hit.id ? doc.elements[hit.id] : undefined;

    if (tool === 'arc') {
      if (isNodeEl(target)) {
        dragRef.current = { kind: 'arc', source: target.id, sx: e.clientX, sy: e.clientY, dragged: false };
        setPreview({ arc: { from: { x: target.x, y: target.y }, to: w, ok: true, points: [] } });
        setDragging(true);
      }
      return;
    }

    if (target) {
      // Element anklicken → auswählen und verschieben
      const additive = e.shiftKey || e.ctrlKey || e.metaKey;
      let collapseTo: Id | null = null;
      if (additive) {
        toggleSelection(target.id);
      } else if (!tab.selection.includes(target.id)) {
        setSelection([target.id]);
      } else {
        collapseTo = target.id;
      }
      const sel = useApp.getState().tabs.find((t) => t.id === tab.id)?.selection ?? [];
      if (!sel.includes(target.id)) return;
      const b = elementBounds(doc, target);
      const anchor = isNodeEl(target) ? { x: target.x, y: target.y } : { x: b.x, y: b.y };
      const selSet = new Set(sel);
      const others: Point[] = [];
      if (isNodeEl(target)) {
        for (const oid of doc.order) {
          const o = doc.elements[oid];
          if (isNodeEl(o) && !selSet.has(oid)) others.push({ x: o.x, y: o.y });
        }
      }
      dragRef.current = {
        kind: 'move',
        start: w,
        ids: sel,
        anchor,
        moved: false,
        clickId: target.id,
        collapseTo,
        snapNet: sel.some((id) => isNodeEl(doc.elements[id])),
        others,
      };
      setDragging(true);
      return;
    }

    // Leere Fläche
    switch (tool) {
      case 'place':
      case 'transition':
        createNode(tool, w);
        return;
      case 'text': {
        const pt = snapPt(w, false, e.altKey);
        const el = createText(pt.x, pt.y, 'Text');
        updateDoc((d) => {
          d.elements[el.id] = el;
          d.order.push(el.id);
        });
        setSelection([el.id]);
        setTool('select');
        setTimeout(() => setEditing({ id: el.id, kind: 'text' }), 20);
        return;
      }
      case 'rect':
      case 'ellipse':
      case 'line':
        dragRef.current = { kind: 'draw', tool, start: snapPt(w, false, e.altKey) };
        setDragging(true);
        return;
      default: {
        const additive = e.shiftKey || e.ctrlKey || e.metaKey;
        if (!additive) clearSelection();
        dragRef.current = { kind: 'rubber', start: w, additive, base: additive ? tab.selection : [] };
        setDragging(true);
      }
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch' && touches.current.has(e.pointerId)) {
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch.current && touches.current.size >= 2) {
        const info = pinchInfo();
        const st = pinch.current;
        const zoom = Math.min(6, Math.max(0.1, st.view.zoom * (info.dist / st.dist)));
        const wx = (st.mid.x - st.view.x) / st.view.zoom;
        const wy = (st.mid.y - st.view.y) / st.view.zoom;
        setView({ zoom, x: info.mid.x - wx * zoom, y: info.mid.y - wy * zoom });
        return;
      }
    }
    const w = toWorld(e.clientX, e.clientY);
    setUi({ cursor: { x: Math.round(w.x), y: Math.round(w.y) } });
    const d = dragRef.current;
    if (!d && e.pointerType !== 'touch') {
      const hid = elementAt(e.target).id;
      if (hid !== tipId.current) {
        tipId.current = hid;
        if (tipTimer.current) clearTimeout(tipTimer.current);
        setTip(null);
        if (hid) {
          const r = hostRef.current?.getBoundingClientRect();
          const x = e.clientX - (r?.left ?? 0);
          const y = e.clientY - (r?.top ?? 0);
          tipTimer.current = setTimeout(() => setTip({ id: hid, x, y }), 650);
        }
      }
    }
    if (!d) {
      if (arcPending) {
        const src = doc.elements[arcPending.source];
        if (isNodeEl(src)) {
          const hit = elementAt(document.elementFromPoint(e.clientX, e.clientY));
          const ok = hit.id ? canConnect(doc, arcPending.source, hit.id).ok : true;
          setPreview({ arc: { from: { x: src.x, y: src.y }, to: w, ok, points: arcPending.points } });
        }
      } else if (polyDraft) {
        setPreview({ poly: polyDraft, hover: snapPt(w, false, e.altKey) });
      }
      return;
    }
    switch (d.kind) {
      case 'pan': {
        const dx = e.clientX - d.sx;
        const dy = e.clientY - d.sy;
        if (!d.moved && Math.hypot(dx, dy) < 4) return;
        d.moved = true;
        setView({ zoom: view.zoom, x: d.vx + dx, y: d.vy + dy });
        return;
      }
      case 'move': {
        const dx0 = w.x - d.start.x;
        const dy0 = w.y - d.start.y;
        if (!d.moved && Math.hypot(dx0, dy0) * view.zoom < 3) return;
        if (!d.moved) beginTransient();
        d.moved = true;
        const raw = { x: d.anchor.x + dx0, y: d.anchor.y + dy0 };
        const target = snapPt(raw, d.snapNet, e.altKey);
        // Hilfslinien: an anderen Knoten ausrichten (hat Vorrang vor dem Raster)
        let guides: Preview['guides'] = undefined;
        if (d.others.length && !e.altKey) {
          const tol = 7 / view.zoom;
          let bx: number | null = null;
          let by: number | null = null;
          let bdx = tol;
          let bdy = tol;
          for (const o of d.others) {
            const ddx = Math.abs(o.x - raw.x);
            const ddy = Math.abs(o.y - raw.y);
            if (ddx < bdx) {
              bdx = ddx;
              bx = o.x;
            }
            if (ddy < bdy) {
              bdy = ddy;
              by = o.y;
            }
          }
          if (bx !== null) target.x = bx;
          if (by !== null) target.y = by;
          if (bx !== null || by !== null) {
            const alignedV = bx !== null ? d.others.filter((o) => Math.abs(o.x - bx!) < 0.5).map((o) => o.y) : [];
            const alignedH = by !== null ? d.others.filter((o) => Math.abs(o.y - by!) < 0.5).map((o) => o.x) : [];
            guides = {
              v: bx !== null ? { x: bx, y1: Math.min(target.y, ...alignedV) - 30, y2: Math.max(target.y, ...alignedV) + 30 } : null,
              h: by !== null ? { y: by, x1: Math.min(target.x, ...alignedH) - 30, x2: Math.max(target.x, ...alignedH) + 30 } : null,
            };
          }
        }
        setPreview(guides ? { guides } : {});
        const dx = target.x - d.anchor.x;
        const dy = target.y - d.anchor.y;
        updateFromBase((draft) => moveElements(draft as NetDoc, d.ids, dx, dy));
        return;
      }
      case 'rubber': {
        const r = rectFromPoints(d.start, w);
        setPreview({ rubber: r });
        return;
      }
      case 'arc': {
        const src = doc.elements[d.source];
        if (!isNodeEl(src)) return;
        if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 6) d.dragged = true;
        const hit = elementAt(document.elementFromPoint(e.clientX, e.clientY));
        const ok = hit.id && hit.id !== d.source ? canConnect(doc, d.source, hit.id).ok : true;
        setPreview({ arc: { from: { x: src.x, y: src.y }, to: w, ok, points: [] } });
        return;
      }
      case 'handle': {
        d.moved = true;
        const o = d.orig;
        const net = o.type === 'arc';
        const pt = snapPt(w, net, e.altKey);
        updateTransient((draft) => {
          const el = draft.elements[d.elId];
          if (!el) return;
          const [kind, idxStr] = d.handle.split(':');
          const idx = Number(idxStr);
          if (el.type === 'arc' && kind === 'bend' && el.points[idx]) el.points[idx] = pt;
          else if (el.type === 'poly' && kind === 'vertex' && el.points[idx]) el.points[idx] = pt;
          else if (el.type === 'line' && kind === 'end') {
            if (idx === 0) {
              el.x1 = pt.x;
              el.y1 = pt.y;
            } else {
              el.x2 = pt.x;
              el.y2 = pt.y;
            }
          } else if (el.type === 'rect' && kind === 'resize' && o.type === 'rect') {
            let x1 = o.x;
            let y1 = o.y;
            let x2 = o.x + o.w;
            let y2 = o.y + o.h;
            if (idxStr.includes('w')) x1 = pt.x;
            if (idxStr.includes('e')) x2 = pt.x;
            if (idxStr.includes('n')) y1 = pt.y;
            if (idxStr.includes('s')) y2 = pt.y;
            if (e.shiftKey && el.shape === 'ellipse') {
              const size = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
              if (idxStr.includes('e') || idxStr.includes('w')) y2 = y1 + size;
              else x2 = x1 + size;
            }
            el.x = Math.min(x1, x2);
            el.y = Math.min(y1, y2);
            el.w = Math.max(4, Math.abs(x2 - x1));
            el.h = Math.max(4, Math.abs(y2 - y1));
          }
        });
        return;
      }
      case 'label': {
        d.moved = true;
        const off = { x: Math.round(d.orig.x + w.x - d.start.x), y: Math.round(d.orig.y + w.y - d.start.y) };
        updateTransient((draft) => {
          const el = draft.elements[d.owner];
          if (!el) return;
          if (el.type === 'place') {
            if (d.label === 'name') el.nameOffset = off;
            else el.capOffset = off;
          } else if (el.type === 'transition') {
            if (d.label === 'name') el.nameOffset = off;
            else el.delayOffset = off;
          } else if (el.type === 'arc') el.labelOffset = off;
        });
        return;
      }
      case 'draw': {
        setPreview({ draw: { tool: d.tool, a: d.start, b: snapPt(w, false, e.altKey) } });
        return;
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') {
      touches.current.delete(e.pointerId);
      if (pinch.current) {
        if (touches.current.size < 2) pinch.current = null;
        dragRef.current = null;
        setDragging(false);
        return;
      }
    }
    const d = dragRef.current;
    dragRef.current = null;
    setDragging(false);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* bereits freigegeben */
    }
    if (!d) return;
    const w = toWorld(e.clientX, e.clientY);
    switch (d.kind) {
      case 'pan':
        if (!d.moved) {
          if (d.clickId) {
            const el = doc.elements[d.clickId];
            setSelection([d.clickId]);
            if (mode === 'sim' && el?.type === 'transition') simFire(tab.id, el.id);
          } else clearSelection();
        }
        return;
      case 'move':
        setPreview({});
        if (d.moved) commitTransient();
        else if (d.collapseTo && tab.selection.length > 1) setSelection([d.collapseTo]);
        return;
      case 'rubber': {
        setPreview({});
        const r = rectFromPoints(d.start, w);
        if (r.w * view.zoom < 3 && r.h * view.zoom < 3) return;
        const ids = doc.order.filter((id) => {
          const el = doc.elements[id];
          return el && rectContains(r, elementBounds(doc, el));
        });
        setSelection([...new Set([...d.base, ...ids])]);
        return;
      }
      case 'arc': {
        setPreview({});
        const hit = elementAt(document.elementFromPoint(e.clientX, e.clientY));
        const target = hit.id ? doc.elements[hit.id] : undefined;
        if (isNodeEl(target) && target.id !== d.source) {
          connect(d.source, target.id);
        } else if (!d.dragged) {
          // Klick-Klick-Modus
          setArcPending({ source: d.source, points: [] });
        } else if (!target) {
          connectToNew(d.source, w, []);
        }
        return;
      }
      case 'handle':
      case 'label':
        if (d.moved) commitTransient();
        else cancelTransient();
        return;
      case 'draw': {
        setPreview({});
        const b = snapPt(w, false, e.altKey);
        const small = Math.abs(b.x - d.start.x) * view.zoom < 6 && Math.abs(b.y - d.start.y) * view.zoom < 6;
        let el: Element;
        if (d.tool === 'line') {
          el = small ? createLine(d.start.x, d.start.y, d.start.x + 120, d.start.y) : createLine(d.start.x, d.start.y, b.x, b.y);
        } else {
          const r = small ? { x: d.start.x, y: d.start.y, w: 180, h: 110 } : rectFromPoints(d.start, b);
          el = createRect(r.x, r.y, Math.max(4, r.w), Math.max(4, r.h), { shape: d.tool === 'ellipse' ? 'ellipse' : 'roundrect' });
        }
        updateDoc((draft) => {
          draft.elements[el.id] = el;
          draft.order.unshift(el.id);
        });
        setSelection([el.id]);
        setTool('select');
        return;
      }
    }
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    if (mode !== 'edit' || polyDraft) return;
    const hit = elementAt(e.target);
    const w = toWorld(e.clientX, e.clientY);
    if (hit.handle && !hit.id) {
      const sel = tab.selection[0];
      const [kind, idxStr] = hit.handle.split(':');
      const idx = Number(idxStr);
      updateDoc((d) => {
        const el = d.elements[sel];
        if (el?.type === 'arc' && kind === 'bend') el.points.splice(idx, 1);
        if (el?.type === 'poly' && kind === 'vertex' && el.points.length > 2) el.points.splice(idx, 1);
      });
      return;
    }
    const el = hit.id ? doc.elements[hit.id] : hit.label ? doc.elements[hit.label.owner] : undefined;
    if (!el) return;
    if (el.type === 'place' || el.type === 'transition') {
      setSelection([el.id]);
      setEditing({ id: el.id, kind: 'name' });
    } else if (el.type === 'text') {
      setSelection([el.id]);
      setEditing({ id: el.id, kind: 'text' });
    } else if (el.type === 'arc') {
      const s = doc.elements[el.source];
      const t = doc.elements[el.target];
      if (!isNodeEl(s) || !isNodeEl(t)) return;
      const pts = arcPolyline(el, s, t);
      const { segment } = distToPolyline(w, pts);
      updateDoc((d) => {
        const a = d.elements[el.id];
        if (a?.type === 'arc') a.points.splice(segment, 0, snapPt(w, true));
      });
      setSelection([el.id]);
    }
  };

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const hit = elementAt(e.target);
    const w = toWorld(e.clientX, e.clientY);
    const id = hit.id ?? hit.label?.owner ?? null;
    if (id && !tab.selection.includes(id)) setSelection([id]);
    openMenu(e.clientX, e.clientY, contextItems(id, w));
  };

  const contextItems = (id: Id | null, w: Point): MenuItem[] => {
    const el = id ? doc.elements[id] : undefined;
    if (mode === 'sim') {
      const items: MenuItem[] = [];
      if (el?.type === 'transition') items.push({ label: `„${el.name}“ schalten`, icon: MousePointerClick, run: () => simFire(tab.id, el.id) });
      items.push(actionItem('sim.step'), actionItem('sim.run'), actionItem('sim.back'), actionItem('sim.reset'), SEP, actionItem('view.fit'), actionItem('mode.edit'));
      return items;
    }
    if (mode === 'analysis') return [actionItem('view.fit'), actionItem('mode.edit'), actionItem('mode.sim')];
    if (!el) {
      return [
        { label: 'Stelle hier einfügen', icon: CircleDot, run: () => createNode('place', w) },
        { label: 'Transition hier einfügen', icon: LayoutGrid, run: () => createNode('transition', w) },
        SEP,
        actionItem('edit.paste'),
        actionItem('edit.selectAll'),
        SEP,
        actionItem('view.fit'),
        actionItem('view.grid'),
        actionItem('edit.docSettings'),
      ];
    }
    const items: MenuItem[] = [];
    if (el.type === 'place' || el.type === 'transition') {
      items.push({ label: 'Umbenennen', shortcut: 'Doppelklick', run: () => setEditing({ id: el.id, kind: 'name' }) });
    }
    if (el.type === 'place') {
      items.push(
        { label: 'Marke hinzufügen', icon: Plus, run: () => updateDoc((d) => { const p = d.elements[el.id]; if (p?.type === 'place') p.tokens += 1; }) },
        { label: 'Marke entfernen', icon: Minus, disabled: el.tokens <= 0, run: () => updateDoc((d) => { const p = d.elements[el.id]; if (p?.type === 'place' && p.tokens > 0) p.tokens -= 1; }) },
      );
    }
    if (el.type === 'transition') {
      items.push(actionItem('arrange.rotate'), {
        label: 'Zeitverhalten',
        children: (['immediate', 'deterministic', 'exponential', 'uniform'] as const).map((tm) => ({
          label: { immediate: 'Sofort', deterministic: 'Deterministisch', exponential: 'Exponentialverteilt', uniform: 'Gleichverteilt' }[tm],
          checked: el.timing === tm,
          run: () => updateDoc((d) => { const t = d.elements[el.id]; if (t?.type === 'transition') t.timing = tm; }),
        })),
      });
    }
    if (el.type === 'arc') {
      const s = doc.elements[el.source];
      items.push(
        { label: 'Gewicht erhöhen', icon: Plus, run: () => updateDoc((d) => { const a = d.elements[el.id]; if (a?.type === 'arc') a.weight += 1; }) },
        { label: 'Gewicht verringern', icon: Minus, disabled: el.weight <= 1, run: () => updateDoc((d) => { const a = d.elements[el.id]; if (a?.type === 'arc' && a.weight > 1) a.weight -= 1; }) },
        {
          label: 'Kantentyp',
          children: (['normal', 'test', 'inhibitor'] as const).map((k) => ({
            label: { normal: 'Normale Kante', test: 'Testkante (liest nur)', inhibitor: 'Inhibitorkante (verbietet)' }[k],
            checked: el.kind === k,
            disabled: k !== 'normal' && s?.type !== 'place',
            run: () => updateDoc((d) => { const a = d.elements[el.id]; if (a?.type === 'arc') a.kind = k; }),
          })),
        },
        actionItem('arrange.reverse'),
        actionItem('arrange.straighten'),
      );
    }
    items.push(SEP, actionItem('edit.cut'), actionItem('edit.copy'), actionItem('edit.duplicate'));
    if (el.type !== 'arc') {
      items.push(SEP, actionItem('arrange.front'), actionItem('arrange.back'));
      if (tab.selection.length > 1) items.push(actionItem('arrange.group'));
      if (el.groupId) items.push(actionItem('arrange.ungroup'));
    }
    if (el.type !== 'rect' && el.type !== 'line' && el.type !== 'poly' && el.type !== 'text') items.push(actionItem('arrange.resetLabels'));
    items.push(SEP, actionItem('edit.delete', { danger: true }));
    return items;
  };

  // ─────────────────────────── Rendern ───────────────────────────

  const grid = doc.settings.grid;
  const gs = grid.size * view.zoom;
  const showMinor = grid.visible && gs >= 7 && mode === 'edit';
  const showMajor = grid.visible && gs * 5 >= 10;
  const bg = doc.settings.background ?? p.bg;
  const hint =
    mode === 'sim'
      ? 'Klicke auf eine aktivierte (grün umrandete) Transition, um sie zu schalten · Leertaste = Einzelschritt'
      : mode === 'analysis'
        ? null
        : arcPending
          ? 'Klicke auf das Ziel · Klick auf die freie Fläche setzt einen Knickpunkt · Esc bricht ab'
          : polyDraft
            ? HINTS.poly
            : tool !== 'select'
              ? HINTS[tool]
              : null;
  const isEmpty = doc.order.length === 0;
  const editEl = editing ? doc.elements[editing.id] : undefined;

  return (
    <div
      ref={hostRef}
      className={`canvas-host tool-${tool} mode-${mode}${spacePan ? ' panning' : ''}${dragging ? ' dragging' : ''}`}
      tabIndex={0}
      data-testid="canvas"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={() => {
        setUi({ cursor: null });
        hideTip();
      }}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    >
      <svg className="canvas-svg" data-testid="canvas-svg">
        <defs>
          <pattern id="grid-minor" width={gs} height={gs} patternUnits="userSpaceOnUse" x={view.x % gs} y={view.y % gs}>
            <circle cx={0.75} cy={0.75} r={0.9} fill={p.gridMajor} />
          </pattern>
          <pattern id="grid-major" width={gs * 5} height={gs * 5} patternUnits="userSpaceOnUse" x={view.x % (gs * 5)} y={view.y % (gs * 5)}>
            <path d={`M ${gs * 5} 0 L 0 0 0 ${gs * 5}`} fill="none" stroke={p.grid} strokeWidth={1} />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={bg} />
        {showMajor && <rect width="100%" height="100%" fill="url(#grid-major)" />}
        {showMinor && <rect width="100%" height="100%" fill="url(#grid-minor)" />}
        <g transform={`translate(${view.x},${view.y}) scale(${view.zoom})`}>
          {content}
          {mode === 'sim' && sess?.anim && <TokenAnimation doc={doc} batch={sess.anim} p={p} />}
          {handles.length > 0 && <Handles handles={handles} zoom={view.zoom} p={p} />}
          {preview.rubber && <SelectionBox rect={preview.rubber} zoom={view.zoom} p={p} />}
          {preview.guides && (
            <g pointerEvents="none" stroke={p.highlight} strokeWidth={1 / view.zoom} strokeDasharray={`${4 / view.zoom} ${3 / view.zoom}`}>
              {preview.guides.v && <line x1={preview.guides.v.x} y1={preview.guides.v.y1} x2={preview.guides.v.x} y2={preview.guides.v.y2} />}
              {preview.guides.h && <line x1={preview.guides.h.x1} y1={preview.guides.h.y} x2={preview.guides.h.x2} y2={preview.guides.h.y} />}
            </g>
          )}
          {preview.arc && <PreviewLine from={preview.arc.from} to={preview.arc.to} ok={preview.arc.ok} p={p} zoom={view.zoom} points={preview.arc.points} />}
          {preview.draw &&
            (preview.draw.tool === 'line' ? (
              <line x1={preview.draw.a.x} y1={preview.draw.a.y} x2={preview.draw.b.x} y2={preview.draw.b.y} stroke={p.selection} strokeWidth={2 / view.zoom} strokeDasharray={`${5 / view.zoom}`} />
            ) : preview.draw.tool === 'ellipse' ? (
              (() => {
                const r = rectFromPoints(preview.draw.a, preview.draw.b);
                return <ellipse cx={r.x + r.w / 2} cy={r.y + r.h / 2} rx={r.w / 2} ry={r.h / 2} fill={p.selectionFill} stroke={p.selection} strokeWidth={1.5 / view.zoom} />;
              })()
            ) : (
              <SelectionBox rect={rectFromPoints(preview.draw.a, preview.draw.b)} zoom={view.zoom} p={p} />
            ))}
          {(preview.poly ?? polyDraft) && (
            <polyline
              points={[...(polyDraft ?? []), ...(preview.hover ? [preview.hover] : [])].map((q) => `${q.x},${q.y}`).join(' ')}
              fill="none"
              stroke={p.selection}
              strokeWidth={2 / view.zoom}
              strokeDasharray={`${5 / view.zoom}`}
              pointerEvents="none"
            />
          )}
        </g>
      </svg>

      {hint && <div className="canvas-hint">{hint}</div>}

      {isEmpty && mode === 'edit' && (
        <div className="canvas-empty">
          <div className="canvas-empty-card">
            <svg width="64" height="40" viewBox="0 0 64 40" aria-hidden>
              <circle cx="12" cy="20" r="10" fill="none" stroke={p.placeStroke} strokeWidth="2" />
              <circle cx="12" cy="20" r="3" fill={p.token} />
              <line x1="22" y1="20" x2="36" y2="20" stroke={p.arc} strokeWidth="2" />
              <rect x="37" y="8" width="6" height="24" rx="1" fill={p.transImmediate} />
              <line x1="43" y1="20" x2="56" y2="20" stroke={p.arc} strokeWidth="2" />
              <polygon points="62,20 54,16 54,24" fill={p.arc} />
            </svg>
            <h3>Leeres Netz</h3>
            <p>
              Wähle oben das Werkzeug <b>Stelle</b> (P) oder <b>Transition</b> (T) und klicke auf die Fläche. Verbinde sie mit dem
              Werkzeug <b>Kante</b> (K).
            </p>
            <div className="row" style={{ justifyContent: 'center' }}>
              <button className="btn primary" onClick={() => setTool('place')}>
                <CircleDot size={16} /> Erste Stelle setzen
              </button>
              <button className="btn" onClick={() => setUi({ tutorialStep: 0 })}>
                <GraduationCap size={16} /> Tutorial
              </button>
            </div>
          </div>
        </div>
      )}

      {editing && editEl && (
        <InlineEditor
          key={editing.id + editing.kind}
          el={editEl}
          doc={doc}
          kind={editing.kind}
          toScreen={toScreen}
          zoom={view.zoom}
          onDone={() => {
            setEditing(null);
            hostRef.current?.focus({ preventScroll: true });
          }}
        />
      )}

      {tip && !dragging && !editing && doc.elements[tip.id] && (
        <ElementTip
          el={doc.elements[tip.id]}
          doc={doc}
          tabId={tab.id}
          mode={mode}
          x={Math.max(0, Math.min(tip.x, viewport.w - 350))}
          y={Math.max(0, Math.min(tip.y, viewport.h - 140))}
        />
      )}

      {minimap && !isEmpty && viewport.h >= 480 && viewport.w >= 640 && <Minimap doc={doc} view={view} viewport={viewport} p={p} />}
      <div className="zoom-controls" onPointerDown={(e) => e.stopPropagation()}>
        <IconButton small icon={<Minus size={15} />} title="Verkleinern (−)" onClick={() => zoomAt(0.8)} />
        <button className="zoom-label" title="Auf 100 % setzen" onClick={() => zoomAt(1 / view.zoom)} data-testid="zoom-label">
          {Math.round(view.zoom * 100)} %
        </button>
        <IconButton small icon={<Plus size={15} />} title="Vergrößern (+)" onClick={() => zoomAt(1.25)} />
        <IconButton small icon={<Maximize size={14} />} title="Ganzes Netz anzeigen (F)" onClick={() => fitView()} />
      </div>
    </div>
  );
}

/** Kurzinfo zu einem Element beim Überfahren mit der Maus. */
function ElementTip({ el, doc, tabId, mode, x, y }: { el: Element; doc: NetDoc; tabId: string; mode: string; x: number; y: number }) {
  const unit = doc.settings.sim.timeUnit;
  const name = (id: string) => {
    const n = doc.elements[id];
    return n && 'name' in n ? n.name : '?';
  };
  let title = '';
  const lines: { text: string; ok?: boolean }[] = [];
  const sess = mode === 'sim' ? getSession(tabId) : null;
  switch (el.type) {
    case 'place': {
      title = `Stelle „${el.name}“`;
      const idx = sess?.net.placeIndex.get(el.id);
      const cur = sess && idx !== undefined ? sess.display[idx] : el.tokens;
      lines.push({ text: `${formatNumber(cur)} Marke${cur === 1 ? '' : 'n'}${sess ? ` (Anfang: ${el.tokens})` : ''}` });
      lines.push({ text: el.capacity > 0 ? `Kapazität: ${el.capacity}` : 'Kapazität: unbegrenzt' });
      break;
    }
    case 'transition': {
      title = `Transition „${el.name}“`;
      lines.push({
        text:
          el.timing === 'immediate'
            ? 'Schaltet sofort'
            : el.timing === 'deterministic'
              ? `${timingLabel(el.timing)}: ${formatNumber(el.delay, 3)} ${unit}`
              : el.timing === 'exponential'
                ? `Exponentialverteilt, Mittelwert ${formatNumber(el.delay, 3)} ${unit}`
                : `Gleichverteilt zwischen ${formatNumber(el.delay, 3)} und ${formatNumber(el.delayMax, 3)} ${unit}`,
      });
      if (el.priority) lines.push({ text: `Priorität ${el.priority}` });
      if (sess) {
        const t = sess.net.transIndex.get(el.id);
        if (t !== undefined) {
          const reasons = explainEnabling(sess.net, t, sess.state, unit);
          const bad = reasons.filter((r) => !r.ok);
          if (!bad.length) lines.push({ text: 'Aktiviert – Klick schaltet die Transition', ok: true });
          else for (const r of bad.slice(0, 3)) lines.push({ text: r.text, ok: false });
          lines.push({ text: `${formatNumber(sess.state.fired[t])}× geschaltet` });
        }
      }
      break;
    }
    case 'arc':
      title = `Kante ${name(el.source)} → ${name(el.target)}`;
      lines.push({ text: `Gewicht ${el.weight}` });
      if (el.kind !== 'normal')
        lines.push({ text: el.kind === 'test' ? 'Testkante: prüft Marken, verbraucht sie aber nicht' : `Inhibitorkante: verbietet das Schalten ab ${el.weight} Marke(n)` });
      break;
    default:
      return null;
  }
  if ('note' in el && el.note) lines.push({ text: el.note.length > 140 ? el.note.slice(0, 140) + '…' : el.note });
  return (
    <div className="canvas-tip" style={{ left: x + 14, top: y + 16 }} role="tooltip">
      <div className="canvas-tip-title">{title}</div>
      {lines.map((l, i) => (
        <div key={i} className={`canvas-tip-line${l.ok === true ? ' ok' : l.ok === false ? ' bad' : ''}`}>
          {l.text}
        </div>
      ))}
    </div>
  );
}

function InlineEditor({
  el,
  doc,
  kind,
  toScreen,
  zoom,
  onDone,
}: {
  el: Element;
  doc: NetDoc;
  kind: 'name' | 'text';
  toScreen: (p: Point) => Point;
  zoom: number;
  onDone: () => void;
}) {
  const initial = kind === 'text' && el.type === 'text' ? el.text : 'name' in el ? el.name : '';
  const [value, setValue] = useState(initial);
  const done = useRef(false);
  const commit = () => {
    if (done.current) return;
    done.current = true;
    const v = kind === 'name' ? value.trim() : value;
    if (v !== initial && (kind === 'text' || v)) {
      updateDoc((d) => {
        const x = d.elements[el.id];
        if (!x) return;
        if (kind === 'text' && x.type === 'text') x.text = v;
        else if ((x.type === 'place' || x.type === 'transition') && v) {
          x.name = v.slice(0, 200);
          x.showName = true;
        }
      });
    }
    onDone();
  };
  const cancel = () => {
    done.current = true;
    onDone();
  };
  if (kind === 'text' && el.type === 'text') {
    const pos = toScreen({ x: el.x, y: el.y });
    return (
      <textarea
        className="inline-editor"
        autoFocus
        value={value}
        style={{ left: pos.x - 4, top: pos.y - 4, fontSize: el.fontSize * zoom, minWidth: 160, minHeight: el.fontSize * zoom * 1.6 + 12 }}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onFocus={(e) => e.target.select()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') cancel();
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) commit();
        }}
        onPointerDown={(e) => e.stopPropagation()}
      />
    );
  }
  if (el.type !== 'place' && el.type !== 'transition') return null;
  const off = doc ? resolveLabelOffset(doc, el, 'name') : defaultNameOffset(el);
  const pos = toScreen({ x: el.x + off.x, y: el.y + off.y });
  return (
    <input
      className="inline-editor"
      autoFocus
      value={value}
      maxLength={200}
      data-testid="inline-name"
      style={{ left: pos.x - 70, top: pos.y - 15, width: 140, height: 30 }}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onFocus={(e) => e.target.select()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') cancel();
      }}
      onPointerDown={(e) => e.stopPropagation()}
    />
  );
}
