/**
 * Import des Binärformats (*.hps) des Original-HPSim 1.x (H. Anschütz, 1999–2001).
 *
 * Das Format ist eine MFC-CArchive-Serialisierung: ein Objektzähler (WORD),
 * danach die Objekte mit MFC-Klassenkennungen (CHRect, CHText, CHLabel,
 * CHPosition = Stelle, CHTransition, CHConnector = Kante, CHLine, CHPoly,
 * CHGroup) und am Ende 90 Byte Dokumenteinstellungen.
 * Die Feldbelegung wurde aus den Serialize-Routinen der HPSim.exe ermittelt.
 */
import { createArc, createDoc, createLine, createPlace, createPoly, createRect, createText, createTransition, newId } from '../model/defaults';
import { arcPolyline, polylineMidpoint } from '../model/geometry';
import type { ArcKind, DashStyle, Element, NetDoc, Point, TimingModel } from '../model/types';

export class LegacyFormatError extends Error {}

/** Skalierungsfaktor: Das Original zeichnete sehr klein (Stellen 24 px). */
export const LEGACY_SCALE = 1.5;

interface RawBase {
  cls: string;
}
interface RawRect extends RawBase {
  cls: 'CHRect';
  l: number; t: number; r: number; b: number;
  fill: number; pen: number; penStyle: number; penWidth: number; style: number; roundX: number; roundY: number; empty: boolean;
}
interface RawLine extends RawBase {
  cls: 'CHLine';
  l: number; t: number; r: number; b: number;
  penStyle: number; penWidth: number; pen: number;
}
interface RawPoly extends RawBase {
  cls: 'CHPoly';
  pen: number; fill: number; type: number; penStyle: number; penWidth: number; empty: boolean; points: Point[];
}
interface RawText extends RawBase {
  cls: 'CHText';
  x: number; y: number; w: number; h: number;
  color: number; fontHeight: number; fontWeight: number; italic: boolean; underline: boolean; face: string; text: string;
}
interface RawLabel extends RawBase {
  cls: 'CHLabel';
  text: string; x: number; y: number; w: number; h: number; owner: number; sub: number; visible: boolean;
}
interface RawPlace extends RawBase {
  cls: 'CHPosition';
  start: number; capacity: number; current: number; counter: number;
  l: number; t: number; r: number; b: number; id: number;
}
interface RawTransition extends RawBase {
  cls: 'CHTransition';
  l: number; t: number; r: number; b: number; id: number;
  currentDelay: number; delay: number; fired: number; range: number; mode: number;
}
interface RawConnector extends RawBase {
  cls: 'CHConnector';
  id: number; src: number; dst: number; weight: number; type: number; points: Point[];
}
interface RawGroup extends RawBase {
  cls: 'CHGroup';
  children: RawObject[];
}
type RawObject = RawRect | RawLine | RawPoly | RawText | RawLabel | RawPlace | RawTransition | RawConnector | RawGroup;

interface RawDocSettings {
  width: number;
  height: number;
  grid: number;
  timeLimit: number;
  stepLimit: number;
  runDelay: number;
  sampleTime: number;
  background: number;
}

class Reader {
  pos = 0;
  private readonly view: DataView;
  /** MFC-Lade-Tabelle: Index → Klassenname bzw. Objekt */
  readonly loadMap: (string | RawObject | null)[] = [null];

