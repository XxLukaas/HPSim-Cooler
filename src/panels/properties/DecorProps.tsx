/**
 * Eigenschaften der Zeichenobjekte (Rechteck/Ellipse, Linie, Linienzug, Text).
 * Diese Objekte dienen nur der Gestaltung und haben keinen Einfluss auf die Simulation.
 */
import { AlignCenter, AlignLeft, AlignRight, Bold, Crosshair, Italic, Paintbrush, Shapes, Trash2, Type, Underline } from 'lucide-react';
import type { Draft } from 'immer';
import { runAction } from '../../app/actions';
import { ColorInput, Field, IconButton, NumberInput, Section, Select, TextInput, Toggle } from '../../components/ui';
import type { Palette } from '../../editor/palette';
import type { DashStyle, DecorEl, LineEl, NetDoc, PolyEl, RectEl, TextEl } from '../../model/types';
import { coalescedEdit, editDoc, editEl, selectAndShow } from './edit';
import { elementLabel } from './model';
import { ChoiceGroup, DashGlyph, Help, Hero, RangeField, ShapeGlyph } from './widgets';

const DASHES: { value: DashStyle; title: string }[] = [
  { value: 'solid', title: 'Durchgezogen' },
  { value: 'dashed', title: 'Gestrichelt' },
  { value: 'dotted', title: 'Gepunktet' },
  { value: 'dashdot', title: 'Strich-Punkt' },
];

const FONTS = [
  { value: 'Inter', label: 'Standard (Inter)' },
  { value: 'Georgia', label: 'Serifen (Georgia)' },
  { value: 'JetBrains Mono', label: 'Festbreite (Mono)' },
  { value: 'Comic Sans MS', label: 'Handschrift (Comic)' },
];

type StyledEl = RectEl | LineEl | PolyEl;

/**
 * Ändert ein Zeichenobjekt (Typprüfung über die ID). Mit `live` werden schnelle
 * Folgeänderungen (Farbwähler, Schieberegler) zu einem Rückgängig-Schritt zusammengefasst.
 */
function editAs<E extends DecorEl>(el: E, fn: (e: Draft<E>) => void, live?: string): void {
  const apply = (d: Draft<NetDoc>) => {
    const e = d.elements[el.id];
    if (e && e.type === el.type) fn(e as unknown as Draft<E>);
  };
  if (live) coalescedEdit(`${el.id}:${live}`, apply);
  else editDoc(apply);
}

function DecorGlyph({ el, p }: { el: DecorEl; p: Palette }) {
  const stroke = el.type === 'text' ? el.color || p.text : el.stroke || p.shapeStroke;
  if (el.type === 'text') {
    return (
      <svg width={40} height={40} viewBox="0 0 40 40" aria-hidden="true">
        <text
          x={20}
          y={21}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={22}
          fontWeight={el.bold ? 800 : 500}
          fontStyle={el.italic ? 'italic' : undefined}
          textDecoration={el.underline ? 'underline' : undefined}
          fill={stroke}
        >
          Aa
        </text>
      </svg>
    );
  }
  if (el.type === 'line') {
    return (
      <svg width={40} height={40} viewBox="0 0 40 40" aria-hidden="true">
        <line x1={7} y1={31} x2={33} y2={9} stroke={stroke} strokeWidth={Math.min(5, Math.max(1.5, el.strokeWidth))} strokeLinecap="round" opacity={el.opacity} />
      </svg>
    );
  }
  const fill = el.filled ? el.fill : 'none';
  if (el.type === 'poly') {
    return (
      <svg width={40} height={40} viewBox="0 0 40 40" aria-hidden="true">
        {el.closed ? (
          <polygon points="8,30 14,9 30,12 33,28" fill={fill} fillOpacity={0.45} stroke={stroke} strokeWidth={2} strokeLinejoin="round" opacity={el.opacity} />
        ) : (
          <polyline points="7,30 14,10 25,24 33,9" fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" opacity={el.opacity} />
        )}
      </svg>
    );
  }
  return (
    <svg width={40} height={40} viewBox="0 0 40 40" aria-hidden="true">
      {el.shape === 'ellipse' ? (
        <ellipse cx={20} cy={20} rx={15} ry={11} fill={fill} fillOpacity={0.45} stroke={stroke} strokeWidth={2} opacity={el.opacity} />
      ) : (
        <rect x={6} y={10} width={28} height={20} rx={el.shape === 'roundrect' ? 6 : 0} fill={fill} fillOpacity={0.45} stroke={stroke} strokeWidth={2} opacity={el.opacity} />
      )}
    </svg>
  );
}

