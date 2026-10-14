/**
 * Reine Dokument-Operationen. Sie arbeiten direkt auf einem (Immer-)Entwurf
 * und werden von Store, Import und Tests gleichermaßen benutzt.
 */
import { createDoc, newId, nextName } from './defaults';
import { contentBounds, elementBounds } from './geometry';
import type { ArcEl, Element, Id, NetDoc, Point } from './types';
import { isDecor, isNode } from './types';

export type ConnectResult = { ok: true } | { ok: false; reason: string };

export function canConnect(doc: NetDoc, sourceId: Id, targetId: Id, ignoreArcId?: Id): ConnectResult {
  const s = doc.elements[sourceId];
  const t = doc.elements[targetId];
  if (!isNode(s)) return { ok: false, reason: 'Der Startpunkt ist weder eine Stelle noch eine Transition.' };
  if (!isNode(t)) return { ok: false, reason: 'Der Endpunkt ist weder eine Stelle noch eine Transition.' };
  if (s.id === t.id) return { ok: false, reason: 'Ein Element kann nicht mit sich selbst verbunden werden.' };
  if (s.type === t.type) {
    return {
      ok: false,
      reason:
        s.type === 'place'
          ? 'Zwei Stellen können nicht direkt verbunden werden – dazwischen muss eine Transition liegen.'
          : 'Zwei Transitionen können nicht direkt verbunden werden – dazwischen muss eine Stelle liegen.',
    };
  }
  for (const id of doc.order) {
    const el = doc.elements[id];
    if (el?.type === 'arc' && el.id !== ignoreArcId && el.source === sourceId && el.target === targetId) {
      return { ok: false, reason: 'Diese Verbindung existiert bereits. Erhöhe stattdessen das Kantengewicht.' };
    }
  }
  return { ok: true };
}

export function addElements(doc: NetDoc, els: Element[]): void {
  for (const el of els) {
    doc.elements[el.id] = el;
    doc.order.push(el.id);
  }
}

export function arcsOf(doc: NetDoc, nodeId: Id): ArcEl[] {
  const res: ArcEl[] = [];
  for (const id of doc.order) {
    const el = doc.elements[id];
    if (el?.type === 'arc' && (el.source === nodeId || el.target === nodeId)) res.push(el);
  }
  return res;
}

/** Löscht Elemente; Kanten an gelöschten Knoten werden mitgelöscht. */
export function deleteElements(doc: NetDoc, ids: Iterable<Id>): Set<Id> {
  const del = new Set<Id>();
  for (const id of ids) if (doc.elements[id]) del.add(id);
  for (const id of doc.order) {
    const el = doc.elements[id];
    if (el?.type === 'arc' && (del.has(el.source) || del.has(el.target))) del.add(id);
  }
  for (const id of del) delete doc.elements[id];
  doc.order = doc.order.filter((id) => !del.has(id));
  return del;
}

/** Erweitert eine Auswahl um alle Mitglieder derselben Gruppen. */
export function expandGroups(doc: NetDoc, ids: Iterable<Id>): Set<Id> {
  const res = new Set<Id>(ids);
  const groups = new Set<string>();
  for (const id of res) {
    const g = doc.elements[id]?.groupId;
    if (g) groups.add(g);
  }
  if (groups.size) {
    for (const id of doc.order) {
      const g = doc.elements[id]?.groupId;
      if (g && groups.has(g)) res.add(id);
    }
  }
  return res;
}

