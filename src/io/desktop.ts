/**
 * Schnittstelle zur Desktop-Version (Electron). Im Browser ist `desktop` null.
 * Die Implementierung liegt in desktop/preload.cjs.
 */
export interface DesktopFile {
  name: string;
  path: string;
  data: Uint8Array;
}

export interface DesktopBridge {
  platform: string;
  openFiles(): Promise<DesktopFile[]>;
  saveFile(opts: { suggestedName: string; path?: string | null; data: string | Uint8Array; filters: { name: string; extensions: string[] }[] }): Promise<string | null>;
  /** Wird aufgerufen, wenn das Betriebssystem eine Datei öffnen möchte (Doppelklick, Kommandozeile). */
  onOpenFile(cb: (file: DesktopFile) => void): void;
  setDirty(dirty: boolean): void;
}

declare global {
  interface Window {
    hpsimDesktop?: DesktopBridge;
  }
}

export const desktop: DesktopBridge | null = typeof window !== 'undefined' ? window.hpsimDesktop ?? null : null;