/** Gemeinsame Linien-Einstellungen (Farbe, Stärke, Art, Deckkraft). */
function StrokeSection({ el }: { el: StyledEl }) {
  return (
    <Section title="Linie" icon={<Paintbrush size={13} />}>
      <Field label="Farbe">
        {/* '' bedeutet „automatisch passend zum Design“ */}
        <ColorInput value={el.stroke || null} onChange={(v) => editAs(el, (e) => void (e.stroke = v ?? ''), 'stroke')} />
      </Field>
      <Field label="Stärke">
        <NumberInput
          value={el.strokeWidth}
          min={0}
          max={30}
          step={0.5}
          unit="px"
          testId="prop-stroke-width"
          onCommit={(v) => editAs(el, (e) => void (e.strokeWidth = v))}
        />
      </Field>
      <Field label="Linienart" stack>
        <ChoiceGroup
          value={el.dash}
          ariaLabel="Linienart"
          options={DASHES.map((d) => ({ value: d.value, icon: <DashGlyph dash={d.value} />, title: d.title, testId: `prop-dash-${d.value}` }))}
          onChange={(v) => editAs(el, (e) => void (e.dash = v))}
        />
      </Field>
      <Field label="Deckkraft">
        <RangeField
          value={el.opacity}
          min={0.05}
          max={1}
          step={0.05}
          label="Deckkraft"
          testId="prop-opacity"
          format={(v) => `${Math.round(v * 100)} %`}
          onLive={(v) => editAs(el, (e) => void (e.opacity = v), 'opacity')}
        />
      </Field>
      {el.strokeWidth === 0 && <Help>Stärke 0 blendet den Rand aus.</Help>}
    </Section>
  );
}

function FillSection({ el }: { el: RectEl | PolyEl }) {
  const canFill = el.type === 'rect' || el.closed;
  return (
    <Section title="Füllung" icon={<Shapes size={13} />}>
      <div className="pp-toggles">
        <Toggle
          checked={el.filled}
          disabled={!canFill}
          label={canFill ? 'Gefüllt' : 'Gefüllt (nur bei geschlossener Form)'}
          testId="prop-filled"
          onChange={(v) => editAs(el, (e) => void (e.filled = v))}
        />
      </div>
      {el.filled && canFill && (
        <Field label="Füllfarbe">
          <ColorInput allowAuto={false} value={el.fill} onChange={(v) => editAs(el, (e) => void (e.fill = v ?? '#3b82f6'), 'fill')} />
        </Field>
      )}
    </Section>
  );
}

function RectSection({ el }: { el: RectEl }) {
  return (
    <Section title="Form" icon={<Shapes size={13} />}>
      <ChoiceGroup
        value={el.shape}
        ariaLabel="Form"
        options={[
          { value: 'rect', icon: <ShapeGlyph shape="rect" />, label: 'Eckig', testId: 'prop-shape-rect' },
          { value: 'roundrect', icon: <ShapeGlyph shape="roundrect" />, label: 'Rund', testId: 'prop-shape-roundrect' },
          { value: 'ellipse', icon: <ShapeGlyph shape="ellipse" />, label: 'Ellipse', testId: 'prop-shape-ellipse' },
        ]}
        onChange={(v) => editEl(el.id, 'rect', (e) => void (e.shape = v))}
      />
      {el.shape === 'roundrect' && (
        <Field label="Eckenradius">
          <NumberInput value={el.radius} min={0} max={500} integer unit="px" testId="prop-radius" onCommit={(v) => editEl(el.id, 'rect', (e) => void (e.radius = v))} />
        </Field>
      )}
      <Field label="Breite">
        <NumberInput value={Math.round(el.w)} min={2} max={20000} integer unit="px" testId="prop-width" onCommit={(v) => editEl(el.id, 'rect', (e) => void (e.w = v))} />
      </Field>
      <Field label="Höhe">
        <NumberInput value={Math.round(el.h)} min={2} max={20000} integer unit="px" testId="prop-height" onCommit={(v) => editEl(el.id, 'rect', (e) => void (e.h = v))} />
      </Field>
    </Section>
  );
}

function LineSection({ el }: { el: LineEl }) {
  const len = Math.hypot(el.x2 - el.x1, el.y2 - el.y1);
  return (
    <Section title="Pfeilspitzen" icon={<Shapes size={13} />}>
      <div className="pp-toggles">
        <Toggle checked={el.arrowStart} label="Pfeil am Anfang" testId="prop-arrow-start" onChange={(v) => editEl(el.id, 'line', (e) => void (e.arrowStart = v))} />
        <Toggle checked={el.arrowEnd} label="Pfeil am Ende" testId="prop-arrow-end" onChange={(v) => editEl(el.id, 'line', (e) => void (e.arrowEnd = v))} />
      </div>
      <Help>Länge: {Number.isFinite(len) ? Math.round(len).toLocaleString('de-DE') : '–'} px. Die Endpunkte verschiebst du direkt auf der Zeichenfläche.</Help>
    </Section>
  );
}

function PolySection({ el }: { el: PolyEl }) {
  return (
    <Section title="Form" icon={<Shapes size={13} />}>
      <div className="pp-toggles">
        <Toggle checked={el.closed} label="Geschlossen (Polygon)" testId="prop-closed" onChange={(v) => editEl(el.id, 'poly', (e) => void (e.closed = v))} />
      </div>
      <Help>
        {el.points.length.toLocaleString('de-DE')} Eckpunkte. Eckpunkte ziehst du direkt auf der Zeichenfläche; Doppelklick auf einen Eckpunkt entfernt ihn.
      </Help>
    </Section>
  );
}

