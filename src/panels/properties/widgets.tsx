/**
 * Bausteine des Eigenschaftenbereichs: Kopfkarte, Auswahlkacheln,
 * Sammel-Zahleneingabe, Schieberegler, Chips für verbundene Elemente,
 * kleine SVG-Symbole der Netznotation und eine eigene Fehlergrenze.
 */
import { AlertTriangle, ChevronDown, Lock, Minus, Pencil, Plus, RotateCcw, Workflow } from 'lucide-react';
import { Component, useEffect, useMemo, useRef, useState, type CSSProperties, type ErrorInfo, type ReactNode } from 'react';
import { Button, Field, Section, TextInput } from '../../components/ui';
import { tokenLayout } from '../../editor/NetRender';
import { DASH, type Palette } from '../../editor/palette';
import type { ArcKind, DashStyle, Id, NetDoc, TimingModel } from '../../model/types';
import { setMode, toast } from '../../store/appStore';
import { clearOwnHighlight, editEl, flushCoalesced, highlight, selectAndShow } from './edit';
import { commonValue, connectionsOf, isDuplicateName, readPref, writePref, type Connection } from './model';

// ───────────────────────────── Symbole ─────────────────────────────

export function PlaceGlyph({ p, size = 28, tokens = 0, color }: { p: Palette; size?: number; tokens?: number; color?: string | null }) {
  const r = 10;
  const dots = tokens > 0 && tokens <= 6 ? tokenLayout(tokens, r) : [];
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true">
      <circle cx={14} cy={14} r={r} fill={p.placeFill} stroke={color || p.placeStroke} strokeWidth={2} />
      {dots.map((d, i) => (
        <circle key={i} cx={14 + d.x} cy={14 + d.y} r={2.3} fill={p.token} />
      ))}
      {tokens > 6 && (
        <text x={14} y={14.5} textAnchor="middle" dominantBaseline="central" fontSize={9} fontWeight={700} fill={p.tokenText}>
          {tokens}
        </text>
      )}
    </svg>
  );
}

export function transitionAccent(p: Palette, timing: TimingModel, color?: string | null): string {
  if (color) return color;
  return timing === 'immediate' ? p.transImmediate : timing === 'deterministic' ? p.transTimed : p.transStochastic;
}

export function TransGlyph({ p, timing, size = 28, horizontal, color }: { p: Palette; timing: TimingModel; size?: number; horizontal?: boolean; color?: string | null }) {
  const accent = transitionAccent(p, timing, color);
  const [w, h] = horizontal ? [22, 8] : [8, 22];
  const x = 14 - w / 2;
  const y = 14 - h / 2;
  const filled = timing === 'immediate';
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true">
      <rect x={x} y={y} width={w} height={h} rx={2} fill={filled ? accent : p.placeFill} stroke={accent} strokeWidth={filled ? 0 : 1.8} />
      {!filled && <rect x={x + 2} y={y + 2} width={w - 4} height={h - 4} rx={1} fill={accent} opacity={0.25} />}
    </svg>
  );
}

export function ArcGlyph({ p, kind, width = 44, height = 18, color }: { p: Palette; kind: ArcKind; width?: number; height?: number; color?: string | null }) {
  const c = color || (kind === 'inhibitor' ? p.arcInhibitor : kind === 'test' ? p.arcTest : p.arc);
  const y = height / 2;
  const x0 = 3;
  const tip = width - 3;
  const head = Math.min(9, width * 0.28);
  if (kind === 'inhibitor') {
    const r = Math.min(4, height * 0.24);
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
        <line x1={x0} y1={y} x2={tip - 2 * r} y2={y} stroke={c} strokeWidth={1.8} strokeLinecap="round" />
        <circle cx={tip - r} cy={y} r={r} fill={p.placeFill} stroke={c} strokeWidth={1.6} />
      </svg>
    );
  }
  const base = tip - head;
  const hw = head * 0.42;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <line x1={x0} y1={y} x2={base} y2={y} stroke={c} strokeWidth={1.8} strokeDasharray={kind === 'test' ? '4 3' : undefined} strokeLinecap="round" />
      <polygon
        points={`${tip},${y} ${base},${y - hw} ${base},${y + hw}`}
        fill={kind === 'test' ? p.placeFill : c}
        stroke={c}
        strokeWidth={kind === 'test' ? 1.4 : 0.6}
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function DashGlyph({ dash, width = 34 }: { dash: DashStyle; width?: number }) {
  return (
    <svg width={width} height={10} viewBox={`0 0 ${width} 10`} aria-hidden="true">
      <line x1={2} y1={5} x2={width - 2} y2={5} stroke="currentColor" strokeWidth={2} strokeDasharray={DASH[dash]} strokeLinecap="butt" />
    </svg>
  );
}

