/** Übersicht: Eigenschaften des Netzes mit Erklärungen, Schranken und Struktur. */
import { AlertTriangle, CheckCircle2, ChevronDown, CircleHelp, Clock, Info, Play, Waypoints, XCircle } from 'lucide-react';
import { useState } from 'react';
import type { AnalysisReport, PropertyResult } from '../../analysis/analyze';
import { OMEGA } from '../../analysis/reachability';
import type { NetDoc } from '../../model/types';
import { centerOn, setSelection, setUi } from '../../store/appStore';
import { formatMarkValue, playWitness, selectState } from '../../store/analysisStore';

/** Für diese Eigenschaften ist „nein“ ein echtes Problem (rot), sonst nur eine Eigenschaft (gelb). */
const SEVERE = new Set(['deadlock', 'dead']);

function verdictClass(p: PropertyResult): string {
  if (p.verdict === 'yes') return 'yes';
  if (p.verdict === 'no') return SEVERE.has(p.key) ? 'no' : 'warn';
  if (p.verdict === 'unknown') return 'unknown';
  return 'info';
}

function VerdictIcon({ cls }: { cls: string }) {
  if (cls === 'yes') return <CheckCircle2 size={18} />;
  if (cls === 'no') return <XCircle size={18} />;
  if (cls === 'warn') return <AlertTriangle size={18} />;
  if (cls === 'unknown') return <CircleHelp size={18} />;
  return <Info size={18} />;
}

