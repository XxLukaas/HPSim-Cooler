import { memo, useEffect, useRef, useState } from 'react';
import { DocSettingsDialog } from './app/DocSettingsDialog';
import { CommandPalette, DialogHost, ErrorBoundary, StatusBar, Toasts, useShortcuts } from './app/Shell';
import { StartScreen } from './app/StartScreen';
import { Toolbar } from './app/Toolbar';
import { TopBar } from './app/TopBar';
import { MenuHost } from './components/ContextMenu';
import { Canvas } from './editor/Canvas';
import { EXAMPLES } from './examples';
import { HelpDialog } from './help/HelpDialog';
import { ShortcutsDialog } from './help/ShortcutsDialog';
import { Tutorial } from './help/Tutorial';
import { desktop } from './io/desktop';
import { openBytes, openFiles } from './io/files';
import { normalizeDoc } from './io/native';
import { AnalysisPanel } from './panels/AnalysisPanel';
import { ExplorerPanel } from './panels/ExplorerPanel';
import { PropertiesPanel } from './panels/PropertiesPanel';
import { SimPanel } from './panels/SimPanel';
import { useShallow } from 'zustand/react/shallow';
import { activeTab, installAutosave, isDirty, openDocument, readSavedSession, restoreTabs, setUi, toast, useApp } from './store/appStore';
import { installSimSync } from './store/simStore';

/** Zieh-Griff zum Ändern von Panelgrößen. */
function Resizer({ axis, value, min, max, onChange, invert, className }: { axis: 'x' | 'y'; value: number; min: number; max: number; onChange: (v: number) => void; invert?: boolean; className: string }) {
  const start = useRef<{ pos: number; value: number } | null>(null);
  return (
    <div
      className={className}
      onPointerDown={(e) => {
        e.preventDefault();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        start.current = { pos: axis === 'x' ? e.clientX : e.clientY, value };
      }}
      onPointerMove={(e) => {
        if (!start.current) return;
        const delta = (axis === 'x' ? e.clientX : e.clientY) - start.current.pos;
        onChange(Math.round(Math.min(max, Math.max(min, start.current.value + (invert ? -delta : delta)))));
      }}
      onPointerUp={() => (start.current = null)}
      onDoubleClick={() => onChange(axis === 'x' ? (invert ? 320 : 250) : 240)}
      role="separator"
      aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
    />
  );
}