/** Verschiebt Elemente. Knickpunkte von Kanten wandern mit, wenn beide Enden bewegt werden. */
export function moveElements(doc: NetDoc, ids: Iterable<Id>, dx: number, dy: number): void {
  if (!dx && !dy) return;
  const set = new Set(ids);
  for (const id of set) {
    const el = doc.elements[id];
    if (!el) continue;
    switch (el.type) {
      case 'place':
      case 'transition':
      case 'rect':
      case 'text':
        el.x += dx;
        el.y += dy;
        break;
      case 'line':
        el.x1 += dx;
        el.y1 += dy;
        el.x2 += dx;
        el.y2 += dy;
        break;
      case 'poly':
        for (const p of el.points) {
          p.x += dx;
          p.y += dy;
        }
        break;
      case 'arc':
        break;
    }
  }
  for (const id of doc.order) {
    const el = doc.elements[id];
    if (el?.type !== 'arc') continue;
    const both = set.has(el.source) && set.has(el.target);
    if (both || (set.has(el.id) && !set.has(el.source) && !set.has(el.target))) {
      for (const p of el.points) {
        p.x += dx;
        p.y += dy;
      }
    }
  }
}

function uniqueName(doc: NetDoc, name: string, taken: Set<string>, prefix: 'P' | 'T'): string {
  if (/^[PT]\d+$/.test(name)) {
    let candidate = nextName(doc, prefix);
    let n = Number(candidate.slice(1));
    while (taken.has(candidate)) candidate = `${prefix}${++n}`;
    return candidate;
  }
  if (!taken.has(name)) return name;
  let i = 2;
  while (taken.has(`${name} ${i}`)) i++;
  return `${name} ${i}`;
}

/**
 * Kopiert Elemente mit neuen IDs. Kanten werden nur übernommen, wenn
 * Quelle und Ziel mitkopiert werden (wie im Original-HPSim).
 */
export function cloneElements(doc: NetDoc, source: Element[], offset: Point, renameIn?: NetDoc): Element[] {
  const map = new Map<Id, Id>();
  const groupMap = new Map<string, string>();
  const result: Element[] = [];
  const target = renameIn ?? doc;
  const taken = new Set<string>();
  for (const id of target.order) {
    const el = target.elements[id];
    if (el && 'name' in el) taken.add(el.name);
  }
  const nameScratch: NetDoc = { ...createDoc(), elements: { ...target.elements }, order: [...target.order] };
  for (const el of source) {
    if (el.type === 'arc') continue;
    const copy = structuredClone(el) as Element;
    copy.id = newId(el.type[0]);
    map.set(el.id, copy.id);
    if (copy.groupId) {
      if (!groupMap.has(copy.groupId)) groupMap.set(copy.groupId, newId('g'));
      copy.groupId = groupMap.get(copy.groupId)!;
    }
    if (copy.type === 'place' || copy.type === 'transition') {
      copy.name = uniqueName(nameScratch, copy.name, taken, copy.type === 'place' ? 'P' : 'T');
      taken.add(copy.name);
      nameScratch.elements[copy.id] = copy;
      nameScratch.order.push(copy.id);
    }
    result.push(copy);
  }
  for (const el of source) {
    if (el.type !== 'arc') continue;
    const s = map.get(el.source);
    const t = map.get(el.target);
    if (!s || !t) continue;
    const copy = structuredClone(el);
    copy.id = newId('a');
    copy.source = s;
    copy.target = t;
    copy.groupId = null;
    result.push(copy);
  }
  const tmp: NetDoc = { ...createDoc(), elements: {}, order: [] };
  addElements(tmp, result);
  moveElements(tmp, tmp.order, offset.x, offset.y);
  return tmp.order.map((id) => tmp.elements[id]);
}

export function groupElements(doc: NetDoc, ids: Iterable<Id>): string | null {
  const members = [...ids].filter((id) => {
    const el = doc.elements[id];
    return el && el.type !== 'arc';
  });
  if (members.length < 2) return null;
  const gid = newId('g');
  for (const id of members) doc.elements[id].groupId = gid;
  return gid;
}

export function ungroupElements(doc: NetDoc, ids: Iterable<Id>): void {
  for (const id of expandGroups(doc, ids)) {
    const el = doc.elements[id];
    if (el) el.groupId = null;
  }
}

export type ZOrderOp = 'front' | 'back' | 'forward' | 'backward';

