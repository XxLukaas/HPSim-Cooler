/**
 * PNML-Import/-Export (Petri Net Markup Language, ISO/IEC 15909-2, P/T-Netze).
 *
 * Export: Standard-PNML für Stellen/Transitions-Netze (Namen, Positionen,
 * Anfangsmarkierung, Kantengewichte, Knickpunkte). Alles, was der Standard
 * nicht kennt (Kapazitäten, Zeiten, Test-/Inhibitorkanten, Zeichenobjekte,
 * Einstellungen), steht zusätzlich in <toolspecific tool="HPSim Studio">.
 * Damit bleibt ein Rundlauf HPSim Studio → PNML → HPSim Studio verlustfrei.
 *
 * Import: Standard-PNML plus gängige Erweiterungen (PIPE: Kapazität,
 * Inhibitorkanten, Raten; Referenzknoten; mehrere Seiten). Fehlen
 * Koordinaten, wird das Netz automatisch angeordnet.
 */
import { createDoc, newId } from '../model/defaults';
import { autoLayout } from '../model/layout';
import type { Element, NetDoc, Point } from '../model/types';
import { normalizeDoc } from './native';
import { child, childrenNamed, descendants, escapeXml, parseXml, pathText, XmlError, type XmlNode } from './xml';

export class PnmlFormatError extends Error {}

const TOOL = 'HPSim Studio';
const TOOL_VERSION = '2.0';
const PTNET = 'http://www.pnml.org/version-2009/grammar/ptnet';

// ───────────────────────────── Export ─────────────────────────────

const n = (v: number) => String(Math.round(v * 100) / 100);

