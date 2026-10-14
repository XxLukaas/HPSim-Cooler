/**
 * Eigenschaften einer Stelle im Bearbeiten-Modus.
 */
import { Circle, Copy, Crosshair, Palette as PaletteIcon, StickyNote, Trash2 } from 'lucide-react';
import { useMemo } from 'react';
import { runAction } from '../../app/actions';
import { Button, ColorInput, Field, IconButton, NumberInput, Section, TextInput, Toggle } from '../../components/ui';
import { PlaceView } from '../../editor/NetRender';
import type { Palette } from '../../editor/palette';
import { PLACE_SIZES } from '../../model/defaults';
import type { NetDoc, PlaceEl } from '../../model/types';
import { coalescedEdit, editEl, selectAndShow } from './edit';
import { MAX_TOKENS } from './model';
import { ChoiceGroup, ConnectionsSection, Help, Hero, NameField, Note } from './widgets';

/** Vorschau einer Stelle mit der echten Darstellung der Zeichenfläche. */
export function PlacePreview({ el, p, tokens }: { el: PlaceEl; p: Palette; tokens: number }) {
  const shown = useMemo<PlaceEl>(() => ({ ...el, showName: false, showCapacity: false }), [el]);
  const r = Number.isFinite(el.r) && el.r > 0 ? el.r : 18;
  const s = r + 7;
  return (
    <svg width={46} height={46} viewBox={`${el.x - s} ${el.y - s} ${2 * s} ${2 * s}`} aria-hidden="true">
      <PlaceView el={shown} p={p} tokens={Math.max(0, tokens)} selected={false} highlighted={false} />
    </svg>
  );
}

function SizeDot({ r }: { r: number }) {
  const min = PLACE_SIZES[0].r;
  const max = PLACE_SIZES[PLACE_SIZES.length - 1].r;
  const gr = 3 + ((r - min) / (max - min)) * 6;
  return (
    <svg width={22} height={22} viewBox="0 0 22 22" aria-hidden="true">
      <circle cx={11} cy={11} r={gr} fill="none" stroke="currentColor" strokeWidth={1.6} />
    </svg>
  );
}

export function placeSub(el: PlaceEl, tokens = el.tokens): string {
  const t = tokens === 1 ? '1 Marke' : `${tokens.toLocaleString('de-DE')} Marken`;
  return `${t} · ${el.capacity > 0 ? `Kapazität ${el.capacity.toLocaleString('de-DE')}` : 'unbegrenzt'}`;
}

export function NodeActions({ id, edit }: { id: string; edit: boolean }) {
  return (
    <>
      <IconButton small icon={<Crosshair size={15} />} title="Im Netz zeigen" onClick={() => selectAndShow([id])} testId="prop-show" />
      {edit && <IconButton small icon={<Copy size={15} />} title="Duplizieren (Strg+D)" onClick={() => runAction('edit.duplicate')} testId="prop-duplicate" />}
      {edit && <IconButton small icon={<Trash2 size={15} />} title="Löschen (Entf)" onClick={() => runAction('edit.delete')} className="pp-danger-btn" testId="prop-delete" />}
    </>
  );
}

