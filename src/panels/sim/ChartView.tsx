/**
 * Live-Diagramm der Markenzahlen (Treppenkurven) mit Fadenkreuz-Tooltip,
 * Legende, Direktbeschriftung und PNG-Export.
 */
import { Download, ImageDown, LineChart, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { runAction } from '../../app/actions';
import { downloadBlob } from '../../io/files';
import { formatNumber } from '../../sim/engine';
import { activeTab, setUi, toast, useApp } from '../../store/appStore';
import type { SimSession } from '../../store/simStore';
import {
  assignSlots,
  defaultSeries,
  downsampleSteps,
  indexAtTime,
  MAX_SERIES,
  niceTicks,
  rangeTicks,
  SERIES_DARK,
  SERIES_LIGHT,
  stepPath,
} from './chartData';

const selections = new Map<string, string[]>();
const slotMaps = new Map<string, Map<string, number>>();

const INK = {
  dark: { text: '#e2e8f0', muted: '#8191a9', grid: 'rgba(148,163,184,0.13)', axis: 'rgba(148,163,184,0.35)', surface: '#121926', cross: 'rgba(226,232,240,0.45)' },
  light: { text: '#0f172a', muted: '#64748b', grid: '#e9edf3', axis: '#cbd5e1', surface: '#ffffff', cross: 'rgba(15,23,42,0.35)' },
};

type XMode = 'auto' | 'time' | 'step';
type Win = 0 | 50 | 200 | 1000;

export function ChartView({ sess }: { sess: SimSession }) {
  const theme = useApp((s) => s.ui.theme);
  const timeUnit = useApp((s) => activeTab(s)?.doc.settings.sim.timeUnit ?? 'ZE');
  const ink = INK[theme];
  const colors = theme === 'dark' ? SERIES_DARK : SERIES_LIGHT;
  const net = sess.net;
  const hist = sess.history;
  const hostRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 600, h: 200 });
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const [query, setQuery] = useState('');
  const [xMode, setXMode] = useState<XMode>('auto');
  const [win, setWin] = useState<Win>(0);

  // Auswahl der Kurven je Tab merken
  const [selected, setSelectedState] = useState<string[]>(() => {
    const prev = selections.get(sess.tabId)?.filter((id) => net.placeIndex.has(id));
    return prev?.length ? prev : defaultSeries(net.placeIds, sess.state.minMarking, sess.state.maxMarking);
  });
  useEffect(() => {
    // Netz geändert → ungültige Stellen entfernen
    setSelectedState((cur) => {
      const valid = cur.filter((id) => net.placeIndex.has(id));
      return valid.length === cur.length ? cur : valid.length ? valid : defaultSeries(net.placeIds, sess.state.minMarking, sess.state.maxMarking);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [net]);
  const slots = useMemo(() => {
    const m = assignSlots(selected, slotMaps.get(sess.tabId) ?? new Map());
    slotMaps.set(sess.tabId, m);
    selections.set(sess.tabId, selected);
    return m;
  }, [selected, sess.tabId]);

  const toggle = (id: string) => {
    setSelectedState((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      if (cur.length >= MAX_SERIES) {
        toast('info', `Höchstens ${MAX_SERIES} Kurven`, 'Blende zuerst eine andere Stelle aus – sonst werden die Farben unverwechselbar.');
        return cur;
      }
      return [...cur, id];
    });
  };

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setSize({ w: Math.round(r.width), h: Math.round(r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = hist.length;
  const timeSpan = n ? hist.times[n - 1] - hist.times[0] : 0;
  const useSteps = xMode === 'step' || (xMode === 'auto' && timeSpan <= 0);
  const allXs = useMemo(() => (useSteps ? hist.steps.slice() : hist.times.slice()), [useSteps, hist, n, sess.version]); // eslint-disable-line react-hooks/exhaustive-deps
  // Zeitfenster: nur die letzten `win` Einheiten zeigen
  const startIdx = useMemo(() => {
    if (!win || !allXs.length) return 0;
    const from = allXs[allXs.length - 1] - win;
    return Math.max(0, indexAtTime(allXs, from));
  }, [win, allXs]);
  const xs = useMemo(() => (startIdx ? allXs.slice(startIdx) : allXs), [allXs, startIdx]);
  const nAll = n;

  const series = useMemo(() => {
    return selected
      .map((id) => {
        const p = net.placeIndex.get(id);
        if (p === undefined) return null;
        const values = new Int32Array(nAll - startIdx);
        for (let i = startIdx; i < nAll; i++) values[i - startIdx] = hist.markings[i][p] ?? 0;
        return { id, p, name: net.placeNames[p], color: colors[(slots.get(id) ?? 0) % colors.length], values, points: downsampleSteps(xs, values, 700) };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null);
  }, [selected, net, nAll, startIdx, hist, xs, colors, slots]);
  const nv = xs.length;

  const direct = series.length > 0 && series.length <= 4;
  const m = { l: 44, r: direct ? 104 : 18, t: 22, b: 30 };
  const pw = Math.max(40, size.w - m.l - m.r);
  const ph = Math.max(30, size.h - m.t - m.b);
  const x0 = nv ? xs[0] : 0;
  const x1 = nv ? Math.max(xs[nv - 1], x0 + 1) : 1;
  let vmax = 1;
  for (const s of series) for (let i = 0; i < s.values.length; i++) if (s.values[i] > vmax) vmax = s.values[i];
  const yTicks = niceTicks(vmax, Math.max(2, Math.min(6, Math.floor(ph / 32))));
  const ymax = yTicks[yTicks.length - 1] || 1;
  const xTicks = rangeTicks(x0, x1, Math.max(2, Math.min(10, Math.floor(pw / 90))));
  const sx = (t: number) => m.l + ((t - x0) / (x1 - x0)) * pw;
  const sy = (v: number) => m.t + ph - (v / ymax) * ph;

  // Fadenkreuz
  let hoverIdx = -1;
  if (hover && nv) {
    const t = x0 + ((hover.x - m.l) / pw) * (x1 - x0);
    hoverIdx = indexAtTime(xs, t);
  }

  // Direktbeschriftung am rechten Rand, Überlappungen auflösen
  const labels = direct
    ? series
        .map((s) => ({ s, y: sy(s.values[nv - 1] ?? 0) }))
        .sort((a, b) => a.y - b.y)
        .reduce<{ s: (typeof series)[number]; y: number }[]>((acc, l) => {
          const prev = acc[acc.length - 1];
          acc.push({ ...l, y: prev && l.y - prev.y < 15 ? prev.y + 15 : l.y });
          return acc;
        }, [])
    : [];

  const exportPng = async () => {
    const svg = svgRef.current;
    if (!svg) return;
    try {
      const clone = svg.cloneNode(true) as SVGSVGElement;
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      clone.querySelectorAll('[data-export-hide]').forEach((e) => e.remove());
      const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      bg.setAttribute('width', '100%');
      bg.setAttribute('height', '100%');
      bg.setAttribute('fill', ink.surface);
      clone.insertBefore(bg, clone.firstChild);
      const xml = new XMLSerializer().serializeToString(clone);
      const img = new Image();
      const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }));
      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = () => rej(new Error('Bild konnte nicht erzeugt werden'));
        img.src = url;
      });
      const scale = 2;
      const canvas = document.createElement('canvas');
      canvas.width = size.w * scale;
      canvas.height = size.h * scale;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas nicht verfügbar');
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, size.w, size.h);
      URL.revokeObjectURL(url);
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
      if (!blob) throw new Error('PNG konnte nicht erzeugt werden');
      const title = activeTab()?.doc.meta.title ?? 'Netz';
      downloadBlob(`${title.replace(/[\\/:*?"<>|]+/g, '_')}_Diagramm.png`, blob);
    } catch (err) {
      toast('error', 'Export fehlgeschlagen', err instanceof Error ? err.message : String(err));
    }
  };

  const q = query.trim().toLowerCase();
  const chipIds = net.placeIds.filter((id, i) => selected.includes(id) || !q || net.placeNames[i].toLowerCase().includes(q));
  const many = net.placeIds.length > 24;

  return (
    <div className="simchart">
      <div className="sim-toolbar wrap">
        <div className="chart-legend" role="group" aria-label="Kurven">
          {chipIds.slice(0, many && !q ? 40 : 200).map((id) => {
            const i = net.placeIndex.get(id)!;
            const on = selected.includes(id);
            const color = on ? colors[(slots.get(id) ?? 0) % colors.length] : undefined;
            return (
              <button
                key={id}
                type="button"
                className={`chip${on ? ' on' : ''}`}
                aria-pressed={on}
                onClick={() => toggle(id)}
                onMouseEnter={() => setUi({ highlight: [id] })}
                onMouseLeave={() => setUi({ highlight: [] })}
                title={on ? 'Kurve ausblenden' : 'Kurve einblenden'}
              >
                <span className="chip-swatch" style={{ background: color ?? 'transparent', borderColor: color ?? 'var(--border-strong)' }} />
                {net.placeNames[i]}
              </button>
            );
          })}
        </div>
        {many && (
          <label className="sim-search small">
            <Search size={13} />
            <input value={query} placeholder="Stelle suchen" onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
          </label>
        )}
        <span className="spacer" />
        <div className="segmented" title="Ausschnitt: nur die letzten Zeiteinheiten bzw. Schritte zeigen">
          {([0, 50, 200, 1000] as const).map((v) => (
            <button key={v} type="button" className={win === v ? 'active' : ''} onClick={() => setWin(v)}>
              {v === 0 ? 'Alles' : `letzte ${v}`}
            </button>
          ))}
        </div>
        <div className="segmented" title="Einheit der waagerechten Achse">
          {(['auto', 'time', 'step'] as const).map((v) => (
            <button key={v} type="button" className={xMode === v ? 'active' : ''} onClick={() => setXMode(v)}>
              {v === 'auto' ? 'Auto' : v === 'time' ? 'Zeit' : 'Schritte'}
            </button>
          ))}
        </div>
        <button type="button" className="btn sm ghost" onClick={exportPng} disabled={nv < 2} title="Diagramm als PNG speichern">
          <ImageDown size={14} /> PNG
        </button>
        <button type="button" className="btn sm ghost" onClick={() => runAction('sim.exportCsv')} title="Verlauf als CSV (Excel)">
          <Download size={14} /> CSV
        </button>
      </div>
      <div className="chart-host" ref={hostRef}>
        {nv < 2 || !series.length ? (
          <div className="empty-state">
            <LineChart size={26} />
            {series.length ? 'Noch keine Daten – führe ein paar Schritte aus oder starte die Simulation.' : 'Wähle oben mindestens eine Stelle aus.'}
          </div>
        ) : (
          <svg
            ref={svgRef}
            width={size.w}
            height={size.h}
            className="chart-svg"
            fontFamily="Inter, 'Segoe UI', system-ui, sans-serif"
            onMouseMove={(e) => {
              const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
              const x = e.clientX - r.left;
              const y = e.clientY - r.top;
              setHover(x >= m.l && x <= m.l + pw ? { x, y } : null);
            }}
            onMouseLeave={() => setHover(null)}
            role="img"
            aria-label={`Markenverlauf von ${series.map((s) => s.name).join(', ')}`}
          >
            {yTicks.map((v) => (
              <g key={`y${v}`}>
                <line x1={m.l} x2={m.l + pw} y1={sy(v)} y2={sy(v)} stroke={v === 0 ? ink.axis : ink.grid} strokeWidth={1} />
                <text x={m.l - 8} y={sy(v)} textAnchor="end" dominantBaseline="central" fontSize={11} fill={ink.muted} style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {formatNumber(v)}
                </text>
              </g>
            ))}
            {xTicks.map((t) => (
              <text key={`x${t}`} x={sx(t)} y={m.t + ph + 18} textAnchor="middle" fontSize={11} fill={ink.muted} style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatNumber(t, 3)}
              </text>
            ))}
            <text x={m.l + pw} y={m.t + ph + 18} dy={-22} textAnchor="end" fontSize={10.5} fill={ink.muted}>
              {useSteps ? 'Schritt' : `Zeit (${timeUnit})`}
            </text>
            <text x={6} y={11} fontSize={10.5} fill={ink.muted}>
              Marken
            </text>
            {series.map((s) => (
              <path key={s.id} d={stepPath(s.points, sx, sy, sx(x1))} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" />
            ))}
            {labels.map(({ s, y }) => (
              <g key={`l${s.id}`}>
                <circle cx={m.l + pw + 8} cy={y} r={4} fill={s.color} />
                <text x={m.l + pw + 16} y={y} dominantBaseline="central" fontSize={11.5} fill={ink.text}>
                  {s.name.length > 10 ? s.name.slice(0, 9) + '…' : s.name}{' '}
                  <tspan fill={ink.muted}>{formatNumber(s.values[nv - 1] ?? 0)}</tspan>
                </text>
              </g>
            ))}
            {hoverIdx >= 0 && hover && (
              <g data-export-hide pointerEvents="none">
                <line x1={sx(xs[hoverIdx])} x2={sx(xs[hoverIdx])} y1={m.t} y2={m.t + ph} stroke={ink.cross} strokeWidth={1} strokeDasharray="3 3" />
                {series.map((s) => (
                  <circle key={s.id} cx={sx(xs[hoverIdx])} cy={sy(s.values[hoverIdx] ?? 0)} r={4.5} fill={s.color} stroke={ink.surface} strokeWidth={2} />
                ))}
              </g>
            )}
          </svg>
        )}
        {hoverIdx >= 0 && hover && series.length > 0 && (
          <div
            className="chart-tip"
            style={{
              left: Math.min(hover.x + 14, size.w - 210),
              top: Math.max(4, Math.min(hover.y - 10, size.h - 40 - series.length * 20)),
            }}
          >
            <div className="chart-tip-head">
              {useSteps ? `Schritt ${formatNumber(xs[hoverIdx])}` : `Zeit ${formatNumber(xs[hoverIdx], 3)} ${timeUnit}`}
              {!useSteps && <span className="muted"> · Schritt {formatNumber(hist.steps[hoverIdx + startIdx])}</span>}
            </div>
            {[...series]
              .sort((a, b) => (b.values[hoverIdx] ?? 0) - (a.values[hoverIdx] ?? 0))
              .map((s) => (
                <div key={s.id} className="chart-tip-row">
                  <span className="chip-swatch" style={{ background: s.color, borderColor: s.color }} />
                  <span className="grow">{s.name}</span>
                  <b className="mono">{formatNumber(s.values[hoverIdx] ?? 0)}</b>
                </div>
              ))}
          </div>
        )}
      </div>
      {hist.decimated && <div className="chart-note muted">Langer Lauf: Der Verlauf wurde ausgedünnt (Spitzen bleiben erhalten).</div>}
    </div>
  );
}
