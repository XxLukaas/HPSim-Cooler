/**
 * Mehrfachauswahl: Zusammenfassung nach Typ und Sammeländerungen
 * (jede Sammeländerung ist genau ein Rückgängig-Schritt).
 */
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  Circle,
  Clock,
  Columns3,
  Group,
  Layers,
  LayoutGrid,
  RectangleVertical,
  Rows3,
  Spline,
  Trash2,
  Ungroup,
} from 'lucide-react';
import { useMemo } from 'react';
import { isEnabled as actionEnabled, runAction } from '../../app/actions';
import { Button, Field, IconButton, Section } from '../../components/ui';
import type { Palette } from '../../editor/palette';
import type { ArcKind, Id, NetDoc, TimingModel } from '../../model/types';
import { setSelection } from '../../store/appStore';
import { editMany } from './edit';
import {
  ARC_KIND_INFO,
  ARC_KIND_ORDER,
  MAX_DELAY,
  MAX_TOKENS,
  MAX_WEIGHT,
  TIMING_INFO,
  TIMING_ORDER,
  TYPE_ORDER,
  clampInt,
  commonValue,
  countLabel,
  groupSelection,
  specialArcAllowed,
} from './model';
import { ArcGlyph, BulkNumber, ChoiceGroup, Help, Hero, MiniNode, TransGlyph } from './widgets';

function MultiGlyph({ p }: { p: Palette }) {
  return (
    <svg width={42} height={42} viewBox="0 0 42 42" aria-hidden="true">
      <circle cx={13} cy={14} r={8} fill={p.placeFill} stroke={p.placeStroke} strokeWidth={1.8} />
      <circle cx={13} cy={14} r={2.2} fill={p.token} />
      <rect x={26} y={6} width={6} height={17} rx={1.5} fill={p.transImmediate} />
      <circle cx={21} cy={31} r={7} fill={p.placeFill} stroke={p.selection} strokeWidth={1.8} strokeDasharray="3 2" />
    </svg>
  );
}

const ALIGN: { id: string; icon: typeof AlignStartVertical; title: string }[] = [
  { id: 'arrange.alignLeft', icon: AlignStartVertical, title: 'Links ausrichten' },
  { id: 'arrange.alignHCenter', icon: AlignCenterVertical, title: 'Horizontal zentrieren' },
  { id: 'arrange.alignRight', icon: AlignEndVertical, title: 'Rechts ausrichten' },
  { id: 'arrange.alignTop', icon: AlignStartHorizontal, title: 'Oben ausrichten' },
  { id: 'arrange.alignVCenter', icon: AlignCenterHorizontal, title: 'Vertikal zentrieren' },
  { id: 'arrange.alignBottom', icon: AlignEndHorizontal, title: 'Unten ausrichten' },
];

