/**
 * Explorer-Reiter: durchsuchbare, gruppierte Liste aller Elemente des Netzes.
 * Die Liste ist virtualisiert (nur sichtbare Zeilen werden gezeichnet) und
 * bleibt damit auch bei mehreren tausend Elementen flüssig.
 */
import {
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Circle,
  LayoutGrid,
  LocateFixed,
  MoveRight,
  Pencil,
  Plus,
  RectangleVertical,
  Search,
  SearchX,
  Shapes,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { memo, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { runAction } from '../../app/actions';
import { actionItem, openMenu, SEP, type MenuItem } from '../../components/ContextMenu';
import { Button, Kbd } from '../../components/ui';
import type { TransStatus, TransVisual } from '../../editor/NetRender';
import { paletteFor, type Palette } from '../../editor/palette';
import type { Id } from '../../model/types';
import { activeTab, centerOn, setSelection, setUi, toast, toggleSelection, updateDoc, useApp, type Mode } from '../../store/appStore';
import { simFire, transitionVisuals, useSim } from '../../store/simStore';
import { isEnabled as transitionEnabled } from '../../sim/engine';
import { readPref, writePref } from './hooks';
import { ArcGlyph, DrawingGlyph, PlaceGlyph, timingColor, TransitionGlyph } from './icons';
import {
  ARC_KIND_LABEL,
  buildExplorerModel,
  buildRows,
  filterModel,
  GROUP_HINTS,
  GROUP_ORDER,
  GROUP_TITLES,
  groupHeaderIndex,
  layoutRows,
  modelSize,
  parseQuery,
  ROW_HEIGHT,
  rowAt,
  splitHighlights,
  visibleRange,
  type ExplorerItem,
  type ExplorerModel,
  type GroupKey,
  type Row,
} from './model';

const EMPTY_SEL: Id[] = [];
const COLLAPSE_KEY = 'hpsim-studio:explorer-collapsed';

const GROUP_ICONS: Record<GroupKey, LucideIcon> = {
  places: Circle,
  transitions: RectangleVertical,
  arcs: MoveRight,
  drawings: Shapes,
};

const STATUS_TEXT: Record<TransStatus, string> = {
  disabled: 'nicht aktiviert',
  enabled: 'aktiviert',
  waiting: 'wartet (Verzögerung läuft)',
  ready: 'schaltbereit',
  fired: 'hat gerade geschaltet',
};

const KIND_TEXT: Record<ExplorerItem['kind'], string> = {
  place: 'Stelle',
  transition: 'Transition',
  arc: 'Kante',
  drawing: 'Zeichnung',
};

function isGroupList(v: unknown): v is GroupKey[] {
  return Array.isArray(v) && v.every((g) => typeof g === 'string' && (GROUP_ORDER as string[]).includes(g));
}

function statusColor(p: Palette, s: TransStatus): string {
  switch (s) {
    case 'enabled':
      return p.enabled;
    case 'ready':
    case 'fired':
      return p.ready;
    case 'waiting':
      return p.waiting;
    default:
      return p.disabled;
  }
}

function fmtCount(n: number): string {
  return Number.isFinite(n) ? n.toLocaleString('de-DE') : '∞';
}

// ───────────────────────────── Zeilen ─────────────────────────────

interface RowHandlers {
  click: (e: React.MouseEvent, item: ExplorerItem) => void;
  doubleClick: (item: ExplorerItem) => void;
  context: (e: React.MouseEvent, item: ExplorerItem) => void;
  enter: (id: Id) => void;
  leave: () => void;
  toggleGroup: (g: GroupKey) => void;
  groupContext: (e: React.MouseEvent, g: GroupKey) => void;
  renameChange: (v: string) => void;
  renameCommit: () => void;
  renameCancel: () => void;
}

function Highlighted({ text, terms }: { text: string; terms: readonly string[] }) {
  if (!terms.length) return <>{text}</>;
  const parts = splitHighlights(text, terms);
  return (
    <>
      {parts.map((part, i) =>
        part.hit ? (
          <mark key={i} className="ex-hit">
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}

function RenameInput({ value, h }: { value: string; h: RowHandlers }) {
  const ref = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.select();
  }, []);
  return (
    <input
      ref={ref}
      className="ex-rename"
      value={value}
      maxLength={80}
      aria-label="Neuer Name"
      spellCheck={false}
      onChange={(e) => h.renameChange(e.target.value)}
      onBlur={() => h.renameCommit()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          e.preventDefault();
          h.renameCommit();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          h.renameCancel();
        }
      }}
    />
  );
}

interface ItemRowProps {
  item: ExplorerItem;
  top: number;
  selected: boolean;
  cursor: boolean;
  /** aktuelle Markenzahl (Stellen) */
  tokens: number | undefined;
  /** Simulationsstatus (Transitionen) */
  visual: TransVisual | undefined;
  renameDraft: string | null;
  terms: readonly string[];
  p: Palette;
  mode: Mode;
  h: RowHandlers;
}

const ItemRow = memo(function ItemRow({ item, top, selected, cursor, tokens, visual, renameDraft, terms, p, mode, h }: ItemRowProps) {
  let glyph: React.ReactNode;
  let badges: React.ReactNode = null;
  let title = `${KIND_TEXT[item.kind]} ${item.label}`;

  switch (item.kind) {
    case 'place': {
      const shown = tokens ?? item.tokens;
      const changed = mode === 'sim' && tokens !== undefined && tokens !== item.tokens;
      const full = item.capacity > 0 && shown >= item.capacity;
      glyph = <PlaceGlyph p={p} color={item.color} marked={shown > 0} />;
      badges = (
        <span
          className={`ex-tokens${shown === 0 ? ' zero' : ''}${changed ? ' changed' : ''}${full ? ' full' : ''}`}
          title={`${fmtCount(shown)} Marke${shown === 1 ? '' : 'n'}${item.capacity > 0 ? ` von höchstens ${fmtCount(item.capacity)}` : ''}${mode === 'sim' ? ' (aktuell)' : ' (Anfangsmarkierung)'}`}
        >
          <span className="ex-token-dot" style={{ background: p.token }} />
          {fmtCount(shown)}
          {item.capacity > 0 && <span className="ex-cap">/{fmtCount(item.capacity)}</span>}
        </span>
      );
      title += ` · ${fmtCount(shown)} Marke${shown === 1 ? '' : 'n'}${item.capacity > 0 ? ` · Kapazität ${fmtCount(item.capacity)}` : ''}`;
      break;
    }
    case 'transition': {
      glyph = <TransitionGlyph p={p} color={item.color} timing={item.timing} />;
      const col = timingColor(p, item.timing);
      badges = (
        <>
          {item.priority !== 0 && (
            <span className="ex-chip faint" title={`Priorität ${item.priority} – höhere Priorität gewinnt bei Konflikten`}>
              ↑{item.priority}
            </span>
          )}
          <span
            className={`ex-chip timing ${item.timing}`}
            style={item.timing === 'immediate' ? undefined : { color: col }}
            title={item.timingHint}
          >
            {item.timingText}
          </span>
          {visual && (
            <span
              className={`ex-status ${visual.status}`}
              style={{ background: statusColor(p, visual.status), color: statusColor(p, visual.status) }}
              title={`Gerade ${STATUS_TEXT[visual.status]}${visual.fired ? ` · ${visual.fired}× geschaltet` : ''}`}
            />
          )}
        </>
      );
      title += ` · ${item.timingText}${item.priority ? ` · Priorität ${item.priority}` : ''}${visual ? ` · ${STATUS_TEXT[visual.status]}` : ''}`;
      break;
    }
    case 'arc': {
      glyph = <ArcGlyph p={p} kind={item.arcKind} color={item.color} broken={item.broken} />;
      badges = (
        <>
          {item.broken && <span className="ex-chip danger">defekt</span>}
          {item.arcKind === 'test' && <span className="ex-chip test">Test</span>}
          {item.arcKind === 'inhibitor' && <span className="ex-chip inhibitor">Inhib.</span>}
          {item.weight !== 1 && (
            <span className="ex-chip weight" title={`Gewicht ${item.weight}: ${item.weight} Marken werden auf einmal bewegt`}>
              ×{fmtCount(item.weight)}
            </span>
          )}
        </>
      );
      title = `${ARC_KIND_LABEL[item.arcKind]} ${item.label}${item.weight !== 1 ? ` · Gewicht ${item.weight}` : ''}${item.broken ? ' · verweist auf ein fehlendes Element' : ''}`;
      break;
    }
    case 'drawing':
      glyph = <DrawingGlyph shape={item.shape} />;
      badges = item.detail ? <span className="ex-detail">{item.detail}</span> : null;
      title = `${item.label}${item.detail ? ` · ${item.detail}` : ''}`;
      break;
  }
  if (item.kind !== 'drawing' && item.detail) title += `\nNotiz: ${item.detail}`;
  const canRename = mode === 'edit' && (item.kind === 'place' || item.kind === 'transition');
  title += `\n\nKlick: auswählen & zeigen · Strg/Umschalt: zur Auswahl hinzufügen${canRename ? ' · Doppelklick/F2: umbenennen' : ''} · Rechtsklick: Menü`;

  return (
    <div
      role="treeitem"
      aria-level={2}
      aria-selected={selected}
      id={`ex-row-${item.id}`}
      className={`ex-row ex-item${selected ? ' selected' : ''}${cursor ? ' is-cursor' : ''}${item.kind === 'drawing' ? ' drawing' : ''}`}
      style={{ top, height: ROW_HEIGHT.item }}
      title={renameDraft === null ? title : undefined}
      data-testid={`explorer-row-${item.id}`}
      onClick={(e) => h.click(e, item)}
      onDoubleClick={() => h.doubleClick(item)}
      onContextMenu={(e) => h.context(e, item)}
      onMouseEnter={() => h.enter(item.id)}
      onMouseLeave={h.leave}
    >
      <span className="ex-glyph-box">{glyph}</span>
      {renameDraft !== null ? (
        <RenameInput value={renameDraft} h={h} />
      ) : (
        <>
          <span className={`ex-label${item.unnamed ? ' unnamed' : ''}`}>
            <Highlighted text={item.label} terms={terms} />
          </span>
          {badges}
        </>
      )}
    </div>
  );
});

interface GroupRowProps {
  row: Extract<Row, { type: 'group' }>;
  top: number;
  cursor: boolean;
  meta: string | null;
  metaTitle?: string;
  searching: boolean;
  h: RowHandlers;
  sticky?: boolean;
}

const GroupRow = memo(function GroupRow({ row, top, cursor, meta, metaTitle, searching, h, sticky }: GroupRowProps) {
  const Icon = GROUP_ICONS[row.group];
  return (
    <div
      role={sticky ? undefined : 'treeitem'}
      aria-level={sticky ? undefined : 1}
      aria-expanded={sticky ? undefined : !row.collapsed}
      aria-hidden={sticky ? true : undefined}
      className={`ex-row ex-group g-${row.group}${row.collapsed ? ' collapsed' : ''}${cursor ? ' is-cursor' : ''}${sticky ? ' sticky' : ''}`}
      style={sticky ? { height: ROW_HEIGHT.group } : { top, height: ROW_HEIGHT.group }}
      data-testid={sticky ? undefined : `explorer-group-${row.group}`}
      onClick={() => h.toggleGroup(row.group)}
      onContextMenu={(e) => h.groupContext(e, row.group)}
      title={row.collapsed ? 'Aufklappen' : 'Zuklappen'}
    >
      <ChevronRight size={14} className="ex-chevron" aria-hidden />
      <span className="ex-group-icon">
        <Icon size={13} aria-hidden />
      </span>
      <span className="ex-group-title">{GROUP_TITLES[row.group]}</span>
      {meta && (
        <span className="ex-group-meta" title={metaTitle}>
          {meta}
        </span>
      )}
      <span className={`ex-count${searching ? ' searching' : ''}`} title={searching ? `${row.count} von ${row.total} passen zur Suche` : `${row.total} insgesamt`}>
        {searching ? `${fmtCount(row.count)}/${fmtCount(row.total)}` : fmtCount(row.total)}
      </span>
    </div>
  );
});

function HintRow({ group, top }: { group: GroupKey; top: number }) {
  const hint = GROUP_HINTS[group];
  return (
    <div className="ex-row ex-hint" style={{ top, height: ROW_HEIGHT.hint }} role="presentation">
      <span className="grow">{hint.text}</span>
      {hint.key && <Kbd>{hint.key}</Kbd>}
    </div>
  );
}

// ───────────────────────────── Hauptkomponente ─────────────────────────────

export const ExplorerTree = memo(function ExplorerTree({ focusToken }: { focusToken: number }) {
  const tabId = useApp((s) => s.activeId);
  const doc = useApp((s) => activeTab(s)?.doc ?? null);
  const selection = useApp((s) => activeTab(s)?.selection ?? EMPTY_SEL);
  const mode = useApp((s) => activeTab(s)?.mode ?? 'edit');
  const theme = useApp((s) => s.ui.theme);
  const sess = useSim((s) => (mode === 'sim' && tabId ? s.sessions[tabId] : undefined));
  const p = paletteFor(theme);

  // ── Suche
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const terms = useMemo(() => parseQuery(deferredQuery), [deferredQuery]);
  const searching = terms.length > 0;
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (focusToken <= 0) return;
    const el = searchRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [focusToken]);

  // ── Modell
  const { model, failed } = useMemo((): { model: ExplorerModel; failed: boolean } => {
    try {
      return { model: buildExplorerModel(doc), failed: false };
    } catch (err) {
      console.error('Explorer: Elementliste konnte nicht erstellt werden', err);
      return { model: { places: [], transitions: [], arcs: [], drawings: [] }, failed: true };
    }
  }, [doc]);
  const filtered = useMemo(() => filterModel(model, terms), [model, terms]);
  const total = modelSize(model);
  const hits = searching ? modelSize(filtered) : total;

  // ── Auf-/Zuklappen (ohne Suche dauerhaft gemerkt, während der Suche separat)
  const [collapsed, setCollapsed] = useState<Set<GroupKey>>(() => new Set(readPref(COLLAPSE_KEY, [] as GroupKey[], isGroupList)));
  const [searchCollapsed, setSearchCollapsed] = useState<Set<GroupKey>>(() => new Set());
  useEffect(() => {
    if (!searching) setSearchCollapsed((s) => (s.size ? new Set() : s));
  }, [searching]);
  const activeCollapsed = searching ? searchCollapsed : collapsed;

  const toggleGroup = useCallback(
    (g: GroupKey) => {
      const upd = (s: Set<GroupKey>) => {
        const n = new Set(s);
        if (n.has(g)) n.delete(g);
        else n.add(g);
        return n;
      };
      if (searching) setSearchCollapsed(upd);
      else
        setCollapsed((s) => {
          const n = upd(s);
          writePref(COLLAPSE_KEY, [...n]);
          return n;
        });
    },
    [searching],
  );
  const setAllCollapsed = useCallback(
    (all: boolean) => {
      const n = new Set<GroupKey>(all ? GROUP_ORDER : []);
      if (searching) setSearchCollapsed(n);
      else {
        setCollapsed(n);
        writePref(COLLAPSE_KEY, [...n]);
      }
    },
    [searching],
  );
  const allCollapsed = GROUP_ORDER.every((g) => activeCollapsed.has(g));

  // ── Zeilen & Layout
  const rows = useMemo(() => buildRows(model, filtered, activeCollapsed, searching), [model, filtered, activeCollapsed, searching]);
  const layout = useMemo(() => layoutRows(rows), [rows]);
  const keyIndex = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r, i) => m.set(r.key, i));
    return m;
  }, [rows]);

  // ── Simulationsdaten
  const marking = useMemo(() => {
    if (!sess) return null;
    const res = new Map<Id, number>();
    try {
      sess.net.placeIds.forEach((id, i) => {
        const v = sess.display[i];
        res.set(id, Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0);
      });
    } catch {
      return null;
    }
    return res;
  }, [sess]);
  const visuals = useMemo((): Record<string, TransVisual> | null => {
    if (!sess) return null;
    try {
      return transitionVisuals(sess);
    } catch {
      return null;
    }
  }, [sess]);

  const groupMeta = useMemo(() => {
    let tokens = 0;
    for (const it of model.places) if (it.kind === 'place') tokens += marking?.get(it.id) ?? it.tokens;
    let active = 0;
    if (visuals) for (const v of Object.values(visuals)) if (v.status !== 'disabled') active++;
    return { tokens, active };
  }, [model, marking, visuals]);

  const selSet = useMemo(() => new Set(selection), [selection]);

  // ── Scrollen & Größe
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const attachScroll = useCallback((el: HTMLDivElement | null) => {
    scrollRef.current = el;
    setScrollEl(el);
  }, []);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewH, setViewH] = useState(600);
  useLayoutEffect(() => {
    const el = scrollEl;
    if (!el) return;
    setViewH(el.clientHeight || 600);
    setScrollTop(el.scrollTop);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setViewH(el.clientHeight || 600));
    ro.observe(el);
    return () => ro.disconnect();
  }, [scrollEl]);
  // Scrollposition begrenzen, wenn die Liste kürzer wird
  useEffect(() => {
    const el = scrollRef.current;
    if (el && el.scrollTop !== scrollTop) setScrollTop(el.scrollTop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout.total]);

  const ensureVisible = useCallback(
    (index: number, center = false) => {
      const el = scrollRef.current;
      if (!el || index < 0 || index >= rows.length) return;
      const top = layout.offsets[index];
      const bottom = layout.offsets[index + 1];
      const stickyH = rows[index]?.type === 'group' ? 0 : ROW_HEIGHT.group;
      if (center) {
        if (top - stickyH < el.scrollTop || bottom > el.scrollTop + el.clientHeight) el.scrollTop = Math.max(0, top - el.clientHeight / 2);
        return;
      }
      if (top - stickyH < el.scrollTop) el.scrollTop = Math.max(0, top - stickyH - 2);
      else if (bottom > el.scrollTop + el.clientHeight) el.scrollTop = bottom - el.clientHeight + 4;
    },
    [layout, rows],
  );

  // ── Cursor (Tastaturnavigation)
  const [cursorKey, setCursorKey] = useState<string | null>(null);
  const cursorIndex = cursorKey ? keyIndex.get(cursorKey) ?? -1 : -1;
  const [kbdNav, setKbdNav] = useState(false);

  // ── Umbenennen
  const [renaming, setRenaming] = useState<{ id: Id; draft: string } | null>(null);
  const renamingRef = useRef(renaming);
  renamingRef.current = renaming;

  // Aktuelle Werte für stabile Handler
  const live = useRef({ mode, tabId, sess, doc, rows, keyIndex, selection, filtered });
  live.current = { mode, tabId, sess, doc, rows, keyIndex, selection, filtered };

  /** Zeitpunkt der letzten Auswahl aus dem Explorer (dann nicht automatisch hinscrollen) */
  const ownSelectAt = useRef(0);
  const hovered = useRef<Id | null>(null);
  const pendingReveal = useRef<string | null>(null);

  const startRename = useCallback((item: ExplorerItem) => {
    if (live.current.mode !== 'edit' || (item.kind !== 'place' && item.kind !== 'transition')) return;
    setRenaming({ id: item.id, draft: item.unnamed ? '' : item.label });
  }, []);

  const handlers = useMemo<RowHandlers>(
    () => ({
      click: (e, item) => {
        if (renamingRef.current?.id === item.id) return;
        ownSelectAt.current = performance.now();
        setCursorKey(item.id);
        setKbdNav(false);
        if (e.ctrlKey || e.metaKey || e.shiftKey) {
          toggleSelection(item.id);
        } else {
          setSelection([item.id]);
          centerOn([item.id]);
        }
      },
      doubleClick: (item) => {
        if (live.current.mode === 'edit' && (item.kind === 'place' || item.kind === 'transition')) startRename(item);
        else centerOn([item.id]);
      },
      context: (e, item) => {
        e.preventDefault();
        e.stopPropagation();
        const { mode: m, tabId: tid, sess: s, selection: sel } = live.current;
        ownSelectAt.current = performance.now();
        setCursorKey(item.id);
        if (!sel.includes(item.id)) setSelection([item.id]);
        const items: MenuItem[] = [{ heading: `${KIND_TEXT[item.kind]} ${item.label}` }];
        items.push({ label: 'Im Netz zeigen', icon: LocateFixed, run: () => centerOn([item.id]) });
        if (m === 'edit' && (item.kind === 'place' || item.kind === 'transition')) {
          items.push({ label: 'Umbenennen', icon: Pencil, shortcut: 'F2', run: () => startRename(item) });
        }
        if (m === 'sim' && item.kind === 'transition' && s && tid) {
          const t = s.net.transIndex.get(item.id);
          let ok = false;
          try {
            ok = t !== undefined && transitionEnabled(s.net, t, s.state.marking);
          } catch {
            ok = false;
          }
          items.push({ label: ok ? 'Jetzt schalten' : 'Jetzt schalten (nicht aktiviert)', icon: Zap, disabled: !ok, run: () => void simFire(tid, item.id) });
        }
        items.push(SEP, actionItem('edit.copy'), actionItem('edit.cut'), actionItem('edit.duplicate'));
        if (item.kind === 'arc') items.push(actionItem('arrange.reverse'), actionItem('arrange.straighten'));
        if (item.kind === 'transition') items.push(actionItem('arrange.rotate'));
        items.push(SEP, actionItem('edit.delete', { danger: true }));
        openMenu(e.clientX, e.clientY, items);
      },
      enter: (id) => {
        hovered.current = id;
        setUi({ highlight: [id] });
      },
      leave: () => {
        if (hovered.current) {
          hovered.current = null;
          setUi({ highlight: [] });
        }
      },
      toggleGroup,
      groupContext: (e, g) => {
        e.preventDefault();
        e.stopPropagation();
        const ids = live.current.filtered[g].map((i) => i.id);
        openMenu(e.clientX, e.clientY, [
          { heading: GROUP_TITLES[g] },
          {
            label: ids.length ? `Alle ${ids.length} auswählen` : 'Nichts auszuwählen',
            icon: LayoutGrid,
            disabled: !ids.length,
            run: () => {
              ownSelectAt.current = performance.now();
              setSelection(ids);
            },
          },
          { label: 'Alle Gruppen zuklappen', icon: ChevronsDownUp, run: () => setAllCollapsed(true) },
          { label: 'Alle Gruppen aufklappen', icon: ChevronsUpDown, run: () => setAllCollapsed(false) },
        ]);
      },
      renameChange: (v) => setRenaming((r) => (r ? { ...r, draft: v } : r)),
      renameCommit: () => {
        const r = renamingRef.current;
        if (!r) return;
        renamingRef.current = null;
        setRenaming(null);
        const d0 = live.current.doc;
        const el = d0?.elements[r.id];
        if (!el || (el.type !== 'place' && el.type !== 'transition')) return;
        const name = r.draft.replace(/\s+/g, ' ').trim();
        if (!name) {
          toast('warning', 'Name darf nicht leer sein', 'Der bisherige Name wurde beibehalten.');
          return;
        }
        if (name === el.name) return;
        updateDoc((d) => {
          const target = d.elements[r.id];
          if (target && (target.type === 'place' || target.type === 'transition')) target.name = name;
        });
        pendingReveal.current = r.id;
        requestAnimationFrame(() => scrollRef.current?.focus({ preventScroll: true }));
      },
      renameCancel: () => {
        renamingRef.current = null;
        setRenaming(null);
        requestAnimationFrame(() => scrollRef.current?.focus({ preventScroll: true }));
      },
    }),
    [toggleGroup, setAllCollapsed, startRename],
  );

  // Umbenennen abbrechen, wenn das Element verschwindet oder der Modus wechselt
  useEffect(() => {
    if (renaming && (mode !== 'edit' || !doc?.elements[renaming.id])) setRenaming(null);
  }, [renaming, mode, doc]);

  // Hervorhebung beim Verlassen aufräumen
  useEffect(
    () => () => {
      if (hovered.current) {
        hovered.current = null;
        setUi({ highlight: [] });
      }
    },
    [],
  );

  // Nach dem Umbenennen zur (evtl. neu einsortierten) Zeile scrollen
  useLayoutEffect(() => {
    const key = pendingReveal.current;
    if (!key) return;
    const idx = keyIndex.get(key);
    if (idx === undefined) return;
    pendingReveal.current = null;
    setCursorKey(key);
    ensureVisible(idx);
  }, [keyIndex, ensureVisible]);

  // Auswahl von außen (z. B. Klick auf der Zeichenfläche): Zeile sichtbar machen
  const prevSelection = useRef(selection);
  useEffect(() => {
    if (prevSelection.current === selection) return;
    prevSelection.current = selection;
    if (performance.now() - ownSelectAt.current < 400) return;
    if (!selection.length) return;
    const idx = keyIndex.get(selection[0]);
    if (idx === undefined) return;
    setCursorKey(selection[0]);
    ensureVisible(idx, true);
  }, [selection, keyIndex, ensureVisible]);

  // ── Tastatursteuerung der Liste
  const moveCursor = (index: number) => {
    const r = rows[index];
    if (!r) return;
    setCursorKey(r.key);
    ensureVisible(index);
    if (r.type === 'item') {
      ownSelectAt.current = performance.now();
      setSelection([r.item.id]);
      centerOn([r.item.id]);
    }
  };
  const focusable = (i: number) => rows[i] && rows[i].type !== 'hint';
  const step = (from: number, dir: 1 | -1): number => {
    let i = from;
    for (let n = 0; n < rows.length; n++) {
      i += dir;
      if (i < 0 || i >= rows.length) return from;
      if (focusable(i)) return i;
    }
    return from;
  };

  const onListKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (renamingRef.current || !rows.length) return;
    const cur = cursorIndex;
    const row = cur >= 0 ? rows[cur] : undefined;
    let handled = true;
    switch (e.key) {
      case 'ArrowDown':
        moveCursor(cur < 0 ? step(-1, 1) : step(cur, 1));
        break;
      case 'ArrowUp':
        moveCursor(cur < 0 ? step(-1, 1) : step(cur, -1));
        break;
      case 'Home':
        moveCursor(step(-1, 1));
        break;
      case 'End':
        moveCursor(step(rows.length, -1));
        break;
      case 'PageDown':
      case 'PageUp': {
        const el = scrollRef.current;
        const base = cur < 0 ? 0 : layout.offsets[cur];
        const target = base + (e.key === 'PageDown' ? 1 : -1) * (el?.clientHeight ?? 300) * 0.85;
        let i = rowAt(layout.offsets, rows.length, Math.max(0, target));
        if (!focusable(i)) i = step(i, e.key === 'PageDown' ? 1 : -1);
        moveCursor(i);
        break;
      }
      case 'ArrowLeft':
        if (row?.type === 'group' && !row.collapsed) toggleGroup(row.group);
        else if (row?.type === 'item') {
          const gi = groupHeaderIndex(rows, cur);
          if (gi >= 0) moveCursor(gi);
        } else handled = false;
        break;
      case 'ArrowRight':
        if (row?.type === 'group') {
          if (row.collapsed) toggleGroup(row.group);
          else if (rows[cur + 1]?.type === 'item') moveCursor(cur + 1);
        } else handled = false;
        break;
      case 'Enter':
      case ' ':
        if (row?.type === 'group') toggleGroup(row.group);
        else if (row?.type === 'item') {
          ownSelectAt.current = performance.now();
          setSelection([row.item.id]);
          centerOn([row.item.id]);
        } else handled = false;
        break;
      case 'F2':
        if (row?.type === 'item') startRename(row.item);
        else handled = false;
        break;
      default:
        handled = false;
    }
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
      setKbdNav(true);
    }
  };

  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      if (query) setQuery('');
      else e.currentTarget.blur();
    } else if (e.key === 'ArrowDown' || e.key === 'Enter') {
      e.preventDefault();
      const first = rows.findIndex((r) => r.type === 'item');
      if (first < 0) return;
      if (e.key === 'Enter') {
        const r = rows[first];
        if (r.type === 'item') {
          ownSelectAt.current = performance.now();
          setSelection([r.item.id]);
          centerOn([r.item.id]);
        }
        setCursorKey(r.key);
      } else {
        moveCursor(first);
        setKbdNav(true);
        scrollRef.current?.focus({ preventScroll: true });
      }
    }
  };

  // ── Sichtbarer Bereich
  const [start, end] = visibleRange(layout, rows.length, scrollTop, viewH);
  const firstVisible = rowAt(layout.offsets, rows.length, scrollTop);
  const stickyIndex = rows.length ? groupHeaderIndex(rows, firstVisible) : -1;
  let sticky: { row: Extract<Row, { type: 'group' }>; shift: number } | null = null;
  if (stickyIndex >= 0 && layout.offsets[stickyIndex] < scrollTop - 0.5) {
    const r = rows[stickyIndex];
    let next = -1;
    for (let i = stickyIndex + 1; i < rows.length; i++)
      if (rows[i].type === 'group') {
        next = i;
        break;
      }
    const shift = next >= 0 ? Math.min(0, layout.offsets[next] - scrollTop - ROW_HEIGHT.group) : 0;
    if (r.type === 'group') sticky = { row: r, shift };
  }

  const metaFor = (g: GroupKey): { text: string | null; title?: string } => {
    if (g === 'places' && model.places.length)
      return { text: `● ${fmtCount(groupMeta.tokens)}`, title: `${fmtCount(groupMeta.tokens)} Marken insgesamt${mode === 'sim' ? ' (aktuell)' : ' (Anfangsmarkierung)'}` };
    if (g === 'transitions' && visuals && model.transitions.length)
      return { text: `${fmtCount(groupMeta.active)} aktiv`, title: `${groupMeta.active} Transition(en) gerade aktiviert` };
    return { text: null };
  };

  // ── Darstellung
  if (!tabId || !doc) {
    return (
      <div className="empty-state ex-empty">
        <Circle size={30} />
        <b>Kein Netz geöffnet</b>
        <span>Lege ein neues Netz an oder öffne ein Beispiel.</span>
        <Button variant="primary" icon={<Plus size={15} />} onClick={() => runAction('file.new')}>
          Neues Netz
        </Button>
      </div>
    );
  }

  const searchBar = (
    <div className="ex-toolbar">
      <div className={`ex-search${query ? ' has-value' : ''}`}>
        <Search size={14} className="ex-search-icon" aria-hidden />
        <input
          ref={searchRef}
          className="ex-search-input"
          value={query}
          placeholder="Suchen …"
          aria-label="Elemente suchen"
          spellCheck={false}
          maxLength={120}
          data-testid="explorer-search"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onSearchKey}
        />
        {query ? (
          <button type="button" className="ex-search-clear" title="Suche löschen (Esc)" aria-label="Suche löschen" onClick={() => setQuery('')}>
            <X size={13} />
          </button>
        ) : (
          <span className="ex-search-kbd" aria-hidden>
            <Kbd>Strg+F</Kbd>
          </span>
        )}
      </div>
      <button
        type="button"
        className="icon-btn sm"
        title={allCollapsed ? 'Alle Gruppen aufklappen' : 'Alle Gruppen zuklappen'}
        aria-label={allCollapsed ? 'Alle Gruppen aufklappen' : 'Alle Gruppen zuklappen'}
        onClick={() => setAllCollapsed(!allCollapsed)}
        disabled={total === 0}
      >
        {allCollapsed ? <ChevronsUpDown size={15} /> : <ChevronsDownUp size={15} />}
      </button>
    </div>
  );

  let body: React.ReactNode;
  if (failed) {
    body = (
      <div className="empty-state ex-empty">
        <SearchX size={28} />
        <b>Die Elementliste konnte nicht angezeigt werden.</b>
        <span>Das Netz enthält vermutlich beschädigte Daten. Die Zeichenfläche funktioniert weiterhin.</span>
      </div>
    );
  } else if (total === 0) {
    body = (
      <div className="empty-state ex-empty" data-testid="explorer-empty">
        <div className="ex-empty-art" aria-hidden>
          <svg width="96" height="44" viewBox="0 0 96 44">
            <circle cx="16" cy="22" r="11" fill="none" stroke="currentColor" strokeWidth="2" />
            <circle cx="16" cy="22" r="3.2" fill="var(--token)" />
            <line x1="29" y1="22" x2="41" y2="22" stroke="currentColor" strokeWidth="2" />
            <polygon points="46,22 39,18 39,26" fill="currentColor" />
            <rect x="48" y="8" width="7" height="28" rx="1.5" fill="currentColor" />
            <line x1="57" y1="22" x2="69" y2="22" stroke="currentColor" strokeWidth="2" />
            <polygon points="74,22 67,18 67,26" fill="currentColor" />
            <circle cx="84" cy="22" r="9" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="3 3" />
          </svg>
        </div>
        <b>Noch leer – leg los!</b>
        <span>
          Wähle das Werkzeug <b>Stelle</b> <Kbd>P</Kbd> oder <b>Transition</b> <Kbd>T</Kbd> und klicke auf die Zeichenfläche. Mit <b>Kante</b> <Kbd>K</Kbd>{' '}
          verbindest du beides.
        </span>
        <span className="ex-empty-sub">Alle Elemente erscheinen dann hier – sortiert und durchsuchbar.</span>
        <Button size="sm" icon={<LayoutGrid size={14} />} onClick={() => runAction('file.start')}>
          Beispiel öffnen
        </Button>
      </div>
    );
  } else if (searching && hits === 0) {
    body = (
      <div className="empty-state ex-empty" data-testid="explorer-noresults">
        <SearchX size={28} />
        <b>Keine Treffer für „{deferredQuery.trim()}“</b>
        <span>Gesucht wird in Namen, Texten und Notizen – Groß-/Kleinschreibung und Umlaute sind egal.</span>
        <Button size="sm" onClick={() => setQuery('')}>
          Suche zurücksetzen
        </Button>
      </div>
    );
  } else {
    const children: React.ReactNode[] = [];
    for (let i = start; i < end; i++) {
      const r = rows[i];
      const top = layout.offsets[i];
      if (r.type === 'group') {
        const meta = metaFor(r.group);
        children.push(<GroupRow key={r.key} row={r} top={top} cursor={i === cursorIndex} meta={meta.text} metaTitle={meta.title} searching={searching} h={handlers} />);
      } else if (r.type === 'hint') {
        children.push(<HintRow key={r.key} group={r.group} top={top} />);
      } else {
        const it = r.item;
        children.push(
          <ItemRow
            key={r.key}
            item={it}
            top={top}
            selected={selSet.has(it.id)}
            cursor={i === cursorIndex}
            tokens={it.kind === 'place' && marking ? marking.get(it.id) : undefined}
            visual={it.kind === 'transition' && visuals ? visuals[it.id] : undefined}
            renameDraft={renaming?.id === it.id ? renaming.draft : null}
            terms={terms}
            p={p}
            mode={mode}
            h={handlers}
          />,
        );
      }
    }
    const stickyMeta = sticky ? metaFor(sticky.row.group) : null;
    body = (
      <div
        ref={attachScroll}
        className={`ex-scroll${kbdNav ? ' kbd-nav' : ''}`}
        tabIndex={0}
        role="tree"
        aria-label="Elemente des Netzes"
        aria-multiselectable
        data-testid="explorer-list"
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        onKeyDown={onListKey}
        onMouseDown={() => setKbdNav(false)}
        onFocus={(e) => {
          if (e.target === e.currentTarget && cursorIndex < 0 && selection.length && keyIndex.has(selection[0])) setCursorKey(selection[0]);
        }}
      >
        {sticky && stickyMeta && (
          <div className="ex-sticky" style={{ transform: `translateY(${sticky.shift}px)` }}>
            <GroupRow row={sticky.row} top={0} cursor={false} meta={stickyMeta.text} metaTitle={stickyMeta.title} searching={searching} h={handlers} sticky />
          </div>
        )}
        <div className="ex-canvas" style={{ height: layout.total }}>
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className="ex-tree" data-testid="explorer-tree">
      {searchBar}
      {searching && hits > 0 && (
        <div className="ex-resultbar" aria-live="polite">
          <span>
            <b>{fmtCount(hits)}</b> Treffer
          </span>
          <button type="button" className="ex-link" onClick={() => setQuery('')}>
            Zurücksetzen
          </button>
        </div>
      )}
      {body}
      {total > 0 && (
        <div className="ex-footer">
          {selection.length > 0 ? (
            <>
              <span>
                <b>{fmtCount(selection.length)}</b> ausgewählt
              </span>
              <span className="grow" />
              <button type="button" className="ex-link" onClick={() => runAction('edit.deselect')}>
                Auswahl aufheben
              </button>
            </>
          ) : (
            <span className="muted">
              {fmtCount(total)} Element{total === 1 ? '' : 'e'}
              {mode === 'sim' ? ' · Marken = aktueller Stand' : ''}
            </span>
          )}
        </div>
      )}
    </div>
  );
});