  constructor(private readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  get remaining(): number {
    return this.bytes.length - this.pos;
  }

  private need(n: number): void {
    if (this.pos + n > this.bytes.length) {
      throw new LegacyFormatError('Unerwartetes Dateiende – die Datei ist unvollständig oder beschädigt.');
    }
  }

  u8(): number {
    this.need(1);
    return this.view.getUint8(this.pos++);
  }
  u16(): number {
    this.need(2);
    const v = this.view.getUint16(this.pos, true);
    this.pos += 2;
    return v;
  }
  i16(): number {
    this.need(2);
    const v = this.view.getInt16(this.pos, true);
    this.pos += 2;
    return v;
  }
  i32(): number {
    this.need(4);
    const v = this.view.getInt32(this.pos, true);
    this.pos += 4;
    return v;
  }
  u32(): number {
    this.need(4);
    const v = this.view.getUint32(this.pos, true);
    this.pos += 4;
    return v;
  }
  skip(n: number): void {
    this.need(n);
    this.pos += n;
  }
  bytesAt(n: number): Uint8Array {
    this.need(n);
    const b = this.bytes.subarray(this.pos, this.pos + n);
    this.pos += n;
    return b;
  }
  count(): number {
    const w = this.u16();
    return w === 0xffff ? this.u32() : w;
  }
  cstring(): string {
    let n = this.u8();
    let unicode = false;
    if (n === 0xff) {
      n = this.u16();
      if (n === 0xfffe) {
        unicode = true;
        n = this.u8();
        if (n === 0xff) n = this.u16();
      }
      if (n === 0xffff) n = this.u32();
    }
    if (n > this.remaining) throw new LegacyFormatError('Ungültige Zeichenkettenlänge in der Datei.');
    if (unicode) {
      const b = this.bytesAt(n * 2);
      return new TextDecoder('utf-16le').decode(b);
    }
    return decodeCp1252(this.bytesAt(n));
  }
}

const CP1252_EXTRA: Record<number, string> = {
  0x80: '€', 0x82: '‚', 0x83: 'ƒ', 0x84: '„', 0x85: '…', 0x86: '†', 0x87: '‡', 0x88: 'ˆ', 0x89: '‰', 0x8a: 'Š',
  0x8b: '‹', 0x8c: 'Œ', 0x8e: 'Ž', 0x91: '‘', 0x92: '’', 0x93: '“', 0x94: '”', 0x95: '•', 0x96: '–', 0x97: '—',
  0x98: '˜', 0x99: '™', 0x9a: 'š', 0x9b: '›', 0x9c: 'œ', 0x9e: 'ž', 0x9f: 'Ÿ',
};

export function decodeCp1252(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += CP1252_EXTRA[b] ?? String.fromCharCode(b);
  return s;
}

function readRect(r: Reader): RawRect {
  const l = r.i32(), t = r.i32(), rr = r.i32(), b = r.i32();
  const fill = r.u32();
  const pen = r.u32();
  const penStyle = r.i16();
  const penWidth = r.i16();
  const style = r.i16();
  const roundX = r.i16();
  const roundY = r.i16();
  const empty = r.u8() !== 0;
  return { cls: 'CHRect', l, t, r: rr, b, fill, pen, penStyle, penWidth, style, roundX, roundY, empty };
}

function readLine(r: Reader): RawLine {
  const l = r.i32(), t = r.i32(), rr = r.i32(), b = r.i32();
  const penStyle = r.i16();
  const penWidth = r.i16();
  const pen = r.u32();
  return { cls: 'CHLine', l, t, r: rr, b, penStyle, penWidth, pen };
}

function readPoints(r: Reader): Point[] {
  const n = r.count();
  if (n * 8 > r.remaining) throw new LegacyFormatError('Ungültige Punktanzahl in der Datei.');
  const pts: Point[] = [];
  for (let i = 0; i < n; i++) pts.push({ x: r.i32(), y: r.i32() });
  return pts;
}

function readPoly(r: Reader): RawPoly {
  r.skip(16); // Begrenzungsrechteck
  const pen = r.u32();
  const fill = r.u32();
  const type = r.i16();
  const penStyle = r.i16();
  const penWidth = r.i16();
  const empty = r.u8() !== 0;
  const points = readPoints(r);
  return { cls: 'CHPoly', pen, fill, type, penStyle, penWidth, empty, points };
}

/** Texte und Beschriftungen speichern ihr Rechteck in der Reihenfolge oben, links, unten, rechts. */
function readTransposedRect(r: Reader) {
  const top = r.i32(), left = r.i32(), bottom = r.i32(), right = r.i32();
  return { x: left, y: top, w: right - left, h: bottom - top };
}

function readText(r: Reader): RawText {
  const rect = readTransposedRect(r);
  const color = r.u32();
  const lf = r.bytesAt(60);
  const dv = new DataView(lf.buffer, lf.byteOffset, 60);
  const fontHeight = dv.getInt32(0, true);
  const fontWeight = dv.getInt32(16, true);
  const italic = lf[20] !== 0;
  const underline = lf[21] !== 0;
  const faceBytes = lf.subarray(28, 60);
  const nul = faceBytes.indexOf(0);
  const face = decodeCp1252(nul >= 0 ? faceBytes.subarray(0, nul) : faceBytes);
  const text = r.cstring();
  return { cls: 'CHText', ...rect, color, fontHeight, fontWeight, italic, underline, face, text };
}

function readLabel(r: Reader): RawLabel {
  const text = r.cstring();
  const rect = readTransposedRect(r);
  const owner = r.i32();
  const sub = r.i32();
  const visible = r.u8() !== 0;
  r.skip(2);
  return { cls: 'CHLabel', text, ...rect, owner, sub, visible };
}

function readPlace(r: Reader): RawPlace {
  const start = r.i32();
  const capacity = r.i32();
  const current = r.i32();
  const counter = r.i32();
  const l = r.i32(), t = r.i32(), rr = r.i32(), b = r.i32();
  r.i32(); // Größe
  const id = r.i32();
  r.skip(4 + 7 + 8);
  return { cls: 'CHPosition', start, capacity, current, counter, l, t, r: rr, b, id };
}

function readTransition(r: Reader): RawTransition {
  r.i32(); // Größe
  const l = r.i32(), t = r.i32(), rr = r.i32(), b = r.i32();
  const id = r.i32();
  const currentDelay = r.i32();
  const delay = r.i32();
  const fired = r.i32();
  const range = r.i32();
  r.skip(8 + 2);
  const mode = r.u8();
  r.skip(6 + 8);
  return { cls: 'CHTransition', l, t, r: rr, b, id, currentDelay, delay, fired, range, mode };
}

function readConnector(r: Reader): RawConnector {
  r.skip(16 + 16); // Begrenzungsrechteck, Pfeilspitze
  const id = r.i32();
  const src = r.i32();
  const dst = r.i32();
  const weight = r.i32();
  r.skip(4 + 2);
  const type = r.i16();
  r.skip(6 + 5 + 8);
  const points = readPoints(r);
  return { cls: 'CHConnector', id, src, dst, weight, type, points };
}

function readGroup(r: Reader): RawGroup {
  r.skip(16);
  const n = r.count();
  const children: RawObject[] = [];
  for (let i = 0; i < n; i++) {
    const o = readObject(r);
    if (o) children.push(o);
  }
  return { cls: 'CHGroup', children };
}

const READERS: Record<string, (r: Reader) => RawObject> = {
  CHRect: readRect,
  CHLine: readLine,
  CHPoly: readPoly,
  CHText: readText,
  CHLabel: readLabel,
  CHPosition: readPlace,
  CHTransition: readTransition,
  CHConnector: readConnector,
  CHGroup: readGroup,
};

function readObject(r: Reader): RawObject | null {
  const tag = r.u16();
  let cls: string;
  if (tag === 0xffff) {
    r.u16(); // Schema
    const len = r.u16();
    if (len > 64) throw new LegacyFormatError('Ungültiger Klassenname in der Datei.');
    cls = decodeCp1252(r.bytesAt(len));
    r.loadMap.push(cls);
  } else {
    const big = tag === 0x7fff ? r.u32() : ((tag & 0x8000) << 16) | (tag & 0x7fff);
    const isClass = (big & 0x80000000) !== 0;
    const idx = big & 0x7fffffff;
    if (!isClass) {
      if (idx === 0) return null;
      const ref = r.loadMap[idx];
      if (ref && typeof ref === 'object') return null; // bereits gelesenes Objekt (doppelte Referenz)
      throw new LegacyFormatError('Ungültiger Objektverweis in der Datei.');
    }
    const entry = r.loadMap[idx];
    if (typeof entry !== 'string') throw new LegacyFormatError('Ungültige Klassenkennung in der Datei.');
    cls = entry;
  }
  const reader = READERS[cls];
  if (!reader) {
    throw new LegacyFormatError(`Unbekannter Objekttyp „${cls}“ – diese Datei stammt vermutlich nicht von HPSim 1.x.`);
  }
  const slot = r.loadMap.length;
  r.loadMap.push(null);
  const obj = reader(r);
  r.loadMap[slot] = obj;
  return obj;
}

function readSettings(r: Reader): RawDocSettings | null {
  if (r.remaining < 90) return null;
  const width = r.i32();
  const height = r.i32();
  r.skip(12); // letzte vergebene IDs
  const grid = r.i32();
  r.i32(); // Schrittzähler
  const timeLimit = r.i32();
  const stepLimit = r.i32();
  const runDelay = r.i32();
  r.i32(); // Simulationszeit
  const sampleTime = r.i32();
  const background = r.u32();
  return { width, height, grid, timeLimit, stepLimit, runDelay, sampleTime, background };
}

/** COLORREF (0x00BBGGRR) → #rrggbb */
export function colorRefToHex(c: number): string {
  const r = c & 0xff;
  const g = (c >> 8) & 0xff;
  const b = (c >> 16) & 0xff;
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

function isBlack(c: number): boolean {
  return (c & 0xffffff) === 0;
}

function dashFromPenStyle(style: number): DashStyle {
  switch (style) {
    case 1:
      return 'dashed';
    case 2:
      return 'dotted';
    case 3:
    case 4:
      return 'dashdot';
    default:
      return 'solid';
  }
}

const TIMING: TimingModel[] = ['immediate', 'deterministic', 'exponential', 'uniform'];
const UNLIMITED = 0xffffff;

export interface LegacyImportResult {
  doc: NetDoc;
  warnings: string[];
  stats: { places: number; transitions: number; arcs: number; decor: number };
}

export function parseLegacyObjects(data: ArrayBuffer | Uint8Array): { objects: RawObject[]; settings: RawDocSettings | null } {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (bytes.length < 4) throw new LegacyFormatError('Die Datei ist leer oder zu kurz.');
  const r = new Reader(bytes);
  const count = r.count();
  const objects: RawObject[] = [];
  for (let i = 0; i < count; i++) {
    const o = readObject(r);
    if (o) objects.push(o);
  }
  const settings = readSettings(r);
  return { objects, settings };
}

export function importLegacyHps(data: ArrayBuffer | Uint8Array, title = 'Importiertes HPSim-Netz'): LegacyImportResult {
  const { objects, settings } = parseLegacyObjects(data);
  const S = LEGACY_SCALE;
  const warnings: string[] = [];
  const doc = createDoc(title);
  doc.meta.description = 'Importiert aus dem Original-HPSim (*.hps).';
  const els: Element[] = [];
  const byLegacyId = new Map<number, Element>();
  const labels: RawLabel[] = [];
  const connectors: RawConnector[] = [];

  const flat: { o: RawObject; group: string | null }[] = [];
  const flatten = (list: RawObject[], group: string | null) => {
    for (const o of list) {
      if (o.cls === 'CHGroup') flatten(o.children, group ?? newId('g'));
      else flat.push({ o, group });
    }
  };
  flatten(objects, null);

  const sc = (v: number) => Math.round(v * S * 100) / 100;

  for (const { o, group } of flat) {
    switch (o.cls) {
      case 'CHPosition': {
        const p = createPlace(doc, { x: sc((o.l + o.r) / 2), y: sc((o.t + o.b) / 2) }, {
          r: Math.max(6, sc(Math.abs(o.r - o.l) / 2)),
          tokens: Math.max(0, o.start),
          capacity: o.capacity >= UNLIMITED || o.capacity <= 0 ? 0 : o.capacity,
          name: '',
          showName: false,
          showCapacity: false,
          groupId: group,
        });
        els.push(p);
        byLegacyId.set(o.id, p);
        break;
      }
      case 'CHTransition': {
        const timing = TIMING[o.mode] ?? 'immediate';
        const t = createTransition(doc, { x: sc((o.l + o.r) / 2), y: sc((o.t + o.b) / 2) }, {
          w: Math.max(4, sc(Math.abs(o.r - o.l))),
          h: Math.max(4, sc(Math.abs(o.b - o.t))),
          timing,
          delay: Math.max(0, o.delay),
          delayMax: Math.max(0, timing === 'uniform' ? o.range : Math.max(o.range, o.delay)),
          name: '',
          showName: false,
          showDelay: false,
          groupId: group,
        });
        els.push(t);
        byLegacyId.set(o.id, t);
        break;
      }
      case 'CHConnector':
        connectors.push(o);
        break;
      case 'CHLabel':
        labels.push(o);
        break;
      case 'CHText': {
        const size = Math.max(8, Math.round(Math.abs(o.fontHeight || 13) * S));
        els.push(
          createText(sc(o.x), sc(o.y), o.text, {
            fontSize: size,
            fontFamily: o.face || 'Arial',
            bold: o.fontWeight >= 600,
            italic: o.italic,
            underline: o.underline,
            color: isBlack(o.color) ? '' : colorRefToHex(o.color),
            groupId: group,
          }),
        );
        break;
      }
      case 'CHRect': {
        const x = Math.min(o.l, o.r);
        const y = Math.min(o.t, o.b);
        els.push(
          createRect(sc(x), sc(y), sc(Math.abs(o.r - o.l)), sc(Math.abs(o.b - o.t)), {
            shape: o.style === 2 ? 'ellipse' : o.style === 1 ? 'roundrect' : 'rect',
            radius: sc(Math.max(0, Math.min(o.roundX, o.roundY)) / 2),
            stroke: isBlack(o.pen) ? '' : colorRefToHex(o.pen),
            strokeWidth: o.penStyle === 5 ? 0 : Math.max(1, o.penWidth) * 1.25,
            dash: dashFromPenStyle(o.penStyle),
            fill: colorRefToHex(o.fill),
            filled: !o.empty,
            groupId: group,
          }),
        );
        break;
      }
      case 'CHLine':
        els.push(
          createLine(sc(o.l), sc(o.t), sc(o.r), sc(o.b), {
            stroke: isBlack(o.pen) ? '' : colorRefToHex(o.pen),
            strokeWidth: Math.max(1, o.penWidth) * 1.25,
            dash: dashFromPenStyle(o.penStyle),
            groupId: group,
          }),
        );
        break;
      case 'CHPoly':
        els.push(
          createPoly(o.points.map((p) => ({ x: sc(p.x), y: sc(p.y) })), {
            closed: o.type === 1,
            stroke: isBlack(o.pen) ? '' : colorRefToHex(o.pen),
            strokeWidth: Math.max(1, o.penWidth) * 1.25,
            dash: dashFromPenStyle(o.penStyle),
            fill: colorRefToHex(o.fill),
            filled: o.type === 1 && !o.empty,
            groupId: group,
          }),
        );
        break;
    }
  }

  // Elemente zunächst einfügen, damit Namen und Kanten aufgelöst werden können
  for (const el of els) {
    doc.elements[el.id] = el;
    doc.order.push(el.id);
  }

  const arcByLegacyId = new Map<number, Element>();
  for (const c of connectors) {
    const s = byLegacyId.get(c.src);
    const t = byLegacyId.get(c.dst);
    if (!s || !t || s.type === t.type || (s.type !== 'place' && s.type !== 'transition') || (t.type !== 'place' && t.type !== 'transition')) {
      warnings.push(`Eine Kante (ID ${c.id}) verweist auf nicht vorhandene oder ungültige Elemente und wurde übersprungen.`);
      continue;
    }
    let kind: ArcKind = c.type === 1 ? 'inhibitor' : c.type === 2 ? 'test' : 'normal';
    if (kind !== 'normal' && s.type !== 'place') {
      warnings.push('Eine Test-/Inhibitorkante von einer Transition zu einer Stelle wurde in eine normale Kante umgewandelt.');
      kind = 'normal';
    }
    const duplicate = doc.order.some((id) => {
      const el = doc.elements[id];
      return el.type === 'arc' && el.source === s.id && el.target === t.id;
    });
    if (duplicate) {
      warnings.push('Eine doppelte Kante wurde übersprungen.');
      continue;
    }
    const bends = c.points.slice(1, -1).map((p) => ({ x: sc(p.x), y: sc(p.y) }));
    const arc = createArc(s.id, t.id, { weight: Math.max(1, c.weight), kind, points: bends });
    doc.elements[arc.id] = arc;
    doc.order.push(arc.id);
    arcByLegacyId.set(c.id, arc);
  }

  // Beschriftungen auswerten: Namen, Sichtbarkeit und Position übernehmen
  for (const lb of labels) {
    const center = { x: sc(lb.x + lb.w / 2), y: sc(lb.y + lb.h / 2) };
    const owner = byLegacyId.get(lb.owner) ?? arcByLegacyId.get(lb.owner);
    if (!owner) continue;
    if (owner.type === 'place') {
      const off = { x: Math.round(center.x - owner.x), y: Math.round(center.y - owner.y) };
      if (lb.sub === 0) {
        owner.name = lb.text;
        owner.showName = lb.visible;
        owner.nameOffset = off;
      } else {
        owner.showCapacity = lb.visible && owner.capacity > 0;
        owner.capOffset = off;
      }
    } else if (owner.type === 'transition') {
      const off = { x: Math.round(center.x - owner.x), y: Math.round(center.y - owner.y) };
      if (lb.sub === 0) {
        owner.name = lb.text;
        owner.showName = lb.visible;
        owner.nameOffset = off;
      } else {
        owner.showDelay = lb.visible && owner.timing !== 'immediate';
        owner.delayOffset = off;
      }
    } else if (owner.type === 'arc') {
      owner.showWeight = lb.visible;
      const s = doc.elements[owner.source];
      const t = doc.elements[owner.target];
      if ((s.type === 'place' || s.type === 'transition') && (t.type === 'place' || t.type === 'transition')) {
        const mid = polylineMidpoint(arcPolyline(owner, s, t)).p;
        owner.labelOffset = { x: Math.round(center.x - mid.x), y: Math.round(center.y - mid.y) };
      }
    }
  }

  // Fehlende Namen ergänzen und Namen eindeutig machen
  const used = new Map<string, number>();
  let pCount = 0;
  let tCount = 0;
  for (const id of doc.order) {
    const el = doc.elements[id];
    if (el.type !== 'place' && el.type !== 'transition') continue;
    if (!el.name.trim()) el.name = el.type === 'place' ? `P${++pCount}` : `T${++tCount}`;
    const n = used.get(el.name) ?? 0;
    used.set(el.name, n + 1);
  }
  const dupNames = [...used.entries()].filter(([, n]) => n > 1).map(([name]) => name);
  if (dupNames.length) {
    warnings.push(
      `Mehrfach vergebene Namen: ${dupNames.slice(0, 8).join(', ')}${dupNames.length > 8 ? ' …' : ''}. ` +
        'Das ist erlaubt, kann aber in Auswertungen verwirren.',
    );
  }

  if (settings) {
    doc.settings.grid.size = settings.grid > 0 && settings.grid <= 100 ? settings.grid : 10;
    doc.settings.sim.timeStep = settings.sampleTime > 0 ? settings.sampleTime : 1;
    doc.settings.sim.timeUnit = 'ms';
    doc.settings.sim.maxTime = settings.timeLimit > 0 && settings.timeLimit < 1e9 ? settings.timeLimit : 0;
    doc.settings.sim.maxSteps = settings.stepLimit > 0 && settings.stepLimit < 1e9 ? settings.stepLimit : 0;
    doc.settings.sim.conflict = 'classic';
    const bg = settings.background & 0xffffff;
    doc.settings.background = bg === 0xffffff ? null : colorRefToHex(bg);
  }

  const stats = { places: 0, transitions: 0, arcs: 0, decor: 0 };
  for (const id of doc.order) {
    const t = doc.elements[id].type;
    if (t === 'place') stats.places++;
    else if (t === 'transition') stats.transitions++;
    else if (t === 'arc') stats.arcs++;
    else stats.decor++;
  }
  return { doc, warnings, stats };
}
