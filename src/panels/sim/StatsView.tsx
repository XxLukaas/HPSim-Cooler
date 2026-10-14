import { ArrowDown, ArrowUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import { formatNumber } from '../../sim/engine';
import { activeTab, centerOn, setSelection, setUi, useApp } from '../../store/appStore';
import { transitionVisuals, type SimSession } from '../../store/simStore';

type Dir = 1 | -1;

function useSort<K extends string>(initial: K) {
  const [key, setKey] = useState<K>(initial);
  const [dir, setDir] = useState<Dir>(1);
  const header = (k: K, label: string, num = false, title?: string) => (
    <th
      className={num ? 'num' : undefined}
      onClick={() => {
        if (k === key) setDir((d) => (d === 1 ? -1 : 1));
        else {
          setKey(k);
          setDir(num ? -1 : 1);
        }
      }}
      style={{ cursor: 'pointer', userSelect: 'none' }}
      title={title ?? 'Sortieren'}
      aria-sort={k === key ? (dir === 1 ? 'ascending' : 'descending') : 'none'}
    >
      {label} {k === key && (dir === 1 ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
    </th>
  );
  return { key, dir, header };
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <span className="stat-bar" aria-hidden>
      <span style={{ width: `${pct * 100}%`, background: color }} />
    </span>
  );
}

function select(id: string) {
  setSelection([id]);
  centerOn([id]);
}

export function StatsView({ sess }: { sess: SimSession }) {
  const timeUnit = useApp((s) => activeTab(s)?.doc.settings.sim.timeUnit ?? 'ZE');
  const net = sess.net;
  const st = sess.state;
  const time = st.time;

  const places = useMemo(
    () =>
      net.placeIds.map((id, p) => ({
        id,
        name: net.placeNames[p],
        cur: st.marking[p],
        min: st.minMarking[p],
        max: st.maxMarking[p],
        avg: time > 0 ? st.integral[p] / time : NaN,
        inflow: st.inflow[p],
        cap: net.capacity[p],
      })),
    [net, st, time],
  );
  const visuals = useMemo(() => transitionVisuals(sess), [sess]);
  const trans = useMemo(
    () =>
      net.transitions.map((tr, t) => ({
        id: tr.id,
        name: tr.name,
        fired: st.fired[t],
        rate: time > 0 ? st.fired[t] / time : NaN,
        consumed: st.consumed[t],
        status: visuals[tr.id]?.status ?? 'disabled',
      })),
    [net, st, time, visuals],
  );

  const ps = useSort<'name' | 'cur' | 'min' | 'max' | 'avg' | 'inflow'>('name');
  const ts = useSort<'name' | 'fired' | 'rate' | 'consumed' | 'status'>('name');
  const sortedPlaces = [...places].sort((a, b) => {
    const va = a[ps.key];
    const vb = b[ps.key];
    if (typeof va === 'string' && typeof vb === 'string') return va.localeCompare(vb, 'de', { numeric: true }) * ps.dir;
    return ((Number.isNaN(va as number) ? -1 : (va as number)) - (Number.isNaN(vb as number) ? -1 : (vb as number))) * ps.dir;
  });
  const sortedTrans = [...trans].sort((a, b) => {
    const va = a[ts.key];
    const vb = b[ts.key];
    if (typeof va === 'string' && typeof vb === 'string') return va.localeCompare(vb, 'de', { numeric: true }) * ts.dir;
    return ((Number.isNaN(va as number) ? -1 : (va as number)) - (Number.isNaN(vb as number) ? -1 : (vb as number))) * ts.dir;
  });
  const maxCur = Math.max(1, ...places.map((p) => p.max));
  const maxFired = Math.max(1, ...trans.map((t) => t.fired));
  const statusLabel: Record<string, string> = { enabled: 'aktiviert', ready: 'schaltbereit', waiting: 'wartet', fired: 'geschaltet', disabled: '–' };

  return (
    <div className="simstats">
      <div className="simstats-col">
        <div className="simstats-title">
          Stellen <span className="muted">· Ø = zeitgewichteter Mittelwert</span>
        </div>
        <div className="simstats-table">
          <table className="table">
            <thead>
              <tr>
                {ps.header('name', 'Stelle')}
                {ps.header('cur', 'Aktuell', true)}
                {ps.header('min', 'Min', true)}
                {ps.header('max', 'Max', true)}
                {ps.header('avg', 'Ø', true, 'Durchschnittliche Markenzahl über die Simulationszeit')}
                {ps.header('inflow', 'Zufluss', true, 'Summe aller Marken, die in die Stelle gelegt wurden')}
              </tr>
            </thead>
            <tbody>
              {sortedPlaces.map((p) => (
                <tr key={p.id} onClick={() => select(p.id)} onMouseEnter={() => setUi({ highlight: [p.id] })} onMouseLeave={() => setUi({ highlight: [] })} style={{ cursor: 'pointer' }}>
                  <td>{p.name}</td>
                  <td className="num">
                    <Bar value={p.cur} max={maxCur} color="var(--token)" />
                    <b>{formatNumber(p.cur)}</b>
                    {p.cap > 0 && <span className="faint">/{p.cap}</span>}
                  </td>
                  <td className="num">{formatNumber(p.min)}</td>
                  <td className="num">{formatNumber(p.max)}</td>
                  <td className="num">{Number.isNaN(p.avg) ? '–' : formatNumber(p.avg, 2)}</td>
                  <td className="num">{formatNumber(p.inflow)}</td>
                </tr>
              ))}
              {!places.length && (
                <tr>
                  <td colSpan={6} className="muted">
                    Keine Stellen vorhanden.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div className="simstats-col">
        <div className="simstats-title">
          Transitionen <span className="muted">· Durchsatz = Schaltungen pro {timeUnit}</span>
        </div>
        <div className="simstats-table">
          <table className="table">
            <thead>
              <tr>
                {ts.header('name', 'Transition')}
                {ts.header('fired', 'Schaltungen', true)}
                {ts.header('rate', 'Durchsatz', true)}
                {ts.header('consumed', 'Verbraucht', true, 'Verbrauchte Marken insgesamt')}
                {ts.header('status', 'Status')}
              </tr>
            </thead>
            <tbody>
              {sortedTrans.map((t) => (
                <tr key={t.id} onClick={() => select(t.id)} onMouseEnter={() => setUi({ highlight: [t.id] })} onMouseLeave={() => setUi({ highlight: [] })} style={{ cursor: 'pointer' }}>
                  <td>{t.name}</td>
                  <td className="num">
                    <Bar value={t.fired} max={maxFired} color="var(--success)" />
                    <b>{formatNumber(t.fired)}</b>
                  </td>
                  <td className="num">{Number.isNaN(t.rate) ? '–' : formatNumber(t.rate, 3)}</td>
                  <td className="num">{formatNumber(t.consumed)}</td>
                  <td>
                    <span className={`badge ${t.status === 'disabled' ? '' : t.status === 'waiting' ? 'accent' : 'success'}`}>{statusLabel[t.status]}</span>
                  </td>
                </tr>
              ))}
              {!trans.length && (
                <tr>
                  <td colSpan={5} className="muted">
                    Keine Transitionen vorhanden.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
