/**
 * Reiter „Prüfung“: kurzer Strukturüberblick (Größe, Netzklasse, Konflikte)
 * und die Liste aller gefundenen Probleme – jeweils anklickbar.
 */
import {
  ChevronRight,
  CircleAlert,
  CircleCheckBig,
  FlaskConical,
  GitFork,
  Info,
  Lightbulb,
  LocateFixed,
  OctagonAlert,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import { memo, useMemo, useRef, useState } from 'react';
import { analyzeStructure, type StructureInfo } from '../../analysis/analyze';
import type { Issue } from '../../analysis/validate';
import { runAction } from '../../app/actions';
import { Button, Kbd } from '../../components/ui';
import { paletteFor } from '../../editor/palette';
import type { Id, NetDoc } from '../../model/types';
import { activeTab, centerOn, setSelection, setUi, toast, useApp } from '../../store/appStore';
import { useSim } from '../../store/simStore';
import { compileNet, type CompiledNet } from '../../sim/engine';
import { ArcGlyph, PlaceGlyph, TransitionGlyph } from './icons';

type Level = Issue['level'];

const LEVELS: { level: Level; title: string; icon: LucideIcon; cls: string; hint: string }[] = [
  { level: 'error', title: 'Fehler', icon: OctagonAlert, cls: 'danger', hint: 'Sollten behoben werden – das Netz verhält sich sonst nicht wie erwartet.' },
  { level: 'warning', title: 'Warnungen', icon: TriangleAlert, cls: 'warning', hint: 'Wahrscheinlich ein Versehen – bitte kurz prüfen.' },
  { level: 'info', title: 'Hinweise', icon: Info, cls: 'info', hint: 'Kein Fehler, aber gut zu wissen.' },
];

interface ClassInfo {
  key: string;
  label: string;
  value: boolean;
  yes: string;
  no: string;
}

function classesOf(s: StructureInfo): ClassInfo[] {
  return [
    {
      key: 'sm',
      label: 'Zustandsmaschine',
      value: s.stateMachine,
      yes: 'Jede Transition hat genau eine Eingangs- und eine Ausgangsstelle. Marken wandern wie „Zustände“ durch das Netz – es gibt keine Synchronisation.',
      no: 'Keine Zustandsmaschine: Mindestens eine Transition hat mehrere (oder keine) Eingangs- bzw. Ausgangsstellen oder ein Kantengewicht ≠ 1.',
    },
    {
      key: 'mg',
      label: 'Synchronisationsgraph',
      value: s.markedGraph,
      yes: 'Jede Stelle hat genau eine Eingangs- und eine Ausgangstransition. Es gibt keine Konflikte – nur Nebenläufigkeit und Synchronisation.',
      no: 'Kein Synchronisationsgraph: Mindestens eine Stelle hat mehrere (oder keine) vor- bzw. nachgelagerte Transitionen.',
    },
    {
      key: 'fc',
      label: 'Free-Choice',
      value: s.freeChoice,
      yes: 'Konkurrieren Transitionen um eine Stelle, haben sie genau dieselben Eingangsstellen. Jede Entscheidung ist damit „frei“ und hängt nicht von anderen Stellen ab.',
      no: 'Nicht Free-Choice: Zwei Transitionen teilen sich eine Eingangsstelle, haben aber unterschiedliche weitere Eingänge. Konflikte und Synchronisation sind verflochten.',
    },
    {
      key: 'pure',
      label: 'schlingenfrei',
      value: s.pure,
      yes: 'Keine Transition hat dieselbe Stelle zugleich als Eingang und als Ausgang. Das Netz ist dann vollständig durch seine Inzidenzmatrix beschrieben.',
      no: 'Nicht schlingenfrei: Mindestens eine Transition nimmt aus einer Stelle und legt auch wieder hinein (Selbstschleife).',
    },
    {
      key: 'ord',
      label: 'gewöhnlich',
      value: s.ordinary,
      yes: 'Alle Kantengewichte sind 1.',
      no: 'Nicht gewöhnlich: Mindestens eine Kante hat ein Gewicht größer als 1.',
    },
  ];
}

interface Counts {
  places: number;
  transitions: number;
  arcs: number;
  drawings: number;
  tokens: number;
}

function countDoc(doc: NetDoc | null): Counts {
  const c: Counts = { places: 0, transitions: 0, arcs: 0, drawings: 0, tokens: 0 };
  if (!doc || !Array.isArray(doc.order)) return c;
  for (const id of doc.order) {
    const el = doc.elements?.[id];
    if (!el) continue;
    if (el.type === 'place') {
      c.places++;
      const t = Number(el.tokens);
      if (Number.isFinite(t) && t > 0) c.tokens += Math.floor(t);
    } else if (el.type === 'transition') c.transitions++;
    else if (el.type === 'arc') c.arcs++;
    else c.drawings++;
  }
  return c;
}

const fmt = (n: number) => (Number.isFinite(n) ? n.toLocaleString('de-DE') : '∞');

function existing(doc: NetDoc | null, ids: readonly Id[]): Id[] {
  if (!doc) return [];
  return ids.filter((id) => !!doc.elements[id]);
}

/** Auswählen und hinzeigen. */
function reveal(doc: NetDoc | null, ids: readonly Id[]) {
  const ok = existing(doc, ids);
  if (!ok.length) {
    if (ids.length) toast('info', 'Element nicht mehr vorhanden', 'Es wurde inzwischen gelöscht – die Prüfung aktualisiert sich gleich.');
    return;
  }
  setSelection(ok);
  centerOn(ok);
}

// ───────────────────────────── Bausteine ─────────────────────────────

function StatTile({ label, value, sub, icon, title }: { label: string; value: string; sub?: string; icon: React.ReactNode; title?: string }) {
  return (
    <div className="ex-stat" title={title}>
      <div className="ex-stat-top">
        <span className="ex-stat-icon">{icon}</span>
        <span className="ex-stat-value">{value}</span>
      </div>
      <div className="ex-stat-label">
        {label}
        {sub && <span className="ex-stat-sub"> · {sub}</span>}
      </div>
    </div>
  );
}

function useHover() {
  const active = useRef(false);
  return useMemo(
    () => ({
      enter: (ids: readonly Id[]) => {
        active.current = true;
        setUi({ highlight: [...ids] });
      },
      leave: () => {
        if (!active.current) return;
        active.current = false;
        setUi({ highlight: [] });
      },
    }),
    [],
  );
}

// ───────────────────────────── Hauptkomponente ─────────────────────────────

export const IssuesView = memo(function IssuesView({ issues, checkedDoc, pending }: { issues: Issue[] | null; checkedDoc: NetDoc | null; pending: boolean }) {
  const doc = useApp((s) => activeTab(s)?.doc ?? null);
  const tabId = useApp((s) => s.activeId);
  const mode = useApp((s) => activeTab(s)?.mode ?? 'edit');
  const theme = useApp((s) => s.ui.theme);
  const p = paletteFor(theme);
  const currentTokens = useSim((s) => {
    if (mode !== 'sim' || !tabId) return null;
    const d = s.sessions[tabId]?.display;
    if (!d) return null;
    let sum = 0;
    for (const v of d) if (Number.isFinite(v) && v > 0) sum += Math.round(v);
    return sum;
  });
  const hover = useHover();
  const [openClass, setOpenClass] = useState<string | null>(null);
  const [showAllConflicts, setShowAllConflicts] = useState(false);

  const counts = useMemo(() => countDoc(doc), [doc]);

  const structure = useMemo((): { net: CompiledNet; info: StructureInfo } | null => {
    if (!checkedDoc) return null;
    try {
      const net = compileNet(checkedDoc);
      return { net, info: analyzeStructure(net) };
    } catch (err) {
      console.error('Strukturanalyse fehlgeschlagen', err);
      return null;
    }
  }, [checkedDoc]);

  const grouped = useMemo(() => {
    const g: Record<Level, Issue[]> = { error: [], warning: [], info: [] };
    for (const i of issues ?? []) (g[i.level] ?? g.info).push(i);
    return g;
  }, [issues]);

  const classes = useMemo(() => (structure ? classesOf(structure.info) : []), [structure]);
  const netEmpty = counts.places + counts.transitions === 0;

  const conflicts = useMemo(() => {
    if (!structure) return [];
    const { net, info } = structure;
    return info.conflicts.map((c) => {
      const placeId = net.placeIds[c.place];
      const tIds = c.transitions.map((t) => net.transitions[t]?.id).filter((x): x is string => !!x);
      const tNames = c.transitions.map((t) => net.transitions[t]?.name || '(ohne Namen)');
      return { key: `${placeId}`, placeName: net.placeNames[c.place] || '(ohne Namen)', ids: [placeId, ...tIds], tNames };
    });
  }, [structure]);

  const extras = useMemo(() => {
    if (!structure) return [];
    const s = structure.info;
    const list: { label: string; title: string }[] = [];
    if (s.timed) list.push({ label: 'zeitbehaftet', title: 'Mindestens eine Transition hat eine Verzögerung (deterministisch, exponentiell oder gleichverteilt).' });
    if (s.hasCapacities) list.push({ label: 'Kapazitäten', title: 'Mindestens eine Stelle hat eine begrenzte Kapazität.' });
    if (s.hasTestArcs) list.push({ label: 'Testkanten', title: 'Testkanten prüfen nur, ob genug Marken da sind – sie verbrauchen keine.' });
    if (s.hasInhibitorArcs) list.push({ label: 'Inhibitorkanten', title: 'Inhibitorkanten verbieten das Schalten, solange die Stelle (genügend) Marken enthält.' });
    if (s.sources.length) list.push({ label: `${s.sources.length} Quelle${s.sources.length > 1 ? 'n' : ''}`, title: 'Transitionen ohne Eingang – sie sind immer aktiviert und erzeugen ständig Marken.' });
    if (s.sinks.length) list.push({ label: `${s.sinks.length} Senke${s.sinks.length > 1 ? 'n' : ''}`, title: 'Transitionen ohne Ausgang – Marken verschwinden beim Schalten.' });
    return list;
  }, [structure]);

  if (!doc) {
    return (
      <div className="empty-state ex-empty">
        <CircleAlert size={28} />
        <b>Kein Netz geöffnet</b>
      </div>
    );
  }

  const problems = grouped.error.length + grouped.warning.length;
  const realIssues = (issues ?? []).filter((i) => !(netEmpty && i.ids.length === 0 && i.level === 'info'));
  const shownConflicts = showAllConflicts ? conflicts : conflicts.slice(0, 5);
  const openInfo = classes.find((c) => c.key === openClass) ?? null;

  return (
    <div className="ex-issues" data-testid="issues-view" onMouseLeave={hover.leave}>
      {/* ── Überblick */}
      <div className="panel-section ex-section">
        <div className="section-title">
          <span className="grow">Überblick</span>
          {pending && <span className="ex-pending">wird aktualisiert …</span>}
        </div>
        <div className="ex-stats">
          <StatTile label="Stellen" value={fmt(counts.places)} icon={<PlaceGlyph p={p} color={null} marked={false} size={18} />} />
          <StatTile label="Transitionen" value={fmt(counts.transitions)} icon={<TransitionGlyph p={p} color={null} timing="immediate" size={18} />} />
          <StatTile label="Kanten" value={fmt(counts.arcs)} icon={<ArcGlyph p={p} kind="normal" color={null} size={18} />} />
          <StatTile
            label="Marken"
            value={fmt(currentTokens ?? counts.tokens)}
            sub={currentTokens !== null ? `Start ${fmt(counts.tokens)}` : undefined}
            title={currentTokens !== null ? 'Marken insgesamt im aktuellen Simulationszustand (Start = Anfangsmarkierung)' : 'Marken insgesamt in der Anfangsmarkierung'}
            icon={
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
                <circle cx="9" cy="9" r="5" fill={p.token} />
                <circle cx="9" cy="9" r="7.5" fill="none" stroke={p.token} strokeOpacity="0.35" strokeWidth="1.5" />
              </svg>
            }
          />
        </div>
      </div>

      {/* ── Netzklasse */}
      <div className="panel-section ex-section">
        <div className="section-title">
          <span className="grow">Netzklasse</span>
        </div>
        {netEmpty ? (
          <div className="muted ex-small">Sobald dein Netz Stellen und Transitionen hat, siehst du hier, zu welcher Klasse es gehört.</div>
        ) : !structure ? (
          <div className="callout warning ex-small">
            <TriangleAlert size={15} />
            <span>Die Struktur konnte nicht bestimmt werden. Prüfe die Liste unten auf fehlerhafte Kanten.</span>
          </div>
        ) : (
          <>
            <div className="ex-classes" role="list">
              {classes.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  role="listitem"
                  className={`ex-class ${c.value ? 'yes' : 'no'}${openClass === c.key ? ' open' : ''}`}
                  title={c.value ? c.yes : c.no}
                  aria-pressed={openClass === c.key}
                  onClick={() => setOpenClass((k) => (k === c.key ? null : c.key))}
                  data-testid={`class-${c.key}`}
                >
                  <span className="ex-class-mark" aria-hidden>
                    {c.value ? '✓' : '✕'}
                  </span>
                  {c.label}
                </button>
              ))}
            </div>
            {openInfo ? (
              <div className={`ex-class-info ${openInfo.value ? 'yes' : 'no'}`}>
                <b>{openInfo.label}:</b> {openInfo.value ? openInfo.yes : openInfo.no}
              </div>
            ) : (
              <div className="faint ex-small">
                <Lightbulb size={12} className="ex-inline-icon" /> Tippe auf eine Klasse, um sie erklärt zu bekommen.
              </div>
            )}
            {extras.length > 0 && (
              <div className="ex-extras">
                {extras.map((x) => (
                  <span key={x.label} className="badge" title={x.title}>
                    {x.label}
                  </span>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Konflikte */}
      {!netEmpty && structure && (
        <div className="panel-section ex-section">
          <div className="section-title">
            <GitFork size={13} />
            <span className="grow">Strukturelle Konflikte</span>
            <span className={`badge ${conflicts.length ? 'warning' : 'success'}`} data-testid="conflict-count">
              {fmt(conflicts.length)}
            </span>
          </div>
          {conflicts.length === 0 ? (
            <div className="muted ex-small">Keine Stelle versorgt mehrere Transitionen – es kann nie zu einem Wettstreit um Marken kommen.</div>
          ) : (
            <>
              <div className="muted ex-small">Diese Stellen versorgen mehrere Transitionen. Sind nicht genug Marken für alle da, muss eine gewinnen.</div>
              <div className="ex-conflicts">
                {shownConflicts.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    className="ex-conflict"
                    onClick={() => reveal(doc, c.ids)}
                    onMouseEnter={() => hover.enter(c.ids)}
                    onMouseLeave={hover.leave}
                    title="Klick: im Netz zeigen"
                  >
                    <PlaceGlyph p={p} color={null} marked={false} size={14} />
                    <span className="ex-conflict-place">{c.placeName}</span>
                    <span className="ex-conflict-arrow" aria-hidden>
                      →
                    </span>
                    <span className="ex-conflict-ts">{c.tNames.join(', ')}</span>
                    <LocateFixed size={13} className="ex-row-go" aria-hidden />
                  </button>
                ))}
              </div>
              {conflicts.length > 5 && (
                <button type="button" className="ex-link" onClick={() => setShowAllConflicts((v) => !v)}>
                  {showAllConflicts ? 'Weniger anzeigen' : `Alle ${conflicts.length} anzeigen`}
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Prüfergebnis */}
      <div className="panel-section ex-section ex-results">
        <div className="section-title">
          <span className="grow">Prüfergebnis</span>
          {problems > 0 && <span className={`badge ${grouped.error.length ? 'danger' : 'warning'}`}>{fmt(problems)}</span>}
        </div>
        {issues === null ? (
          <div className="callout warning ex-small" role="alert">
            <TriangleAlert size={15} />
            <span>Die Prüfung konnte nicht durchgeführt werden. Das Netz enthält vermutlich beschädigte Daten.</span>
          </div>
        ) : realIssues.length === 0 ? (
          netEmpty ? (
            <div className="empty-state ex-ok neutral" data-testid="issues-empty-net">
              <Info size={26} />
              <b>Das Netz ist noch leer</b>
              <span>
                Lege Stellen <Kbd>P</Kbd> und Transitionen <Kbd>T</Kbd> an und verbinde sie mit Kanten <Kbd>K</Kbd>. Die Prüfung läuft automatisch mit.
              </span>
            </div>
          ) : (
            <div className="empty-state ex-ok" data-testid="issues-ok">
              <div className="ex-ok-icon">
                <CircleCheckBig size={30} />
              </div>
              <b>Keine Probleme gefunden ✓</b>
              <span>Dein Netz ist formal in Ordnung. Ob es sich auch richtig verhält (Verklemmungen, Lebendigkeit …), zeigt dir die Analyse.</span>
            </div>
          )
        ) : (
          <>
            {problems === 0 && (
              <div className="callout success ex-small" data-testid="issues-no-problems">
                <CircleCheckBig size={15} color="var(--success)" />
                <span>
                  <b>Keine Fehler oder Warnungen ✓</b> – nur ein paar Hinweise.
                </span>
              </div>
            )}
            {LEVELS.map(({ level, title, icon: Icon, cls, hint }) => {
              const list = grouped[level];
              if (!list.length) return null;
              return (
                <div key={level} className={`ex-level ${cls}`} data-testid={`issues-${level}`}>
                  <div className="ex-level-head" title={hint}>
                    <Icon size={14} />
                    <span className="grow">{title}</span>
                    <span className={`badge ${cls === 'info' ? 'accent' : cls}`}>{fmt(list.length)}</span>
                  </div>
                  <div className="ex-issue-list">
                    {list.map((issue, i) => {
                      const clickable = issue.ids.length > 0;
                      return (
                        <button
                          key={`${level}-${i}-${issue.message}`}
                          type="button"
                          className={`ex-issue ${cls}${clickable ? '' : ' static'}`}
                          disabled={!clickable}
                          onClick={() => clickable && reveal(doc, issue.ids)}
                          onMouseEnter={() => clickable && hover.enter(issue.ids)}
                          onMouseLeave={hover.leave}
                          title={clickable ? `Klick: ${issue.ids.length > 1 ? `die ${issue.ids.length} betroffenen Elemente` : 'das betroffene Element'} auswählen und zeigen` : undefined}
                        >
                          <Icon size={14} className="ex-issue-icon" aria-hidden />
                          <span className="ex-issue-msg">{issue.message}</span>
                          {clickable && (
                            <span className="ex-issue-go">
                              {issue.ids.length > 1 && <span className="ex-issue-n">{issue.ids.length}</span>}
                              <ChevronRight size={14} aria-hidden />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      {mode !== 'analysis' && !netEmpty && (
        <div className="panel-section ex-section ex-cta">
          <div className="muted ex-small">Beschränktheit, Lebendigkeit, Verklemmungen und Invarianten untersuchst du im Analysemodus.</div>
          <Button size="sm" icon={<FlaskConical size={14} />} onClick={() => runAction('mode.analysis')}>
            Netz analysieren <Kbd>F6</Kbd>
          </Button>
        </div>
      )}
    </div>
  );
});
