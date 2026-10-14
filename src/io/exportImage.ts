/**
 * Export als SVG/PNG und Drucken.
 * PLATZHALTER – wird vollständig implementiert.
 */
import type { NetDoc } from '../model/types';
import { toast } from '../store/appStore';

export async function exportSvg(doc: NetDoc): Promise<void> {
  void doc;
  toast('info', 'SVG-Export folgt');
}

export async function exportPng(doc: NetDoc, scale = 2): Promise<void> {
  void doc;
  void scale;
  toast('info', 'PNG-Export folgt');
}

export function printDoc(doc: NetDoc): void {
  void doc;
  toast('info', 'Drucken folgt');
}