function TextSections({ el }: { el: TextEl }) {
  const id = el.id;
  return (
    <>
      <Section title="Text" icon={<Type size={13} />}>
        <TextInput multiline value={el.text} maxLength={5000} placeholder="Text (Strg+Enter übernimmt)" testId="prop-text" onCommit={(v) => editEl(id, 'text', (e) => void (e.text = v))} />
        <Field label="Schriftgröße">
          <NumberInput value={el.fontSize} min={6} max={200} integer unit="px" testId="prop-font-size" onCommit={(v) => editEl(id, 'text', (e) => void (e.fontSize = v))} />
        </Field>
        <Field label="Schriftart">
          <Select
            value={FONTS.some((f) => f.value === el.fontFamily) ? el.fontFamily : 'Inter'}
            options={FONTS}
            testId="prop-font-family"
            onChange={(v) => editEl(id, 'text', (e) => void (e.fontFamily = v))}
          />
        </Field>
        <Field label="Stil">
          <div className="pp-icon-row">
            <IconButton small active={el.bold} icon={<Bold size={15} />} title="Fett" onClick={() => editEl(id, 'text', (e) => void (e.bold = !e.bold))} testId="prop-bold" />
            <IconButton small active={el.italic} icon={<Italic size={15} />} title="Kursiv" onClick={() => editEl(id, 'text', (e) => void (e.italic = !e.italic))} testId="prop-italic" />
            <IconButton
              small
              active={el.underline}
              icon={<Underline size={15} />}
              title="Unterstrichen"
              onClick={() => editEl(id, 'text', (e) => void (e.underline = !e.underline))}
              testId="prop-underline"
            />
          </div>
        </Field>
        <Field label="Ausrichtung">
          <ChoiceGroup
            value={el.align}
            compact
            ariaLabel="Ausrichtung"
            options={[
              { value: 'left', icon: <AlignLeft size={15} />, title: 'Linksbündig', testId: 'prop-align-left' },
              { value: 'center', icon: <AlignCenter size={15} />, title: 'Zentriert', testId: 'prop-align-center' },
              { value: 'right', icon: <AlignRight size={15} />, title: 'Rechtsbündig', testId: 'prop-align-right' },
            ]}
            onChange={(v) => editEl(id, 'text', (e) => void (e.align = v))}
          />
        </Field>
      </Section>
      <Section title="Farben" icon={<Paintbrush size={13} />}>
        <Field label="Textfarbe">
          <ColorInput value={el.color || null} onChange={(v) => editAs(el, (e) => void (e.color = v ?? ''), 'color')} />
        </Field>
        <Field label="Hintergrund">
          <ColorInput value={el.background} onChange={(v) => editAs(el, (e) => void (e.background = v), 'background')} />
        </Field>
        <Help>Beim Hintergrund bedeutet „Automatisch“: durchsichtig.</Help>
      </Section>
    </>
  );
}

export function DecorProps({ el, p }: { el: DecorEl; p: Palette }) {
  const label = elementLabel(el);
  const sub =
    el.type === 'text'
      ? `${el.text.split('\n').length} Zeile${el.text.split('\n').length === 1 ? '' : 'n'} · ${el.fontSize} px`
      : el.type === 'rect'
        ? `${Math.round(el.w)} × ${Math.round(el.h)} px`
        : el.type === 'poly'
          ? `${el.points.length} Eckpunkte`
          : 'Gerade Linie';
  const title = el.type === 'text' ? el.text.split('\n')[0]?.trim() || '(leerer Text)' : label;
  return (
    <>
      <div className="panel-section">
        <Hero
          tint="var(--muted)"
          visual={<DecorGlyph el={el} p={p} />}
          kicker={`Zeichenobjekt · ${label}`}
          title={title}
          sub={sub}
          actions={
            <>
              <IconButton small icon={<Crosshair size={15} />} title="Im Netz zeigen" onClick={() => selectAndShow([el.id])} testId="prop-show" />
              <IconButton small icon={<Trash2 size={15} />} title="Löschen (Entf)" onClick={() => runAction('edit.delete')} className="pp-danger-btn" testId="prop-delete" />
            </>
          }
          testId="prop-hero"
        />
        <Help>Zeichenobjekte dienen nur der Gestaltung (Rahmen, Hinweise, Überschriften) und beeinflussen die Simulation nicht.</Help>
      </div>
      {el.type === 'rect' && (
        <>
          <RectSection el={el} />
          <StrokeSection el={el} />
          <FillSection el={el} />
        </>
      )}
      {el.type === 'line' && (
        <>
          <StrokeSection el={el} />
          <LineSection el={el} />
        </>
      )}
      {el.type === 'poly' && (
        <>
          <PolySection el={el} />
          <StrokeSection el={el} />
          <FillSection el={el} />
        </>
      )}
      {el.type === 'text' && <TextSections el={el} />}
    </>
  );
}
