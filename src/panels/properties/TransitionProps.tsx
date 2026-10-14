/**
 * Eigenschaften einer Transition im Bearbeiten-Modus.
 */
import { ArrowDownUp, Clock, Info, Palette as PaletteIcon, RectangleHorizontal, RectangleVertical, StickyNote, Trophy } from 'lucide-react';
import { useMemo } from 'react';
import { runAction } from '../../app/actions';
import { Button, ColorInput, Field, NumberInput, Section, TextInput, Toggle } from '../../components/ui';
import { TransitionView, delayLabel, type TransVisual } from '../../editor/NetRender';
import type { Palette } from '../../editor/palette';
import { TRANSITION_SIZES } from '../../model/defaults';
import type { NetDoc, TimingModel, TransitionEl } from '../../model/types';
import { formatNumber } from '../../sim/engine';
import { coalescedEdit, editEl } from './edit';
import { MAX_DELAY, TIMING_INFO, TIMING_ORDER } from './model';
import { NodeActions } from './PlaceProps';
import { ChoiceGroup, ConnectionsSection, Help, Hero, NameField, Note, TransGlyph, transitionAccent } from './widgets';

/** Vorschau einer Transition mit der echten Darstellung der Zeichenfläche. */
export function TransitionPreview({ el, p, visual }: { el: TransitionEl; p: Palette; visual?: TransVisual | null }) {
  const shown = useMemo<TransitionEl>(() => ({ ...el, showName: false, showDelay: false }), [el]);
  const w = Number.isFinite(el.w) && el.w > 0 ? el.w : 12;
  const h = Number.isFinite(el.h) && el.h > 0 ? el.h : 36;
  const s = Math.max(w, h) / 2 + 7;
  return (
    <svg width={46} height={46} viewBox={`${el.x - s} ${el.y - s} ${2 * s} ${2 * s}`} aria-hidden="true">
      <TransitionView el={shown} p={p} selected={false} highlighted={false} visual={visual ?? null} />
    </svg>
  );
}

function SizeBar({ w, h }: { w: number; h: number }) {
  const max = TRANSITION_SIZES[TRANSITION_SIZES.length - 1];
  const gh = 6 + (h / max.h) * 12;
  const gw = Math.max(2.5, (w / max.w) * 6);
  return (
    <svg width={22} height={22} viewBox="0 0 22 22" aria-hidden="true">
      <rect x={11 - gw / 2} y={11 - gh / 2} width={gw} height={gh} rx={1} fill="currentColor" />
    </svg>
  );
}

export function timingSub(el: TransitionEl, unit: string): string {
  if (el.timing === 'immediate') return 'Sofort';
  const label = delayLabel(el).replace('⏱ ', '');
  return `${TIMING_INFO[el.timing].label} · ${label} ${unit}`;
}

