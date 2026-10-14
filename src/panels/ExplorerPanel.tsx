/**
 * Linke Seitenleiste mit zwei Reitern:
 *  - „Explorer“: alle Elemente des Netzes, gruppiert und durchsuchbar
 *  - „Prüfung“: Strukturüberblick und automatische Netzprüfung
 */
import { CircleCheck, ListTree, PanelLeftClose, ShieldCheck } from 'lucide-react';
import { memo, useEffect, useMemo, useState } from 'react';
import { validateNet, type Issue } from '../analysis/validate';
import type { NetDoc } from '../model/types';
import { activeTab, setUi, useApp, type LeftTab } from '../store/appStore';
import { ExplorerTree } from './explorer/ExplorerTree';
import { IssuesView } from './explorer/IssuesView';
import { useSettled } from './explorer/hooks';
import './explorer/explorer.css';

/** Ab dieser Elementzahl wird die Prüfung erst nach einer kurzen Pause neu berechnet. */
const LARGE_NET = 300;

function safeValidate(doc: NetDoc | null): Issue[] | null {
  if (!doc) return [];
  try {
    return validateNet(doc);
  } catch (err) {
    console.error('Netzprüfung fehlgeschlagen', err);
    return null;
  }
}

const PanelTabs = memo(function PanelTabs({ leftTab, errors, warnings }: { leftTab: LeftTab; errors: number; warnings: number }) {
  const problems = errors + warnings;
  const select = (t: LeftTab) => setUi({ leftTab: t });
  return (
    <div className="panel-header ex-header">
      <div className="panel-tabs ex-tabs" role="tablist" aria-label="Linke Seitenleiste">
        <button
          type="button"
          role="tab"
          aria-selected={leftTab === 'explorer'}
          className={`panel-tab${leftTab === 'explorer' ? ' active' : ''}`}
          onClick={() => select('explorer')}
          data-testid="left-tab-explorer"
          title="Alle Elemente des Netzes (Strg+F zum Suchen)"
        >
          <ListTree size={14} />
          <span className="ex-tab-label">Explorer</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={leftTab === 'issues'}
          className={`panel-tab${leftTab === 'issues' ? ' active' : ''}`}
          onClick={() => select('issues')}
          data-testid="left-tab-issues"
          title={
            problems
              ? `${errors} Fehler, ${warnings} Warnung${warnings === 1 ? '' : 'en'} gefunden`
              : 'Netzprüfung: keine Fehler oder Warnungen'
          }
        >
          <ShieldCheck size={14} />
          <span className="ex-tab-label">Prüfung</span>
          {problems > 0 ? (
            <span className={`badge ${errors ? 'danger' : 'warning'} ex-tab-badge`} data-testid="issues-badge">
              {problems > 99 ? '99+' : problems}
            </span>
          ) : (
            <CircleCheck size={13} className="ex-tab-ok" aria-label="keine Probleme" />
          )}
        </button>
      </div>
      <span className="grow" />
      <button type="button" className="icon-btn sm" title="Seitenleiste ausblenden (Strg+1)" aria-label="Seitenleiste ausblenden" onClick={() => setUi({ leftOpen: false })}>
        <PanelLeftClose size={15} />
      </button>
    </div>
  );
});

/** Linke Seitenleiste: Explorer (Elementbaum, Suche) und Netzprüfung. */
export function ExplorerPanel() {
  return <ExplorerPanelInner />;
}

const ExplorerPanelInner = memo(function ExplorerPanelInner() {
  const leftTab = useApp((s) => s.ui.leftTab);
  const doc = useApp((s) => activeTab(s)?.doc ?? null);
  const [focusToken, setFocusToken] = useState(0);

  // „Element suchen“ (Strg+F) – Suchfeld fokussieren
  useEffect(() => {
    const onFocusSearch = () => {
      if (useApp.getState().ui.leftTab !== 'explorer') setUi({ leftTab: 'explorer' });
      setFocusToken((n) => n + 1);
    };
    window.addEventListener('hpsim:focus-search', onFocusSearch);
    return () => window.removeEventListener('hpsim:focus-search', onFocusSearch);
  }, []);

  // Prüfung: kleine Netze sofort, große nach kurzer Pause (z. B. nach dem Ziehen)
  const size = doc?.order.length ?? 0;
  const checkedDoc = useSettled(doc, size > LARGE_NET ? 250 : 0);
  const issues = useMemo(() => safeValidate(checkedDoc), [checkedDoc]);
  const { errors, warnings } = useMemo(() => {
    let e = 0;
    let w = 0;
    for (const i of issues ?? []) {
      if (i.level === 'error') e++;
      else if (i.level === 'warning') w++;
    }
    return { errors: e, warnings: w };
  }, [issues]);

  return (
    <div className="ex-panel" data-testid="explorer-panel">
      <PanelTabs leftTab={leftTab} errors={errors} warnings={warnings} />
      <div className="ex-panel-body">
        {/* Der Explorer bleibt eingehängt, damit Suche, Scrollposition und Klappzustand erhalten bleiben */}
        <div className="ex-pane" role="tabpanel" aria-label="Explorer" hidden={leftTab !== 'explorer'}>
          <ExplorerTree focusToken={focusToken} />
        </div>
        {leftTab === 'issues' && (
          <div className="ex-pane" role="tabpanel" aria-label="Prüfung">
            <IssuesView issues={issues} checkedDoc={checkedDoc} pending={checkedDoc !== doc} />
          </div>
        )}
      </div>
    </div>
  );
});
