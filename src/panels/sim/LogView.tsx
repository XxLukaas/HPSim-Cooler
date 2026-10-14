import { AlertTriangle, ArrowDown, Ban, Flag, GitFork, Hand, Info, Search, Trash2, Zap } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { formatNumber } from '../../sim/engine';
import { activeTab, setSelection, setUi, useApp } from '../../store/appStore';
import { clearLog, type LogEntry, type LogKind, type SimSession } from '../../store/simStore';

type Filter = 'all' | 'fire' | 'conflict' | 'info';

const FILTERS: { value: Filter; label: string; kinds: LogKind[] }[] = [
  { value: 'all', label: 'Alle', kinds: [] },
  { value: 'fire', label: 'Schalten', kinds: ['fire', 'manual'] },
  { value: 'conflict', label: 'Konflikte', kinds: ['conflict'] },
  { value: 'info', label: 'Hinweise', kinds: ['info', 'warn', 'deadlock', 'limit'] },
];

const ICONS: Record<LogKind, { icon: typeof Zap; color: string; label: string }> = {
  fire: { icon: Zap, color: 'var(--success)', label: 'Schalten' },
  manual: { icon: Hand, color: 'var(--accent)', label: 'Manuell geschaltet' },
  conflict: { icon: GitFork, color: 'var(--warning)', label: 'Konflikt' },
  deadlock: { icon: Ban, color: 'var(--danger)', label: 'Verklemmung' },
  limit: { icon: Flag, color: 'var(--warning)', label: 'Limit' },
  info: { icon: Info, color: 'var(--info)', label: 'Hinweis' },
  warn: { icon: AlertTriangle, color: 'var(--warning)', label: 'Warnung' },
};

const PAGE = 400;

export function LogView({ sess }: { sess: SimSession }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [stick, setStick] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);
  const timeUnit = useApp((s) => activeTab(s)?.doc.settings.sim.timeUnit ?? 'ZE');

  const filtered = useMemo(() => {
    const kinds = FILTERS.find((f) => f.value === filter)?.kinds ?? [];
    const q = query.trim().toLowerCase();
    return sess.log.filter((e) => (!kinds.length || kinds.includes(e.kind)) && (!q || e.text.toLowerCase().includes(q)));
  }, [sess.log, filter, query]);

  const visible = filtered.length > limit ? filtered.slice(filtered.length - limit) : filtered;
  const hidden = filtered.length - visible.length;

  // Automatisch nach unten scrollen, solange der Nutzer nicht hochgescrollt hat
  useLayoutEffect(() => {
    const el = listRef.current;
    if (el && stick) el.scrollTop = el.scrollHeight;
  }, [visible, stick]);

  useEffect(() => setLimit(PAGE), [filter, query]);

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    if (atBottom !== stick) setStick(atBottom);
  };

  const hover = (e: LogEntry | null) => setUi({ highlight: e ? e.refs : [] });

  return (
    <div className="simlog">
      <div className="sim-toolbar">
        <div className="segmented" role="radiogroup" aria-label="Filter">
          {FILTERS.map((f) => (
            <button key={f.value} type="button" className={filter === f.value ? 'active' : ''} onClick={() => setFilter(f.value)}>
              {f.label}
            </button>
          ))}
        </div>
        <label className="sim-search">
          <Search size={14} />
          <input
            value={query}
            placeholder="Protokoll durchsuchen …"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Escape') setQuery('');
            }}
          />
        </label>
        <span className="spacer" />
        <span className="muted" style={{ fontSize: 12 }}>
          {formatNumber(filtered.length)} Einträge
        </span>
        <button type="button" className="btn sm ghost" onClick={() => clearLog(sess.tabId)} title="Protokoll leeren">
          <Trash2 size={14} /> Leeren
        </button>
      </div>
      <div className="simlog-list" ref={listRef} onScroll={onScroll} onMouseLeave={() => hover(null)} data-testid="sim-log">
        {hidden > 0 && (
          <button type="button" className="btn sm ghost simlog-more" onClick={() => setLimit((l) => l + PAGE)}>
            {formatNumber(hidden)} ältere Einträge anzeigen
          </button>
        )}
        {visible.length === 0 && <div className="empty-state">Noch keine passenden Einträge. Starte die Simulation oder klicke eine Transition an.</div>}
        {visible.map((e) => {
          const meta = ICONS[e.kind];
          const Icon = meta.icon;
          return (
            <div
              key={e.id}
              className={`simlog-row kind-${e.kind}`}
              onMouseEnter={() => hover(e)}
              onClick={() => {
                const ids = e.refs.filter((id) => activeTab()?.doc.elements[id]);
                if (ids.length) setSelection(ids);
              }}
            >
              <span className="simlog-when mono" title={`Schritt ${e.step}, Zeit ${e.time} ${timeUnit}`}>
                #{formatNumber(e.step)} · {formatNumber(e.time, 3)}
              </span>
              <Icon size={14} color={meta.color} aria-label={meta.label} style={{ flex: 'none' }} />
              <span className="simlog-text">{e.text}</span>
            </div>
          );
        })}
      </div>
      {!stick && (
        <button
          type="button"
          className="simlog-jump"
          onClick={() => {
            setStick(true);
            const el = listRef.current;
            if (el) el.scrollTop = el.scrollHeight;
          }}
        >
          <ArrowDown size={14} /> Neueste Einträge
        </button>
      )}
    </div>
  );
}
