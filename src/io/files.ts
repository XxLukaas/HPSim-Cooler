/**
 * Öffnen, Speichern, Importieren und Exportieren von Dateien – im Browser
 * (Dateiauswahl, File-System-Access-API, Download) und in der Desktop-Version.
 */
import type { NetDoc } from '../model/types';
import { activeTab, markSaved, openDocument, toast, useApp } from '../store/appStore';
import { desktop } from './desktop';
import { importLegacyHps, LegacyFormatError } from './legacyHps';
import { NativeFormatError, parseNative, serializeDoc, FILE_EXTENSION } from './native';
import { importPnml, PnmlFormatError } from './pnml';

export type ImportKind = 'native' | 'legacy' | 'pnml';

export interface ImportResult {
  doc: NetDoc;
  warnings: string[];
  kind: ImportKind;
}

export function baseName(name: string): string {
  const file = name.split(/[\\/]/).pop() ?? name;
  return file.replace(/\.(hpsim|json|hps|pnml|xml)$/i, '');
}

/** Erkennt das Format am Dateinamen bzw. Inhalt und lädt das Netz. */
export function importBytes(name: string, bytes: Uint8Array): ImportResult {
  const lower = name.toLowerCase();
  const title = baseName(name) || 'Netz';
  if (lower.endsWith('.hps')) {
    const res = importLegacyHps(bytes, title);
    return { doc: res.doc, warnings: res.warnings, kind: 'legacy' };
  }
  const text = new TextDecoder('utf-8').decode(bytes).replace(/^﻿/, '');
  const trimmed = text.trimStart();
  if (trimmed.startsWith('{')) {
    const res = parseNative(text);
    return { ...res, kind: 'native' };
  }
  if (trimmed.startsWith('<')) {
    const res = importPnml(text, title);
    return { ...res, kind: 'pnml' };
  }
  // Letzter Versuch: Binärformat des Originals
  try {
    const res = importLegacyHps(bytes, title);
    return { doc: res.doc, warnings: res.warnings, kind: 'legacy' };
  } catch {
    throw new NativeFormatError('Unbekanntes Dateiformat. Unterstützt werden *.hpsim, *.hps (HPSim 1.x) und *.pnml.');
  }
}

export function friendlyError(err: unknown): string {
  if (err instanceof LegacyFormatError || err instanceof NativeFormatError || err instanceof PnmlFormatError) return err.message;
  if (err instanceof Error) return `Die Datei konnte nicht gelesen werden (${err.message}).`;
  return 'Die Datei konnte nicht gelesen werden.';
}

/** Öffnet geladene Bytes als neuen Tab und meldet Warnungen. */
export function openBytes(name: string, bytes: Uint8Array, path?: string): boolean {
  try {
    const res = importBytes(name, bytes);
    const fileName = res.kind === 'native' ? path ?? name : null;
    if (res.kind === 'legacy') res.doc.meta.title = baseName(name);
    openDocument(res.doc, fileName, res.kind === 'native');
    rememberRecent(res.doc, name);
    const what = res.kind === 'legacy' ? 'HPSim-1.x-Netz importiert' : res.kind === 'pnml' ? 'PNML-Netz importiert' : 'Netz geöffnet';
    if (res.warnings.length) {
      toast('warning', `${what} – mit Hinweisen`, res.warnings.slice(0, 3).join(' '), { duration: 9000 });
    } else {
      toast('success', what, baseName(name));
    }
    return true;
  } catch (err) {
    toast('error', `„${baseName(name)}“ konnte nicht geöffnet werden`, friendlyError(err));
    return false;
  }
}

export async function openFiles(files: Iterable<File>): Promise<void> {
  for (const f of files) {
    try {
      const buf = new Uint8Array(await f.arrayBuffer());
      openBytes(f.name, buf);
    } catch (err) {
      toast('error', `„${f.name}“ konnte nicht gelesen werden`, friendlyError(err));
    }
  }
}

const ACCEPT = '.hpsim,.json,.hps,.pnml,.xml';

/** Zeigt die Dateiauswahl zum Öffnen. */
export async function openFromPicker(): Promise<void> {
  if (desktop) {
    try {
      const files = await desktop.openFiles();
      for (const f of files) openBytes(f.name, f.data, f.path);
    } catch (err) {
      toast('error', 'Öffnen fehlgeschlagen', friendlyError(err));
    }
    return;
  }
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = ACCEPT;
  input.multiple = true;
  input.style.display = 'none';
  document.body.appendChild(input);
  input.addEventListener('change', () => {
    if (input.files?.length) void openFiles(Array.from(input.files));
    input.remove();
  });
  input.addEventListener('cancel', () => input.remove());
  input.click();
}

// Dateihandles der File-System-Access-API je Tab (für „Speichern“ ohne Nachfrage)
type FileHandle = { name: string; createWritable: () => Promise<{ write: (d: Blob | string) => Promise<void>; close: () => Promise<void> }> };
const handles = new Map<string, FileHandle>();

