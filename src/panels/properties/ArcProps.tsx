/**
 * Eigenschaften einer Kante im Bearbeiten-Modus.
 */
import { ArrowLeftRight, ArrowRight, Crosshair, Info, Palette as PaletteIcon, Spline, StickyNote, Trash2, Weight } from 'lucide-react';
import { runAction } from '../../app/actions';
import { Button, ColorInput, Field, IconButton, NumberInput, Section, TextInput, Toggle } from '../../components/ui';
import type { Palette } from '../../editor/palette';
import type { ArcEl, NetDoc } from '../../model/types';
import { isNode } from '../../model/types';
import { canConnect } from '../../model/ops';
import { clearOwnHighlight, coalescedEdit, editEl, highlight, selectAndShow } from './edit';
import { ARC_KIND_INFO, ARC_KIND_ORDER, MAX_WEIGHT, arcEffectText, specialArcAllowed } from './model';
import { ArcGlyph, ChoiceGroup, Help, Hero, MiniNode, Note } from './widgets';

/** „Von → Nach“ als anklickbare Knoten. */
export function ArcEnds({ arc, doc, p }: { arc: ArcEl; doc: NetDoc; p: Palette }) {
  const s = doc.elements[arc.source];
  const t = doc.elements[arc.target];
  const end = (node: typeof s, label: string, testId: string) =>
    isNode(node) ? (
      <button
        type="button"
        className="pp-end"
        data-testid={testId}
        title={`„${node.name}“ auswählen`}
        onClick={() => selectAndShow([node.id])}
        onMouseEnter={() => highlight([node.id])}
        onMouseLeave={clearOwnHighlight}
      >
        <span className="pp-end-label">{label}</span>
        <span className="pp-end-name">
          <MiniNode type={node.type} p={p} timing={node.type === 'transition' ? node.timing : undefined} />
          <span>{node.name || '(ohne Namen)'}</span>
        </span>
      </button>
    ) : (
      <span className="pp-end missing">
        <span className="pp-end-label">{label}</span>
        <span className="pp-end-name">fehlt</span>
      </span>
    );
  return (
    <div className="pp-ends">
      {end(s, 'Von', 'prop-arc-from')}
      <ArrowRight size={16} className="pp-ends-arrow" />
      {end(t, 'Nach', 'prop-arc-to')}
    </div>
  );
}

export function arcTitle(arc: ArcEl, doc: NetDoc): string {
  const s = doc.elements[arc.source];
  const t = doc.elements[arc.target];
  const n = (x: typeof s) => (isNode(x) ? x.name || '?' : '?');
  return `${n(s)} → ${n(t)}`;
}