function cdata(s: string): string {
  return `<![CDATA[${s.replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
}

function toolspecific(data: unknown, indent: string): string {
  return `${indent}<toolspecific tool="${TOOL}" version="${TOOL_VERSION}"><hpsim>${cdata(JSON.stringify(data))}</hpsim></toolspecific>\n`;
}

function nameLabel(name: string, offset: Point | null, indent: string): string {
  const g = offset ? `<graphics><offset x="${n(offset.x)}" y="${n(offset.y)}"/></graphics>` : '';
  return `${indent}<name><text>${escapeXml(name)}</text>${g}</name>\n`;
}

/** Erzeugt PNML-Text für ein Netz. */
export function exportPnml(doc: NetDoc): string {
  const out: string[] = [];
  out.push('<?xml version="1.0" encoding="UTF-8"?>\n');
  out.push('<pnml xmlns="http://www.pnml.org/version-2009/grammar/pnml">\n');
  out.push(`  <net id="net1" type="${PTNET}">\n`);
  out.push(nameLabel(doc.meta.title || 'Netz', null, '    '));
  const decor = doc.order.map((id) => doc.elements[id]).filter((el) => el && el.type !== 'place' && el.type !== 'transition' && el.type !== 'arc');
  out.push(toolspecific({ meta: doc.meta, settings: doc.settings, decor }, '    '));
  out.push('    <page id="page1">\n');
  const ind = '      ';
  for (const id of doc.order) {
    const el = doc.elements[id];
    if (!el) continue;
    if (el.type === 'place') {
      out.push(`${ind}<place id="${escapeXml(el.id)}">\n`);
      out.push(nameLabel(el.name, el.nameOffset, ind + '  '));
      out.push(`${ind}  <graphics><position x="${n(el.x)}" y="${n(el.y)}"/><dimension x="${n(el.r * 2)}" y="${n(el.r * 2)}"/></graphics>\n`);
      if (el.tokens > 0) out.push(`${ind}  <initialMarking><text>${el.tokens}</text></initialMarking>\n`);
      const { r, capacity, showName, showCapacity, capOffset, color, note, groupId } = el;
      out.push(toolspecific({ r, capacity, showName, showCapacity, capOffset, color, note, groupId }, ind + '  '));
      out.push(`${ind}</place>\n`);
    } else if (el.type === 'transition') {
      out.push(`${ind}<transition id="${escapeXml(el.id)}">\n`);
      out.push(nameLabel(el.name, el.nameOffset, ind + '  '));
      out.push(`${ind}  <graphics><position x="${n(el.x)}" y="${n(el.y)}"/><dimension x="${n(el.w)}" y="${n(el.h)}"/></graphics>\n`);
      const { w, h, timing, delay, delayMax, priority, showName, showDelay, delayOffset, color, note, groupId } = el;
      out.push(toolspecific({ w, h, timing, delay, delayMax, priority, showName, showDelay, delayOffset, color, note, groupId }, ind + '  '));
      out.push(`${ind}</transition>\n`);
    }
  }
  for (const id of doc.order) {
    const el = doc.elements[id];
    if (!el || el.type !== 'arc') continue;
    if (!doc.elements[el.source] || !doc.elements[el.target]) continue;
    out.push(`${ind}<arc id="${escapeXml(el.id)}" source="${escapeXml(el.source)}" target="${escapeXml(el.target)}">\n`);
    if (el.weight !== 1) out.push(`${ind}  <inscription><text>${el.weight}</text></inscription>\n`);
    if (el.points.length) out.push(`${ind}  <graphics>${el.points.map((p) => `<position x="${n(p.x)}" y="${n(p.y)}"/>`).join('')}</graphics>\n`);
    const { kind, showWeight, labelOffset, color, note } = el;
    out.push(toolspecific({ kind, showWeight, labelOffset, color, note }, ind + '  '));
    out.push(`${ind}</arc>\n`);
  }
  out.push('    </page>\n');
  out.push('  </net>\n');
  out.push('</pnml>\n');
  return out.join('');
}

/** Hinweise, was andere Werkzeuge beim Lesen der exportierten Datei nicht verstehen. */
export function pnmlExportNotes(doc: NetDoc): string[] {
  const notes: string[] = [];
  let special = 0;
  let caps = 0;
  let timed = 0;
  for (const id of doc.order) {
    const el = doc.elements[id];
    if (el?.type === 'arc' && el.kind !== 'normal') special++;
    if (el?.type === 'place' && el.capacity > 0) caps++;
    if (el?.type === 'transition' && el.timing !== 'immediate') timed++;
  }
  if (special) notes.push(`${special} Test-/Inhibitorkante(n)`);
  if (caps) notes.push(`${caps} Kapazität(en)`);
  if (timed) notes.push(`${timed} zeitbehaftete Transition(en)`);
  return notes;
}

// ───────────────────────────── Import ─────────────────────────────

function parseNumber(s: string | undefined): number | null {
  if (s === undefined) return null;
  // PIPE schreibt z. B. „Default,3“ – die letzte Zahl zählt
  const all = s.match(/-?\d+(?:[.,]\d+)?(?:e-?\d+)?/gi);
  if (!all) return null;
  const v = Number(all[all.length - 1].replace(',', '.'));
  return Number.isFinite(v) ? v : null;
}

/** Wert eines Labels: <x><text>…</text></x> oder (PIPE) <x><value>…</value></x>. */
function labelValue(node: XmlNode | undefined, name: string): string | undefined {
  const l = child(node, name);
  if (!l) return undefined;
  return pathText(l, 'text') ?? pathText(l, 'value') ?? (l.attrs.value !== undefined ? l.attrs.value : l.text.trim() || undefined);
}

function position(node: XmlNode | undefined): Point | null {
  const p = child(child(node, 'graphics'), 'position');
  if (!p) return null;
  const x = Number(p.attrs.x);
  const y = Number(p.attrs.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function nameOffset(node: XmlNode | undefined): Point | null {
  const o = child(child(child(node, 'name'), 'graphics'), 'offset');
  if (!o) return null;
  const x = Number(o.attrs.x);
  const y = Number(o.attrs.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

/** Daten unserer eigenen Erweiterung (oder null). */
function ownData(node: XmlNode | undefined): Record<string, unknown> | null {
  for (const ts of childrenNamed(node, 'toolspecific')) {
    if (ts.attrs.tool !== TOOL) continue;
    const raw = pathText(ts, 'hpsim');
    if (!raw) continue;
    try {
      const v = JSON.parse(raw);
      if (v && typeof v === 'object') return v as Record<string, unknown>;
    } catch {
      /* beschädigte Erweiterung ignorieren */
    }
  }
  return null;
}

function arcKind(node: XmlNode): 'normal' | 'test' | 'inhibitor' {
  const candidates = [child(node, 'type')?.attrs.value, labelValue(node, 'type'), labelValue(node, 'arctype'), labelValue(node, 'arcType'), node.attrs.type];
  for (const c of candidates) {
    const v = (c ?? '').toLowerCase();
    if (v.includes('inhibitor')) return 'inhibitor';
    if (v.includes('test') || v.includes('read')) return 'test';
  }
  return 'normal';
}

export interface PnmlImportResult {
  doc: NetDoc;
  warnings: string[];
}

export function importPnml(xml: string, title = 'PNML-Netz'): PnmlImportResult {
  let root: XmlNode;
  try {
    root = parseXml(xml);
  } catch (err) {
    throw new PnmlFormatError(`Die PNML-Datei ist kein gültiges XML: ${err instanceof XmlError ? err.message : String(err)}`);
  }
  const pnml = child(root, 'pnml');
  if (!pnml) throw new PnmlFormatError('Die Datei ist keine PNML-Datei (Element <pnml> fehlt).');
  const nets = childrenNamed(pnml, 'net');
  if (!nets.length) throw new PnmlFormatError('Die PNML-Datei enthält kein Netz.');
  const net = nets[0];
  const warnings: string[] = [];
  if (nets.length > 1) warnings.push(`Die Datei enthält ${nets.length} Netze – nur das erste wurde geöffnet.`);
  const type = net.attrs.type ?? '';
  if (type && !/ptnet|p\/t|pt-net|placetransition/i.test(type)) {
    warnings.push('Das Netz ist kein reines Stellen/Transitions-Netz – farbige oder höhere Netzkonzepte werden nicht übernommen.');
  }

  const own = ownData(net);
  const base = createDoc(pathText(net, 'name', 'text') || title);
  const raw: Record<string, unknown> & { elements: Record<string, Record<string, unknown>>; order: string[] } = {
    format: 'hpsim-studio',
    version: 1,
    meta: { ...base.meta, ...(own && typeof own.meta === 'object' ? own.meta : {}) },
    settings: own?.settings ?? base.settings,
    elements: {},
    order: [],
  };
  if (!own) (raw.meta as { title: string }).title = pathText(net, 'name', 'text') || title;

  // Alle Knoten aller (verschachtelten) Seiten einsammeln
  const pages = descendants(net, 'page');
  const containers = pages.length ? pages : [net];
  const idMap = new Map<string, string>();
  const refs = new Map<string, string>();
  let missingPos = 0;
  let nodes = 0;

  for (const page of containers) {
    for (const node of page.children) {
      if (node.name === 'referencePlace' || node.name === 'referenceTransition') {
        if (node.attrs.id && node.attrs.ref) refs.set(node.attrs.id, node.attrs.ref);
        continue;
      }
      if (node.name !== 'place' && node.name !== 'transition') continue;
      const pid = node.attrs.id;
      if (!pid || idMap.has(pid)) continue;
      nodes++;
      const id = newId(node.name === 'place' ? 'p' : 't');
      idMap.set(pid, id);
      const pos = position(node);
      if (!pos) missingPos++;
      const name = labelValue(node, 'name') || pid;
      const data = ownData(node) ?? {};
      const el: Record<string, unknown> = { ...data, type: node.name, id, name, x: pos?.x ?? 0, y: pos?.y ?? 0, nameOffset: nameOffset(node) };
      if (node.name === 'place') {
        const tokens = parseNumber(labelValue(node, 'initialMarking'));
        el.tokens = tokens !== null ? Math.max(0, Math.round(tokens)) : 0;
        if (data.capacity === undefined) {
          const cap = parseNumber(labelValue(node, 'capacity'));
          if (cap !== null && cap > 0) el.capacity = Math.round(cap);
        }
      } else if (!Object.keys(data).length) {
        // PIPE: <timed><value>true</value></timed>, <rate><value>2.0</value></rate>, <priority>
        const timed = /true/i.test(labelValue(node, 'timed') ?? '');
        const rate = parseNumber(labelValue(node, 'rate'));
        if (timed && rate && rate > 0) {
          el.timing = 'exponential';
          el.delay = Math.round((1 / rate) * 1000) / 1000;
        }
        const prio = parseNumber(labelValue(node, 'priority'));
        if (prio !== null) el.priority = Math.round(prio);
      }
      raw.elements[id] = el;
      raw.order.push(id);
    }
  }
  const resolve = (ref: string | undefined): string | undefined => {
    let cur = ref;
    for (let k = 0; k < 20 && cur && !idMap.has(cur); k++) cur = refs.get(cur);
    return cur ? idMap.get(cur) : undefined;
  };

  let skipped = 0;
  for (const page of containers) {
    for (const node of childrenNamed(page, 'arc')) {
      const source = resolve(node.attrs.source);
      const target = resolve(node.attrs.target);
      if (!source || !target) {
        skipped++;
        continue;
      }
      const s = raw.elements[source];
      const t = raw.elements[target];
      if (s.type === t.type) {
        skipped++;
        continue;
      }
      const data = ownData(node) ?? {};
      const weight = parseNumber(labelValue(node, 'inscription'));
      const pts: Point[] = [];
      for (const p of childrenNamed(child(node, 'graphics'), 'position')) {
        const x = Number(p.attrs.x);
        const y = Number(p.attrs.y);
        if (Number.isFinite(x) && Number.isFinite(y)) pts.push({ x, y });
      }
      const id = newId('a');
      let kind = (data.kind as string | undefined) ?? arcKind(node);
      if (kind !== 'normal' && s.type !== 'place') {
        kind = 'normal';
        warnings.push('Eine Test-/Inhibitorkante von einer Transition zu einer Stelle wurde als normale Kante übernommen.');
      }
      raw.elements[id] = {
        ...data,
        type: 'arc',
        id,
        source,
        target,
        weight: weight !== null && weight >= 1 ? Math.round(weight) : 1,
        kind,
        points: pts,
      };
      raw.order.push(id);
    }
  }
  if (skipped) warnings.push(`${skipped} Kante(n) mit ungültigen Endpunkten wurden übersprungen.`);

  // Zeichenobjekte aus unserer Erweiterung
  if (own && Array.isArray(own.decor)) {
    for (const d of own.decor as Element[]) {
      if (!d || typeof d !== 'object') continue;
      const id = newId('d');
      raw.elements[id] = { ...(d as unknown as Record<string, unknown>), id };
      raw.order.unshift(id);
    }
  }

  if (!nodes) throw new PnmlFormatError('Die PNML-Datei enthält keine Stellen oder Transitionen.');

  const res = normalizeDoc(raw);
  const doc = res.doc;
  warnings.push(...res.warnings);

  // Koordinaten fehlen → automatisch anordnen; winzige Koordinaten hochskalieren
  if (missingPos > nodes / 2) {
    autoLayout(doc);
    warnings.push('Die Datei enthielt keine (vollständigen) Koordinaten – das Netz wurde automatisch angeordnet.');
  } else {
    rescaleIfTiny(doc);
  }
  return { doc, warnings };
}

/** Manche Werkzeuge verwenden sehr kleine Koordinaten (z. B. Zentimeter) – auf Bildschirmmaß bringen. */
function rescaleIfTiny(doc: NetDoc): void {
  const pts: Point[] = [];
  for (const id of doc.order) {
    const el = doc.elements[id];
    if (el && (el.type === 'place' || el.type === 'transition')) pts.push({ x: el.x, y: el.y });
  }
  if (pts.length < 2 || pts.length > 3000) return;
  const nearest: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    let best = Infinity;
    for (let j = 0; j < pts.length; j++) {
      if (i === j) continue;
      const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
      if (d > 0 && d < best) best = d;
    }
    if (best < Infinity) nearest.push(best);
  }
  if (!nearest.length) return;
  nearest.sort((a, b) => a - b);
  const median = nearest[Math.floor(nearest.length / 2)];
  if (median >= 40) return;
  const f = Math.min(60, 90 / Math.max(median, 0.01));
  for (const id of doc.order) {
    const el = doc.elements[id];
    if (!el) continue;
    if (el.type === 'place' || el.type === 'transition') {
      el.x *= f;
      el.y *= f;
      el.nameOffset = null;
    } else if (el.type === 'arc') {
      el.points = el.points.map((p) => ({ x: p.x * f, y: p.y * f }));
    }
  }
}
