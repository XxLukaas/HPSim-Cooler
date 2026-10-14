/**
 * Eigenschaften des Dokuments (keine Auswahl im Bearbeiten-Modus):
 * Titel, Beschreibung, Autor, Kennzahlen, Simulationseinstellungen, Legende.
 */
import { Circle, FileText, Hash, Lightbulb, MousePointerClick, RectangleVertical, Settings, Shapes, Spline, Timer } from 'lucide-react';
import { useMemo } from 'react';
import { runAction } from '../../app/actions';
import { Button, Field, Section, TextInput } from '../../components/ui';
import type { Palette } from '../../editor/palette';
import type { ElementType, NetDoc } from '../../model/types';
import { formatNumber } from '../../sim/engine';
import { setSelection } from '../../store/appStore';
import { editDoc } from './edit';
import { Legend } from './Legend';
import { docStats } from './model';
import { Help, Hero, KV, Stat } from './widgets';

const CONFLICT_LABEL: Record<string, string> = {
  random: 'Zufall',
  priority: 'Priorität',
  classic: 'Klassisch (HPSim)',
};

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return '';
  }
}

function selectType(doc: NetDoc, type: ElementType | 'decor') {
  const ids = doc.order.filter((id) => {
    const t = doc.elements[id]?.type;
    if (!t) return false;
    return type === 'decor' ? t === 'rect' || t === 'line' || t === 'poly' || t === 'text' : t === type;
  });
  if (ids.length) setSelection(ids);
}

function DocGlyph() {
  return (
    <svg width={40} height={40} viewBox="0 0 40 40" aria-hidden="true">
      <circle cx={11} cy={20} r={7} fill="none" stroke="var(--accent)" strokeWidth={2} />
      <circle cx={11} cy={20} r={2.2} fill="var(--token)" />
      <line x1={18} y1={20} x2={25} y2={20} stroke="var(--muted)" strokeWidth={1.6} />
      <polygon points="27,20 23.5,18 23.5,22" fill="var(--muted)" />
      <rect x={28} y={11} width={5} height={18} rx={1.5} fill="var(--text)" />
    </svg>
  );
}

