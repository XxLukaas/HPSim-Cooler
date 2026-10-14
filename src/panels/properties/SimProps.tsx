/**
 * Eigenschaftenbereich im Simulationsmodus: Live-Überblick, Statistik der
 * ausgewählten Stelle, Aktivierungs-Erklärung der ausgewählten Transition.
 * Strukturelle Eigenschaften werden hier nur angezeigt, nicht geändert.
 */
import {
  Activity,
  ArrowDownToLine,
  BarChart3,
  Check,
  CircleHelp,
  Gauge,
  History,
  Info,
  ListChecks,
  Minus,
  MousePointerClick,
  Plus,
  RotateCcw,
  Sigma,
  Timer,
  X,
  Zap,
} from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { Button, Section } from '../../components/ui';
import { delayLabel } from '../../editor/NetRender';
import type { Palette } from '../../editor/palette';
import type { ArcEl, DecorEl, Id, NetDoc, PlaceEl, TransitionEl } from '../../model/types';
import { explainEnabling, formatNumber, isEnabled, type EnablingCondition } from '../../sim/engine';
import { setSelection } from '../../store/appStore';
import { adoptMarking, setCurrentTokens, simFire, simReset, transitionVisuals, type SimSession } from '../../store/simStore';
import { ArcEnds, arcTitle } from './ArcProps';
import { DecorGlyph } from './DecorProps';
import { clearOwnHighlight, highlight } from './edit';
import { Legend } from './Legend';
import { ARC_KIND_INFO, TIMING_INFO, arcEffectText, countLabel, elementLabel, groupSelection, TYPE_ORDER } from './model';
import { NodeActions, PlacePreview, placeSub } from './PlaceProps';
import { TransitionPreview, timingSub } from './TransitionProps';
import { useSimSession } from './useSimSession';
import { ArcGlyph, ConnectionsSection, Help, Hero, KV, MiniNode, Note, ReadOnlyNote, Stat, transitionAccent } from './widgets';

const MAX_TABLE_ROWS = 400;
const MAX_FIRE_BUTTONS = 60;

type TStatus = 'on' | 'wait' | 'off';

interface TransInfo {
  index: number;
  id: Id;
  name: string;
  timing: TransitionEl['timing'];
  enabled: boolean;
  waiting: boolean;
  progress: number | null;
  remaining: number | null;
}

function transInfos(sess: SimSession): TransInfo[] {
  const { net, state } = sess;
  return net.transitions.map((tr, i) => {
    let enabled = false;
    try {
      enabled = isEnabled(net, i, state.marking);
    } catch {
      enabled = false;
    }
    const timer = state.timers[i] ?? null;
    const total = state.timerTotals[i] ?? null;
    const waiting = enabled && tr.timing !== 'immediate' && timer !== null && timer > 1e-9;
    const progress = waiting && total !== null && total > 0 ? Math.max(0, Math.min(1, 1 - (timer as number) / total)) : null;
    return { index: i, id: tr.id, name: tr.name, timing: tr.timing, enabled, waiting, progress, remaining: waiting ? timer : null };
  });
}

function runLabel(sess: SimSession): { text: string; tone: 'success' | 'accent' | 'warning' | '' } {
  switch (sess.run) {
    case 'running':
      return { text: 'läuft', tone: 'success' };
    case 'fast':
      return { text: 'Schnelllauf', tone: 'success' };
    case 'replay':
      return { text: 'Wiedergabe', tone: 'accent' };
    default:
      if (sess.status === 'deadlock') return { text: 'Verklemmung', tone: 'warning' };
      if (sess.status === 'step-limit' || sess.status === 'time-limit') return { text: 'Limit erreicht', tone: 'warning' };
      return { text: 'angehalten', tone: '' };
  }
}

function ProgressBar({ value, tone = 'accent', label }: { value: number; tone?: 'accent' | 'success' | 'warning' | 'danger' | 'token'; label?: ReactNode }) {
  const pct = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) * 100 : 0;
  return (
    <div className="pp-progress-wrap">
      <div className={`pp-progress ${tone}`} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
        <div className="pp-progress-bar" style={{ width: `${pct}%` }} />
      </div>
      {label && <div className="pp-progress-label">{label}</div>}
    </div>
  );
}

