/**
 * Automatische Platzierung von Beschriftungen: Name und Zusatzangabe
 * (Kapazität bzw. Verzögerung) werden auf die Seiten eines Knotens gelegt,
 * an denen möglichst keine Kanten ansetzen.
 */
import { arcPolyline } from '../model/geometry';
import type { NetDoc, NodeEl, Point } from '../model/types';

export interface LabelSlots {
  name: Point;
  secondary: Point;
}

type Side = 'top' | 'bottom' | 'right' | 'left';

const SIDE_ANGLE: Record<Side, number> = {
  right: 0,
  bottom: Math.PI / 2,
  left: Math.PI,
  top: -Math.PI / 2,
};

function angleDist(a: number, b: number): number {
  const d = Math.abs(a - b) % (2 * Math.PI);
  return d > Math.PI ? 2 * Math.PI - d : d;
}

/** geschätzte Textbreite in Pixel (Beschriftungen ca. 12 px) */
export function textWidth(text: string, size = 12.5): number {
  return Math.max(8, text.length * size * 0.58);
}

function offsetFor(node: NodeEl, side: Side, text: string, size: number): Point {
  const hw = node.type === 'place' ? node.r : node.w / 2;
  const hh = node.type === 'place' ? node.r : node.h / 2;
  const gap = 12;
  switch (side) {
    case 'top':
      return { x: 0, y: -hh - gap };
    case 'bottom':
      return { x: 0, y: hh + gap };
    case 'right':
      return { x: hw + 7 + textWidth(text, size) / 2, y: 0 };
    case 'left':
      return { x: -hw - 7 - textWidth(text, size) / 2, y: 0 };
  }
}

function secondaryText(node: NodeEl): string {
  if (node.type === 'place') return node.capacity > 0 ? `K=${node.capacity}` : '';
  return node.timing === 'immediate' ? '' : '⏱ 0000';
}

/** Berechnet für jeden Knoten die bevorzugten Beschriftungspositionen. */
export function autoLabelSlots(doc: NetDoc): Map<string, LabelSlots> {
  const angles = new Map<string, number[]>();
  const push = (id: string, a: number) => {
    const list = angles.get(id);
    if (list) list.push(a);
    else angles.set(id, [a]);
  };
  for (const id of doc.order) {
    const el = doc.elements[id];
    if (el?.type !== 'arc') continue;
    const s = doc.elements[el.source];
    const t = doc.elements[el.target];
    if (!s || !t || (s.type !== 'place' && s.type !== 'transition') || (t.type !== 'place' && t.type !== 'transition')) continue;
    const pts = arcPolyline(el, s, t);
    if (pts.length < 2) continue;
    const a0 = pts[0];
    const a1 = pts[1];
    push(s.id, Math.atan2(a1.y - a0.y, a1.x - a0.x));
    const b0 = pts[pts.length - 1];
    const b1 = pts[pts.length - 2];
    push(t.id, Math.atan2(b1.y - b0.y, b1.x - b0.x));
  }
  const res = new Map<string, LabelSlots>();
  for (const id of doc.order) {
    const node = doc.elements[id];
    if (!node || (node.type !== 'place' && node.type !== 'transition')) continue;
    const arcAngles = angles.get(id) ?? [];
    const vertical = node.type === 'transition' && node.h >= node.w;
    // Bevorzugte Reihenfolge ohne Kanten: Name oben, Zusatz unten
    const prefs: Side[] = ['top', 'bottom', vertical ? 'right' : 'right', 'left'];
    const score = (side: Side) => {
      if (!arcAngles.length) return Math.PI;
      let min = Math.PI;
      for (const a of arcAngles) min = Math.min(min, angleDist(a, SIDE_ANGLE[side]));
      return min;
    };
    const ranked = [...prefs].sort((a, b) => {
      const d = score(b) - score(a);
      // nahezu gleich gut → Präferenzreihenfolge beibehalten
      return Math.abs(d) < 0.35 ? prefs.indexOf(a) - prefs.indexOf(b) : d;
    });
    const nameSide = ranked[0];
    let secSide = ranked.find((s) => s !== nameSide && (s === 'bottom' || s === 'top')) ?? ranked[1];
    if (score(secSide) < 0.6) secSide = ranked[1];
    const name = offsetFor(node, nameSide, node.name, 12.5);
    let secondary = offsetFor(node, secSide, secondaryText(node), 11);
    if (node.type === 'place' && secSide === nameSide) secondary = { x: node.r + 14, y: node.r - 2 };
    res.set(id, { name, secondary });
  }
  return res;
}