interface SavePickerWindow {
  showSaveFilePicker?: (opts: unknown) => Promise<FileHandle>;
}

export function downloadBlob(fileName: string, data: Blob | string, mime = 'application/octet-stream'): void {
  const blob = typeof data === 'string' ? new Blob([data], { type: mime }) : data;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 1500);
}

function safeFileName(title: string): string {
  return (title.trim() || 'Netz').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 120);
}

/**
 * Speichert eine Datei: Desktop → nativer Dialog; Chrome/Edge → Dateiauswahl;
 * sonst Download. Gibt den gewählten Namen zurück oder null bei Abbruch.
 */
export async function saveData(opts: {
  suggestedName: string;
  data: string | Uint8Array | Blob;
  mime: string;
  extension: string;
  description: string;
  key?: string;
  forcePicker?: boolean;
  path?: string | null;
}): Promise<string | null> {
  const { suggestedName, data, mime, extension, description } = opts;
  if (desktop) {
    let payload: string | Uint8Array;
    if (data instanceof Blob) payload = new Uint8Array(await data.arrayBuffer());
    else payload = data;
    return desktop.saveFile({
      suggestedName,
      path: opts.forcePicker ? null : opts.path ?? null,
      data: payload,
      filters: [{ name: description, extensions: [extension.replace(/^\./, '')] }],
    });
  }
  const w = window as unknown as SavePickerWindow;
  const blob = data instanceof Blob ? data : new Blob([data as BlobPart], { type: mime });
  if (w.showSaveFilePicker && window.isSecureContext && window.self === window.top) {
    try {
      let handle = opts.key && !opts.forcePicker ? handles.get(opts.key) : undefined;
      if (!handle) {
        handle = await w.showSaveFilePicker({
          suggestedName,
          types: [{ description, accept: { [mime]: [extension] } }],
        });
      }
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      if (opts.key) handles.set(opts.key, handle);
      return handle.name;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return null;
      // Fallback: Download
    }
  }
  downloadBlob(suggestedName, blob);
  return suggestedName;
}

export async function saveTab(tabId?: string, saveAs = false): Promise<boolean> {
  const tab = tabId ? useApp.getState().tabs.find((t) => t.id === tabId) : activeTab();
  if (!tab) return false;
  const name = tab.fileName ?? `${safeFileName(tab.doc.meta.title)}${FILE_EXTENSION}`;
  const suggested = /\.(hpsim|json)$/i.test(name) ? name.split(/[\\/]/).pop()! : `${baseName(name)}${FILE_EXTENSION}`;
  try {
    const saved = await saveData({
      suggestedName: suggested,
      data: serializeDoc(tab.doc),
      mime: 'application/json',
      extension: FILE_EXTENSION,
      description: 'HPSim-Studio-Netz',
      key: tab.id,
      forcePicker: saveAs,
      path: tab.fileName,
    });
    if (!saved) return false;
    markSaved(tab.id, saved);
    rememberRecent(tab.doc, saved);
    toast('success', 'Gespeichert', saved.split(/[\\/]/).pop());
    return true;
  } catch (err) {
    toast('error', 'Speichern fehlgeschlagen', err instanceof Error ? err.message : String(err));
    return false;
  }
}

// ───────────────────────────── Zuletzt verwendet ─────────────────────────────

const RECENT_KEY = 'hpsim-studio:recent';

export interface RecentEntry {
  title: string;
  fileName: string;
  date: string;
  doc: string;
}

export function readRecent(): RecentEntry[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const list = raw ? (JSON.parse(raw) as RecentEntry[]) : [];
    return Array.isArray(list) ? list.filter((e) => e && typeof e.doc === 'string') : [];
  } catch {
    return [];
  }
}

export function rememberRecent(doc: NetDoc, fileName: string): void {
  try {
    const entry: RecentEntry = { title: doc.meta.title, fileName: fileName.split(/[\\/]/).pop() ?? fileName, date: new Date().toISOString(), doc: serializeDoc(doc) };
    if (entry.doc.length > 400_000) return;
    const list = readRecent().filter((e) => e.fileName !== entry.fileName);
    localStorage.setItem(RECENT_KEY, JSON.stringify([entry, ...list].slice(0, 8)));
  } catch {
    /* Speicher voll – nicht schlimm */
  }
}

export function openRecent(entry: RecentEntry): void {
  try {
    const { doc, warnings } = parseNative(entry.doc);
    openDocument(doc, null, false);
    if (warnings.length) toast('warning', 'Geöffnet mit Hinweisen', warnings[0]);
  } catch (err) {
    toast('error', 'Konnte nicht geöffnet werden', friendlyError(err));
  }
}

export function clearRecent(): void {
  try {
    localStorage.removeItem(RECENT_KEY);
  } catch {
    /* egal */
  }
}
