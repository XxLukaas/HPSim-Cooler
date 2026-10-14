/**
 * Reine Darstellungskomponenten für Petri-Netze (ohne Interaktion).
 * Werden von der Zeichenfläche, von Vorschaubildern und vom SVG/PNG-Export genutzt.
 */
import { memo, type JSX } from 'react';
import {
  arcPolyline,
  defaultNameOffset,
  defaultSecondaryOffset,
  polylineMidpoint,
} from '../model/geometry';
import type { ArcEl, DecorEl, LineEl, NetDoc, NodeEl, PlaceEl, Point, PolyEl, RectEl, TextEl, TransitionEl } from '../model/types';
import { autoLabelSlots, type LabelSlots } from './labels';
import { DASH, type Palette } from './palette';

const slotCache = new WeakMap<NetDoc, Map<string, LabelSlots>>();

/** Automatische Beschriftungspositionen (je Dokumentstand zwischengespeichert). */
export function labelSlots(doc: NetDoc): Map<string, LabelSlots> {
  let m = slotCache.get(doc);
  if (!m) {
    m = autoLabelSlots(doc);
    slotCache.set(doc, m);
  }
  return m;
}

/** Tatsächliche Position der Namens- bzw. Zusatzbeschriftung relativ zum Knoten. */
export function resolveLabelOffset(doc: NetDoc, node: NodeEl, kind: 'name' | 'secondary'): Point {
  const manual = kind === 'name' ? node.nameOffset : node.type === 'place' ? node.capOffset : node.delayOffset;
  if (manual) return manual;
  const slot = labelSlots(doc).get(node.id);
  if (slot) return kind === 'name' ? slot.name : slot.secondary;
  return kind === 'name' ? defaultNameOffset(node) : defaultSecondaryOffset(node);
}

export type TransStatus = 'disabled' | 'enabled' | 'waiting' | 'ready' | 'fired';

export interface TransVisual {
  status: TransStatus;
  /** Anteil der bereits verstrichenen Verzögerung (0..1) */
  progress: number | null;
  fired: number;
  /** konkurriert mit anderen aktivierten Transitionen um dieselben Marken */
  conflict?: boolean;
}

export interface RenderState {
  marking?: Record<string, number> | null;
  trans?: Record<string, TransVisual> | null;
  selection?: ReadonlySet<string>;
  highlight?: ReadonlySet<string>;
  activeArcs?: ReadonlySet<string>;
  /** Stellen, deren Kapazität erreicht ist */
  showStats?: boolean;
}