export function TransitionProps({ el, doc, p }: { el: TransitionEl; doc: NetDoc; p: Palette }) {
  const id = el.id;
  const sim = doc.settings.sim;
  const unit = sim.timeUnit || 'ZE';
  const vertical = el.h >= el.w;
  const long = Math.max(el.w, el.h);
  const short = Math.min(el.w, el.h);
  const sizeMatch = TRANSITION_SIZES.find((s) => s.w === short && s.h === long);
  const timed = el.timing !== 'immediate';
  const uniformBad = el.timing === 'uniform' && el.delayMax < el.delay;
  const dt = sim.timeStep > 0 ? sim.timeStep : 1;
  const notMultiple = el.timing === 'deterministic' && el.delay > 0 && Math.abs(el.delay / dt - Math.round(el.delay / dt)) > 1e-9;

  const setTiming = (t: TimingModel) =>
    editEl(id, 'transition', (e) => {
      e.timing = t;
      if (t !== 'immediate' && !(e.delay > 0)) e.delay = 1;
      if (t === 'uniform' && e.delayMax < e.delay) e.delayMax = e.delay * 2 || 2;
    });

  return (
    <>
      <div className="panel-section">
        <Hero
          tint={transitionAccent(p, el.timing, el.color)}
          visual={<TransitionPreview el={el} p={p} />}
          kicker="Transition"
          title={el.name || '(ohne Namen)'}
          sub={timingSub(el, unit)}
          actions={<NodeActions id={id} edit />}
          testId="prop-hero"
        />
      </div>

      <Section title="Allgemein" icon={<RectangleVertical size={13} />}>
        <NameField id={id} type="transition" name={el.name} doc={doc} />
      </Section>

      <Section title="Zeitverhalten" icon={<Clock size={13} />}>
        <ChoiceGroup
          value={el.timing}
          columns={2}
          ariaLabel="Zeitverhalten"
          options={TIMING_ORDER.map((t) => ({
            value: t,
            label: TIMING_INFO[t].label,
            icon: <TransGlyph p={p} timing={t} size={22} />,
            title: TIMING_INFO[t].text,
            testId: `prop-timing-${t}`,
          }))}
          onChange={setTiming}
        />
        <div className="pp-explain" data-testid="prop-timing-explain">
          <Info size={14} />
          <span>{TIMING_INFO[el.timing].text}</span>
        </div>

        {el.timing === 'deterministic' && (
          <Field label="Verzögerung" hint="Wartezeit zwischen Aktivierung und Schalten">
            <NumberInput value={el.delay} min={0} max={MAX_DELAY} step={1} unit={unit} testId="prop-delay" onCommit={(v) => editEl(id, 'transition', (e) => void (e.delay = v))} />
          </Field>
        )}
        {el.timing === 'exponential' && (
          <Field label="Mittelwert" hint="Durchschnittliche Wartezeit">
            <NumberInput value={el.delay} min={0} max={MAX_DELAY} step={1} unit={unit} testId="prop-delay" onCommit={(v) => editEl(id, 'transition', (e) => void (e.delay = v))} />
          </Field>
        )}
        {el.timing === 'uniform' && (
          <>
            <Field label="Untergrenze" hint="Kürzeste mögliche Wartezeit">
              <NumberInput value={el.delay} min={0} max={MAX_DELAY} step={1} unit={unit} testId="prop-delay" onCommit={(v) => editEl(id, 'transition', (e) => void (e.delay = v))} />
            </Field>
            <Field label="Obergrenze" hint="Längste mögliche Wartezeit">
              <NumberInput value={el.delayMax} min={0} max={MAX_DELAY} step={1} unit={unit} testId="prop-delay-max" onCommit={(v) => editEl(id, 'transition', (e) => void (e.delayMax = v))} />
            </Field>
            {uniformBad && (
              <Note
                tone="danger"
                action={
                  <Button
                    size="sm"
                    icon={<ArrowDownUp size={13} />}
                    onClick={() =>
                      editEl(id, 'transition', (e) => {
                        const lo = Math.min(e.delay, e.delayMax);
                        const hi = Math.max(e.delay, e.delayMax);
                        e.delay = lo;
                        e.delayMax = hi;
                      })
                    }
                  >
                    Werte tauschen
                  </Button>
                }
              >
                Die Obergrenze ({formatNumber(el.delayMax)}) muss mindestens so groß sein wie die Untergrenze ({formatNumber(el.delay)}).
              </Note>
            )}
          </>
        )}
        {el.timing === 'deterministic' && el.delay === 0 && <Help>Eine Verzögerung von 0 verhält sich wie eine sofortige Transition.</Help>}
        {notMultiple && (
          <Help>
            Die Simulation rechnet in Schritten von Δt = {formatNumber(dt)} {unit}. Die Verzögerung wird deshalb praktisch auf ein Vielfaches davon aufgerundet.
          </Help>
        )}
        {timed && el.timing !== 'deterministic' && <Help>Zufallswerte werden bei jeder Aktivierung neu gezogen.</Help>}
      </Section>

      <Section title="Konflikte" icon={<Trophy size={13} />}>
        <Field label="Priorität" hint="Höhere Zahl gewinnt bei Konflikten">
          <NumberInput value={el.priority} min={-1000} max={1000} integer testId="prop-priority" onCommit={(v) => editEl(id, 'transition', (e) => void (e.priority = v))} />
        </Field>
        <Help>
          Wollen mehrere Transitionen dieselben Marken, gewinnt die mit der höheren Priorität – aber nur bei der Konfliktstrategie „Priorität“.
        </Help>
        {sim.conflict !== 'priority' && (
          <div className="pp-inline-note">
            <span>
              Aktuell: <b>{sim.conflict === 'classic' ? 'Klassisch (HPSim)' : 'Zufall'}</b> – die Priorität wird ignoriert.
            </span>
            <button type="button" className="pp-link" onClick={() => runAction('edit.docSettings')}>
              ändern…
            </button>
          </div>
        )}
      </Section>

      <Section title="Darstellung" icon={<PaletteIcon size={13} />}>
        <Field label="Ausrichtung">
          <ChoiceGroup
            value={vertical ? 'v' : 'h'}
            ariaLabel="Ausrichtung"
            options={[
              { value: 'v', icon: <RectangleVertical size={15} />, label: 'Senkrecht', testId: 'prop-orient-v', title: 'Senkrechter Balken' },
              { value: 'h', icon: <RectangleHorizontal size={15} />, label: 'Waagerecht', testId: 'prop-orient-h', title: 'Waagerechter Balken' },
            ]}
            onChange={() =>
              editEl(id, 'transition', (e) => {
                const w = e.w;
                e.w = e.h;
                e.h = w;
              })
            }
          />
        </Field>
        <Field label="Größe" stack>
          <ChoiceGroup
            value={sizeMatch ? sizeMatch.label : null}
            ariaLabel="Größe"
            options={TRANSITION_SIZES.map((s) => ({ value: s.label, icon: <SizeBar w={s.w} h={s.h} />, title: `${s.label} (${s.w} × ${s.h} px)` }))}
            onChange={(label) => {
              const s = TRANSITION_SIZES.find((x) => x.label === label);
              if (!s) return;
              editEl(id, 'transition', (e) => {
                const vert = e.h >= e.w;
                e.w = vert ? s.w : s.h;
                e.h = vert ? s.h : s.w;
              });
            }}
          />
        </Field>
        <div className="pp-toggles">
          <Toggle checked={el.showName} label="Name anzeigen" testId="prop-show-name" onChange={(v) => editEl(id, 'transition', (e) => void (e.showName = v))} />
          <Toggle
            checked={el.showDelay}
            label={timed ? 'Verzögerung anzeigen' : 'Verzögerung anzeigen (nur zeitbehaftet)'}
            testId="prop-show-delay"
            onChange={(v) => editEl(id, 'transition', (e) => void (e.showDelay = v))}
          />
        </div>
        <Field label="Farbe">
          <ColorInput
            value={el.color}
            onChange={(v) =>
              coalescedEdit(`${id}:color`, (d) => {
                const e = d.elements[id];
                if (e?.type === 'transition') e.color = v;
              })
            }
          />
        </Field>
        {el.color && <Help>Mit eigener Farbe ist das Zeitverhalten nicht mehr an der Farbe erkennbar – „Automatisch“ stellt das wieder her.</Help>}
      </Section>

      <ConnectionsSection doc={doc} nodeId={id} nodeType="transition" p={p} />

      <Section title="Notiz" icon={<StickyNote size={13} />}>
        <TextInput
          multiline
          value={el.note}
          maxLength={10000}
          placeholder="Eigene Anmerkungen zu dieser Transition (Strg+Enter übernimmt)"
          testId="prop-note"
          onCommit={(v) => editEl(id, 'transition', (e) => void (e.note = v))}
        />
      </Section>
    </>
  );
}
