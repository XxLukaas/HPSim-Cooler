/**
 * Überlagerungen der Zeichenfläche: Auswahlgriffe, Vorschau beim Zeichnen,
 * Gummiband-Auswahl und die Marken-Animation.
 */
import { memo, useEffect, useRef } from 'react';
import { arcPolyline, pointAlong } from '../model/geometry';
import type { ArcEl, NetDoc, Point, Rect } from '../model/types';
import type { AnimationBatch } from '../store/simStore';
import type { Palette } from './palette';

export interface HandleSpec {
  id: string;
  x: number;
  y: number;
  kind: 'square' | 'circle' | 'add';
  cursor: string;
}

/** Griffe für das (einzige) ausgewählte Element. */
export function handlesFor(doc: NetDoc, selection: string[]): HandleSpec[] {
  if (selection.length !== 1) return [];
  const el = doc.elements[selection[0]];
  if (!el) return [];
  const res: HandleSpec[] = [];
  switch (el.type) {
    case 'rect': {
      const { x, y, w, h } = el;
      const pts: [string, number, number, string][] = [
        ['nw', x, y, 'nwse-resize'],
        ['n', x + w / 2, y, 'ns-resize'],
        ['ne', x + w, y, 'nesw-resize'],
        ['e', x + w, y + h / 2, 'ew-resize'],
        ['se', x + w, y + h, 'nwse-resize'],
        ['s', x + w / 2, y + h, 'ns-resize'],
        ['sw', x, y + h, 'nesw-resize'],
        ['w', x, y + h / 2, 'ew-resize'],
      ];
      for (const [k, hx, hy, cursor] of pts) res.push({ id: `resize:${k}`, x: hx, y: hy, kind: 'square', cursor });
      break;
    }
    case 'line':
      res.push({ id: 'end:0', x: el.x1, y: el.y1, kind: 'circle', cursor: 'move' });
      res.push({ id: 'end:1', x: el.x2, y: el.y2, kind: 'circle', cursor: 'move' });
      break;
    case 'poly':
      el.points.forEach((p, i) => res.push({ id: `vertex:${i}`, x: p.x, y: p.y, kind: 'circle', cursor: 'move' }));
      for (let i = 1; i < el.points.length; i++) {
        const a = el.points[i - 1];
        const b = el.points[i];
        res.push({ id: `addvertex:${i}`, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, kind: 'add', cursor: 'copy' });
      }
      break;
    case 'arc': {
      const s = doc.elements[el.source];
      const t = doc.elements[el.target];
      if (!s || !t || (s.type !== 'place' && s.type !== 'transition') || (t.type !== 'place' && t.type !== 'transition')) break;
      const pts = arcPolyline(el, s, t);
      el.points.forEach((p, i) => res.push({ id: `bend:${i}`, x: p.x, y: p.y, kind: 'circle', cursor: 'move' }));
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        if (Math.hypot(b.x - a.x, b.y - a.y) < 30) continue;
        res.push({ id: `addbend:${i - 1}`, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, kind: 'add', cursor: 'copy' });
      }
      break;
    }
    default:
      break;
  }
  return res;
}

export const Handles = memo(function Handles({ handles, zoom, p }: { handles: HandleSpec[]; zoom: number; p: Palette }) {
  const s = 1 / zoom;
  return (
    <g className="layer-handles">
      {handles.map((h) =>
        h.kind === 'square' ? (
          <rect
            key={h.id}
            data-handle={h.id}
            x={h.x - 4.5 * s}
            y={h.y - 4.5 * s}
            width={9 * s}
            height={9 * s}
            rx={2 * s}
            fill={p.placeFill}
            stroke={p.selection}
            strokeWidth={1.5 * s}
            style={{ cursor: h.cursor }}
          />
        ) : h.kind === 'circle' ? (
          <circle
            key={h.id}
            data-handle={h.id}
            cx={h.x}
            cy={h.y}
            r={5 * s}
            fill={p.selection}
            stroke={p.placeFill}
            strokeWidth={1.5 * s}
            style={{ cursor: h.cursor }}
          />
        ) : (
          <circle
            key={h.id}
            data-handle={h.id}
            cx={h.x}
            cy={h.y}
            r={4 * s}
            fill={p.placeFill}
            stroke={p.selection}
            strokeWidth={1.2 * s}
            strokeDasharray={`${2 * s} ${1.5 * s}`}
            opacity={0.85}
            style={{ cursor: h.cursor }}
          >
            <title>Knickpunkt hinzufügen (ziehen)</title>
          </circle>
        ),
      )}
    </g>
  );
});

