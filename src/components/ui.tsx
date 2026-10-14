/**
 * Wiederverwendbare UI-Bausteine (Buttons, Eingabefelder, Schalter …).
 * Alle Eingaben validieren selbst und liefern nur gültige Werte nach außen.
 */
import { Minus, Plus, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

export function IconButton({
  icon,
  title,
  onClick,
  active,
  disabled,
  size = 17,
  small,
  className = '',
  testId,
}: {
  icon: ReactNode | ((props: { size: number }) => ReactNode);
  title: string;
  onClick?: (e: React.MouseEvent) => void;
  active?: boolean;
  disabled?: boolean;
  size?: number;
  small?: boolean;
  className?: string;
  testId?: string;
}) {
  return (
    <button
      type="button"
      className={`icon-btn${small ? ' sm' : ''}${active ? ' active' : ''} ${className}`}
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      data-testid={testId}
    >
      {typeof icon === 'function' ? icon({ size: small ? size - 2 : size }) : icon}
    </button>
  );
}

export function Button({
  children,
  onClick,
  variant,
  size,
  disabled,
  title,
  icon,
  type = 'button',
  testId,
}: {
  children?: ReactNode;
  onClick?: (e: React.MouseEvent) => void;
  variant?: 'primary' | 'ghost' | 'danger' | 'success';
  size?: 'sm' | 'lg';
  disabled?: boolean;
  title?: string;
  icon?: ReactNode;
  type?: 'button' | 'submit';
  testId?: string;
}) {
  return (
    <button
      type={type}
      className={`btn${variant ? ' ' + variant : ''}${size ? ' ' + size : ''}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
      data-testid={testId}
    >
      {icon}
      {children}
    </button>
  );
}

export function Field({ label, children, stack, hint }: { label: ReactNode; children: ReactNode; stack?: boolean; hint?: string }) {
  return (
    <div className={`field${stack ? ' stack' : ''}`} title={hint}>
      <span className="field-label">{label}</span>
      <div style={{ minWidth: 0 }}>{children}</div>
    </div>
  );
}

/**
 * Texteingabe, die Änderungen erst bei Enter oder Verlassen übernimmt
 * (verhindert einen Historieneintrag pro Tastendruck).
 */
export function TextInput({
  value,
  onCommit,
  placeholder,
  multiline,
  maxLength = 500,
  autoFocus,
  testId,
}: {
  value: string;
  onCommit: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  maxLength?: number;
  autoFocus?: boolean;
  testId?: string;
}) {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setDraft(value);
  }, [value]);
  const commit = () => {
    if (draft !== value) onCommit(draft);
  };
  const common = {
    value: draft,
    placeholder,
    maxLength,
    autoFocus,
    'data-testid': testId,
    onFocus: () => (focused.current = true),
    onBlur: () => {
      focused.current = false;
      commit();
    },
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(e.target.value),
  };
  if (multiline) {
    return (
      <textarea
        className="textarea"
        {...common}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) (e.target as HTMLTextAreaElement).blur();
          if (e.key === 'Escape') {
            setDraft(value);
            (e.target as HTMLTextAreaElement).blur();
          }
          e.stopPropagation();
        }}
      />
    );
  }
  return (
    <input
      className="input"
      {...common}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          setDraft(value);
          setTimeout(() => (e.target as HTMLInputElement).blur());
        }
        e.stopPropagation();
      }}
    />
  );
}

/** Zahleneingabe mit +/- Knöpfen, Grenzen und Fehleranzeige. */
export function NumberInput({
  value,
  onCommit,
  min = -Infinity,
  max = Infinity,
  step = 1,
  integer = false,
  unit,
  disabled,
  testId,
  title,
}: {
  value: number;
  onCommit: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  integer?: boolean;
  unit?: string;
  disabled?: boolean;
  testId?: string;
  title?: string;
}) {
  const fmt = (v: number) => (Number.isFinite(v) ? String(Number(v.toFixed(6))).replace('.', ',') : '');
  const [draft, setDraft] = useState(fmt(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setDraft(fmt(value));
  }, [value]);
  const parse = (s: string): number | null => {
    const n = Number(s.trim().replace(/\s/g, '').replace(',', '.'));
    if (!Number.isFinite(n) || s.trim() === '') return null;
    return n;
  };
  const clamp = (n: number) => {
    let v = Math.min(max, Math.max(min, n));
    if (integer) v = Math.round(v);
    return v;
  };
  const parsed = parse(draft);
  const invalid = parsed === null || parsed < min || parsed > max || (integer && !Number.isInteger(parsed));
  const commit = (s = draft) => {
    const n = parse(s);
    if (n === null) {
      setDraft(fmt(value));
      return;
    }
    const v = clamp(n);
    setDraft(fmt(v));
    if (v !== value) onCommit(v);
  };
  const bump = (dir: number) => {
    const base = parse(draft) ?? value;
    const v = clamp(base + dir * step);
    setDraft(fmt(v));
    if (v !== value) onCommit(v);
  };
  return (
    <div className="number-input" title={title} style={invalid ? { borderColor: 'var(--danger)' } : undefined}>
      <input
        inputMode="decimal"
        value={draft}
        disabled={disabled}
        data-testid={testId}
        aria-invalid={invalid}
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
          if (e.key === 'Enter') commit();
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            bump(e.shiftKey ? 10 : 1);
          }
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            bump(e.shiftKey ? -10 : -1);
          }
          if (e.key === 'Escape') setDraft(fmt(value));
        }}
      />
      {unit && <span className="unit">{unit}</span>}
      <button type="button" tabIndex={-1} disabled={disabled} onClick={() => bump(-1)} aria-label="Verringern">
        <Minus size={13} />
      </button>
      <button type="button" tabIndex={-1} disabled={disabled} onClick={() => bump(1)} aria-label="Erhöhen">
        <Plus size={13} />
      </button>
    </div>
  );
}

export function Toggle({ checked, onChange, label, disabled, testId }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; disabled?: boolean; testId?: string }) {
  const id = useId();
  return (
    <label className="toggle" htmlFor={id} style={disabled ? { opacity: 0.5, pointerEvents: 'none' } : undefined}>
      <input id={id} type="checkbox" checked={checked} disabled={disabled} data-testid={testId} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" />
      {label && <span>{label}</span>}
    </label>
  );
}

export function Select<T extends string>({
  value,
  options,
  onChange,
  testId,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  testId?: string;
}) {
  return (
    <select className="select" value={value} data-testid={testId} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={o.value === value ? 'active' : ''}
          title={o.title}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const SWATCHES = ['#60a5fa', '#34d399', '#fbbf24', '#f87171', '#a78bfa', '#f472b6', '#22d3ee', '#fb923c', '#94a3b8', '#1e293b', '#ffffff'];

/** Farbwahl mit Vorschlägen; `allowAuto` erlaubt „Automatisch“ (= null/leer). */
export function ColorInput({ value, onChange, allowAuto = true }: { value: string | null; onChange: (v: string | null) => void; allowAuto?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="color-input">
      {allowAuto && (
        <button
          type="button"
          className={`color-swatch auto${!value ? ' active' : ''}`}
          title="Automatisch (passend zum Design)"
          onClick={() => onChange(null)}
        />
      )}
      {SWATCHES.slice(0, 7).map((c) => (
        <button
          key={c}
          type="button"
          className={`color-swatch${value?.toLowerCase() === c ? ' active' : ''}`}
          style={{ background: c }}
          title={c}
          onClick={() => onChange(c)}
        />
      ))}
      <button
        type="button"
        className="color-swatch"
        title="Eigene Farbe wählen"
        style={{ background: 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' }}
        onClick={() => ref.current?.click()}
      />
      <input
        ref={ref}
        type="color"
        value={value && /^#[0-9a-f]{6}$/i.test(value) ? value : '#60a5fa'}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: 0, height: 0, opacity: 0, position: 'absolute', pointerEvents: 'none' }}
        tabIndex={-1}
      />
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd>{children}</kbd>;
}

export function Section({ title, icon, children, actions }: { title: ReactNode; icon?: ReactNode; children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="panel-section">
      <div className="section-title">
        {icon}
        <span className="grow">{title}</span>
        {actions}
      </div>
      {children}
    </div>
  );
}

export function Dialog({
  title,
  icon,
  onClose,
  children,
  footer,
  wide,
  testId,
}: {
  title: ReactNode;
  icon?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  testId?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return (
    <div className="backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`dialog${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" data-testid={testId}>
        <div className="dialog-header">
          {icon}
          <h2>{title}</h2>
          <IconButton icon={<X size={17} />} title="Schließen (Esc)" onClick={onClose} small />
        </div>
        <div className="dialog-body">{children}</div>
        {footer && <div className="dialog-footer">{footer}</div>}
      </div>
    </div>
  );
}
