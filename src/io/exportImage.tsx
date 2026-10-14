/**
 * Export als SVG/PNG und Drucken. Das Netz wird immer im hellen Design
 * gezeichnet (gut für Dokumente und Ausdrucke), unabhängig vom App-Design.
 */
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { NetContent, resolveLabelOffset } from '../editor/NetRender';
import { textWidth } from '../editor/labels';
import { LIGHT } from '../editor/palette';
import { contentBounds, expandRect, unionRect } from '../model/geometry';
import type { NetDoc, Rect } from '../model/types';
import { toast } from '../store/appStore';
import { saveData } from './files';

const FONT = "Inter, 'Segoe UI', system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif";

/** Umgebendes Rechteck inklusive Beschriftungen. */
export function exportBounds(doc: NetDoc): Rect | null {
  let r = contentBounds(doc);
  if (!r) return null;
  for (const id of doc.order) {
    const el = doc.elements[id];
    if (!el || (el.type !== 'place' && el.type !== 'transition')) continue;
    if (el.showName && el.name) {
      const o = resolveLabelOffset(doc, el, 'name');
      const w = textWidth(el.name) / 2 + 4;
      r = unionRect(r, { x: el.x + o.x - w, y: el.y + o.y - 9, w: w * 2, h: 18 });
    }
    const showSecondary = el.type === 'place' ? el.showCapacity && el.capacity > 0 : el.showDelay && el.timing !== 'immediate';
    if (showSecondary) {
      const o = resolveLabelOffset(doc, el, 'secondary');
      r = unionRect(r, { x: el.x + o.x - 40, y: el.y + o.y - 9, w: 80, h: 18 });
    }
  }
  return r;
}

/** Erzeugt eine eigenständige SVG-Datei des Netzes. */
export function renderDocSvg(doc: NetDoc, opts: { padding?: number; background?: boolean } = {}): { svg: string; width: number; height: number } {
  const pad = opts.padding ?? 24;
  const b = exportBounds(doc) ?? { x: 0, y: 0, w: 200, h: 120 };
  const v = expandRect(b, pad);
  const width = Math.ceil(v.w);
  const height = Math.ceil(v.h);
  const bg = doc.settings.background && opts.background !== false ? doc.settings.background : '#ffffff';

  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    flushSync(() =>
      root.render(
        <svg xmlns="http://www.w3.org/2000/svg" width={width} height={height} viewBox={`${v.x} ${v.y} ${v.w} ${v.h}`} fontFamily={FONT}>
          <title>{doc.meta.title}</title>
          {opts.background !== false && <rect x={v.x} y={v.y} width={v.w} height={v.h} fill={isDark(bg) ? '#ffffff' : bg} />}
          <NetContent doc={doc} p={LIGHT} />
        </svg>,
      ),
    );
    let svg = host.innerHTML;
    // Nur für die Bedienung nötige Teile entfernen (Trefferflächen, Klassen, Datenattribute)
    svg = svg
      .replace(/<path[^>]*stroke="transparent"[^>]*><\/path>/g, '')
      .replace(/<path[^>]*stroke="transparent"[^>]*\/>/g, '')
      .replace(/\s(class|data-[a-z-]+)="[^"]*"/g, '');
    return { svg: `<?xml version="1.0" encoding="UTF-8"?>\n${svg}\n`, width, height };
  } finally {
    root.unmount();
  }
}

/** Dunkle Hintergrundfarben passen nicht zum hellen Export – dann Weiß verwenden. */
function isDark(color: string): boolean {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color.trim());
  if (!m) return false;
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => parseInt(h, 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.45;
}

