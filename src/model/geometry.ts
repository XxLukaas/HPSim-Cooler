import type { ArcEl, Element, NetDoc, NodeEl, Point, Rect } from './types';

export const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

export function snap(v: number, grid: number): number {
  return grid > 0 ? Math.round(v / grid) * grid : v;
}

export function rectFromPoints(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y),
  };
}

export function rectContains(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  );
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;
}

export function unionRect(a: Rect | null, b: Rect): Rect {
  if (!a) return { ...b };
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    w: Math.max(a.x + a.w, b.x + b.w) - x,
    h: Math.max(a.y + a.h, b.y + b.h) - y,
  };
}

export function expandRect(r: Rect, m: number): Rect {
  return { x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m };
}

/** Punkt am Rand eines Knotens in Richtung `toward`. */
export function nodeBoundaryPoint(node: NodeEl, toward: Point): Point {
  const dx = toward.x - node.x;
  const dy = toward.y - node.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return { x: node.x, y: node.y };
  if (node.type === 'place') {
    return { x: node.x + (dx / len) * node.r, y: node.y + (dy / len) * node.r };
  }
  const hw = node.w / 2;
  const hh = node.h / 2;
  const sx = Math.abs(dx) > 1e-9 ? hw / Math.abs(dx) : Infinity;
  const sy = Math.abs(dy) > 1e-9 ? hh / Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy);
  return { x: node.x + dx * s, y: node.y + dy * s };
}

/** Vollständiger Kantenverlauf (inklusive Start- und Endpunkt am Knotenrand). */
export function arcPolyline(arc: ArcEl, source: NodeEl, target: NodeEl): Point[] {
  const first = arc.points.length ? arc.points[0] : { x: target.x, y: target.y };
  const last = arc.points.length ? arc.points[arc.points.length - 1] : { x: source.x, y: source.y };
  const start = nodeBoundaryPoint(source, first);
  const end = nodeBoundaryPoint(target, last);
  return [start, ...arc.points, end];
}

export function polylineLength(pts: Point[]): number {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += dist(pts[i - 1], pts[i]);
  return l;
}

/** Punkt bei Anteil t (0..1) entlang eines Linienzugs. */
export function pointAlong(pts: Point[], t: number): Point {
  if (pts.length === 0) return { x: 0, y: 0 };
  if (pts.length === 1) return { ...pts[0] };
  const total = polylineLength(pts);
  let target = Math.max(0, Math.min(1, t)) * total;
  for (let i = 1; i < pts.length; i++) {
    const seg = dist(pts[i - 1], pts[i]);
    if (target <= seg || i === pts.length - 1) {
      const f = seg > 0 ? Math.min(1, target / seg) : 0;
      return {
        x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * f,
        y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * f,
      };
    }
    target -= seg;
  }
  return { ...pts[pts.length - 1] };
}

/** Mittelpunkt des Linienzugs inkl. Richtung des Segments (für Beschriftungen). */
export function polylineMidpoint(pts: Point[]): { p: Point; angle: number } {
  const p = pointAlong(pts, 0.5);
  const total = polylineLength(pts);
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const seg = dist(pts[i - 1], pts[i]);
    if (acc + seg >= total / 2) {
      return { p, angle: Math.atan2(pts[i].y - pts[i - 1].y, pts[i].x - pts[i - 1].x) };
    }
    acc += seg;
  }
  return { p, angle: 0 };
}

export function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return dist(p, a);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function distToPolyline(p: Point, pts: Point[]): { d: number; segment: number } {
  let best = Infinity;
  let segment = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = distToSegment(p, pts[i - 1], pts[i]);
    if (d < best) {
      best = d;
      segment = i - 1;
    }
  }
  return { d: best, segment };
}

export function getNode(doc: NetDoc, id: string): NodeEl | null {
  const el = doc.elements[id];
  return el && (el.type === 'place' || el.type === 'transition') ? el : null;
}

/** Begrenzungsrechteck eines Elements (ohne Beschriftungen). */
export function elementBounds(doc: NetDoc, el: Element): Rect {
  switch (el.type) {
    case 'place':
      return { x: el.x - el.r, y: el.y - el.r, w: el.r * 2, h: el.r * 2 };
    case 'transition':
      return { x: el.x - el.w / 2, y: el.y - el.h / 2, w: el.w, h: el.h };
    case 'arc': {
      const s = getNode(doc, el.source);
      const t = getNode(doc, el.target);
      const pts = s && t ? arcPolyline(el, s, t) : el.points;
      return boundsOfPoints(pts);
    }
    case 'rect':
      return { x: el.x, y: el.y, w: el.w, h: el.h };
    case 'line':
      return rectFromPoints({ x: el.x1, y: el.y1 }, { x: el.x2, y: el.y2 });
    case 'poly':
      return boundsOfPoints(el.points);
    case 'text': {
      const lines = el.text.split('\n');
      const longest = lines.reduce((m, l) => Math.max(m, l.length), 1);
      return {
        x: el.x,
        y: el.y,
        w: Math.max(8, longest * el.fontSize * 0.56),
        h: lines.length * el.fontSize * 1.3,
      };
    }
  }
}

export function boundsOfPoints(pts: Point[]): Rect {
  if (!pts.length) return { x: 0, y: 0, w: 0, h: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** Begrenzungsrechteck des gesamten Inhalts (oder null bei leerem Dokument). */
export function contentBounds(doc: NetDoc, ids?: Iterable<string>): Rect | null {
  let r: Rect | null = null;
  for (const id of ids ?? doc.order) {
    const el = doc.elements[id];
    if (!el) continue;
    r = unionRect(r, elementBounds(doc, el));
  }
  return r;
}

/** Standardposition der Namensbeschriftung relativ zum Knotenmittelpunkt. */
export function defaultNameOffset(node: NodeEl): Point {
  if (node.type === 'place') return { x: 0, y: -node.r - 12 };
  return { x: 0, y: -node.h / 2 - 12 };
}

export function defaultSecondaryOffset(node: NodeEl): Point {
  if (node.type === 'place') return { x: node.r + 14, y: node.r - 2 };
  return { x: 0, y: node.h / 2 + 14 };
}