export function ShapeGlyph({ shape }: { shape: 'rect' | 'roundrect' | 'ellipse' }) {
  return (
    <svg width={22} height={16} viewBox="0 0 22 16" aria-hidden="true">
      {shape === 'ellipse' ? (
        <ellipse cx={11} cy={8} rx={9} ry={6} fill="none" stroke="currentColor" strokeWidth={1.6} />
      ) : (
        <rect x={2} y={2} width={18} height={12} rx={shape === 'roundrect' ? 4 : 0} fill="none" stroke="currentColor" strokeWidth={1.6} />
      )}
    </svg>
  );
}

/** Kleines Knotensymbol für Chips und Listen. */
export function MiniNode({ type, p, timing = 'immediate', color }: { type: 'place' | 'transition'; p: Palette; timing?: TimingModel; color?: string | null }) {
  if (type === 'place') {
    return (
      <svg width={12} height={12} viewBox="0 0 12 12" aria-hidden="true">
        <circle cx={6} cy={6} r={4.6} fill={p.placeFill} stroke={color || p.placeStroke} strokeWidth={1.6} />
      </svg>
    );
  }
  const accent = transitionAccent(p, timing, color);
  return (
    <svg width={12} height={12} viewBox="0 0 12 12" aria-hidden="true">
      <rect x={4} y={1} width={4} height={10} rx={1} fill={timing === 'immediate' ? accent : p.placeFill} stroke={accent} strokeWidth={timing === 'immediate' ? 0 : 1.3} />
    </svg>
  );
}

// ───────────────────────────── Layout-Bausteine ─────────────────────────────

export function Hero({
  visual,
  kicker,
  title,
  sub,
  tint,
  actions,
  testId,
}: {
  visual: ReactNode;
  kicker: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  tint: string;
  actions?: ReactNode;
  testId?: string;
}) {
  return (
    <div className="pp-hero" style={{ '--pp-tint': tint } as CSSProperties} data-testid={testId}>
      <div className="pp-hero-visual">{visual}</div>
      <div className="pp-hero-text">
        <div className="pp-hero-kicker">{kicker}</div>
        <div className="pp-hero-title" title={typeof title === 'string' ? title : undefined}>
          {title}
        </div>
        {sub && <div className="pp-hero-sub">{sub}</div>}
      </div>
      {actions && <div className="pp-hero-actions">{actions}</div>}
    </div>
  );
}

export function Help({ children, tone }: { children: ReactNode; tone?: 'warning' | 'danger' }) {
  return <p className={`pp-help${tone ? ' ' + tone : ''}`}>{children}</p>;
}

export function Note({ tone = 'info', icon, children, action }: { tone?: 'info' | 'warning' | 'danger' | 'success'; icon?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <div className={`callout pp-note${tone === 'info' ? '' : ' ' + tone}`} role={tone === 'danger' || tone === 'warning' ? 'alert' : undefined}>
      {icon ?? <AlertTriangle size={15} />}
      <div className="grow">
        <div>{children}</div>
        {action && <div className="pp-note-action">{action}</div>}
      </div>
    </div>
  );
}

export function KV({ label, children, hint, testId }: { label: ReactNode; children: ReactNode; hint?: string; testId?: string }) {
  return (
    <div className="pp-kv" title={hint}>
      <span className="pp-kv-label">{label}</span>
      <span className="pp-kv-value" data-testid={testId}>
        {children}
      </span>
    </div>
  );
}