function fileBase(doc: NetDoc): string {
  return (doc.meta.title || 'Netz').replace(/[\\/:*?"<>|]+/g, '_');
}

function isEmpty(doc: NetDoc): boolean {
  if (doc.order.length) return false;
  toast('info', 'Das Netz ist leer', 'Es gibt noch nichts zu exportieren.');
  return true;
}

export async function exportSvg(doc: NetDoc): Promise<void> {
  if (isEmpty(doc)) return;
  try {
    const { svg } = renderDocSvg(doc);
    const path = await saveData({ suggestedName: `${fileBase(doc)}.svg`, data: svg, mime: 'image/svg+xml', extension: '.svg', description: 'SVG-Grafik' });
    if (path !== null) toast('success', 'SVG exportiert', path || undefined);
  } catch (err) {
    toast('error', 'SVG-Export fehlgeschlagen', err instanceof Error ? err.message : String(err));
  }
}

/** Rastert das SVG in ein PNG (Standard: doppelte Auflösung). */
export async function renderPng(doc: NetDoc, scale = 2): Promise<Blob> {
  const { svg, width, height } = renderDocSvg(doc);
  // Browser begrenzen die Canvas-Größe – bei Riesennetzen die Auflösung reduzieren
  const maxSide = 16000;
  const maxArea = 120_000_000;
  let s = Math.min(scale, maxSide / width, maxSide / height);
  if (width * height * s * s > maxArea) s = Math.sqrt(maxArea / (width * height));
  s = Math.max(0.1, s);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Die Grafik konnte nicht gerendert werden.'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * s));
    canvas.height = Math.max(1, Math.round(height * s));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Der Browser stellt keine Zeichenfläche bereit.');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG konnte nicht erzeugt werden.'))), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function exportPng(doc: NetDoc, scale = 2): Promise<void> {
  if (isEmpty(doc)) return;
  try {
    const blob = await renderPng(doc, scale);
    const path = await saveData({ suggestedName: `${fileBase(doc)}.png`, data: blob, mime: 'image/png', extension: '.png', description: 'PNG-Bild' });
    if (path !== null) toast('success', 'PNG exportiert', path || undefined);
  } catch (err) {
    toast('error', 'PNG-Export fehlgeschlagen', err instanceof Error ? err.message : String(err));
  }
}

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Druckt das Netz auf eine Seite eingepasst (Hoch- oder Querformat je nach Form). */
export function printDoc(doc: NetDoc): void {
  if (isEmpty(doc)) return;
  try {
    const { svg, width, height } = renderDocSvg(doc, { padding: 10 });
    const landscape = width > height * 1.1;
    const date = new Date().toLocaleDateString('de-DE', { dateStyle: 'long' });
    const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${escapeHtml(doc.meta.title)}</title>
<style>
@page { size: A4 ${landscape ? 'landscape' : 'portrait'}; margin: 12mm; }
html, body { margin: 0; font-family: ${FONT}; color: #0f172a; }
.page { display: flex; flex-direction: column; height: calc(100vh - 2px); }
header { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; margin-bottom: 8px; }
h1 { font-size: 15pt; margin: 0; }
.meta { font-size: 9pt; color: #64748b; }
.desc { font-size: 9.5pt; color: #334155; margin: 0 0 8px; white-space: pre-wrap; }
.net { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; }
.net svg { max-width: 100%; max-height: 100%; width: auto; height: auto; }
footer { font-size: 8pt; color: #94a3b8; text-align: right; margin-top: 6px; }
</style></head><body><div class="page">
<header><h1>${escapeHtml(doc.meta.title)}</h1><span class="meta">${escapeHtml(doc.meta.author ? doc.meta.author + ' · ' : '')}${date}</span></header>
${doc.meta.description ? `<p class="desc">${escapeHtml(doc.meta.description.slice(0, 600))}</p>` : ''}
<div class="net">${svg.replace(/^<\?xml[^>]*>\s*/, '')}</div>
<footer>Erstellt mit HPSim Studio</footer>
</div></body></html>`;
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(frame);
    const cleanup = () => setTimeout(() => frame.remove(), 1000);
    const w = frame.contentWindow;
    const d = frame.contentDocument;
    if (!w || !d) {
      frame.remove();
      throw new Error('Das Druckfenster konnte nicht geöffnet werden.');
    }
    d.open();
    d.write(html);
    d.close();
    w.addEventListener('afterprint', cleanup);
    setTimeout(() => {
      try {
        w.focus();
        w.print();
      } finally {
        // Manche Browser senden kein „afterprint“
        setTimeout(() => frame.isConnected && frame.remove(), 60_000);
      }
    }, 250);
  } catch (err) {
    toast('error', 'Drucken fehlgeschlagen', err instanceof Error ? err.message : String(err));
  }
}