export function DocumentProps({ doc, p }: { doc: NetDoc; p: Palette }) {
  const stats = useMemo(() => docStats(doc), [doc]);
  const sim = doc.settings.sim;
  const empty = doc.order.length === 0;
  const modified = formatDate(doc.meta.modified);
  return (
    <>
      <div className="panel-section">
        <Hero
          tint="var(--accent)"
          visual={<DocGlyph />}
          kicker="Netz"
          title={doc.meta.title || 'Unbenanntes Netz'}
          sub={modified ? `Zuletzt geändert: ${modified}` : 'Noch nicht gespeichert'}
          testId="prop-hero"
        />
      </div>

      <Section title="Dokument" icon={<FileText size={13} />}>
        <Field label="Titel">
          <TextInput
            value={doc.meta.title}
            maxLength={200}
            placeholder="Titel des Netzes"
            testId="prop-doc-title"
            onCommit={(v) => {
              const t = v.trim() || 'Unbenanntes Netz';
              editDoc((d) => void (d.meta.title = t));
            }}
          />
        </Field>
        <Field label="Autor">
          <TextInput value={doc.meta.author} maxLength={200} placeholder="Dein Name" testId="prop-doc-author" onCommit={(v) => editDoc((d) => void (d.meta.author = v.trim()))} />
        </Field>
        <Field label="Beschreibung" stack>
          <TextInput
            multiline
            value={doc.meta.description}
            maxLength={20000}
            placeholder="Worum geht es in diesem Netz? (Strg+Enter übernimmt)"
            testId="prop-doc-description"
            onCommit={(v) => editDoc((d) => void (d.meta.description = v))}
          />
        </Field>
      </Section>

      <Section title="Überblick" icon={<Hash size={13} />}>
        <div className="pp-stats">
          <Stat
            icon={<Circle size={13} />}
            label="Stellen"
            value={formatNumber(stats.places)}
            tone="accent"
            onClick={stats.places ? () => selectType(doc, 'place') : undefined}
            title="Alle Stellen auswählen"
            testId="prop-stat-places"
          />
          <Stat
            icon={<RectangleVertical size={13} />}
            label="Transitionen"
            value={formatNumber(stats.transitions)}
            tone="violet"
            onClick={stats.transitions ? () => selectType(doc, 'transition') : undefined}
            title="Alle Transitionen auswählen"
            testId="prop-stat-transitions"
          />
          <Stat
            icon={<Spline size={13} />}
            label="Kanten"
            value={formatNumber(stats.arcs)}
            onClick={stats.arcs ? () => selectType(doc, 'arc') : undefined}
            title="Alle Kanten auswählen"
            testId="prop-stat-arcs"
          />
          <Stat
            icon={<span className="pp-token-dot" />}
            label="Marken gesamt"
            value={formatNumber(stats.tokens)}
            tone="token"
            testId="prop-stat-tokens"
            title="Summe der Anfangsmarken aller Stellen"
          />
        </div>
        {(stats.timed > 0 || stats.decor > 0) && (
          <div className="pp-inline-stats">
            {stats.timed > 0 && (
              <span>
                <Timer size={12} /> {formatNumber(stats.timed)} zeitbehaftet
              </span>
            )}
            {stats.decor > 0 && (
              <button type="button" className="pp-link" onClick={() => selectType(doc, 'decor')} title="Alle Zeichenobjekte auswählen">
                <Shapes size={12} /> {formatNumber(stats.decor)} Zeichenobjekt{stats.decor === 1 ? '' : 'e'}
              </button>
            )}
          </div>
        )}
        {stats.places + stats.transitions > 0 && <Help>Tipp: Klicke auf eine Kachel, um alle Elemente dieser Art auszuwählen und gemeinsam zu ändern.</Help>}
      </Section>

      {empty && (
        <Section title="So fängst du an" icon={<Lightbulb size={13} />}>
          <ol className="pp-steps">
            <li>
              Stelle setzen: Werkzeug <kbd>P</kbd> und auf die Fläche klicken.
            </li>
            <li>
              Transition setzen: Werkzeug <kbd>T</kbd> und klicken.
            </li>
            <li>
              Verbinden: Werkzeug <kbd>K</kbd>, von der Stelle zur Transition ziehen.
            </li>
            <li>
              Auswählen mit <kbd>V</kbd> – die Eigenschaften erscheinen hier.
            </li>
          </ol>
        </Section>
      )}

      <Section
        title="Simulation"
        icon={<Settings size={13} />}
        actions={
          <Button size="sm" variant="ghost" icon={<Settings size={13} />} onClick={() => runAction('edit.docSettings')} testId="prop-doc-settings">
            Netz-Einstellungen…
          </Button>
        }
      >
        <KV label="Zeitbasis Δt">
          {formatNumber(sim.timeStep)} {sim.timeUnit}
        </KV>
        <KV label="Konflikte">{CONFLICT_LABEL[sim.conflict] ?? sim.conflict}</KV>
        <KV label="Kapazitätsregel">{sim.capacityRule === 'weak' ? 'schwach' : 'stark'}</KV>
        <KV label="Stopp nach">
          {sim.maxSteps > 0 || sim.maxTime > 0
            ? [sim.maxSteps > 0 ? `${formatNumber(sim.maxSteps)} Schritten` : '', sim.maxTime > 0 ? `${formatNumber(sim.maxTime)} ${sim.timeUnit}` : '']
                .filter(Boolean)
                .join(' oder ')
            : 'kein Limit'}
        </KV>
        <KV label="Zufallsstartwert">{sim.seed === null ? 'zufällig' : formatNumber(sim.seed)}</KV>
      </Section>

      {!empty && (
        <div className="panel-section pp-tip">
          <MousePointerClick size={14} />
          <span>
            Klicke ein Element an, um seine Eigenschaften zu bearbeiten. Mit <kbd>Umschalt</kbd> + Klick wählst du mehrere aus.
          </span>
        </div>
      )}

      <Legend p={p} />
    </>
  );
}