export function PlaceProps({ el, doc, p }: { el: PlaceEl; doc: NetDoc; p: Palette }) {
  const id = el.id;
  const limited = el.capacity > 0;
  const over = limited && el.tokens > el.capacity;
  const sizeValue = PLACE_SIZES.find((s) => s.r === el.r)?.r;
  return (
    <>
      <div className="panel-section">
        <Hero
          tint={el.color || 'var(--accent)'}
          visual={<PlacePreview el={el} p={p} tokens={el.tokens} />}
          kicker="Stelle"
          title={el.name || '(ohne Namen)'}
          sub={placeSub(el)}
          actions={<NodeActions id={id} edit />}
          testId="prop-hero"
        />
      </div>

      <Section title="Allgemein" icon={<Circle size={13} />}>
        <NameField id={id} type="place" name={el.name} doc={doc} />
        <Field label="Anfangsmarken" hint="Wie viele Marken zu Beginn der Simulation in der Stelle liegen">
          <NumberInput
            value={el.tokens}
            min={0}
            max={MAX_TOKENS}
            integer
            testId="prop-tokens"
            onCommit={(v) => editEl(id, 'place', (e) => void (e.tokens = v))}
          />
        </Field>
        <Field label="Kapazität" hint="Höchstzahl an Marken in dieser Stelle">
          <div className="pp-inline">
            <Toggle
              checked={limited}
              label="begrenzt"
              testId="prop-capacity-limited"
              onChange={(on) => editEl(id, 'place', (e) => void (e.capacity = on ? Math.max(1, e.tokens, e.capacity) : 0))}
            />
          </div>
        </Field>
        {limited ? (
          <Field label="Höchstens">
            <NumberInput
              value={el.capacity}
              min={1}
              max={MAX_TOKENS}
              integer
              unit="Marken"
              testId="prop-capacity"
              onCommit={(v) => editEl(id, 'place', (e) => void (e.capacity = v))}
            />
          </Field>
        ) : (
          <Help>Unbegrenzt: Die Stelle kann beliebig viele Marken aufnehmen.</Help>
        )}
        {over && (
          <Note
            tone="danger"
            action={
              <div className="row">
                <Button size="sm" onClick={() => editEl(id, 'place', (e) => void (e.capacity = e.tokens))}>
                  Kapazität auf {el.tokens.toLocaleString('de-DE')} setzen
                </Button>
                <Button size="sm" variant="ghost" onClick={() => editEl(id, 'place', (e) => void (e.tokens = e.capacity))}>
                  Marken verringern
                </Button>
              </div>
            }
          >
            Die Stelle enthält mehr Marken ({el.tokens.toLocaleString('de-DE')}) als ihre Kapazität ({el.capacity.toLocaleString('de-DE')}) erlaubt.
          </Note>
        )}
        {limited && !over && (
          <Help>
            Eine Transition, die hier Marken ablegen würde, kann nicht schalten, sobald die Stelle voll ist (Regel in den Netz-Einstellungen).
          </Help>
        )}
      </Section>

      <Section title="Darstellung" icon={<PaletteIcon size={13} />}>
        <Field label="Größe" stack>
          <ChoiceGroup
            value={sizeValue !== undefined ? String(sizeValue) : null}
            ariaLabel="Größe"
            options={PLACE_SIZES.map((s) => ({ value: String(s.r), icon: <SizeDot r={s.r} />, title: `${s.label} (Radius ${s.r} px)` }))}
            onChange={(v) => {
              const r = Number(v);
              if (Number.isFinite(r)) editEl(id, 'place', (e) => void (e.r = r));
            }}
          />
        </Field>
        <Field label="Radius genau">
          <NumberInput value={el.r} min={6} max={200} integer unit="px" testId="prop-radius" onCommit={(v) => editEl(id, 'place', (e) => void (e.r = v))} />
        </Field>
        <div className="pp-toggles">
          <Toggle checked={el.showName} label="Name anzeigen" testId="prop-show-name" onChange={(v) => editEl(id, 'place', (e) => void (e.showName = v))} />
          <Toggle
            checked={el.showCapacity}
            label={limited ? 'Kapazität anzeigen (K = …)' : 'Kapazität anzeigen (nur wenn begrenzt)'}
            testId="prop-show-capacity"
            onChange={(v) => editEl(id, 'place', (e) => void (e.showCapacity = v))}
          />
        </div>
        <Field label="Farbe">
          <ColorInput value={el.color} onChange={(v) => coalescedEdit(`${id}:color`, (d) => {
            const e = d.elements[id];
            if (e?.type === 'place') e.color = v;
          })} />
        </Field>
      </Section>

      <ConnectionsSection doc={doc} nodeId={id} nodeType="place" p={p} />

      <Section title="Notiz" icon={<StickyNote size={13} />}>
        <TextInput
          multiline
          value={el.note}
          maxLength={10000}
          placeholder="Eigene Anmerkungen zu dieser Stelle (Strg+Enter übernimmt)"
          testId="prop-note"
          onCommit={(v) => editEl(id, 'place', (e) => void (e.note = v))}
        />
      </Section>
    </>
  );
}
