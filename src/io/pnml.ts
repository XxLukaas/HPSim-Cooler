/**
 * PNML-Import/-Export (Petri Net Markup Language, ISO/IEC 15909-2).
 * PLATZHALTER – wird vollständig implementiert.
 */
import type { NetDoc } from '../model/types';

export class PnmlFormatError extends Error {}

export function exportPnml(doc: NetDoc): string {
  void doc;
  throw new PnmlFormatError('PNML-Export ist noch nicht verfügbar.');
}

export function importPnml(xml: string, title?: string): { doc: NetDoc; warnings: string[] } {
  void xml;
  void title;
  throw new PnmlFormatError('PNML-Import ist noch nicht verfügbar.');
}
