/** Dialog „Netz-Einstellungen“: Dokument, Darstellung und Simulation. */
import { Clock, FileText, Grid3x3, Settings } from 'lucide-react';
import type { Draft } from 'immer';
import { useEffect } from 'react';
import { Button, ColorInput, Dialog, Field, NumberInput, Segmented, Select, TextInput, Toggle } from '../components/ui';
import type { NetDoc } from '../model/types';
import { activeTab, setUi, updateDoc, useApp } from '../store/appStore';
import '../help/help.css';

const UNITS = ['ms', 's', 'min', 'h', 'Tage', 'Takte', 'ZE'];

const CONFLICT_HELP: Record<NetDoc['settings']['sim']['conflict'], string> = {
  random: 'Konkurrieren mehrere Transitionen um dieselben Marken, entscheidet der Zufall, welche schaltet.',
  priority: 'Die Transition mit der höchsten Priorität gewinnt; bei Gleichstand entscheidet der Zufall.',
  classic: 'Wie im Original-HPSim 1.1: Teilen sich schaltbereite Transitionen eine Eingangs- oder Ausgangsstelle, darf pro Schritt nur eine zufällig gewählte davon schalten.',
};

const CAPACITY_HELP: Record<NetDoc['settings']['sim']['capacityRule'], string> = {
  strong: 'Streng (wie HPSim): Eine Transition darf nur schalten, wenn die Ausgangsstelle die neuen Marken zusätzlich aufnehmen kann.',
  weak: 'Schwach: Marken, die dieselbe Transition aus der Stelle entnimmt, werden vorher abgezogen.',
};

function edit(fn: (d: Draft<NetDoc>) => void) {
  updateDoc(fn);
}

export function DocSettingsDialog() {
  const open = useApp((s) => s.ui.settingsOpen);
  const doc = useApp((s) => activeTab(s)?.doc ?? null);
  useEffect(() => {
    if (open && !doc) setUi({ settingsOpen: false });
  }, [open, doc]);
  if (!open || !doc) return null;
  const close = () => setUi({ settingsOpen: false });
  const g = doc.settings.grid;
  const sim = doc.settings.sim;
  const unitOptions = (UNITS.includes(sim.timeUnit) ? UNITS : [sim.timeUnit, ...UNITS]).map((u) => ({ value: u, label: u }));

  return (
    <Dialog
      title="Netz-Einstellungen"
      icon={<Settings size={18} />}
      onClose={close}
      wide
      testId="doc-settings"
      footer={
        <Button variant="primary" onClick={close} testId="doc-settings-done">
          Fertig
        </Button>
      }
    >
      <div className="settings-grid">
        <section className="settings-col">
          <h3>
            <FileText size={15} /> Dokument
          </h3>
          <Field label="Titel">
            <TextInput value={doc.meta.title} maxLength={200} onCommit={(v) => edit((d) => void (d.meta.title = v.trim() || 'Unbenanntes Netz'))} testId="settings-title" />
          </Field>
          <Field label="Autor">
            <TextInput value={doc.meta.author} maxLength={200} placeholder="Dein Name" onCommit={(v) => edit((d) => void (d.meta.author = v.trim()))} />
          </Field>
          <Field label="Beschreibung" stack>
            <TextInput
              multiline
              value={doc.meta.description}
              maxLength={20000}
              placeholder="Worum geht es in diesem Netz?"
              onCommit={(v) => edit((d) => void (d.meta.description = v))}
            />
          </Field>

          <h3>
            <Grid3x3 size={15} /> Darstellung
          </h3>
          <Field label="Hintergrund">
            <ColorInput value={doc.settings.background} onChange={(v) => edit((d) => void (d.settings.background = v))} />
          </Field>
          <Field label="Raster">
            <Toggle checked={g.visible} onChange={(v) => edit((d) => void (d.settings.grid.visible = v))} label="anzeigen" />
          </Field>
          <Field label="Rasterweite">
            <NumberInput value={g.size} min={4} max={100} integer unit="px" onCommit={(v) => edit((d) => void (d.settings.grid.size = v))} />
          </Field>
          <Field label="Einrasten" hint="Halte beim Ziehen Alt gedrückt, um das Einrasten kurz auszusetzen.">
            <div className="settings-toggles">
              <Toggle checked={g.snapNet} onChange={(v) => edit((d) => void (d.settings.grid.snapNet = v))} label="Stellen & Transitionen" />
              <Toggle checked={g.snapDecor} onChange={(v) => edit((d) => void (d.settings.grid.snapDecor = v))} label="Zeichenobjekte" />
            </div>
          </Field>
        </section>

        <section className="settings-col">
          <h3>
            <Clock size={15} /> Simulation
          </h3>
          <Field label="Zeitschritt Δt" hint="Um so viel schreitet die Simulationszeit pro Schritt voran (wie „Time Base“ im Original).">
            <NumberInput value={sim.timeStep} min={0.0001} max={1e6} step={0.1} onCommit={(v) => edit((d) => void (d.settings.sim.timeStep = v))} testId="settings-timestep" />
          </Field>
          <Field label="Zeiteinheit">
            <Select value={sim.timeUnit} options={unitOptions} onChange={(v) => edit((d) => void (d.settings.sim.timeUnit = v))} />
          </Field>
          <Field label="Stopp bei Zeit" hint="0 = kein automatischer Stopp">
            <NumberInput value={sim.maxTime} min={0} max={1e9} unit={sim.timeUnit} onCommit={(v) => edit((d) => void (d.settings.sim.maxTime = v))} />
          </Field>
          <Field label="Stopp nach Schritten" hint="0 = kein automatischer Stopp">
            <NumberInput value={sim.maxSteps} min={0} max={1e9} integer onCommit={(v) => edit((d) => void (d.settings.sim.maxSteps = v))} />
          </Field>
          <Field label="Konflikte" stack>
            <Segmented
              value={sim.conflict}
              options={[
                { value: 'random', label: 'Zufall' },
                { value: 'priority', label: 'Priorität' },
                { value: 'classic', label: 'Klassisch' },
              ]}
              onChange={(v) => edit((d) => void (d.settings.sim.conflict = v))}
            />
            <div className="settings-help">{CONFLICT_HELP[sim.conflict]}</div>
          </Field>
          <Field label="Kapazitätsregel" stack>
            <Segmented
              value={sim.capacityRule}
              options={[
                { value: 'strong', label: 'Streng' },
                { value: 'weak', label: 'Schwach' },
              ]}
              onChange={(v) => edit((d) => void (d.settings.sim.capacityRule = v))}
            />
            <div className="settings-help">{CAPACITY_HELP[sim.capacityRule]}</div>
          </Field>
          <Field label="Zufall" hint="Mit festem Startwert verläuft jede Simulation gleich – praktisch zum Vergleichen und Nachvollziehen.">
            <div className="settings-toggles">
              <Toggle
                checked={sim.seed !== null}
                onChange={(v) => edit((d) => void (d.settings.sim.seed = v ? 12345 : null))}
                label="fester Startwert"
                testId="settings-seed-toggle"
              />
              {sim.seed !== null && (
                <NumberInput value={sim.seed} min={0} max={2 ** 31 - 1} integer onCommit={(v) => edit((d) => void (d.settings.sim.seed = v))} title="Startwert des Zufallsgenerators" />
              )}
            </div>
          </Field>
        </section>
      </div>
    </Dialog>
  );
}