export function ArcProps({ arc, doc, p }: { arc: ArcEl; doc: NetDoc; p: Palette }) {
  const id = arc.id;
  const special = specialArcAllowed(doc, arc);
  const broken = !isNode(doc.elements[arc.source]) || !isNode(doc.elements[arc.target]);
  const canReverse = arc.kind === 'normal' && !broken && canConnect(doc, arc.target, arc.source, arc.id).ok;
  const bends = arc.points.length;
  return (
    <>
      <div className="panel-section">
        <Hero
          tint={arc.kind === 'inhibitor' ? p.arcInhibitor : arc.kind === 'test' ? p.arcTest : 'var(--muted)'}
          visual={<ArcGlyph p={p} kind={arc.kind} width={40} height={20} color={arc.color} />}
          kicker={arc.kind === 'normal' ? 'Kante' : arc.kind === 'test' ? 'Testkante' : 'Inhibitorkante'}
          title={arcTitle(arc, doc)}
          sub={`Gewicht ${arc.weight.toLocaleString('de-DE')}${bends ? ` · ${bends} Knickpunkt${bends === 1 ? '' : 'e'}` : ''}`}
          actions={
            <>
              <IconButton small icon={<Crosshair size={15} />} title="Im Netz zeigen" onClick={() => selectAndShow([id])} testId="prop-show" />
              <IconButton small icon={<Trash2 size={15} />} title="Löschen (Entf)" onClick={() => runAction('edit.delete')} className="pp-danger-btn" testId="prop-delete" />
            </>
          }
          testId="prop-hero"
        />
      </div>

      {broken && (
        <div className="panel-section">
          <Note tone="danger">Diese Kante ist unvollständig – Start oder Ziel fehlt. Am besten löschst du sie.</Note>
        </div>
      )}

      <Section title="Verbindung" icon={<Spline size={13} />}>
        <ArcEnds arc={arc} doc={doc} p={p} />
        <Button
          size="sm"
          variant="ghost"
          icon={<ArrowLeftRight size={13} />}
          disabled={!canReverse}
          title={
            canReverse
              ? 'Kantenrichtung umkehren'
              : arc.kind !== 'normal'
                ? 'Nur normale Kanten können umgekehrt werden'
                : 'Umkehren nicht möglich – es gibt bereits eine Kante in Gegenrichtung'
          }
          onClick={() => runAction('arrange.reverse')}
          testId="prop-arc-reverse"
        >
          Richtung umkehren
        </Button>
      </Section>

      <Section title="Gewicht & Typ" icon={<Weight size={13} />}>
        <Field label="Gewicht" hint="Anzahl der Marken, die diese Kante bewegt bzw. prüft">
          <NumberInput value={arc.weight} min={1} max={MAX_WEIGHT} integer testId="prop-weight" onCommit={(v) => editEl(id, 'arc', (e) => void (e.weight = v))} />
        </Field>
        <Field label="Kantentyp" stack>
          <ChoiceGroup
            value={arc.kind}
            ariaLabel="Kantentyp"
            options={ARC_KIND_ORDER.map((k) => ({
              value: k,
              label: ARC_KIND_INFO[k].label,
              icon: <ArcGlyph p={p} kind={k} width={30} height={14} />,
              disabled: k !== 'normal' && !special,
              title: k !== 'normal' && !special ? 'Test- und Inhibitorkanten müssen von einer Stelle zu einer Transition führen.' : ARC_KIND_INFO[k].text,
              testId: `prop-kind-${k}`,
            }))}
            onChange={(k) => {
              if (k !== 'normal' && !special) return;
              editEl(id, 'arc', (e) => void (e.kind = k));
            }}
          />
        </Field>
        <div className="pp-explain" data-testid="prop-arc-explain">
          <Info size={14} />
          <span>
            {ARC_KIND_INFO[arc.kind].text}
            <br />
            <b>Hier:</b> {arcEffectText(doc, arc)}
          </span>
        </div>
        {!special && !broken && <Help>Diese Kante führt von einer Transition zu einer Stelle – dafür gibt es nur normale Kanten.</Help>}
      </Section>

      <Section title="Darstellung" icon={<PaletteIcon size={13} />}>
        <div className="pp-toggles">
          <Toggle checked={arc.showWeight} label="Gewicht immer anzeigen (auch bei 1)" testId="prop-show-weight" onChange={(v) => editEl(id, 'arc', (e) => void (e.showWeight = v))} />
        </div>
        <Field label="Knickpunkte">
          <div className="row">
            <span className="badge" data-testid="prop-bends">
              {bends}
            </span>
            <Button size="sm" disabled={!bends} icon={<Spline size={13} />} onClick={() => editEl(id, 'arc', (e) => void (e.points = []))} testId="prop-straighten">
              Entfernen
            </Button>
          </div>
        </Field>
        <Help>Doppelklick auf die Kante fügt einen Knickpunkt hinzu, Doppelklick auf einen Knickpunkt entfernt ihn.</Help>
        <Field label="Farbe">
          <ColorInput
            value={arc.color}
            onChange={(v) =>
              coalescedEdit(`${id}:color`, (d) => {
                const e = d.elements[id];
                if (e?.type === 'arc') e.color = v;
              })
            }
          />
        </Field>
      </Section>

      <Section title="Notiz" icon={<StickyNote size={13} />}>
        <TextInput
          multiline
          value={arc.note}
          maxLength={10000}
          placeholder="Eigene Anmerkungen zu dieser Kante (Strg+Enter übernimmt)"
          testId="prop-note"
          onCommit={(v) => editEl(id, 'arc', (e) => void (e.note = v))}
        />
      </Section>
    </>
  );
}