export function Stat({
  label,
  value,
  icon,
  tone,
  onClick,
  title,
  testId,
}: {
  label: ReactNode;
  value: ReactNode;
  icon?: ReactNode;
  tone?: 'accent' | 'success' | 'warning' | 'danger' | 'violet' | 'token';
  onClick?: () => void;
  title?: string;
  testId?: string;
}) {
  const cls = `pp-stat${tone ? ' ' + tone : ''}${onClick ? ' clickable' : ''}`;
  const inner = (
    <>
      <span className="pp-stat-top">
        {icon && <span className="pp-stat-icon">{icon}</span>}
        <span className="pp-stat-label">{label}</span>
      </span>
      <b className="pp-stat-value" data-testid={testId}>
        {value}
      </b>
    </>
  );
  return onClick ? (
    <button type="button" className={cls} onClick={onClick} title={title}>
      {inner}
    </button>
  ) : (
    <div className={cls} title={title}>
      {inner}
    </div>
  );
}

/** Hinweis im Simulationsmodus: Struktur nur im Bearbeiten-Modus änderbar. */
export function ReadOnlyNote() {
  return (
    <div className="pp-readonly" data-testid="prop-readonly">
      <Lock size={14} />
      <span className="grow">Zum Ändern in den Modus Bearbeiten wechseln.</span>
      <Button size="sm" icon={<Pencil size={13} />} onClick={() => setMode('edit')} testId="prop-to-edit">
        Bearbeiten
      </Button>
    </div>
  );
}

export function CollapsibleSection({
  id,
  title,
  icon,
  defaultOpen = true,
  children,
  badge,
}: {
  id: string;
  title: ReactNode;
  icon?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
  badge?: ReactNode;
}) {
  const [open, setOpen] = useState(() => readPref(`open:${id}`, defaultOpen));
  return (
    <div className="panel-section">
      <button
        type="button"
        className="section-title pp-collapse"
        aria-expanded={open}
        onClick={() => {
          const next = !open;
          setOpen(next);
          writePref(`open:${id}`, next);
        }}
      >
        {icon}
        <span className="grow">{title}</span>
        {badge}
        <ChevronDown size={14} className={`pp-collapse-chevron${open ? '' : ' closed'}`} />
      </button>
      {open && children}
    </div>
  );
}

// ───────────────────────────── Eingaben ─────────────────────────────

export interface ChoiceOption<T extends string> {
  value: T;
  label?: ReactNode;
  icon?: ReactNode;
  title?: string;
  disabled?: boolean;
  testId?: string;
}

/**
 * Auswahl als Kacheln (wie ein Segment-Schalter, aber mit Symbolen, Umbruch
 * und deaktivierbaren Optionen, deren Tooltip trotzdem erscheint).
 */