// ───────────────────────────── Live-Überblick ─────────────────────────────

function LiveOverview({ sess, doc, p }: { sess: SimSession; doc: NetDoc; p: Palette }) {
  const unit = doc.settings.sim.timeUnit || 'ZE';
  const st = sess.state;
  const infos = useMemo(() => transInfos(sess), [sess]);
  const enabled = infos.filter((t) => t.enabled);
  const run = runLabel(sess);
  const totalTokens = useMemo(() => st.marking.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0), [st.marking]);
  const changed = useMemo(() => sess.net.initial.some((v, i) => v !== st.marking[i]), [sess.net.initial, st.marking]);
  const rows = sess.net.placeIds.slice(0, MAX_TABLE_ROWS);

  return (
    <>
      <div className="panel-section">
        <div className="pp-live-head">
          <span className={`pp-live-dot${sess.run !== 'stopped' ? ' on' : ''}`} />
          <b>Live-Überblick</b>
          <span className="spacer" />
          <span className={`badge ${run.tone}`} data-testid="prop-run-status">
            {run.text}
          </span>
        </div>
        <div className="pp-stats four">
          <Stat icon={<History size={12} />} label="Schritt" value={formatNumber(st.step)} testId="prop-live-step" />
          <Stat icon={<Timer size={12} />} label={`Zeit (${unit})`} value={formatNumber(st.time)} testId="prop-live-time" />
          <Stat icon={<Zap size={12} />} label="Aktiviert" value={`${enabled.length}/${infos.length}`} tone={enabled.length ? 'success' : 'warning'} testId="prop-live-enabled" />
          <Stat icon={<span className="pp-token-dot" />} label="Marken" value={formatNumber(totalTokens)} tone="token" testId="prop-live-tokens" />
        </div>
      </div>

      <Section title="Aktivierte Transitionen" icon={<Zap size={13} />} actions={<span className="badge success">{enabled.length}</span>}>
        {enabled.length === 0 ? (
          infos.length === 0 ? (
            <Help>Das Netz hat noch keine Transitionen.</Help>
          ) : (
            <Note
              tone="warning"
              action={
                <Button size="sm" icon={<RotateCcw size={13} />} onClick={() => simReset(sess.tabId)} testId="prop-live-reset">
                  Zurücksetzen
                </Button>
              }
            >
              Verklemmung: Keine Transition ist aktiviert – das Netz kann nicht weiterschalten.
            </Note>
          )
        ) : (
          <>
            <div className="pp-fire-list" data-testid="prop-enabled-list">
              {enabled.slice(0, MAX_FIRE_BUTTONS).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`pp-fire${t.waiting ? ' waiting' : ''}`}
                  title={`„${t.name}“ jetzt schalten`}
                  onClick={() => simFire(sess.tabId, t.id)}
                  onMouseEnter={() => highlight([t.id])}
                  onMouseLeave={clearOwnHighlight}
                  data-testid={`prop-fire-${t.name}`}
                >
                  <MiniNode type="transition" p={p} timing={t.timing} />
                  <span className="pp-fire-name">{t.name || '(ohne Namen)'}</span>
                  {t.waiting && t.progress !== null ? (
                    <span className="pp-fire-wait" title={`Verzögerung läuft: noch ${formatNumber(t.remaining ?? 0)} ${unit}`}>
                      <span style={{ width: `${Math.round(t.progress * 100)}%` }} />
                    </span>
                  ) : (
                    <span className="pp-fire-tag">{t.timing === 'immediate' ? 'bereit' : TIMING_INFO[t.timing].short}</span>
                  )}
                  <Zap size={13} className="pp-fire-icon" />
                </button>
              ))}
            </div>
            {enabled.length > MAX_FIRE_BUTTONS && <Help>… und {enabled.length - MAX_FIRE_BUTTONS} weitere.</Help>}
            <Help>Klick schaltet die Transition sofort von Hand (eine laufende Verzögerung wird übersprungen).</Help>
          </>
        )}
      </Section>

      <Section title="Markierung" icon={<BarChart3 size={13} />}>
        {rows.length === 0 ? (
          <Help>Das Netz hat noch keine Stellen.</Help>
        ) : (
          <div className="pp-table-wrap">
            <table className="table pp-table" data-testid="prop-marking-table">
              <thead>
                <tr>
                  <th>Stelle</th>
                  <th className="num">aktuell</th>
                  <th className="num">Anfang</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((id, i) => {
                  const cur = st.marking[i] ?? 0;
                  const init = sess.net.initial[i] ?? 0;
                  const cap = sess.net.capacity[i] ?? 0;
                  const delta = cur - init;
                  return (
                    <tr key={id} className="pp-row" onClick={() => setSelection([id])} onMouseEnter={() => highlight([id])} onMouseLeave={clearOwnHighlight} title="Stelle auswählen">
                      <td>
                        <span className="pp-cell-name">
                          <MiniNode type="place" p={p} />
                          {sess.net.placeNames[i] || '(ohne Namen)'}
                        </span>
                      </td>
                      <td className={`num pp-cur${delta ? ' changed' : ''}${cap > 0 && cur >= cap ? ' full' : ''}`}>
                        {delta !== 0 && <span className={`pp-delta ${delta > 0 ? 'up' : 'down'}`}>{delta > 0 ? `+${formatNumber(delta)}` : formatNumber(delta)}</span>}
                        <b>{formatNumber(cur)}</b>
                      </td>
                      <td className="num muted">{formatNumber(init)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {sess.net.placeIds.length > MAX_TABLE_ROWS && <Help>Es werden die ersten {MAX_TABLE_ROWS} Stellen angezeigt.</Help>}
        <Button icon={<ArrowDownToLine size={14} />} disabled={!changed} onClick={() => adoptMarking(sess.tabId)} testId="prop-adopt" title="Die aktuelle Markierung wird zur neuen Anfangsmarkierung">
          Aktuelle Markierung übernehmen
        </Button>
        <Help>{changed ? 'Macht die aktuelle Markierung zur neuen Anfangsmarkierung des Netzes (rückgängig machbar).' : 'Die Markierung entspricht noch der Anfangsmarkierung.'}</Help>
      </Section>

      <div className="panel-section pp-tip">
        <MousePointerClick size={14} />
        <span>Klicke im Netz auf eine Transition, um sie zu schalten. Wähle eine Stelle aus, um ihre Statistik zu sehen.</span>
      </div>

      <Legend p={p} />
    </>
  );
}

// ───────────────────────────── Stelle ─────────────────────────────

function Sparkline({ sess, idx }: { sess: SimSession; idx: number }) {
  const data = useMemo(() => {
    const h = sess.history;
    const n = h.length;
    const start = Math.max(0, n - 200);
    const vals: number[] = [];
    for (let i = start; i < n; i++) {
      const m = h.markings[i];
      vals.push(m && idx < m.length ? m[idx] : 0);
    }
    return vals;
  }, [sess, idx]);
  if (data.length < 2) return <Help>Noch kein Verlauf – führe ein paar Schritte aus.</Help>;
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of data) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const W = 280;
  const H = 64;
  const pad = 4;
  const span = hi - lo || 1;
  const x = (i: number) => (i / (data.length - 1)) * W;
  const y = (v: number) => H - pad - ((v - lo) / span) * (H - 2 * pad);
  let d = `M0,${y(data[0]).toFixed(1)}`;
  for (let i = 1; i < data.length; i++) d += ` H${x(i).toFixed(1)} V${y(data[i]).toFixed(1)}`;
  const area = `${d} V${H} H0 Z`;
  return (
    <div className="pp-spark" data-testid="prop-sparkline">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-label="Markenverlauf">
        <path d={area} className="pp-spark-area" />
        <path d={d} className="pp-spark-line" vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="pp-spark-max">{formatNumber(hi)}</span>
      <span className="pp-spark-min">{formatNumber(lo)}</span>
      <span className="pp-spark-range">letzte {data.length} Werte</span>
    </div>
  );
}

function SimPlace({ el, sess, doc, p }: { el: PlaceEl; sess: SimSession; doc: NetDoc; p: Palette }) {
  const idx = sess.net.placeIndex.get(el.id);
  const infos = useMemo(() => transInfos(sess), [sess]);
  const statusOf = useMemo(() => {
    const map = new Map<Id, TStatus>(infos.map((t) => [t.id, t.waiting ? 'wait' : t.enabled ? 'on' : 'off']));
    return (id: Id) => map.get(id);
  }, [infos]);
  if (idx === undefined) {
    return (
      <div className="panel-section">
        <Note>Diese Stelle ist noch nicht Teil der laufenden Simulation. Setze die Simulation zurück, um sie einzubeziehen.</Note>
      </div>
    );
  }
  const st = sess.state;
  const unit = doc.settings.sim.timeUnit || 'ZE';
  const cur = st.marking[idx] ?? 0;
  const init = sess.net.initial[idx] ?? el.tokens;
  const cap = sess.net.capacity[idx] ?? 0;
  const avg = st.time > 0 ? (st.integral[idx] ?? 0) / st.time : null;
  const setTokens = (v: number) => setCurrentTokens(sess.tabId, el.id, v);
  return (
    <>
      <div className="panel-section">
        <Hero
          tint={el.color || 'var(--accent)'}
          visual={<PlacePreview el={el} p={p} tokens={cur} />}
          kicker="Stelle · Simulation"
          title={el.name || '(ohne Namen)'}
          sub={placeSub(el, cur)}
          actions={<NodeActions id={el.id} edit={false} />}
          testId="prop-hero"
        />
      </div>

      <Section title="Marken jetzt" icon={<span className="pp-token-dot" />}>
        <div className="pp-counter">
          <button type="button" className="pp-counter-btn" disabled={cur <= 0} onClick={() => setTokens(cur - 1)} aria-label="Eine Marke entfernen" title="Eine Marke entfernen" data-testid="prop-sim-minus">
            <Minus size={18} />
          </button>
          <div className="pp-counter-value">
            <b data-testid="prop-sim-tokens">{formatNumber(cur)}</b>
            <span>{cur === 1 ? 'Marke' : 'Marken'}</span>
          </div>
          <button
            type="button"
            className="pp-counter-btn"
            disabled={cur >= 1e9}
            onClick={() => setTokens(cur + 1)}
            aria-label="Eine Marke hinzufügen"
            title="Eine Marke hinzufügen"
            data-testid="prop-sim-plus"
          >
            <Plus size={18} />
          </button>
        </div>
        {cap > 0 && (
          <ProgressBar
            value={cur / cap}
            tone={cur >= cap ? 'danger' : cur / cap > 0.75 ? 'warning' : 'token'}
            label={
              <>
                <span>Füllstand</span>
                <span>
                  {formatNumber(cur)} von {formatNumber(cap)} {cur >= cap && <b className="pp-full">· voll</b>}
                </span>
              </>
            }
          />
        )}
        <div className="row pp-wrap">
          <span className="muted grow">Anfang: {formatNumber(init)}</span>
          {cur !== init && (
            <Button size="sm" variant="ghost" icon={<RotateCcw size={13} />} onClick={() => setTokens(init)}>
              Auf Anfang
            </Button>
          )}
        </div>
        <Help>Mit −/+ veränderst du nur die laufende Simulation, nicht das Netz.</Help>
      </Section>

      <Section title="Statistik" icon={<Sigma size={13} />}>
        <div className="pp-stats">
          <Stat label="Minimum" value={formatNumber(st.minMarking[idx] ?? cur)} testId="prop-stat-min" />
          <Stat label="Maximum" value={formatNumber(st.maxMarking[idx] ?? cur)} testId="prop-stat-max" />
          <Stat
            label="Ø zeitgewichtet"
            value={avg === null ? '–' : formatNumber(avg)}
            tone="accent"
            title={avg === null ? 'Es ist noch keine Simulationszeit vergangen (Schalten von Hand ändert die Zeit nicht).' : `Durchschnittliche Markenzahl über ${formatNumber(st.time)} ${unit}`}
            testId="prop-stat-avg"
          />
          <Stat label="Zufluss gesamt" value={formatNumber(st.inflow[idx] ?? 0)} tone="success" title="So viele Marken wurden bisher in diese Stelle gelegt" testId="prop-stat-inflow" />
        </div>
        <Sparkline sess={sess} idx={idx} />
      </Section>

      <Section title="Eigenschaften" icon={<Info size={13} />}>
        <KV label="Anfangsmarken">{formatNumber(el.tokens)}</KV>
        <KV label="Kapazität">{el.capacity > 0 ? formatNumber(el.capacity) : 'unbegrenzt'}</KV>
        <ReadOnlyNote />
      </Section>

      <ConnectionsSection doc={doc} nodeId={el.id} nodeType="place" p={p} statusOf={statusOf} />
    </>
  );
}

// ───────────────────────────── Transition ─────────────────────────────

function lastFiredStep(sess: SimSession, t: number): number | null {
  const h = sess.history;
  const stop = Math.max(0, h.length - 5000);
  for (let i = h.length - 1; i >= stop; i--) {
    if (h.fired[i]?.includes(t)) return h.steps[i];
  }
  return null;
}

function Checklist({ items }: { items: EnablingCondition[] }) {
  return (
    <ul className="pp-checklist" data-testid="prop-explain">
      {items.map((c, i) => (
        <li key={i} className={c.ok ? 'ok' : 'bad'}>
          <span className="pp-check-icon">{c.ok ? <Check size={12} strokeWidth={3} /> : <X size={12} strokeWidth={3} />}</span>
          <span>{c.text}</span>
        </li>
      ))}
    </ul>
  );
}

function SimTransition({ el, sess, doc, p }: { el: TransitionEl; sess: SimSession; doc: NetDoc; p: Palette }) {
  const t = sess.net.transIndex.get(el.id);
  const unit = doc.settings.sim.timeUnit || 'ZE';
  const visual = useMemo(() => {
    try {
      return transitionVisuals(sess)[el.id] ?? null;
    } catch {
      return null;
    }
  }, [sess, el.id]);
  const explain = useMemo<EnablingCondition[] | null>(() => {
    if (t === undefined) return null;
    try {
      return explainEnabling(sess.net, t, sess.state, unit);
    } catch {
      return null;
    }
  }, [sess, t, unit]);
  const lastStep = useMemo(() => (t === undefined ? null : lastFiredStep(sess, t)), [sess, t]);
  if (t === undefined) {
    return (
      <div className="panel-section">
        <Note>Diese Transition ist noch nicht Teil der laufenden Simulation. Setze die Simulation zurück, um sie einzubeziehen.</Note>
      </div>
    );
  }
  const st = sess.state;
  const tr = sess.net.transitions[t];
  let enabled = false;
  try {
    enabled = isEnabled(sess.net, t, st.marking);
  } catch {
    enabled = false;
  }
  const timer = st.timers[t] ?? null;
  const total = st.timerTotals[t] ?? null;
  const waiting = enabled && tr.timing !== 'immediate' && timer !== null && timer > 1e-9;
  const fired = st.fired[t] ?? 0;
  const consumed = st.consumed[t] ?? 0;
  const throughput = st.time > 0 ? fired / st.time : null;

  let status: { label: string; tone: 'success' | 'accent' | 'danger'; text: string };
  if (!enabled) status = { label: 'nicht aktiviert', tone: 'danger', text: 'Mindestens eine Bedingung ist nicht erfüllt – siehe unten.' };
  else if (waiting) status = { label: 'wartet', tone: 'accent', text: 'Aktiviert – die Verzögerung läuft gerade ab.' };
  else if (tr.timing !== 'immediate' && timer === null) status = { label: 'aktiviert', tone: 'success', text: 'Aktiviert – der Zeitgeber startet im nächsten Schritt.' };
  else status = { label: 'aktiviert', tone: 'success', text: 'Aktiviert – schaltet im nächsten Schritt.' };

  return (
    <>
      <div className="panel-section">
        <Hero
          tint={transitionAccent(p, el.timing, el.color)}
          visual={<TransitionPreview el={el} p={p} visual={visual} />}
          kicker="Transition · Simulation"
          title={el.name || '(ohne Namen)'}
          sub={timingSub(el, unit)}
          actions={<NodeActions id={el.id} edit={false} />}
          testId="prop-hero"
        />
      </div>

      <Section title="Status" icon={<Activity size={13} />}>
        <div className={`pp-status ${status.tone}`}>
          <span className={`badge ${status.tone}`} data-testid="prop-trans-status">
            {status.label}
          </span>
          <span>{status.text}</span>
        </div>
        {timer !== null && total !== null && total > 0 && tr.timing !== 'immediate' && (
          <ProgressBar
            value={1 - Math.max(0, timer) / total}
            tone="accent"
            label={
              <>
                <span>Verzögerung</span>
                <span>
                  noch {formatNumber(Math.max(0, timer))} von {formatNumber(total)} {unit}
                </span>
              </>
            }
          />
        )}
        <Button variant="success" icon={<Zap size={14} />} disabled={!enabled} onClick={() => simFire(sess.tabId, el.id)} testId="prop-fire-now" title={enabled ? 'Jetzt von Hand schalten' : 'Nicht aktiviert – kann nicht schalten'}>
          Jetzt schalten
        </Button>
        {enabled && tr.timing !== 'immediate' && <Help>Von Hand geschaltet wird sofort – eine laufende Verzögerung wird übersprungen.</Help>}
      </Section>

      <Section title="Warum schaltet die Transition (nicht)?" icon={<CircleHelp size={13} />}>
        {explain ? <Checklist items={explain} /> : <Help>Die Erklärung ist gerade nicht verfügbar.</Help>}
      </Section>

      <Section title="Statistik" icon={<Gauge size={13} />}>
        <div className="pp-stats">
          <Stat label="Schaltungen" value={formatNumber(fired)} tone="success" testId="prop-stat-fired" />
          <Stat label="Verbrauchte Marken" value={formatNumber(consumed)} testId="prop-stat-consumed" />
          <Stat
            label={`Durchsatz pro ${unit}`}
            value={throughput === null ? '–' : formatNumber(throughput, 3)}
            tone="accent"
            title={throughput === null ? 'Es ist noch keine Simulationszeit vergangen.' : 'Schaltungen je Zeiteinheit'}
            testId="prop-stat-throughput"
          />
          <Stat label="Zuletzt geschaltet" value={lastStep === null ? '–' : `Schritt ${formatNumber(lastStep)}`} testId="prop-stat-last" />
        </div>
      </Section>

      <Section title="Eigenschaften" icon={<ListChecks size={13} />}>
        <KV label="Zeitverhalten">{TIMING_INFO[el.timing].label}</KV>
        {el.timing !== 'immediate' && (
          <KV label={TIMING_INFO[el.timing].valueLabel === 'Untergrenze' ? 'Verzögerung' : TIMING_INFO[el.timing].valueLabel}>
            {delayLabel(el).replace('⏱ ', '')} {unit}
          </KV>
        )}
        <KV label="Priorität">{formatNumber(el.priority)}</KV>
        <ReadOnlyNote />
      </Section>

      <ConnectionsSection doc={doc} nodeId={el.id} nodeType="transition" p={p} />
    </>
  );
}

// ───────────────────────────── Kante, Zeichenobjekt, Mehrfachauswahl ─────────────────────────────

function SimArc({ arc, sess, doc, p }: { arc: ArcEl; sess: SimSession; doc: NetDoc; p: Palette }) {
  const src = doc.elements[arc.source];
  const pIdx = src?.type === 'place' ? sess.net.placeIndex.get(src.id) : undefined;
  const tokens = pIdx !== undefined ? (sess.state.marking[pIdx] ?? 0) : null;
  const w = Math.max(1, Math.floor(arc.weight));
  const isInput = src?.type === 'place' && doc.elements[arc.target]?.type === 'transition';
  const ok = tokens === null ? null : arc.kind === 'inhibitor' ? tokens < w : tokens >= w;
  return (
    <>
      <div className="panel-section">
        <Hero
          tint={arc.kind === 'inhibitor' ? p.arcInhibitor : arc.kind === 'test' ? p.arcTest : 'var(--muted)'}
          visual={<ArcGlyph p={p} kind={arc.kind} width={40} height={20} color={arc.color} />}
          kicker={arc.kind === 'normal' ? 'Kante · Simulation' : arc.kind === 'test' ? 'Testkante · Simulation' : 'Inhibitorkante · Simulation'}
          title={arcTitle(arc, doc)}
          sub={`Gewicht ${formatNumber(arc.weight)}`}
          testId="prop-hero"
        />
      </div>
      <Section title="Verbindung" icon={<Info size={13} />}>
        <ArcEnds arc={arc} doc={doc} p={p} />
        <KV label="Gewicht">{formatNumber(arc.weight)}</KV>
        <KV label="Kantentyp">{ARC_KIND_INFO[arc.kind].label}</KV>
        <div className="pp-explain">
          <Info size={14} />
          <span>{arcEffectText(doc, arc)}</span>
        </div>
        {isInput && ok !== null && src?.type === 'place' && (
          <div className={`pp-status ${ok ? 'success' : 'danger'}`}>
            <span className={`badge ${ok ? 'success' : 'danger'}`}>{ok ? 'erfüllt' : 'nicht erfüllt'}</span>
            <span>
              „{src.name}“ hat jetzt {formatNumber(tokens ?? 0)} {tokens === 1 ? 'Marke' : 'Marken'}.
            </span>
          </div>
        )}
        <ReadOnlyNote />
      </Section>
    </>
  );
}

function SimDecor({ el, p }: { el: DecorEl; p: Palette }) {
  return (
    <div className="panel-section">
      <Hero tint="var(--muted)" visual={<DecorGlyph el={el} p={p} />} kicker="Zeichenobjekt" title={elementLabel(el)} testId="prop-hero" />
      <Help>Zeichenobjekte dienen nur der Gestaltung und spielen in der Simulation keine Rolle.</Help>
      <ReadOnlyNote />
    </div>
  );
}

function SimMulti({ ids, sess, doc }: { ids: Id[]; sess: SimSession; doc: NetDoc }) {
  const groups = useMemo(() => groupSelection(doc, ids), [doc, ids]);
  const tokens = groups.place.reduce((sum, id) => {
    const i = sess.net.placeIndex.get(id);
    return sum + (i !== undefined ? (sess.state.marking[i] ?? 0) : 0);
  }, 0);
  const enabledCount = groups.transition.filter((id) => {
    const t = sess.net.transIndex.get(id);
    try {
      return t !== undefined && isEnabled(sess.net, t, sess.state.marking);
    } catch {
      return false;
    }
  }).length;
  return (
    <>
      <div className="panel-section">
        <div className="pp-live-head">
          <b>{formatNumber(ids.length)} Elemente ausgewählt</b>
        </div>
        <div className="pp-type-chips">
          {TYPE_ORDER.filter((t) => groups[t].length).map((t) => (
            <button key={t} type="button" className="pp-type-chip" onClick={() => setSelection(groups[t])} title="Nur diese auswählen">
              {countLabel(t, groups[t].length)}
            </button>
          ))}
        </div>
        <div className="pp-stats">
          {groups.place.length > 0 && <Stat icon={<span className="pp-token-dot" />} label="Marken (Auswahl)" value={formatNumber(tokens)} tone="token" />}
          {groups.transition.length > 0 && <Stat icon={<Zap size={12} />} label="davon aktiviert" value={`${enabledCount}/${groups.transition.length}`} tone="success" />}
        </div>
        <ReadOnlyNote />
      </div>
    </>
  );
}

// ───────────────────────────── Einstieg ─────────────────────────────

export function SimProperties({ tabId, doc, sel, p }: { tabId: string; doc: NetDoc; sel: Id[]; p: Palette }) {
  const sess = useSimSession(tabId);
  if (!sess) {
    return (
      <div className="empty-state">
        <div className="spinner" />
        <span>Simulation wird vorbereitet…</span>
      </div>
    );
  }
  if (sel.length === 0) return <LiveOverview sess={sess} doc={doc} p={p} />;
  if (sel.length > 1) return <SimMulti ids={sel} sess={sess} doc={doc} />;
  const el = doc.elements[sel[0]];
  if (!el) return <LiveOverview sess={sess} doc={doc} p={p} />;
  switch (el.type) {
    case 'place':
      return <SimPlace el={el} sess={sess} doc={doc} p={p} />;
    case 'transition':
      return <SimTransition el={el} sess={sess} doc={doc} p={p} />;
    case 'arc':
      return <SimArc arc={el} sess={sess} doc={doc} p={p} />;
    default:
      return <SimDecor el={el} p={p} />;
  }
}