export function SelectionBox({ rect, zoom, p }: { rect: Rect; zoom: number; p: Palette }) {
  return (
    <rect
      x={rect.x}
      y={rect.y}
      width={rect.w}
      height={rect.h}
      fill={p.selectionFill}
      stroke={p.selection}
      strokeWidth={1 / zoom}
      strokeDasharray={`${4 / zoom} ${3 / zoom}`}
      pointerEvents="none"
    />
  );
}

export function PreviewLine({ from, to, ok, p, zoom, points = [] }: { from: Point; to: Point; ok: boolean; p: Palette; zoom: number; points?: Point[] }) {
  const all = [from, ...points, to];
  return (
    <g pointerEvents="none">
      <polyline
        points={all.map((q) => `${q.x},${q.y}`).join(' ')}
        fill="none"
        stroke={ok ? p.selection : p.full}
        strokeWidth={2 / zoom + 0.5}
        strokeDasharray={`${6 / zoom} ${4 / zoom}`}
      />
      <circle cx={to.x} cy={to.y} r={4 / zoom + 1} fill={ok ? p.selection : p.full} />
    </g>
  );
}

/**
 * Animierte Marken, die entlang der Kanten wandern. Positionen werden per
 * requestAnimationFrame direkt am DOM gesetzt (kein React-Rendering pro Frame).
 */
export const TokenAnimation = memo(function TokenAnimation({ doc, batch, p }: { doc: NetDoc; batch: AnimationBatch | null; p: Palette }) {
  const groupRef = useRef<SVGGElement>(null);
  useEffect(() => {
    const g = groupRef.current;
    if (!g || !batch) return;
    const items: { el: SVGGElement; pts: Point[]; phase: 0 | 1 }[] = [];
    const add = (arcId: string, weight: number, phase: 0 | 1) => {
      const arc = doc.elements[arcId] as ArcEl | undefined;
      if (!arc || arc.type !== 'arc') return;
      const s = doc.elements[arc.source];
      const t = doc.elements[arc.target];
      if (!s || !t || (s.type !== 'place' && s.type !== 'transition') || (t.type !== 'place' && t.type !== 'transition')) return;
      const pts = arcPolyline(arc, s, t);
      const ns = 'http://www.w3.org/2000/svg';
      const grp = document.createElementNS(ns, 'g');
      const glow = document.createElementNS(ns, 'circle');
      glow.setAttribute('r', '9');
      glow.setAttribute('fill', p.tokenGlow);
      const dot = document.createElementNS(ns, 'circle');
      dot.setAttribute('r', '5');
      dot.setAttribute('fill', p.token);
      grp.appendChild(glow);
      grp.appendChild(dot);
      if (weight > 1) {
        const txt = document.createElementNS(ns, 'text');
        txt.textContent = `×${weight}`;
        txt.setAttribute('x', '8');
        txt.setAttribute('y', '-7');
        txt.setAttribute('font-size', '11');
        txt.setAttribute('font-weight', '700');
        txt.setAttribute('fill', p.tokenText);
        grp.appendChild(txt);
      }
      grp.style.opacity = '0';
      g.appendChild(grp);
      items.push({ el: grp, pts, phase });
    };
    for (const c of batch.consumed) add(c.arcId, c.weight, 0);
    for (const c of batch.produced) add(c.arcId, c.weight, 1);
    let raf = 0;
    const ease = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
    const frame = () => {
      const f = Math.min(1, (performance.now() - batch.start) / batch.duration);
      for (const it of items) {
        const local = it.phase === 0 ? f * 2 : f * 2 - 1;
        if (local < 0 || local > 1) {
          it.el.style.opacity = '0';
          continue;
        }
        const pos = pointAlong(it.pts, ease(local));
        it.el.setAttribute('transform', `translate(${pos.x},${pos.y})`);
        it.el.style.opacity = '1';
      }
      if (f < 1) raf = requestAnimationFrame(frame);
      else for (const it of items) it.el.style.opacity = '0';
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      for (const it of items) it.el.remove();
    };
  }, [batch, doc, p]);
  return <g ref={groupRef} className="layer-anim" pointerEvents="none" />;
});
