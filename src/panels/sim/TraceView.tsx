import { useMemo } from 'react';
import { formatNumber } from '../../sim/engine';
import { activeTab, useApp } from '../../store/appStore';
import type { SimSession } from '../../store/simStore';

const ROWS = 200;

/** Tabelle der letzten Markierungen (neueste oben). */
export function TraceView({ sess }: { sess: SimSession }) {
  const timeUnit = useApp((s) => activeTab(s)?.doc.settings.sim.timeUnit ?? 'ZE');
  const hist = sess.history;
  const n = hist.length;
  const net = sess.net;
  const rows = useMemo(() => {
    const out: { step: number; time: number; marking: Int32Array; fired: number[] | null; changed: boolean[] }[] = [];
    for (let i = n - 1; i >= Math.max(0, n - ROWS); i--) {
      const prev = i > 0 ? hist.markings[i - 1] : null;
      const m = hist.markings[i];
      out.push({
        step: hist.steps[i],
        time: hist.times[i],
        marking: m,
        fired: hist.fired[i],
        changed: Array.from(m, (v, p) => !!prev && prev[p] !== v),
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hist, n, sess.version]);

  if (!n) return <div className="empty-state">Noch kein Verlauf vorhanden.</div>;
  return (
    <div className="simtrace">
      <div className="simtrace-note muted">
        Die letzten {Math.min(ROWS, n)} Markierungen, neueste oben. Geänderte Werte sind hervorgehoben.
        {hist.decimated && ' Der Verlauf wurde bei diesem langen Lauf ausgedünnt.'}
      </div>
      <div className="simtrace-table">
        <table className="table">
          <thead>
            <tr>
              <th className="num">Schritt</th>
              <th className="num">Zeit ({timeUnit})</th>
              {net.placeNames.map((name, p) => (
                <th key={net.placeIds[p]} className="num">
                  {name}
                </th>
              ))}
              <th>Geschaltet</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.step}-${i}`}>
                <td className="num mono">{formatNumber(r.step)}</td>
                <td className="num mono">{formatNumber(r.time, 3)}</td>
                {Array.from(r.marking, (v, p) => (
                  <td key={p} className={`num mono${r.changed[p] ? ' changed' : ''}`}>
                    {v}
                  </td>
                ))}
                <td className="muted">{r.fired?.map((t) => net.transitions[t]?.name ?? '?').join(', ') || '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