export function ChoiceGroup<T extends string>({
  value,
  options,
  onChange,
  columns,
  compact,
  ariaLabel,
}: {
  value: T | null | undefined;
  options: ChoiceOption<T>[];
  onChange: (v: T) => void;
  columns?: number;
  compact?: boolean;
  ariaLabel?: string;
}) {
  return (
    <div
      className={`pp-choices${compact ? ' compact' : ''}`}
      role="radiogroup"
      aria-label={ariaLabel}
      style={{ gridTemplateColumns: `repeat(${columns ?? options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-disabled={o.disabled || undefined}
            className={`pp-choice${active ? ' active' : ''}${o.disabled ? ' disabled' : ''}`}
            title={o.title}
            data-testid={o.testId}
            onClick={() => {
              if (!o.disabled && !active) onChange(o.value);
            }}
          >
            {o.icon && <span className="pp-choice-icon">{o.icon}</span>}
            {o.label !== undefined && <span className="pp-choice-label">{o.label}</span>}
          </button>
        );
      })}
    </div>
  );
}

const fmtNum = (v: number) => (Number.isFinite(v) ? String(Number(v.toFixed(6))).replace('.', ',') : '');

function minMax(values: readonly number[]): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return [lo, hi];
}

/**
 * Zahleneingabe für mehrere Elemente: zeigt den gemeinsamen Wert oder
 * „gemischt“. Eintippen setzt alle auf den Wert, −/+ verändert alle relativ.
 */
export function BulkNumber({
  values,
  onSet,
  onShift,
  min = -Infinity,
  max = Infinity,
  step = 1,
  integer,
  unit,
  testId,
  title,
}: {
  values: readonly number[];
  onSet: (v: number) => void;
  onShift: (delta: number) => void;
  min?: number;
  max?: number;
  step?: number;
  integer?: boolean;
  unit?: string;
  testId?: string;
  title?: string;
}) {
  const common = commonValue(values);
  const mixed = common === undefined && values.length > 1;
  const shown = common !== undefined ? fmtNum(common) : '';
  const [draft, setDraft] = useState(shown);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setDraft(shown);
  }, [shown]);
  const [lo, hi] = useMemo(() => minMax(values), [values]);
  const commit = () => {
    const s = draft.trim();
    if (!s) {
      setDraft(shown);
      return;
    }
    const n = Number(s.replace(/\s/g, '').replace(',', '.'));
    if (!Number.isFinite(n)) {
      setDraft(shown);
      return;
    }
    let v = Math.min(max, Math.max(min, n));
    if (integer) v = Math.round(v);
    setDraft(fmtNum(v));
    if (mixed || v !== common) onSet(v);
  };
  return (
    <div className={`number-input${mixed ? ' pp-mixed' : ''}`} title={title}>
      <input
        inputMode="decimal"
        value={draft}
        placeholder={mixed ? `gemischt (${fmtNum(lo)}–${fmtNum(hi)})` : ''}
        data-testid={testId}
        onFocus={(e) => {
          focused.current = true;
          e.target.select();
        }}
        onBlur={() => {
          focused.current = false;
          commit();
        }}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') setDraft(shown);
        }}
      />
      {unit && <span className="unit">{unit}</span>}
      <button type="button" tabIndex={-1} onClick={() => onShift(-step)} aria-label="Alle verringern" title={mixed ? 'Alle um 1 verringern' : 'Verringern'}>
        <Minus size={13} />
      </button>
      <button type="button" tabIndex={-1} onClick={() => onShift(step)} aria-label="Alle erhöhen" title={mixed ? 'Alle um 1 erhöhen' : 'Erhöhen'}>
        <Plus size={13} />
      </button>
    </div>
  );
}

/** Schieberegler mit Live-Vorschau; ein Ziehen ergibt genau einen Rückgängig-Schritt. */
export function RangeField({
  value,
  min,
  max,
  step,
  format,
  onLive,
  testId,
  label,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onLive: (v: number) => void;
  testId?: string;
  label?: string;
}) {
  const safe = Number.isFinite(value) ? value : max;
  const [draft, setDraft] = useState(safe);
  const active = useRef(false);
  useEffect(() => {
    if (!active.current) setDraft(safe);
  }, [safe]);
  const end = () => {
    active.current = false;
    flushCoalesced();
  };
  const pct = max > min ? ((draft - min) / (max - min)) * 100 : 0;
  return (
    <div className="pp-range-row">
      <input
        type="range"
        className="pp-range"
        min={min}
        max={max}
        step={step}
        value={draft}
        aria-label={label}
        data-testid={testId}
        style={{ '--pp-fill': `${Math.max(0, Math.min(100, pct))}%` } as CSSProperties}
        onPointerDown={() => (active.current = true)}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (!Number.isFinite(v)) return;
          active.current = true;
          setDraft(v);
          onLive(v);
        }}
        onPointerUp={end}
        onKeyUp={end}
        onBlur={end}
        onKeyDown={(e) => e.stopPropagation()}
      />
      <span className="pp-range-value">{format(draft)}</span>
    </div>
  );
}

/** Namensfeld mit Prüfung auf leere und doppelte Namen. */
export function NameField({ id, type, name, doc }: { id: Id; type: 'place' | 'transition'; name: string; doc: NetDoc }) {
  const [reset, setReset] = useState(0);
  const dup = useMemo(() => isDuplicateName(doc, id, name), [doc, id, name]);
  return (
    <>
      <Field label="Name">
        <TextInput
          key={`${id}:${reset}`}
          value={name}
          maxLength={80}
          placeholder="Name"
          testId="prop-name"
          onCommit={(v) => {
            const t = v.trim().replace(/\s+/g, ' ');
            if (!t) {
              toast('warning', 'Name darf nicht leer sein', 'Der bisherige Name bleibt erhalten.');
              setReset((r) => r + 1);
              return;
            }
            if (t !== name) editEl(id, type, (el) => void (el.name = t));
            if (t !== v) setReset((r) => r + 1);
          }}
        />
      </Field>
      {dup && (
        <Note tone="warning">
          Der Name „{name}“ kommt mehrfach vor. Eindeutige Namen machen Protokoll und Analyse leichter verständlich.
        </Note>
      )}
    </>
  );
}

// ───────────────────────────── Verbindungen ─────────────────────────────

function ConnChip({ c, p, status }: { c: Connection; p: Palette; status?: 'on' | 'wait' | 'off' }) {
  const kindText = c.kind === 'normal' ? 'normale Kante' : c.kind === 'test' ? 'Testkante' : 'Inhibitorkante';
  return (
    <span className="pp-chip" onMouseEnter={() => highlight([c.nodeId, c.arcId])} onMouseLeave={clearOwnHighlight}>
      <button type="button" className="pp-chip-main" title={`„${c.name}“ auswählen`} onClick={() => selectAndShow([c.nodeId])}>
        <MiniNode type={c.nodeType} p={p} />
        <span className="pp-chip-name">{c.name || '(ohne Namen)'}</span>
        {status && <span className={`pp-dot ${status}`} title={status === 'on' ? 'aktiviert' : status === 'wait' ? 'wartet' : 'nicht aktiviert'} />}
      </button>
      <button
        type="button"
        className="pp-chip-arc"
        title={`Kante auswählen (${kindText}, Gewicht ${c.weight})`}
        onClick={() => selectAndShow([c.arcId])}
      >
        <ArcGlyph p={p} kind={c.kind} width={18} height={10} />
        {c.weight !== 1 && <span>×{c.weight}</span>}
      </button>
    </span>
  );
}

/** Vorbereich und Nachbereich eines Knotens als anklickbare Chips. */
export function ConnectionsSection({
  doc,
  nodeId,
  nodeType,
  p,
  statusOf,
}: {
  doc: NetDoc;
  nodeId: Id;
  nodeType: 'place' | 'transition';
  p: Palette;
  statusOf?: (id: Id) => 'on' | 'wait' | 'off' | undefined;
}) {
  const { pre, post } = useMemo(() => connectionsOf(doc, nodeId), [doc, nodeId]);
  const isPlace = nodeType === 'place';
  const group = (label: string, explain: string, list: Connection[], testId: string) => (
    <div className="pp-conn-group" data-testid={testId}>
      <div className="pp-conn-label">
        <span>{label}</span>
        <span className="badge">{list.length}</span>
        <span className="pp-conn-explain">{explain}</span>
      </div>
      <div className="pp-chips">
        {list.length ? list.map((c) => <ConnChip key={c.arcId} c={c} p={p} status={statusOf?.(c.nodeId)} />) : <span className="pp-none">– keine –</span>}
      </div>
    </div>
  );
  return (
    <Section title="Verbindungen" icon={<Workflow size={13} />}>
      {group('Vorbereich', isPlace ? 'Transitionen, die Marken hineinlegen' : 'Eingangsstellen', pre, 'prop-pre')}
      {group('Nachbereich', isPlace ? 'Transitionen, die Marken entnehmen' : 'Ausgangsstellen', post, 'prop-post')}
      {!pre.length && !post.length && (
        <Help>
          Noch nicht verbunden. Wähle das Kanten-Werkzeug (<kbd>K</kbd>) und ziehe von hier zu einer {isPlace ? 'Transition' : 'Stelle'}.
        </Help>
      )}
    </Section>
  );
}

// ───────────────────────────── Fehlergrenze ─────────────────────────────

interface BoundaryState {
  error: Error | null;
  key: string;
}

/** Fängt Fehler einer Ansicht ab; beim Wechsel der Auswahl wird automatisch neu versucht. */
export class PropsBoundary extends Component<{ resetKey: string; children: ReactNode }, BoundaryState> {
  state: BoundaryState = { error: null, key: this.props.resetKey };

  static getDerivedStateFromError(error: Error): Partial<BoundaryState> {
    return { error };
  }

  static getDerivedStateFromProps(props: { resetKey: string }, state: BoundaryState): Partial<BoundaryState> | null {
    if (props.resetKey !== state.key) return { error: null, key: props.resetKey };
    return null;
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Fehler im Eigenschaftenbereich', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="empty-state" role="alert">
        <AlertTriangle size={24} color="var(--warning)" />
        <b>Diese Ansicht konnte nicht angezeigt werden.</b>
        <span>Dein Netz ist unverändert. Wähle ein anderes Element oder versuche es erneut.</span>
        <Button size="sm" icon={<RotateCcw size={13} />} onClick={() => this.setState({ error: null })}>
          Erneut versuchen
        </Button>
      </div>
    );
  }
}
