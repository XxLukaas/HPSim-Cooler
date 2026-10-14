/**
 * Rechte Seitenleiste: Eigenschaften der Auswahl bzw. des Dokuments.
 *
 * Bearbeiten-Modus: Dokument, Stelle, Transition, Kante, Zeichenobjekte und
 * Mehrfachauswahl lassen sich hier ändern (jede Änderung = ein Rückgängig-Schritt).
 * Simulationsmodus: Live-Überblick und Statistik; die Struktur ist schreibgeschützt.
 */
import { Activity, Circle, FileText, Hexagon, Layers, Minus, MoveRight, RectangleVertical, Square, Type } from 'lucide-react';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { paletteFor } from '../editor/palette';
import type { Element } from '../model/types';
import { activeTab, useApp } from '../store/appStore';
import { ArcProps } from './properties/ArcProps';
import { DecorProps } from './properties/DecorProps';
import { DocumentProps } from './properties/DocumentProps';
import { clearOwnHighlight, flushCoalesced } from './properties/edit';
import { MultiProps } from './properties/MultiProps';
import { elementLabel } from './properties/model';
import { PlaceProps } from './properties/PlaceProps';
import { SimProperties } from './properties/SimProps';
import { TransitionProps } from './properties/TransitionProps';
import { PropsBoundary } from './properties/widgets';
import './properties/properties.css';

function typeIcon(el: Element | undefined, multi: boolean): ReactNode {
  if (multi) return <Layers size={14} />;
  switch (el?.type) {
    case 'place':
      return <Circle size={14} />;
    case 'transition':
      return <RectangleVertical size={14} />;
    case 'arc':
      return <MoveRight size={14} />;
    case 'rect':
      return el.shape === 'ellipse' ? <Circle size={14} /> : <Square size={14} />;
    case 'line':
      return <Minus size={14} />;
    case 'poly':
      return <Hexagon size={14} />;
    case 'text':
      return <Type size={14} />;
    default:
      return <FileText size={14} />;
  }
}

export function PropertiesPanel() {
  const tabId = useApp((s) => s.activeId);
  const doc = useApp((s) => activeTab(s)?.doc);
  const selection = useApp((s) => activeTab(s)?.selection);
  const mode = useApp((s) => activeTab(s)?.mode ?? 'edit');
  const theme = useApp((s) => s.ui.theme);
  const p = paletteFor(theme);

  const sel = useMemo(() => (doc && selection ? selection.filter((id) => !!doc.elements[id]) : []), [doc, selection]);
  const single = sel.length === 1 && doc ? doc.elements[sel[0]] : undefined;
  const multi = sel.length > 1;
  const sim = mode === 'sim';

  const rootRef = useRef<HTMLDivElement>(null);

  // Zusammengefasste Änderungen (Farbwähler, Regler) abschließen, bevor etwas anderes passiert.
  // Ein Klick außerhalb (z. B. auf die Zeichenfläche) übernimmt zuerst ein gerade bearbeitetes
  // Eingabefeld – sonst könnte es durch den Auswahlwechsel verschwinden, bevor es „blur“ erhält.
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const root = rootRef.current;
      const active = document.activeElement;
      if (root && active instanceof HTMLElement && root.contains(active) && !(e.target instanceof Node && root.contains(e.target))) {
        if (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA') active.blur();
      }
      flushCoalesced();
    };
    const onKeyDown = () => flushCoalesced();
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown, true);
      flushCoalesced();
      clearOwnHighlight();
    };
  }, []);

  // Hervorhebung aus Chips beim Wechsel von Auswahl/Modus entfernen
  useEffect(() => clearOwnHighlight, [sel, mode, tabId]);

  const subtitle = !doc ? '' : multi ? `${sel.length} Elemente` : single ? elementLabel(single) : sim ? 'Live' : 'Netz';

  let body: ReactNode;
  if (!doc || !tabId) {
    body = (
      <div className="empty-state">
        <FileText size={26} />
        <span>Kein Netz geöffnet.</span>
      </div>
    );
  } else if (sim) {
    body = <SimProperties tabId={tabId} doc={doc} sel={sel} p={p} />;
  } else if (multi) {
    body = <MultiProps ids={sel} doc={doc} p={p} />;
  } else if (single) {
    switch (single.type) {
      case 'place':
        body = <PlaceProps el={single} doc={doc} p={p} />;
        break;
      case 'transition':
        body = <TransitionProps el={single} doc={doc} p={p} />;
        break;
      case 'arc':
        body = <ArcProps arc={single} doc={doc} p={p} />;
        break;
      default:
        body = <DecorProps el={single} p={p} />;
    }
  } else {
    body = <DocumentProps doc={doc} p={p} />;
  }

  const resetKey = `${tabId ?? ''}|${mode}|${sel.join(',')}`;

  return (
    <div ref={rootRef} className={`pp-root${sim ? ' is-sim' : ''}`} data-testid="properties-panel">
      <div className="panel-header pp-header">
        <span className={`pp-header-icon${sim ? ' sim' : ''}`}>{sim && !single && !multi ? <Activity size={14} /> : typeIcon(single, multi)}</span>
        <span className="panel-title">Eigenschaften</span>
        {subtitle && (
          <span className="pp-header-sub" data-testid="prop-kind">
            {subtitle}
          </span>
        )}
        <span className="spacer" />
        {sim && <span className="badge success pp-live-badge">Simulation</span>}
      </div>
      <div className="panel-body pp-body" key={sel.length === 1 ? sel[0] : multi ? 'multi' : 'none'}>
        <PropsBoundary resetKey={resetKey}>{body}</PropsBoundary>
      </div>
    </div>
  );
}