export function reorder(doc: NetDoc, ids: Iterable<Id>, op: ZOrderOp): void {
  const set = new Set(ids);
  const order = doc.order;
  if (op === 'front') {
    doc.order = [...order.filter((id) => !set.has(id)), ...order.filter((id) => set.has(id))];
  } else if (op === 'back') {
    doc.order = [...order.filter((id) => set.has(id)), ...order.filter((id) => !set.has(id))];
  } else if (op === 'forward') {
    const arr = [...order];
    for (let i = arr.length - 2; i >= 0; i--) {
      if (set.has(arr[i]) && !set.has(arr[i + 1])) [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
    }
    doc.order = arr;
  } else {
    const arr = [...order];
    for (let i = 1; i < arr.length; i++) {
      if (set.has(arr[i]) && !set.has(arr[i - 1])) [arr[i], arr[i - 1]] = [arr[i - 1], arr[i]];
    }
    doc.order = arr;
  }
}

export type AlignMode = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom';

export function alignElements(doc: NetDoc, ids: Id[], mode: AlignMode): void {
  const els = ids.map((id) => doc.elements[id]).filter((el) => el && el.type !== 'arc');
  if (els.length < 2) return;
  const all = contentBounds(doc, els.map((e) => e.id));
  if (!all) return;
  for (const el of els) {
    const b = elementBounds(doc, el);
    let dx = 0;
    let dy = 0;
    switch (mode) {
      case 'left':
        dx = all.x - b.x;
        break;
      case 'right':
        dx = all.x + all.w - (b.x + b.w);
        break;
      case 'hcenter':
        dx = all.x + all.w / 2 - (b.x + b.w / 2);
        break;
      case 'top':
        dy = all.y - b.y;
        break;
      case 'bottom':
        dy = all.y + all.h - (b.y + b.h);
        break;
      case 'vcenter':
        dy = all.y + all.h / 2 - (b.y + b.h / 2);
        break;
    }
    moveElements(doc, [el.id], dx, dy);
  }
}

export function distributeElements(doc: NetDoc, ids: Id[], axis: 'h' | 'v'): void {
  const els = ids.map((id) => doc.elements[id]).filter((el) => el && el.type !== 'arc');
  if (els.length < 3) return;
  const withB = els.map((el) => ({ el, b: elementBounds(doc, el) }));
  const key = (b: { x: number; y: number; w: number; h: number }) => (axis === 'h' ? b.x + b.w / 2 : b.y + b.h / 2);
  withB.sort((a, b) => key(a.b) - key(b.b));
  const first = key(withB[0].b);
  const last = key(withB[withB.length - 1].b);
  const step = (last - first) / (withB.length - 1);
  withB.forEach(({ el, b }, i) => {
    const d = first + step * i - key(b);
    moveElements(doc, [el.id], axis === 'h' ? d : 0, axis === 'v' ? d : 0);
  });
}

/** Dreht Transitionen um 90° (vertauscht Breite und Höhe). */
export function rotateTransitions(doc: NetDoc, ids: Iterable<Id>): void {
  for (const id of ids) {
    const el = doc.elements[id];
    if (el?.type === 'transition') {
      const w = el.w;
      el.w = el.h;
      el.h = w;
    }
  }
}

/** Kehrt die Richtung normaler Kanten um (falls dadurch kein Duplikat entsteht). */
export function reverseArcs(doc: NetDoc, ids: Iterable<Id>): number {
  let n = 0;
  for (const id of ids) {
    const el = doc.elements[id];
    if (el?.type !== 'arc') continue;
    if (el.kind !== 'normal') continue;
    const check = canConnect(doc, el.target, el.source, el.id);
    if (!check.ok) continue;
    const s = el.source;
    el.source = el.target;
    el.target = s;
    el.points.reverse();
    n++;
  }
  return n;
}

export function decorIds(doc: NetDoc): Id[] {
  return doc.order.filter((id) => isDecor(doc.elements[id]));
}