// Panels ohne Props: nicht bei jedem Neuzeichnen der Hülle mitrendern
/** Fensterbreite (für ein Layout, das auch in schmalen Fenstern bedienbar bleibt). */
function useWindowWidth(): number {
  const [w, setW] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1440));
  useEffect(() => {
    const on = () => setW(window.innerWidth);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return w;
}

/** Mindestbreite, die der Zeichenfläche immer bleiben soll */
const MIN_CANVAS = 340;

const ExplorerPanelM = memo(ExplorerPanel);
const PropertiesPanelM = memo(PropertiesPanel);
const AnalysisPanelM = memo(AnalysisPanel);
const SimPanelM = memo(SimPanel);
const CanvasM = memo(Canvas);
const StartScreenM = memo(StartScreen);

let bootstrapped = false;

function bootstrap(): () => void {
  const unsubs = [installAutosave(), installSimSync()];
  if (bootstrapped) return () => unsubs.forEach((u) => u());
  bootstrapped = true;

  // Letzte Sitzung wiederherstellen
  const saved = readSavedSession();
  if (saved?.tabs.length) {
    const restored = [];
    for (const t of saved.tabs) {
      try {
        const { doc } = normalizeDoc(t.doc);
        restored.push({ ...t, doc });
      } catch {
        /* beschädigten Eintrag überspringen */
      }
    }
    if (restored.length) {
      restoreTabs(restored, saved.active);
      toast('info', 'Letzte Sitzung wiederhergestellt', `${restored.length} Netz${restored.length > 1 ? 'e' : ''} geöffnet.`);
    }
  }

  // Beispiel per URL (?beispiel=…)
  try {
    const params = new URLSearchParams(window.location.search);
    const ex = params.get('beispiel') ?? params.get('example');
    const found = ex ? EXAMPLES.find((e) => e.id === ex) : undefined;
    if (found) openDocument(found.build());
  } catch {
    /* ohne URL-Parameter */
  }

  // Desktop: vom Betriebssystem übergebene Dateien öffnen
  desktop?.onOpenFile((f) => openBytes(f.name, f.data, f.path));
  return () => unsubs.forEach((u) => u());
}

export function App() {
  useShortcuts();
  const theme = useApp((s) => s.ui.theme);
  const hasTab = useApp((s) => !!activeTab(s));
  const mode = useApp((s) => activeTab(s)?.mode ?? 'edit');
  // Nur die Layout-relevanten UI-Felder abonnieren (nicht z. B. die Cursorposition)
  const ui = useApp(
    useShallow((s) => ({
      showStart: s.ui.showStart,
      leftOpen: s.ui.leftOpen,
      rightOpen: s.ui.rightOpen,
      bottomOpen: s.ui.bottomOpen,
      leftWidth: s.ui.leftWidth,
      rightWidth: s.ui.rightWidth,
      bottomHeight: s.ui.bottomHeight,
    })),
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => bootstrap(), []);

  // Dateien per Drag & Drop öffnen
  useEffect(() => {
    const over = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      if (!e.dataTransfer?.files.length) return;
      e.preventDefault();
      void openFiles(Array.from(e.dataTransfer.files));
    };
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, []);

  // Unerwartete Fehler abfangen und melden statt abzustürzen
  useEffect(() => {
    let last = 0;
    const report = (msg: string) => {
      const now = Date.now();
      if (now - last < 3000) return;
      last = now;
      toast('error', 'Unerwarteter Fehler', `${msg} – deine Arbeit ist gesichert.`);
    };
    const onError = (e: ErrorEvent) => {
      if (!e.message || e.message.includes('ResizeObserver')) return;
      report(e.message);
    };
    const onRejection = (e: PromiseRejectionEvent) => report(e.reason instanceof Error ? e.reason.message : String(e.reason));
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  // Desktop: ungespeicherte Änderungen an das Fenster melden
  const anyDirty = useApp((s) => s.tabs.some((t) => isDirty(t) && t.doc.order.length > 0));
  useEffect(() => {
    desktop?.setDirty(anyDirty);
  }, [anyDirty]);

  const showStart = ui.showStart || !hasTab;
  // In schmalen Fenstern zuerst die linke Leiste ausblenden, dann die rechte verschmälern
  const winW = useWindowWidth();
  const wantRight = ui.rightOpen ? (mode === 'analysis' ? Math.max(ui.rightWidth, 460) : ui.rightWidth) : 0;
  const showLeft = ui.leftOpen && winW - ui.leftWidth - wantRight >= MIN_CANVAS;
  const rightWidth = Math.max(260, Math.min(wantRight, winW - (showLeft ? ui.leftWidth : 0) - MIN_CANVAS));

  return (
    <div className="app">
      <TopBar />
      <Toolbar />
      <div className="workspace">
        {showStart ? (
          <ErrorBoundary area="Startseite">
            <StartScreenM />
          </ErrorBoundary>
        ) : (
          <>
            {showLeft && (
              <aside className="sidebar left" style={{ width: ui.leftWidth }} data-testid="left-sidebar">
                <Resizer className="sidebar-resizer" axis="x" value={ui.leftWidth} min={190} max={480} onChange={(v) => setUi({ leftWidth: v })} />
                <ErrorBoundary area="Explorer" compact>
                  <ExplorerPanelM />
                </ErrorBoundary>
              </aside>
            )}
            <main className="center">
              <ErrorBoundary area="Zeichenfläche">
                <CanvasM />
              </ErrorBoundary>
              {mode === 'sim' && ui.bottomOpen && (
                <section className="bottom-panel" style={{ height: ui.bottomHeight }} data-testid="bottom-panel">
                  <Resizer className="bottom-resizer" axis="y" value={ui.bottomHeight} min={120} max={Math.max(160, window.innerHeight - 260)} invert onChange={(v) => setUi({ bottomHeight: v })} />
                  <ErrorBoundary area="Simulation" compact>
                    <SimPanelM />
                  </ErrorBoundary>
                </section>
              )}
            </main>
            {ui.rightOpen && (
              <aside className="sidebar right" style={{ width: rightWidth }} data-testid="right-sidebar">
                <Resizer className="sidebar-resizer" axis="x" value={rightWidth} min={260} max={820} invert onChange={(v) => setUi({ rightWidth: v })} />
                <ErrorBoundary area={mode === 'analysis' ? 'Analyse' : 'Eigenschaften'} compact>
                  {mode === 'analysis' ? <AnalysisPanelM /> : <PropertiesPanelM />}
                </ErrorBoundary>
              </aside>
            )}
          </>
        )}
      </div>
      <StatusBar />
      <ErrorBoundary area="Dialoge" compact>
        <HelpDialog />
        <ShortcutsDialog />
        <DocSettingsDialog />
        <Tutorial />
      </ErrorBoundary>
      <CommandPalette />
      <DialogHost />
      <MenuHost />
      <Toasts />
    </div>
  );
}
