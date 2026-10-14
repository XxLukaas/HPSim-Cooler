/**
 * Kleinere Bausteine der App-Hülle: Statusleiste, Meldungen, Rückfrage-Dialog,
 * Befehlspalette, Fehlergrenze und Tastenkürzel.
 */
import { AlertTriangle, CheckCircle2, Info, XCircle, X, Download, RotateCcw, Copy } from 'lucide-react';
import { Component, useEffect, useMemo, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '../components/ui';
import { serializeDoc } from '../io/native';
import { downloadBlob } from '../io/files';
import { formatNumber } from '../sim/engine';
import { activeTab, dismissToast, setUi, useApp } from '../store/appStore';
import { useSim } from '../store/simStore';
import { ACTIONS, actionForEvent, runAction, type Action } from './actions';

export function StatusBar() {
  const tab = useApp((s) => activeTab(s));
  const cursor = useApp((s) => s.ui.cursor);
  const showStart = useApp((s) => s.ui.showStart);
  const sess = useSim((s) => (tab ? s.sessions[tab.id] : undefined));
  if (!tab || showStart) {
    return (
      <footer className="statusbar">
        <span>HPSim Studio 2.0</span>
        <span className="spacer" />
        <span>Petri-Netze: entwerfen · simulieren · analysieren</span>
      </footer>
    );
  }
  const counts = { place: 0, transition: 0, arc: 0 };
  for (const id of tab.doc.order) {
    const t = tab.doc.elements[id]?.type;
    if (t === 'place' || t === 'transition' || t === 'arc') counts[t]++;
  }
  const modeLabel = tab.mode === 'edit' ? 'Bearbeiten' : tab.mode === 'sim' ? 'Simulation' : 'Analyse';
  return (
    <footer className="statusbar" data-testid="statusbar">
      <span className="status-item">
        <span className={`status-dot${tab.mode === 'sim' ? ' on' : ''}`} />
        {modeLabel}
        {sess && tab.mode === 'sim' && sess.run !== 'stopped' && ' · läuft'}
      </span>
      <span className="status-item">
        {counts.place} Stellen · {counts.transition} Transitionen · {counts.arc} Kanten
      </span>
      {tab.selection.length > 0 && <span className="status-item">{tab.selection.length} ausgewählt</span>}
      {sess && tab.mode === 'sim' && (
        <span className="status-item">
          Schritt {formatNumber(sess.state.step)} · Zeit {formatNumber(sess.state.time, 3)} {tab.doc.settings.sim.timeUnit}
        </span>
      )}
      <span className="spacer" />
      {cursor && (
        <span className="status-item mono">
          x {cursor.x} · y {cursor.y}
        </span>
      )}
      <span className="status-item">{Math.round(tab.view.zoom * 100)} %</span>
    </footer>
  );
}

export function Toasts() {
  const toasts = useApp((s) => s.toasts);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => {
        const Icon = t.kind === 'success' ? CheckCircle2 : t.kind === 'warning' ? AlertTriangle : t.kind === 'error' ? XCircle : Info;
        const color = t.kind === 'success' ? 'var(--success)' : t.kind === 'warning' ? 'var(--warning)' : t.kind === 'error' ? 'var(--danger)' : 'var(--info)';
        return (
          <div key={t.id} className={`toast ${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'} data-testid="toast">
            <Icon size={18} color={color} style={{ flex: 'none', marginTop: 1 }} />
            <div className="grow">
              <div className="toast-title">{t.title}</div>
              {t.message && <div className="toast-msg">{t.message}</div>}
              {t.action && (
                <button
                  className="btn sm"
                  style={{ marginTop: 8 }}
                  onClick={() => {
                    t.action!.run();
                    dismissToast(t.id);
                  }}
                >
                  {t.action.label}
                </button>
              )}
            </div>
            <button className="icon-btn sm" onClick={() => dismissToast(t.id)} aria-label="Schließen">
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function DialogHost() {
  const dialog = useApp((s) => s.dialog);
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!dialog) return;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        dialog.resolve('cancel');
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [dialog]);
  if (!dialog) return null;
  return (
    <div className="backdrop" style={{ zIndex: 1050 }}>
      <div className="dialog" role="alertdialog" aria-modal="true" style={{ width: 'min(460px, 100%)' }}>
        <div className="dialog-header">
          <AlertTriangle size={20} color="var(--warning)" />
          <h2>{dialog.title}</h2>
        </div>
        <div className="dialog-body">{dialog.message}</div>
        <div className="dialog-footer">
          {dialog.extraLabel && (
            <Button variant="danger" onClick={() => dialog.resolve('extra')} testId="dialog-extra">
              {dialog.extraLabel}
            </Button>
          )}
          <span className="spacer" />
          <Button onClick={() => dialog.resolve('cancel')} testId="dialog-cancel">
            {dialog.cancelLabel}
          </Button>
          <button ref={confirmRef} className={`btn ${dialog.danger ? 'danger' : 'primary'}`} onClick={() => dialog.resolve('confirm')} data-testid="dialog-confirm">
            {dialog.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export function CommandPalette() {
  const open = useApp((s) => s.ui.commandPalette);
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const results = useMemo(() => {
    if (!open) return [] as Action[];
    const q = normalize(query.trim());
    const enabled = ACTIONS.filter((a) => !a.enabled || a.enabled());
    if (!q) return enabled;
    const words = q.split(/\s+/);
    return enabled
      .map((a) => {
        const hay = normalize(`${a.label} ${a.group} ${a.keywords ?? ''}`);
        const score = words.every((w) => hay.includes(w)) ? (normalize(a.label).startsWith(words[0]) ? 2 : 1) : 0;
        return { a, score };
      })
      .filter((x) => x.score > 0)
      .sort((x, y) => y.score - x.score)
      .map((x) => x.a);
  }, [open, query]);
  useEffect(() => {
    if (open) {
      setQuery('');
      setIndex(0);
    }
  }, [open]);
  useEffect(() => setIndex(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector('.focused')?.scrollIntoView({ block: 'nearest' });
  }, [index]);
  if (!open) return null;
  const close = () => setUi({ commandPalette: false });
  const run = (a: Action) => {
    close();
    setTimeout(() => runAction(a.id), 0);
  };
  return (
    <div className="backdrop" onPointerDown={(e) => e.target === e.currentTarget && close()} style={{ alignItems: 'start' }}>
      <div className="palette" role="dialog" aria-label="Befehlspalette">
        <input
          className="palette-input"
          autoFocus
          placeholder="Befehl suchen … (z. B. „speichern“, „simulieren“, „pnml“)"
          value={query}
          data-testid="palette-input"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Escape') close();
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setIndex((i) => Math.min(results.length - 1, i + 1));
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              setIndex((i) => Math.max(0, i - 1));
            }
            if (e.key === 'Enter' && results[index]) run(results[index]);
          }}
        />
        <div className="palette-list" ref={listRef}>
          {results.length === 0 && <div className="empty-state">Kein passender Befehl gefunden.</div>}
          {results.map((a, i) => {
            const Icon = a.icon;
            return (
              <button key={a.id} type="button" className={`menu-item${i === index ? ' focused' : ''}`} onMouseEnter={() => setIndex(i)} onClick={() => run(a)}>
                <span className="menu-icon">{Icon && <Icon size={15} />}</span>
                <span className="menu-label">{a.label}</span>
                <span className="faint" style={{ fontSize: 11 }}>
                  {a.group}
                </span>
                {a.shortcut && <span className="menu-shortcut">{a.shortcut}</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Globale Tastenkürzel. Ignoriert Eingaben in Textfeldern. */
export function useShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      const st = useApp.getState();
      if (st.dialog || st.ui.commandPalette) return;
      if (typing) {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
          e.preventDefault();
          (t as HTMLElement).blur();
          runAction('file.save');
          return;
        }
        return;
      }
      const tab = activeTab(st);
      if (e.code === 'Space' && tab?.mode === 'sim' && !e.repeat) {
        e.preventDefault();
        runAction('sim.step');
        return;
      }
      const action = actionForEvent(e);
      if (!action) return;
      // Einzelne Buchstaben (Werkzeuge) nicht bei gedrückter Strg-/Alt-Taste
      e.preventDefault();
      runAction(action.id);
    };
    // Funktionstasten (F1–F12) erzeugen keine Zeichen – sie wirken auch aus Eingabefeldern heraus
    // (Eingabefelder stoppen die Weitergabe, daher in der Capture-Phase), sonst lädt z. B. F5 die Seite neu.
    const onFnKey = (e: KeyboardEvent) => {
      if (!/^F([1-9]|1[0-2])$/.test(e.key)) return;
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      const st = useApp.getState();
      if (!typing || st.dialog || st.ui.commandPalette) return;
      const fn = actionForEvent(e);
      if (!fn) return;
      e.preventDefault();
      e.stopPropagation();
      t.blur();
      runAction(fn.id);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keydown', onFnKey, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keydown', onFnKey, true);
    };
  }, []);
}

interface BoundaryState {
  error: Error | null;
}

/** Fängt Darstellungsfehler ab, damit nie die ganze Anwendung abstürzt. */
export class ErrorBoundary extends Component<{ children: ReactNode; area: string; compact?: boolean }, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`Fehler im Bereich „${this.props.area}“`, error, info.componentStack);
  }

  private rescue = () => {
    const tabs = useApp.getState().tabs;
    for (const t of tabs) downloadBlob(`${t.doc.meta.title || 'Netz'} (gerettet).hpsim`, serializeDoc(t.doc), 'application/json');
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const details = `${error.name}: ${error.message}\n${error.stack ?? ''}`;
    return (
      <div className="empty-state" role="alert" style={{ height: '100%', gap: 10 }}>
        <AlertTriangle size={this.props.compact ? 22 : 34} color="var(--warning)" />
        <b>Im Bereich „{this.props.area}“ ist ein Fehler aufgetreten.</b>
        <span style={{ maxWidth: 420 }}>Deine Netze sind nicht verloren – sie werden automatisch gesichert. Du kannst einfach weiterarbeiten.</span>
        <div className="row" style={{ flexWrap: 'wrap', justifyContent: 'center' }}>
          <Button variant="primary" icon={<RotateCcw size={15} />} onClick={() => this.setState({ error: null })}>
            Weiterarbeiten
          </Button>
          {!this.props.compact && (
            <Button icon={<Download size={15} />} onClick={this.rescue}>
              Alle Netze sichern
            </Button>
          )}
          <Button
            variant="ghost"
            icon={<Copy size={15} />}
            onClick={() => {
              void navigator.clipboard?.writeText(details).catch(() => undefined);
            }}
          >
            Fehlerdetails kopieren
          </Button>
        </div>
      </div>
    );
  }
}