const EMPTY = new Set<string>();

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${Math.round(n / 100_000) / 10}M`;
  if (n >= 10_000) return `${Math.round(n / 100) / 10}k`;
  return String(n);
}

/** Anordnung von bis zu 6 Marken innerhalb einer Stelle (wie Würfelaugen). */
export function tokenLayout(n: number, r: number): Point[] {
  const d = r * 0.42;
  switch (n) {
    case 1:
      return [{ x: 0, y: 0 }];
    case 2:
      return [
        { x: -d * 0.75, y: 0 },
        { x: d * 0.75, y: 0 },
      ];
    case 3:
      return [
        { x: 0, y: -d * 0.8 },
        { x: -d * 0.8, y: d * 0.6 },
        { x: d * 0.8, y: d * 0.6 },
      ];
    case 4:
      return [
        { x: -d * 0.7, y: -d * 0.7 },
        { x: d * 0.7, y: -d * 0.7 },
        { x: -d * 0.7, y: d * 0.7 },
        { x: d * 0.7, y: d * 0.7 },
      ];
    case 5:
      return [
        { x: -d * 0.8, y: -d * 0.8 },
        { x: d * 0.8, y: -d * 0.8 },
        { x: 0, y: 0 },
        { x: -d * 0.8, y: d * 0.8 },
        { x: d * 0.8, y: d * 0.8 },
      ];
    case 6:
      return [
        { x: -d * 0.85, y: -d * 0.9 },
        { x: d * 0.85, y: -d * 0.9 },
        { x: -d * 0.85, y: 0 },
        { x: d * 0.85, y: 0 },
        { x: -d * 0.85, y: d * 0.9 },
        { x: d * 0.85, y: d * 0.9 },
      ];
    default:
      return [];
  }
}

export function delayLabel(t: TransitionEl): string {
  const f = (v: number) => (Number.isInteger(v) ? String(v) : v.toLocaleString('de-DE', { maximumFractionDigits: 3 }));
  switch (t.timing) {
    case 'immediate':
      return '';
    case 'deterministic':
      return `⏱ ${f(t.delay)}`;
    case 'exponential':
      return `exp(${f(t.delay)})`;
    case 'uniform':
      return `U[${f(t.delay)}; ${f(t.delayMax)}]`;
  }
}

interface LabelProps {
  x: number;
  y: number;
  text: string;
  p: Palette;
  owner: string;
  kind: 'name' | 'secondary' | 'weight';
  muted?: boolean;
  size?: number;
}

export const Label = memo(function Label({ x, y, text, p, owner, kind, muted, size = 12.5 }: LabelProps) {
  if (!text) return null;
  return (
    <text
      x={x}
      y={y}
      className="net-label"
      data-label={kind}
      data-owner={owner}
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={size}
      fontWeight={kind === 'name' ? 600 : 500}
      fill={muted ? p.labelMuted : p.label}
      stroke={p.labelBg}
      strokeWidth={3.5}
      strokeLinejoin="round"
      paintOrder="stroke"
    >
      {text}
    </text>
  );
});

interface PlaceProps {
  el: PlaceEl;
  p: Palette;
  tokens: number;
  selected: boolean;
  highlighted: boolean;
  /** automatische Beschriftungspositionen (dx/dy) */
  ax?: number;
  ay?: number;
  bx?: number;
  by?: number;
}

export const PlaceView = memo(function PlaceView({ el, p, tokens, selected, highlighted, ax, ay, bx, by }: PlaceProps) {
  const full = el.capacity > 0 && tokens >= el.capacity;
  const nameOff = el.nameOffset ?? (ax !== undefined && ay !== undefined ? { x: ax, y: ay } : defaultNameOffset(el));
  const capOff = el.capOffset ?? (bx !== undefined && by !== undefined ? { x: bx, y: by } : defaultSecondaryOffset(el));
  const layout = tokens <= 6 && el.r >= 9 ? tokenLayout(tokens, el.r) : [];
  const tokR = Math.max(2.2, Math.min(5.5, el.r * 0.19));
  const stroke = el.color ?? p.placeStroke;
  return (
    <g className="net-place" data-id={el.id} data-type="place">
      {(selected || highlighted) && (
        <circle
          cx={el.x}
          cy={el.y}
          r={el.r + 6}
          fill={selected ? p.selectionFill : 'none'}
          stroke={selected ? p.selection : p.highlight}
          strokeWidth={selected ? 1.5 : 2.5}
          strokeDasharray={selected ? '4 3' : undefined}
        />
      )}
      <circle
        cx={el.x}
        cy={el.y}
        r={el.r}
        fill={p.placeFill}
        stroke={full ? p.full : stroke}
        strokeWidth={full ? 2.6 : 2}
      />
      {layout.map((o, i) => (
        <circle key={i} className="net-token" cx={el.x + o.x} cy={el.y + o.y} r={tokR} fill={p.token} />
      ))}
      {tokens > 6 || (tokens > 0 && el.r < 9) ? (
        <text
          x={el.x}
          y={el.y}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={Math.max(9, Math.min(15, el.r * 0.75))}
          fontWeight={700}
          fill={p.tokenText}
          className="net-token-count"
        >
          {formatTokens(tokens)}
        </text>
      ) : null}
      {el.showName && <Label x={el.x + nameOff.x} y={el.y + nameOff.y} text={el.name} p={p} owner={el.id} kind="name" />}
      {el.showCapacity && el.capacity > 0 && (
        <Label
          x={el.x + capOff.x}
          y={el.y + capOff.y}
          text={`K=${el.capacity}`}
          p={p}
          owner={el.id}
          kind="secondary"
          muted
          size={11}
        />
      )}
    </g>
  );
});

interface TransitionProps {
  el: TransitionEl;
  p: Palette;
  selected: boolean;
  highlighted: boolean;
  visual: TransVisual | null;
  ax?: number;
  ay?: number;
  bx?: number;
  by?: number;
}

export const TransitionView = memo(function TransitionView({ el, p, selected, highlighted, visual, ax, ay, bx, by }: TransitionProps) {
  const x = el.x - el.w / 2;
  const y = el.y - el.h / 2;
  const nameOff = el.nameOffset ?? (ax !== undefined && ay !== undefined ? { x: ax, y: ay } : defaultNameOffset(el));
  const delOff = el.delayOffset ?? (bx !== undefined && by !== undefined ? { x: bx, y: by } : defaultSecondaryOffset(el));
  const accent =
    el.color ??
    (el.timing === 'immediate' ? p.transImmediate : el.timing === 'deterministic' ? p.transTimed : p.transStochastic);
  const filled = el.timing === 'immediate';
  const status = visual?.status;
  const vertical = el.h >= el.w;
  const prog = visual?.progress ?? null;
  return (
    <g className={`net-transition${status === 'fired' ? ' is-fired' : ''}`} data-id={el.id} data-type="transition">
      {(selected || highlighted) && (
        <rect
          x={x - 6}
          y={y - 6}
          width={el.w + 12}
          height={el.h + 12}
          rx={5}
          fill={selected ? p.selectionFill : 'none'}
          stroke={selected ? p.selection : p.highlight}
          strokeWidth={selected ? 1.5 : 2.5}
          strokeDasharray={selected ? '4 3' : undefined}
        />
      )}
      {status && status !== 'disabled' && (
        <rect
          className="net-halo"
          x={x - 4}
          y={y - 4}
          width={el.w + 8}
          height={el.h + 8}
          rx={4}
          fill="none"
          stroke={status === 'enabled' ? p.enabled : status === 'waiting' ? p.waiting : p.ready}
          strokeWidth={status === 'fired' ? 4 : 2.5}
          opacity={status === 'enabled' ? 0.75 : 0.95}
        />
      )}
      {visual?.conflict && status !== 'disabled' && (
        <rect
          className="net-conflict"
          x={x - 8}
          y={y - 8}
          width={el.w + 16}
          height={el.h + 16}
          rx={6}
          fill="none"
          stroke={p.conflict}
          strokeWidth={1.6}
          strokeDasharray="4 3"
        >
          <title>Konflikt: konkurriert mit anderen Transitionen um dieselben Marken</title>
        </rect>
      )}
      <rect
        x={x}
        y={y}
        width={el.w}
        height={el.h}
        rx={Math.min(3, el.w / 4, el.h / 4)}
        fill={filled ? accent : p.placeFill}
        stroke={accent}
        strokeWidth={filled ? 0 : 2}
        opacity={status === 'disabled' ? 0.55 : 1}
      />
      {!filled && (
        <rect
          x={x + 2}
          y={y + 2}
          width={Math.max(0, el.w - 4)}
          height={Math.max(0, el.h - 4)}
          rx={1}
          fill={accent}
          opacity={0.22}
        />
      )}
      {prog !== null && prog > 0 && (
        <rect
          className="net-progress"
          x={vertical ? x + 1.5 : x + 1.5}
          y={vertical ? y + el.h - 1.5 - (el.h - 3) * Math.min(1, prog) : y + 1.5}
          width={vertical ? el.w - 3 : (el.w - 3) * Math.min(1, prog)}
          height={vertical ? (el.h - 3) * Math.min(1, prog) : el.h - 3}
          fill={p.waiting}
          opacity={0.85}
        />
      )}
      {el.showName && <Label x={el.x + nameOff.x} y={el.y + nameOff.y} text={el.name} p={p} owner={el.id} kind="name" />}
      {el.showDelay && el.timing !== 'immediate' && (
        <Label x={el.x + delOff.x} y={el.y + delOff.y} text={delayLabel(el)} p={p} owner={el.id} kind="secondary" muted size={11} />
      )}
    </g>
  );
});

function arrowHead(tip: Point, from: Point, size: number): { base: Point; points: string } {
  const ang = Math.atan2(tip.y - from.y, tip.x - from.x);
  const bx = tip.x - Math.cos(ang) * size;
  const by = tip.y - Math.sin(ang) * size;
  const wx = Math.cos(ang + Math.PI / 2) * size * 0.42;
  const wy = Math.sin(ang + Math.PI / 2) * size * 0.42;
  return {
    base: { x: bx, y: by },
    points: `${tip.x},${tip.y} ${bx + wx},${by + wy} ${bx - wx},${by - wy}`,
  };
}

export function arcGeometry(el: ArcEl, source: NodeEl, target: NodeEl) {
  const pts = arcPolyline(el, source, target);
  const tip = pts[pts.length - 1];
  const prev = pts[pts.length - 2];
  const len = Math.hypot(tip.x - prev.x, tip.y - prev.y) || 1;
  const ux = (tip.x - prev.x) / len;
  const uy = (tip.y - prev.y) / len;
  return { pts, tip, prev, ux, uy };
}

interface ArcProps {
  el: ArcEl;
  source: NodeEl;
  target: NodeEl;
  p: Palette;
  selected: boolean;
  active: boolean;
  highlighted: boolean;
}

export const ArcView = memo(function ArcView({ el, source, target, p, selected, active, highlighted }: ArcProps) {
  const { pts, tip, prev, ux, uy } = arcGeometry(el, source, target);
  const color = selected ? p.selection : active ? p.ready : highlighted ? p.highlight : el.color ?? (el.kind === 'inhibitor' ? p.arcInhibitor : el.kind === 'test' ? p.arcTest : p.arc);
  const width = active ? 2.6 : 1.7;
  let head: JSX.Element;
  let end = tip;
  if (el.kind === 'inhibitor') {
    const r = 4.5;
    end = { x: tip.x - ux * r * 2, y: tip.y - uy * r * 2 };
    head = <circle cx={tip.x - ux * r} cy={tip.y - uy * r} r={r} fill={p.placeFill} stroke={color} strokeWidth={1.8} />;
  } else {
    const ah = arrowHead(tip, prev, 11);
    end = ah.base;
    head = (
      <polygon
        points={ah.points}
        fill={el.kind === 'test' ? p.placeFill : color}
        stroke={color}
        strokeWidth={el.kind === 'test' ? 1.6 : 0.8}
        strokeLinejoin="round"
      />
    );
  }
  const linePts = [...pts.slice(0, -1), end];
  const d = 'M' + linePts.map((q) => `${q.x.toFixed(2)},${q.y.toFixed(2)}`).join(' L');
  const showWeight = el.weight !== 1 || el.showWeight;
  const mid = showWeight ? polylineMidpoint(pts) : null;
  let label: Point | null = null;
  if (mid) {
    if (el.labelOffset) label = { x: mid.p.x + el.labelOffset.x, y: mid.p.y + el.labelOffset.y };
    else {
      const nx = -Math.sin(mid.angle);
      const ny = Math.cos(mid.angle);
      label = { x: mid.p.x + nx * 11, y: mid.p.y + ny * 11 };
    }
  }
  return (
    <g className={`net-arc${active ? ' is-active' : ''}`} data-id={el.id} data-type="arc">
      <path d={'M' + pts.map((q) => `${q.x.toFixed(2)},${q.y.toFixed(2)}`).join(' L')} className="net-arc-hit" stroke="transparent" strokeWidth={12} fill="none" />
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={width}
        strokeDasharray={el.kind === 'test' ? '6 4' : undefined}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {head}
      {label && (
        <Label x={label.x} y={label.y} text={String(el.weight)} p={p} owner={el.id} kind="weight" size={12} />
      )}
    </g>
  );
});

function lineArrow(tip: Point, from: Point, color: string, w: number) {
  const ah = arrowHead(tip, from, 8 + w * 2);
  return <polygon points={ah.points} fill={color} />;
}

interface DecorProps {
  el: DecorEl;
  p: Palette;
  selected: boolean;
}

export const DecorView = memo(function DecorView({ el, p, selected }: DecorProps) {
  switch (el.type) {
    case 'rect':
      return <RectShape el={el} p={p} selected={selected} />;
    case 'line':
      return <LineShape el={el} p={p} selected={selected} />;
    case 'poly':
      return <PolyShape el={el} p={p} selected={selected} />;
    case 'text':
      return <TextShape el={el} p={p} selected={selected} />;
  }
});

function RectShape({ el, p, selected }: { el: RectEl; p: Palette; selected: boolean }) {
  const stroke = el.stroke || p.shapeStroke;
  const common = {
    fill: el.filled ? el.fill : 'transparent',
    fillOpacity: el.filled ? 0.35 * el.opacity + 0.15 : 1,
    stroke: el.strokeWidth > 0 ? stroke : 'none',
    strokeWidth: el.strokeWidth,
    strokeDasharray: DASH[el.dash],
    opacity: el.opacity,
  };
  return (
    <g className="net-decor" data-id={el.id} data-type="rect">
      {el.shape === 'ellipse' ? (
        <ellipse cx={el.x + el.w / 2} cy={el.y + el.h / 2} rx={Math.abs(el.w / 2)} ry={Math.abs(el.h / 2)} {...common} />
      ) : (
        <rect
          x={el.x}
          y={el.y}
          width={Math.max(0, el.w)}
          height={Math.max(0, el.h)}
          rx={el.shape === 'roundrect' ? el.radius : 0}
          {...common}
        />
      )}
      {selected && (
        <rect x={el.x - 3} y={el.y - 3} width={el.w + 6} height={el.h + 6} fill="none" stroke={p.selection} strokeDasharray="4 3" />
      )}
    </g>
  );
}

function LineShape({ el, p, selected }: { el: LineEl; p: Palette; selected: boolean }) {
  const stroke = selected ? p.selection : el.stroke || p.shapeStroke;
  const a = { x: el.x1, y: el.y1 };
  const b = { x: el.x2, y: el.y2 };
  return (
    <g className="net-decor" data-id={el.id} data-type="line" opacity={el.opacity}>
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={12} />
      <line
        x1={a.x}
        y1={a.y}
        x2={b.x}
        y2={b.y}
        stroke={stroke}
        strokeWidth={el.strokeWidth}
        strokeDasharray={DASH[el.dash]}
        strokeLinecap="round"
      />
      {el.arrowEnd && lineArrow(b, a, stroke, el.strokeWidth)}
      {el.arrowStart && lineArrow(a, b, stroke, el.strokeWidth)}
    </g>
  );
}

function PolyShape({ el, p, selected }: { el: PolyEl; p: Palette; selected: boolean }) {
  const pts = el.points.map((q) => `${q.x},${q.y}`).join(' ');
  const stroke = selected ? p.selection : el.stroke || p.shapeStroke;
  const props = {
    points: pts,
    stroke,
    strokeWidth: el.strokeWidth,
    strokeDasharray: DASH[el.dash],
    strokeLinejoin: 'round' as const,
    opacity: el.opacity,
  };
  return (
    <g className="net-decor" data-id={el.id} data-type="poly">
      {el.closed ? (
        <polygon {...props} fill={el.filled ? el.fill : 'transparent'} fillOpacity={el.filled ? 0.45 : 1} />
      ) : (
        <>
          <polyline points={pts} stroke="transparent" strokeWidth={12} fill="none" />
          <polyline {...props} fill="none" />
        </>
      )}
    </g>
  );
}

function TextShape({ el, p, selected }: { el: TextEl; p: Palette; selected: boolean }) {
  const lines = el.text.split('\n');
  const lh = el.fontSize * 1.3;
  const longest = lines.reduce((m, l) => Math.max(m, l.length), 1);
  const w = Math.max(8, longest * el.fontSize * 0.56);
  const h = lines.length * lh;
  const anchor = el.align === 'center' ? 'middle' : el.align === 'right' ? 'end' : 'start';
  const tx = el.align === 'center' ? el.x + w / 2 : el.align === 'right' ? el.x + w : el.x;
  return (
    <g className="net-decor net-text" data-id={el.id} data-type="text">
      <rect
        x={el.x - 4}
        y={el.y - 2}
        width={w + 8}
        height={h + 4}
        rx={4}
        fill={el.background ?? 'transparent'}
        stroke={selected ? p.selection : 'none'}
        strokeDasharray="4 3"
      />
      <text
        x={tx}
        y={el.y}
        fontSize={el.fontSize}
        fontFamily={`${el.fontFamily}, Inter, system-ui, sans-serif`}
        fontWeight={el.bold ? 700 : 400}
        fontStyle={el.italic ? 'italic' : undefined}
        textDecoration={el.underline ? 'underline' : undefined}
        fill={el.color || p.text}
        textAnchor={anchor}
      >
        {lines.map((l, i) => (
          <tspan key={i} x={tx} dy={i === 0 ? el.fontSize : lh}>
            {l || ' '}
          </tspan>
        ))}
      </text>
    </g>
  );
}

interface NetContentProps {
  doc: NetDoc;
  p: Palette;
  state?: RenderState;
}

/** Alle Ebenen eines Netzes: Zeichenobjekte, Kanten, Knoten. */
export function NetContent({ doc, p, state }: NetContentProps) {
  const sel = state?.selection ?? EMPTY;
  const hl = state?.highlight ?? EMPTY;
  const active = state?.activeArcs ?? EMPTY;
  const decor: JSX.Element[] = [];
  const arcs: JSX.Element[] = [];
  const nodes: JSX.Element[] = [];
  const slots = labelSlots(doc);
  for (const id of doc.order) {
    const el = doc.elements[id];
    if (!el) continue;
    switch (el.type) {
      case 'place': {
        const sl = slots.get(id);
        nodes.push(
          <PlaceView
            key={id}
            el={el}
            p={p}
            tokens={state?.marking?.[id] ?? el.tokens}
            selected={sel.has(id)}
            highlighted={hl.has(id)}
            ax={sl?.name.x}
            ay={sl?.name.y}
            bx={sl?.secondary.x}
            by={sl?.secondary.y}
          />,
        );
        break;
      }
      case 'transition': {
        const sl = slots.get(id);
        nodes.push(
          <TransitionView
            key={id}
            el={el}
            p={p}
            selected={sel.has(id)}
            highlighted={hl.has(id)}
            visual={state?.trans?.[id] ?? null}
            ax={sl?.name.x}
            ay={sl?.name.y}
            bx={sl?.secondary.x}
            by={sl?.secondary.y}
          />,
        );
        break;
      }
      case 'arc': {
        const s = doc.elements[el.source];
        const t = doc.elements[el.target];
        if (!s || !t || (s.type !== 'place' && s.type !== 'transition') || (t.type !== 'place' && t.type !== 'transition')) break;
        arcs.push(
          <ArcView
            key={id}
            el={el}
            source={s}
            target={t}
            p={p}
            selected={sel.has(id)}
            active={active.has(id)}
            highlighted={hl.has(id)}
          />,
        );
        break;
      }
      default:
        decor.push(<DecorView key={id} el={el} p={p} selected={sel.has(id)} />);
    }
  }
  return (
    <>
      <g className="layer-decor">{decor}</g>
      <g className="layer-arcs">{arcs}</g>
      <g className="layer-nodes">{nodes}</g>
    </>
  );
}