export function MultiProps({ ids, doc, p }: { ids: Id[]; doc: NetDoc; p: Palette }) {
  const groups = useMemo(() => groupSelection(doc, ids), [doc, ids]);
  const places = useMemo(() => groups.place.map((id) => doc.elements[id]).filter((e) => e?.type === 'place'), [groups, doc]);
  const transitions = useMemo(() => groups.transition.map((id) => doc.elements[id]).filter((e) => e?.type === 'transition'), [groups, doc]);
  const arcs = useMemo(() => groups.arc.map((id) => doc.elements[id]).filter((e) => e?.type === 'arc'), [groups, doc]);

  const tokens = useMemo(() => places.map((e) => (e.type === 'place' ? e.tokens : 0)), [places]);
  const caps = useMemo(() => places.map((e) => (e.type === 'place' ? e.capacity : 0)), [places]);
  const timings = useMemo(() => transitions.map((e) => (e.type === 'transition' ? e.timing : 'immediate')), [transitions]);
  const timedDelays = useMemo(() => transitions.flatMap((e) => (e.type === 'transition' && e.timing !== 'immediate' ? [e.delay] : [])), [transitions]);
  const weights = useMemo(() => arcs.map((e) => (e.type === 'arc' ? e.weight : 1)), [arcs]);
  const kinds = useMemo(() => arcs.map((e) => (e.type === 'arc' ? e.kind : 'normal')), [arcs]);
  const specialOk = useMemo(() => arcs.filter((e) => e.type === 'arc' && specialArcAllowed(doc, e)).map((e) => e.id), [arcs, doc]);

  const nonArcCount = ids.length - groups.arc.length;
  const groupIds = useMemo(() => new Set(ids.map((id) => doc.elements[id]?.groupId).filter((g): g is string => !!g)), [ids, doc]);
  const commonTiming = commonValue(timings);
  const commonKind = commonValue(kinds);
  const typeSummary = TYPE_ORDER.filter((t) => groups[t].length).map((t) => countLabel(t, groups[t].length));

  const setKind = (k: ArcKind) => {
    const target = k === 'normal' ? groups.arc : specialOk;
    editMany(target, 'arc', (e) => void (e.kind = k));
  };
  const setTiming = (t: TimingModel) =>
    editMany(groups.transition, 'transition', (e) => {
      e.timing = t;
      if (t !== 'immediate' && !(e.delay > 0)) e.delay = 1;
      if (t === 'uniform' && e.delayMax < e.delay) e.delayMax = e.delay * 2 || 2;
    });

  return (
    <>
      <div className="panel-section">
        <Hero
          tint="var(--accent)"
          visual={<MultiGlyph p={p} />}
          kicker={groupIds.size === 1 && nonArcCount > 1 ? 'Gruppe' : 'Mehrfachauswahl'}
          title={`${ids.length.toLocaleString('de-DE')} Elemente`}
          sub={typeSummary.join(' · ')}
          actions={<IconButton small icon={<Trash2 size={15} />} title="Alle löschen (Entf)" onClick={() => runAction('edit.delete')} className="pp-danger-btn" testId="prop-delete" />}
          testId="prop-hero"
        />
        <div className="pp-type-chips" data-testid="prop-multi-types">
          {TYPE_ORDER.filter((t) => groups[t].length).map((t) => (
            <button key={t} type="button" className="pp-type-chip" title={`Nur die ${countLabel(t, groups[t].length)} auswählen`} onClick={() => setSelection(groups[t])}>
              {t === 'place' ? <MiniNode type="place" p={p} /> : t === 'transition' ? <MiniNode type="transition" p={p} /> : t === 'arc' ? <Spline size={12} /> : <LayoutGrid size={12} />}
              {countLabel(t, groups[t].length)}
            </button>
          ))}
        </div>
        <Help>Klicke auf eine Art, um nur diese Elemente auszuwählen. Änderungen unten gelten für alle ausgewählten Elemente dieser Art.</Help>
      </div>

      {places.length > 0 && (
        <Section title={`Stellen (${places.length})`} icon={<Circle size={13} />}>
          <Field label="Anfangsmarken">
            <BulkNumber
              values={tokens}
              min={0}
              max={MAX_TOKENS}
              integer
              testId="prop-bulk-tokens"
              onSet={(v) => editMany(groups.place, 'place', (e) => void (e.tokens = v))}
              onShift={(d) => editMany(groups.place, 'place', (e) => void (e.tokens = clampInt(e.tokens + d, 0, MAX_TOKENS)))}
            />
          </Field>
          <Field label="Kapazität" hint="0 = unbegrenzt">
            <BulkNumber
              values={caps}
              min={0}
              max={MAX_TOKENS}
              integer
              testId="prop-bulk-capacity"
              onSet={(v) => editMany(groups.place, 'place', (e) => void (e.capacity = v))}
              onShift={(d) => editMany(groups.place, 'place', (e) => void (e.capacity = clampInt(e.capacity + d, 0, MAX_TOKENS)))}
            />
          </Field>
          <Help>Kapazität 0 bedeutet unbegrenzt.</Help>
        </Section>
      )}

      {transitions.length > 0 && (
        <Section title={`Transitionen (${transitions.length})`} icon={<RectangleVertical size={13} />}>
          <Field label="Zeitverhalten" stack>
            <ChoiceGroup
              value={commonTiming ?? null}
              columns={2}
              ariaLabel="Zeitverhalten"
              options={TIMING_ORDER.map((t) => ({
                value: t,
                label: TIMING_INFO[t].label,
                icon: <TransGlyph p={p} timing={t} size={22} />,
                title: TIMING_INFO[t].text,
                testId: `prop-bulk-timing-${t}`,
              }))}
              onChange={setTiming}
            />
          </Field>
          {commonTiming === undefined && <Help>Gemischt – ein Klick stellt alle ausgewählten Transitionen um.</Help>}
          {timedDelays.length > 0 && (
            <Field label={commonTiming === 'exponential' ? 'Mittelwert' : commonTiming === 'uniform' ? 'Untergrenze' : 'Verzögerung'}>
              <BulkNumber
                values={timedDelays}
                min={0}
                max={MAX_DELAY}
                unit={doc.settings.sim.timeUnit || 'ZE'}
                testId="prop-bulk-delay"
                onSet={(v) =>
                  editMany(groups.transition, 'transition', (e) => {
                    if (e.timing === 'immediate') return;
                    e.delay = v;
                    if (e.timing === 'uniform' && e.delayMax < v) e.delayMax = v;
                  })
                }
                onShift={(d) =>
                  editMany(groups.transition, 'transition', (e) => {
                    if (e.timing === 'immediate') return;
                    e.delay = Math.max(0, Math.min(MAX_DELAY, e.delay + d));
                    if (e.timing === 'uniform' && e.delayMax < e.delay) e.delayMax = e.delay;
                  })
                }
              />
            </Field>
          )}
          {timedDelays.length > 0 && timedDelays.length < transitions.length && <Help>Die Verzögerung gilt nur für die zeitbehafteten Transitionen der Auswahl.</Help>}
          {timedDelays.length === 0 && (
            <Help>
              <Clock size={11} /> Alle ausgewählten Transitionen schalten sofort – wähle ein Zeitverhalten, um eine Verzögerung einzustellen.
            </Help>
          )}
        </Section>
      )}

      {arcs.length > 0 && (
        <Section title={`Kanten (${arcs.length})`} icon={<Spline size={13} />}>
          <Field label="Gewicht">
            <BulkNumber
              values={weights}
              min={1}
              max={MAX_WEIGHT}
              integer
              testId="prop-bulk-weight"
              onSet={(v) => editMany(groups.arc, 'arc', (e) => void (e.weight = v))}
              onShift={(d) => editMany(groups.arc, 'arc', (e) => void (e.weight = clampInt(e.weight + d, 1, MAX_WEIGHT)))}
            />
          </Field>
          <Field label="Kantentyp" stack>
            <ChoiceGroup
              value={commonKind ?? null}
              ariaLabel="Kantentyp"
              options={ARC_KIND_ORDER.map((k) => ({
                value: k,
                label: ARC_KIND_INFO[k].label,
                icon: <ArcGlyph p={p} kind={k} width={30} height={14} />,
                disabled: k !== 'normal' && specialOk.length === 0,
                title: k !== 'normal' && specialOk.length === 0 ? 'Keine der Kanten führt von einer Stelle zu einer Transition.' : ARC_KIND_INFO[k].text,
                testId: `prop-bulk-kind-${k}`,
              }))}
              onChange={setKind}
            />
          </Field>
          {specialOk.length > 0 && specialOk.length < arcs.length && (
            <Help>
              Test- und Inhibitor gelten nur für {specialOk.length} der {arcs.length} Kanten (von Stelle zu Transition) – die übrigen bleiben normal.
            </Help>
          )}
        </Section>
      )}

      <Section title="Anordnen" icon={<Layers size={13} />}>
        <div className="pp-arrange">
          {ALIGN.map((a) => (
            <IconButton key={a.id} small icon={<a.icon size={15} />} title={a.title} disabled={nonArcCount < 2} onClick={() => runAction(a.id)} testId={`prop-${a.id}`} />
          ))}
          <span className="pp-arrange-sep" />
          <IconButton small icon={<Columns3 size={15} />} title="Horizontal gleichmäßig verteilen (ab 3 Elementen)" disabled={nonArcCount < 3} onClick={() => runAction('arrange.distributeH')} testId="prop-distribute-h" />
          <IconButton small icon={<Rows3 size={15} />} title="Vertikal gleichmäßig verteilen (ab 3 Elementen)" disabled={nonArcCount < 3} onClick={() => runAction('arrange.distributeV')} testId="prop-distribute-v" />
        </div>
        <div className="row pp-wrap">
          <Button size="sm" icon={<Group size={13} />} disabled={nonArcCount < 2 || !actionEnabled('arrange.group')} onClick={() => runAction('arrange.group')} testId="prop-group">
            Gruppieren
          </Button>
          <Button size="sm" icon={<Ungroup size={13} />} disabled={groupIds.size === 0} onClick={() => runAction('arrange.ungroup')} testId="prop-ungroup">
            Gruppe auflösen
          </Button>
          <Button size="sm" variant="danger" icon={<Trash2 size={13} />} onClick={() => runAction('edit.delete')} testId="prop-delete-all">
            Löschen
          </Button>
        </div>
        {nonArcCount < 2 && <Help>Zum Ausrichten mindestens zwei Stellen, Transitionen oder Zeichenobjekte auswählen.</Help>}
        {groupIds.size > 0 && <Help>Gruppierte Elemente werden gemeinsam ausgewählt und verschoben.</Help>}
      </Section>
    </>
  );
}
