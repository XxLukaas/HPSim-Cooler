/**
 * Zustandsgraph (Erreichbarkeits-/Überdeckungsgraph) mit Zoom, Verschieben,
 * Vollbild und einem Inspektor für den gewählten Zustand.
 */
import { ArrowRight, Flag, Maximize, Maximize2, Minimize2, Play, Skull, X } from 'lucide-react';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { AnalysisReport } from '../../analysis/analyze';
import { layoutReachGraph, NODE_H, type GraphLayout } from '../../analysis/graphLayout';
import { OMEGA, pathTo } from '../../analysis/reachability';
import { IconButton } from '../../components/ui';
import { setUi } from '../../store/appStore';
import { formatMarkValue, playWitness, selectState } from '../../store/analysisStore';

const MAX_DRAW = 1500;
const MAX_EDGE_LABELS = 220;

interface GraphModel {
  layout: GraphLayout;
  nodeW: number;
  showVector: boolean;
  labels: string[];
}

function buildModel(report: AnalysisReport): GraphModel | null {
  const g = report.graph;
  if (g.states.length > MAX_DRAW) return null;
  const P = report.net.placeIds.length;
  const showVector = P > 0 && P <= 6;
  const labels = g.states.map((m, s) => (showVector ? `(${m.map(formatMarkValue).join(',')})` : `M${s}`));
  let longest = 0;
  for (const l of labels) longest = Math.max(longest, l.length);
  const nodeW = Math.max(52, Math.round(16 + longest * 6.6));
  return { layout: layoutReachGraph(g, nodeW, g.edges.length <= MAX_EDGE_LABELS), nodeW, showVector, labels };
}

interface ViewT {
  x: number;
  y: number;
  k: number;
}

