/** Rechte Seitenleiste im Analysemodus: Eigenschaften, Zustandsgraph, Invarianten, Matrizen. */
import { ChevronRight, FlaskConical, Grid3x3, Loader2, RefreshCw, Sigma, Waypoints } from 'lucide-react';
import { useEffect } from 'react';
import { IconButton } from '../components/ui';
import { activeTab, setUi, useApp, type AnalysisTab } from '../store/appStore';
import { DEFAULT_LIMIT, runAnalysis, STATE_LIMITS, useAnalysis } from '../store/analysisStore';
import { GraphView } from './analysis/GraphView';
import { InvariantsView } from './analysis/InvariantsView';
import { MatrixView } from './analysis/MatrixView';
import { Overview } from './analysis/Overview';
import './analysis/analysis.css';

const TABS: { id: AnalysisTab; label: string; icon: typeof FlaskConical }[] = [
  { id: 'overview', label: 'Übersicht', icon: FlaskConical },
  { id: 'graph', label: 'Graph', icon: Waypoints },
  { id: 'invariants', label: 'Invarianten', icon: Sigma },
  { id: 'matrix', label: 'Matrizen', icon: Grid3x3 },
];

export function AnalysisPanel() {
  const current = useApp((s) => s.ui.analysisTab);
  const tabId = useApp((s) => s.activeId);
  const doc = useApp((s) => activeTab(s)?.doc ?? null);
  const sess = useAnalysis((s) => (tabId ? s.sessions[tabId] : undefined));
  const stale = !!sess && !!doc && sess.doc !== doc;

  // Beim Öffnen und nach Änderungen automatisch (neu) analysieren
  useEffect(() => {
    if (!tabId || !doc) return;
    if (!sess || (sess.doc !== doc && !sess.running)) runAnalysis(tabId, doc);
  }, [tabId, doc, sess]);

  if (!tabId || !doc) return <div className="empty-state">Kein Netz geöffnet.</div>;
  const report = sess?.report ?? null;

  return (
    <div className="analysis">
      <div className="panel-header">
        <div className="panel-tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={current === t.id}
              className={`panel-tab${current === t.id ? ' active' : ''}`}
              onClick={() => setUi({ analysisTab: t.id })}
              data-testid={`analysistab-${t.id}`}
            >
              <t.icon size={14} />
              {t.label}
            </button>
          ))}
        </div>
        <span className="spacer" />
        <IconButton small icon={<ChevronRight size={16} />} title="Bereich ausblenden (Strg+2)" onClick={() => setUi({ rightOpen: false })} />
      </div>
      <div className="analysis-bar">
        <button
          type="button"
          className="btn sm"
          onClick={() => runAnalysis(tabId, doc)}
          disabled={sess?.running}
          title="Analyse mit dem aktuellen Netz neu berechnen"
          data-testid="analysis-run"
        >
          {sess?.running ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
          {sess?.running ? 'Analysiere …' : 'Neu analysieren'}
        </button>
        <label className="analysis-limit" title="Höchstzahl der Zustände, die untersucht werden. Größere Werte dauern länger.">
          Limit
          <select
            className="select sm"
            value={sess?.maxStates ?? DEFAULT_LIMIT}
            onChange={(e) => runAnalysis(tabId, doc, Number(e.target.value))}
            data-testid="analysis-limit"
          >
            {STATE_LIMITS.map((n) => (
              <option key={n} value={n}>
                {n.toLocaleString('de-DE')} Zustände
              </option>
            ))}
          </select>
        </label>
        <span className="spacer" />
        {report && !sess?.running && (
          <span className={`faint analysis-time${stale ? ' stale' : ''}`}>
            {stale ? 'veraltet' : `${Math.max(1, Math.round(report.durationMs)).toLocaleString('de-DE')} ms`}
          </span>
        )}
      </div>
      <div className="analysis-body">
        {sess?.error ? (
          <div className="callout danger" style={{ margin: 12 }}>
            Die Analyse ist fehlgeschlagen: {sess.error}
          </div>
        ) : !report ? (
          <div className="empty-state">
            <Loader2 size={22} className="spin" />
            Netz wird analysiert …
          </div>
        ) : current === 'overview' ? (
          <Overview report={report} tabId={tabId} doc={sess!.doc} />
        ) : current === 'graph' ? (
          <GraphView report={report} tabId={tabId} selected={sess!.selected} />
        ) : current === 'invariants' ? (
          <InvariantsView report={report} />
        ) : (
          <MatrixView report={report} />
        )}
      </div>
    </div>
  );
}
