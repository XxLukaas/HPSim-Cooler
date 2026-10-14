/**
 * Übersichtskarte: zeigt das gesamte Netz verkleinert samt sichtbarem Ausschnitt.
 * Klicken oder Ziehen verschiebt die Ansicht.
 */
import { memo, useMemo, useRef, type JSX } from 'react';
import { contentBounds, expandRect } from '../model/geometry';
import type { NetDoc } from '../model/types';
import { setView, type View } from '../store/appStore';
import type { Palette } from './palette';

const W = 196;
const H = 128;

const MiniContent = memo(function MiniContent({ doc, p }: { doc: NetDoc; p: Palette }) {
  const out: JSX.Element[] = [];
  for (const id of doc.order) {
    const el = doc.elements[id];
    if (!el) continue;
    if (el.type === 'place') out.push(<circle key={id} cx={el.x} cy={el.y} r={el.r} fill={p.placeStroke} opacity={0.75} />);
    else if (el.type === 'transition')
      out.push(<rect key={id} x={el.x - el.w / 2} y={el.y - el.h / 2} width={el.w} height={el.h} fill={p.transImmediate} />);
    else if (el.type === 'arc') {
      const s = doc.elements[el.source];
      const t = doc.elements[el.target];
      if (s && t && 'x' in s && 'x' in t && (s.type === 'place' || s.type === 'transition') && (t.type === 'place' || t.type === 'transition')) {
        const pts = [{ x: s.x, y: s.y }, ...el.points, { x: t.x, y: t.y }];
        out.push(<polyline key={id} points={pts.map((q) => `${q.x},${q.y}`).join(' ')} fill="none" stroke={p.arc} strokeWidth={2} opacity={0.6} />);
      }
    } else if (el.type === 'rect') {
      out.push(<rect key={id} x={el.x} y={el.y} width={el.w} height={el.h} fill="none" stroke={p.shapeStroke} strokeWidth={2} opacity={0.6} />);
    }
  }
  return <>{out}</>;
});


export function Minimap({ doc, view, viewport, p }: { doc: NetDoc; view: View; viewport: { w: number; h: number }; p: Palette }) {
  const ref = useRef<SVGSVGElement>(null);
  const world = useMemo(() => {
    const b = contentBounds(doc);
    return b ? expandRect(b, 60) : { x: 0, y: 0, w: 800, h: 500 };
  }, [doc]);
  const vis = {
    x: -view.x / view.zoom,
    y: -view.y / view.zoom,
    w: viewport.w / view.zoom,
    h: viewport.h / view.zoom,
  };
  // Gesamtbereich = Inhalt ∪ sichtbarer Ausschnitt
  const minX = Math.min(world.x, vis.x);
  const minY = Math.min(world.y, vis.y);
  const maxX = Math.max(world.x + world.w, vis.x + vis.w);
  const maxY = Math.max(world.y + world.h, vis.y + vis.h);
  const bw = maxX - minX;
  const bh = maxY - minY;
  const scale = Math.min(W / bw, H / bh);
  const ox = (W - bw * scale) / 2;
  const oy = (H - bh * scale) / 2;

  const moveTo = (clientX: number, clientY: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const wx = (clientX - r.left - ox) / scale + minX;
    const wy = (clientY - r.top - oy) / scale + minY;
    setView({ zoom: view.zoom, x: viewport.w / 2 - wx * view.zoom, y: viewport.h / 2 - wy * view.zoom });
  };

  return (
    <div className="minimap" title="Übersicht – klicken oder ziehen, um die Ansicht zu verschieben">
      <svg
        ref={ref}
        width={W}
        height={H}
        onPointerDown={(e) => {
          e.stopPropagation();
          (e.currentTarget as Element).setPointerCapture(e.pointerId);
          moveTo(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (e.buttons & 1) moveTo(e.clientX, e.clientY);
        }}
      >
        <g transform={`translate(${ox},${oy}) scale(${scale}) translate(${-minX},${-minY})`}>
          <MiniContent doc={doc} p={p} />
          <rect
            x={vis.x}
            y={vis.y}
            width={vis.w}
            height={vis.h}
            fill={p.selectionFill}
            stroke={p.selection}
            strokeWidth={1.5 / scale}
            rx={3 / scale}
          />
        </g>
      </svg>
    </div>
  );
}