function PropertyCard({ p, tabId }: { p: PropertyResult; tabId: string }) {
  const [open, setOpen] = useState(false);
  const cls = verdictClass(p);
  return (
    <div className={`prop-card ${cls}`} data-testid={`prop-${p.key}`}>
      <div className="prop-icon">
        <VerdictIcon cls={cls} />
      </div>
      <div className="prop-main">
        <div className="prop-title">
          {p.title}
          <button type="button" className={`prop-help-btn${open ? ' open' : ''}`} onClick={() => setOpen(!open)} title="Was bedeutet das?">
            <ChevronDown size={14} />
          </button>
        </div>
        <div className="prop-summary">{p.summary}</div>
        {p.detail && <div className="prop-detail">{p.detail}</div>}
        {open && <div className="prop-help">{p.help}</div>}
        {p.witness && (
          <div className="prop-actions">
            <button type="button" className="btn sm primary" onClick={() => playWitness(p.witness!.sequence, p.witness!.label)} data-testid={`witness-${p.key}`}>
              <Play size={13} /> {p.witness.label}
            </button>
            <button
              type="button"
              className="btn sm ghost"
              onClick={() => {
                selectState(tabId, p.witness!.state);
                setUi({ analysisTab: 'graph' });
              }}
            >
              <Waypoints size={13} /> Im Zustandsgraphen
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function highlight(ids: string[]) {
  setUi({ highlight: ids });
}

export function Overview({ report, tabId, doc }: { report: AnalysisReport; tabId: string; doc: NetDoc }) {
  const { net, graph, structure: st } = report;
  const P = net.placeIds.length;
  const T = net.transitions.length;
  const tName = (t: number) => net.transitions[t].name;
  const pName = (p: number) => net.placeNames[p];

  if (P + T === 0) {
    return <div className="empty-state">Das Netz ist leer. Lege zuerst Stellen und Transitionen an.</div>;
  }

  const kpis = [
    { label: 'Zustände', value: graph.states.length.toLocaleString('de-DE') + (graph.truncated ? '+' : '') },
    { label: 'Übergänge', value: graph.edges.length.toLocaleString('de-DE') },
    { label: 'Verklemmungen', value: report.deadlocks.length.toLocaleString('de-DE'), bad: report.deadlocks.length > 0 },
    { label: 'Tote Trans.', value: report.deadTransitions.length.toLocaleString('de-DE'), bad: report.deadTransitions.length > 0 },
  ];

  const chips: { on: boolean; label: string; title: string }[] = [
    { on: st.stateMachine, label: 'Zustandsmaschine', title: 'Jede Transition hat genau eine Eingangs- und eine Ausgangsstelle.' },
    { on: st.markedGraph, label: 'Markierter Graph', title: 'Jede Stelle hat genau eine Eingangs- und eine Ausgangstransition (keine Konflikte).' },
    { on: st.freeChoice, label: 'Free-Choice', title: 'Konkurrieren Transitionen um eine Stelle, haben sie denselben Vorbereich.' },
    { on: st.pure, label: 'Schlingenfrei', title: 'Keine Transition liest und schreibt dieselbe Stelle (rein).' },
    { on: st.ordinary, label: 'Gewöhnlich', title: 'Alle Kantengewichte sind 1.' },
    { on: st.hasTestArcs, label: 'Testkanten', title: 'Das Netz enthält Testkanten (lesen, ohne zu verbrauchen).' },
    { on: st.hasInhibitorArcs, label: 'Inhibitorkanten', title: 'Das Netz enthält Inhibitorkanten (schalten nur bei leerer Stelle).' },
    { on: st.hasCapacities, label: 'Kapazitäten', title: 'Mindestens eine Stelle hat eine Kapazitätsgrenze.' },
    { on: st.timed, label: 'Zeitbehaftet', title: 'Mindestens eine Transition hat eine Verzögerung.' },
  ];

  return (
    <div className="analysis-scroll" data-testid="analysis-overview">
      <div className="kpis">
        {kpis.map((k) => (
          <div key={k.label} className={`kpi${k.bad ? ' bad' : ''}`}>
            <div className="kpi-value">{k.value}</div>
            <div className="kpi-label">{k.label}</div>
          </div>
        ))}
      </div>

      {st.timed && (
        <div className="callout" style={{ margin: '0 12px 10px' }}>
          <Clock size={16} />
          <span>
            Die Analyse betrachtet alle möglichen Schaltreihenfolgen <b>ohne Zeitverhalten</b>. Mit Zeiten sind manche Zustände in der Simulation nicht
            erreichbar – die Analyse ist also eine sichere Obergrenze.
          </span>
        </div>
      )}
      {doc.settings.sim.conflict === 'priority' && net.transitions.some((t) => t.priority !== net.transitions[0].priority) && (
        <div className="callout" style={{ margin: '0 12px 10px' }}>
          <Info size={16} />
          <span>Prioritäten werden in der Analyse nicht berücksichtigt – sie untersucht jede mögliche Reihenfolge.</span>
        </div>
      )}

      <div className="prop-list">
        {report.properties.map((p) => (
          <PropertyCard key={p.key} p={p} tabId={tabId} />
        ))}
      </div>

      <div className="panel-section">
        <div className="section-title">Schranken je Stelle</div>
        <table className="table compact">
          <thead>
            <tr>
              <th>Stelle</th>
              <th className="num" title="Marken im Anfangszustand">Anfang</th>
              <th className="num" title="Größte erreichbare Markenzahl">Max.</th>
              <th className="num" title="Kapazitätsgrenze (∞ = unbegrenzt)">Kapazität</th>
            </tr>
          </thead>
          <tbody>
            {net.placeIds.map((id, p) => {
              const b = report.bounds[p];
              const cap = net.capacity[p];
              return (
                <tr
                  key={id}
                  className="clickable"
                  onMouseEnter={() => highlight([id])}
                  onMouseLeave={() => highlight([])}
                  onClick={() => {
                    setSelection([id]);
                    centerOn([id]);
                  }}
                >
                  <td className="ellipsis">{pName(p)}</td>
                  <td className="num">{net.initial[p]}</td>
                  <td className={`num${b === OMEGA ? ' omega' : cap > 0 && b >= cap ? ' full' : ''}`}>{formatMarkValue(b)}</td>
                  <td className="num faint">{cap > 0 ? cap : '∞'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="panel-section">
        <div className="section-title">Struktur</div>
        <div className="struct-chips">
          {chips.map((c) => (
            <span key={c.label} className={`struct-chip${c.on ? ' on' : ''}`} title={c.title}>
              {c.on ? '✓' : '–'} {c.label}
            </span>
          ))}
        </div>
        {st.conflicts.length > 0 && (
          <div className="struct-list">
            <div className="muted">Mögliche Konflikte (Transitionen teilen sich eine Eingangsstelle):</div>
            {st.conflicts.slice(0, 12).map((c) => (
              <div
                key={c.place}
                className="struct-row"
                onMouseEnter={() => highlight([net.placeIds[c.place], ...c.transitions.map((t) => net.transitions[t].id)])}
                onMouseLeave={() => highlight([])}
              >
                <b>{pName(c.place)}</b> → {c.transitions.map(tName).join(', ')}
              </div>
            ))}
            {st.conflicts.length > 12 && <div className="faint">… und {st.conflicts.length - 12} weitere</div>}
          </div>
        )}
        {st.sources.length > 0 && (
          <div className="struct-row" title="Quellen haben keine Eingangsstellen und können immer schalten.">
            <span className="muted">Quellen:</span> {st.sources.map(tName).join(', ')}
          </div>
        )}
        {st.sinks.length > 0 && (
          <div className="struct-row" title="Senken haben keine Ausgangsstellen – ihre Marken verschwinden.">
            <span className="muted">Senken:</span> {st.sinks.map(tName).join(', ')}
          </div>
        )}
      </div>
    </div>
  );
}
