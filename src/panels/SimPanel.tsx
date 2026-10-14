/** Unterer Bereich im Simulationsmodus: Protokoll, Diagramm, Statistik, Verlauf. */
import { BarChart3, ChevronDown, Download, History, LineChart, ScrollText } from 'lucide-react';
import { runAction } from '../app/actions';
import { IconButton } from '../components/ui';
import { formatNumber } from '../sim/engine';
import { setUi, useApp, type BottomTab } from '../store/appStore';
import { ChartView } from './sim/ChartView';
import { LogView } from './sim/LogView';
import { StatsView } from './sim/StatsView';
import { TraceView } from './sim/TraceView';
import { useLiveSession } from './sim/useLiveSession';
import './sim/sim.css';

const TABS: { id: BottomTab; label: string; icon: typeof ScrollText }[] = [
  { id: 'log', label: 'Protokoll', icon: ScrollText },
  { id: 'chart', label: 'Diagramm', icon: LineChart },
  { id: 'stats', label: 'Statistik', icon: BarChart3 },
  { id: 'trace', label: 'Verlauf', icon: History },
];

export function SimPanel() {
  const tab = useApp((s) => s.ui.bottomTab);
  const sess = useLiveSession(tab === 'log' ? 80 : 150);
  return (
    <div className="simpanel">
      <div className="panel-header">
        <div className="panel-tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`panel-tab${tab === t.id ? ' active' : ''}`}
              onClick={() => setUi({ bottomTab: t.id })}
              data-testid={`simtab-${t.id}`}
            >
              <t.icon size={14} />
              {t.label}
              {t.id === 'log' && sess && sess.log.length > 0 && <span className="badge">{formatNumber(sess.log.length)}</span>}
            </button>
          ))}
        </div>
        <span className="spacer" />
        <IconButton small icon={<Download size={15} />} title="Markierungsverlauf als CSV exportieren (Excel)" onClick={() => runAction('sim.exportCsv')} />
        <IconButton small icon={<ChevronDown size={16} />} title="Bereich ausblenden (Strg+3)" onClick={() => setUi({ bottomOpen: false })} />
      </div>
      <div className="simpanel-body">
        {!sess ? (
          <div className="empty-state">Wechsle in den Modus „Simulieren“, um Protokoll, Diagramm und Statistik zu sehen.</div>
        ) : tab === 'log' ? (
          <LogView sess={sess} />
        ) : tab === 'chart' ? (
          <ChartView sess={sess} />
        ) : tab === 'stats' ? (
          <StatsView sess={sess} />
        ) : (
          <TraceView sess={sess} />
        )}
      </div>
    </div>
  );
}