/** Statischer Graphinhalt – wird nur bei Auswahländerung neu gezeichnet, nicht beim Zoomen. */
const GraphContent = memo(function GraphContent({ report, model, selected }: { report: AnalysisReport; model: GraphModel; selected: number | null }) {
  const g = report.graph;
  const { layout: L, nodeW, labels, showVector } = model;
  const deadlocks = useMemo(() => new Set(report.deadlocks), [report]);
  const hw = nodeW / 2;
  const hh = NODE_H / 2;

  // Mehrfachkanten zwischen denselben Zuständen zusammenfassen
  const grouped = useMemo(() => {
    const m = new Map<string, { from: number; to: number; ts: number[] }>();
    for (const e of g.edges) {
      const key = `${e.from}>${e.to}`;
      const cur = m.get(key);
      if (cur) cur.ts.push(e.t);
      else m.set(key, { from: e.from, to: e.to, ts: [e.t] });
    }
    return [...m.values()];
  }, [g]);
  const withLabels = grouped.length <= MAX_EDGE_LABELS;
  const tName = (t: number) => report.net.transitions[t].name;

  const pairs = useMemo(() => new Set(grouped.map((e) => `${e.from}>${e.to}`)), [grouped]);

  /** Schnittpunkt des Strahls vom Knotenmittelpunkt in Richtung (vx, vy) mit dem Knotenrand. */
  const clip = (cx: number, cy: number, vx: number, vy: number, pad = 0) => {
    const len = Math.hypot(vx, vy) || 1;
    const ux = vx / len;
    const uy = vy / len;
    const t = Math.min(ux ? (hw + pad) / Math.abs(ux) : Infinity, uy ? (hh + pad) / Math.abs(uy) : Infinity);
    return { x: cx + ux * t, y: cy + uy * t };
  };

  const edges = grouped.map((e, i) => {
    const x1 = L.x[e.from];
    const y1 = L.y[e.from];
    const x2 = L.x[e.to];
    const y2 = L.y[e.to];
    const active = selected !== null && e.from === selected;
    const incoming = selected !== null && e.to === selected;
    let d: string;
    let lx: number;
    let ly: number;
    if (e.from === e.to) {
      // Schleife rechts am Knoten
      d = `M ${x1 + hw} ${y1 - 6} C ${x1 + hw + 34} ${y1 - 26}, ${x1 + hw + 34} ${y1 + 26}, ${x1 + hw} ${y1 + 6}`;
      lx = x1 + hw + 30;
      ly = y1 + 3.5;
    } else {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const reverse = pairs.has(`${e.to}>${e.from}`);
      // Gegenläufige Kanten auf verschiedene Seiten biegen, Rückwärtskanten seitlich vorbeiführen
      const bend = reverse ? Math.max(18, len * 0.16) : dy <= 0 ? 26 + len * 0.14 : 0;
      const cx = (x1 + x2) / 2 + nx * bend;
      const cy = (y1 + y2) / 2 + ny * bend;
      const s0 = clip(x1, y1, cx - x1, cy - y1);
      const e0 = clip(x2, y2, cx - x2, cy - y2, 3);
      d = bend ? `M ${s0.x} ${s0.y} Q ${cx} ${cy} ${e0.x} ${e0.y}` : `M ${s0.x} ${s0.y} L ${e0.x} ${e0.y}`;
      // Beschriftung etwas näher am Ausgangsknoten: gegenläufige Kanten überlappen so nicht
      const t = 0.4;
      const a = (1 - t) * (1 - t);
      const b = 2 * (1 - t) * t;
      const c = t * t;
      const mx = a * s0.x + b * cx + c * e0.x;
      const my = a * s0.y + b * cy + c * e0.y;
      const side = bend ? 9 : 0;
      lx = mx + nx * side;
      ly = my + ny * side + 3.5;
    }
    return (
      <g key={i} className={`rg-edge${active ? ' out' : ''}${incoming ? ' in' : ''}`}>
        <path d={d} markerEnd={`url(#rg-arrow${active ? '-out' : incoming ? '-in' : ''})`} />
        {withLabels && (
          <text x={lx} y={ly} className="rg-edge-label">
            {e.ts.map(tName).join(', ')}
          </text>
        )}
      </g>
    );
  });

  const nodes = g.states.map((m, s) => {
    const omega = m.some((v) => v === OMEGA);
    const cls = ['rg-node', s === 0 && 'initial', deadlocks.has(s) && 'dead', omega && 'omega', s === selected && 'selected'].filter(Boolean).join(' ');
    return (
      <g key={s} className={cls} data-state={s} transform={`translate(${L.x[s] - hw} ${L.y[s] - hh})`}>
        <title>{`M${s}: ${m.map((v, p) => `${report.net.placeNames[p]}=${formatMarkValue(v)}`).join(', ')}`}</title>
        <rect width={nodeW} height={NODE_H} rx={9} />
        <text x={hw} y={hh + 4}>
          {labels[s]}
        </text>
        {showVector && (
          <text x={-4} y={-4} className="rg-node-id">
            M{s}
          </text>
        )}
      </g>
    );
  });

  return (
    <>
      <defs>
        {['', '-out', '-in'].map((suffix) => (
          <marker key={suffix} id={`rg-arrow${suffix}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" className={`rg-arrow${suffix}`} />
          </marker>
        ))}
      </defs>
      <g>{edges}</g>
      <g>{nodes}</g>
    </>
  );
});

function GraphCanvas({ report, model, tabId, selected, tall }: { report: AnalysisReport; model: GraphModel; tabId: string; selected: number | null; tall?: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 400, h: 300 });
  const [view, setView] = useState<ViewT>({ x: 0, y: 0, k: 1 });
  const drag = useRef<{ sx: number; sy: number; vx: number; vy: number; moved: boolean; state: number | null } | null>(null);
  const L = model.layout;

  const [measured, setMeasured] = useState(false);

  /** Ganzen Graphen einpassen; `readable` begrenzt das Herauszoomen und zeigt dann den Anfang. */
  const fit = useCallback(
    (readable = false) => {
      const pad = 24;
      const k = Math.max(0.03, Math.min(1.3, (size.w - pad * 2) / Math.max(L.width, 1), (size.h - pad * 2) / Math.max(L.height, 1)));
      if (readable && k < 0.5 && L.x.length) {
        const kk = 0.6;
        setView({ k: kk, x: size.w / 2 - L.x[0] * kk, y: pad - (L.y[0] - NODE_H) * kk });
        return;
      }
      setView({ k, x: (size.w - L.width * k) / 2, y: Math.max(pad, (size.h - L.height * k) / 2) });
    },
    [L, size.w, size.h],
  );

  useLayoutEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        setSize({ w: r.width, h: r.height });
        setMeasured(true);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Beim ersten Anzeigen und bei neuem Graphen einpassen
  const fittedFor = useRef<GraphLayout | null>(null);
  useEffect(() => {
    if (!measured || fittedFor.current === L) return;
    fittedFor.current = L;
    fit(true);
  }, [L, fit, measured]);

  // Gewählten Zustand ins Bild holen, falls er außerhalb liegt
  useEffect(() => {
    if (selected === null || selected >= L.x.length) return;
    setView((v) => {
      const sx = L.x[selected] * v.k + v.x;
      const sy = L.y[selected] * v.k + v.y;
      if (sx > 30 && sx < size.w - 30 && sy > 30 && sy < size.h - 30) return v;
      return { ...v, x: size.w / 2 - L.x[selected] * v.k, y: size.h / 2 - L.y[selected] * v.k };
    });
  }, [selected, L, size.w, size.h]);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      const f = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0018));
      setView((v) => {
        const k = Math.min(4, Math.max(0.04, v.k * f));
        return { k, x: mx - ((mx - v.x) * k) / v.k, y: my - ((my - v.y) * k) / v.k };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.button !== 1) return;
    const node = (e.target as Element).closest('[data-state]');
    drag.current = { sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, moved: false, state: node ? Number(node.getAttribute('data-state')) : null };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    d.moved = true;
    setView((v) => ({ ...v, x: d.vx + dx, y: d.vy + dy }));
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved) return;
    selectState(tabId, d.state);
  };

  return (
    <div className={`rg-host${tall ? ' tall' : ''}`} ref={hostRef} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} data-testid="reach-graph">
      <svg width={size.w} height={size.h} className={view.k < 0.45 ? 'rg-small' : ''}>
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          <GraphContent report={report} model={model} selected={selected} />
        </g>
      </svg>
      <div className="rg-zoom">
        <IconButton small icon={<Maximize size={15} />} title="Ganzen Graphen einpassen" onClick={() => fit()} />
      </div>
    </div>
  );
}

function StateInspector({ report, tabId, selected }: { report: AnalysisReport; tabId: string; selected: number | null }) {
  const g = report.graph;
  const net = report.net;
  const tName = (t: number) => net.transitions[t].name;
  const highlight = (ids: string[]) => setUi({ highlight: ids });

  if (selected === null || selected >= g.states.length) {
    return (
      <div className="rg-inspector">
        <div className="muted">Klicke auf einen Zustand, um seine Markierung auf der Zeichenfläche zu sehen.</div>
        <div className="rg-quick">
          <button type="button" className="btn sm" onClick={() => selectState(tabId, 0)} data-testid="rg-initial">
            <Flag size={13} /> Anfangszustand
          </button>
          {report.deadlocks.slice(0, 6).map((d) => (
            <button key={d} type="button" className="btn sm danger-ghost" onClick={() => selectState(tabId, d)}>
              <Skull size={13} /> M{d}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const m = g.states[selected];
  const outs = (g.out[selected] ?? []).map((i) => g.edges[i]);
  const ins = g.edges.filter((e) => e.to === selected && e.from !== selected).slice(0, 12);
  const path = pathTo(g, selected);
  const dead = outs.length === 0;

  return (
    <div className="rg-inspector" data-testid="rg-inspector">
      <div className="rg-insp-head">
        <b>Zustand M{selected}</b>
        {selected === 0 && <span className="badge accent">Anfang</span>}
        {dead && <span className="badge danger">Verklemmung</span>}
        {m.some((v) => v === OMEGA) && <span className="badge" title="ω: beliebig viele Marken möglich">ω</span>}
        <span className="faint">Tiefe {g.depth[selected]}</span>
        <span className="spacer" />
        <IconButton small icon={<X size={14} />} title="Auswahl aufheben (Zeichenfläche zeigt wieder die Anfangsmarkierung)" onClick={() => selectState(tabId, null)} />
      </div>
      <div className="rg-marking">
        {m.map((v, p) => (
          <span
            key={p}
            className={`mark-chip${v === 0 ? ' zero' : ''}`}
            onMouseEnter={() => highlight([net.placeIds[p]])}
            onMouseLeave={() => highlight([])}
          >
            {net.placeNames[p]} <b>{formatMarkValue(v)}</b>
          </span>
        ))}
      </div>
      <div className="rg-insp-section">
        <div className="section-title">Aktiviert – Klick geht zum Folgezustand</div>
        {dead ? (
          <div className="muted">Keine Transition kann schalten – das Netz ist hier verklemmt.</div>
        ) : (
          <div className="rg-moves">
            {outs.map((e, i) => (
              <button
                key={i}
                type="button"
                className="move-btn"
                onClick={() => selectState(tabId, e.to)}
                onMouseEnter={() => highlight([net.transitions[e.t].id])}
                onMouseLeave={() => highlight([])}
              >
                {tName(e.t)} <ArrowRight size={12} /> M{e.to}
              </button>
            ))}
          </div>
        )}
      </div>
      {ins.length > 0 && (
        <div className="rg-insp-section">
          <div className="section-title">Vorgänger</div>
          <div className="rg-moves">
            {ins.map((e, i) => (
              <button key={i} type="button" className="move-btn ghost" onClick={() => selectState(tabId, e.from)}>
                M{e.from} <ArrowRight size={12} /> {tName(e.t)}
              </button>
            ))}
          </div>
        </div>
      )}
      {selected !== 0 && (
        <div className="rg-insp-section">
          <div className="section-title">Kürzester Weg vom Anfang ({path.length} Schritt{path.length === 1 ? '' : 'e'})</div>
          <div className="rg-path">{path.map(tName).join(' → ')}</div>
          <div>
            <button type="button" className="btn sm primary" onClick={() => playWitness(path, `Weg zu M${selected}`)} data-testid="rg-play">
              <Play size={13} /> In der Simulation nachspielen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function GraphView({ report, tabId, selected }: { report: AnalysisReport; tabId: string; selected: number | null }) {
  const [full, setFull] = useState(false);
  const model = useMemo(() => buildModel(report), [report]);
  const g = report.graph;

  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setFull(false);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [full]);

  const legend = (
    <div className="rg-legend">
      <span>
        <i className="lg initial" /> Anfang
      </span>
      <span>
        <i className="lg dead" /> Verklemmung
      </span>
      {g.hasOmega && (
        <span>
          <i className="lg omega" /> mit ω
        </span>
      )}
      <span>
        <i className="lg selected" /> gewählt
      </span>
    </div>
  );

  return (
    <div className="graphview" data-testid="analysis-graph">
      <div className="rg-toolbar">
        <span className="muted">
          {g.states.length.toLocaleString('de-DE')} Zustände · {g.edges.length.toLocaleString('de-DE')} Übergänge
          {g.truncated ? ' · unvollständig' : ''}
        </span>
        <span className="spacer" />
        {model && <IconButton small icon={<Maximize2 size={15} />} title="Im Vollbild anzeigen" onClick={() => setFull(true)} testId="rg-fullscreen" />}
      </div>
      {model ? (
        <>
          <GraphCanvas report={report} model={model} tabId={tabId} selected={selected} />
          {legend}
        </>
      ) : (
        <div className="callout warning" style={{ margin: 12 }}>
          Der Zustandsraum ist mit {g.states.length.toLocaleString('de-DE')} Zuständen zu groß zum Zeichnen (höchstens {MAX_DRAW.toLocaleString('de-DE')}). Über den Inspektor kannst
          du trotzdem durch die Zustände wandern.
        </div>
      )}
      <StateInspector report={report} tabId={tabId} selected={selected} />
      {full &&
        model &&
        createPortal(
          <div className="rg-full" role="dialog" aria-modal="true" aria-label="Zustandsgraph">
            <div className="rg-full-head">
              <b>Zustandsgraph</b>
              <span className="muted">Mausrad zoomt · Ziehen verschiebt · Klick wählt einen Zustand</span>
              <span className="spacer" />
              {legend}
              <IconButton small icon={<Minimize2 size={15} />} title="Vollbild verlassen (Esc)" onClick={() => setFull(false)} />
            </div>
            <div className="rg-full-body">
              <GraphCanvas report={report} model={model} tabId={tabId} selected={selected} tall />
              <div className="rg-full-side">
                <StateInspector report={report} tabId={tabId} selected={selected} />
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
