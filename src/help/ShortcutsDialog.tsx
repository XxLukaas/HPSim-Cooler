/** Übersicht der Tastenkürzel (ui.shortcutsOpen) – direkt aus dem Befehlsverzeichnis erzeugt. */
import { Keyboard, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ACTIONS, type ActionGroup } from '../app/actions';
import { Dialog } from '../components/ui';
import { setUi, useApp } from '../store/appStore';
import './help.css';

const GROUP_ORDER: ActionGroup[] = ['Datei', 'Bearbeiten', 'Werkzeuge', 'Anordnen', 'Ansicht', 'Simulation', 'Analyse', 'Hilfe'];

const MOUSE: { keys: string; text: string }[] = [
  { keys: 'Mausrad', text: 'Zoomen (an der Mausposition)' },
  { keys: 'Leertaste + Ziehen', text: 'Ansicht verschieben (auch mittlere Maustaste)' },
  { keys: 'Doppelklick', text: 'Stelle/Transition umbenennen, Text bearbeiten, Knickpunkt einfügen' },
  { keys: 'Umschalt + Klick', text: 'Auswahl erweitern' },
  { keys: 'Pfeiltasten', text: 'Auswahl verschieben (Umschalt: ×5, Alt: 1 Pixel)' },
  { keys: 'Alt beim Ziehen', text: 'Einrasten am Raster kurz aussetzen' },
  { keys: 'Rechtsklick', text: 'Kontextmenü mit passenden Befehlen' },
  { keys: 'Esc', text: 'Vorgang abbrechen, Werkzeug beenden, Auswahl aufheben' },
  { keys: 'Leertaste', text: 'Einzelschritt (im Simulationsmodus)' },
];

/** „Strg+Umschalt+Z“ → [Strg, Umschalt, Z]; „Strg++“ → [Strg, +] */
function splitKeys(combo: string): string[] {
  const out: string[] = [];
  let cur = '';
  for (const ch of combo.trim()) {
    if (ch === '+' && cur) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur) out.push(cur.trim());
  return out;
}

function Keys({ text }: { text: string }) {
  const parts = text.split(/\s*\/\s*/);
  return (
    <span className="sc-keys">
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 && <span className="faint"> oder </span>}
          {splitKeys(p).map((k, j) => (
            <span key={j}>
              {j > 0 && <span className="faint">+</span>}
              <kbd>{k}</kbd>
            </span>
          ))}
        </span>
      ))}
    </span>
  );
}

export function ShortcutsDialog() {
  const open = useApp((s) => s.ui.shortcutsOpen);
  const [query, setQuery] = useState('');
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return GROUP_ORDER.map((g) => ({
      group: g,
      items: ACTIONS.filter((a) => a.group === g && a.shortcut && (!q || `${a.label} ${a.shortcut} ${a.keywords ?? ''}`.toLowerCase().includes(q))),
    })).filter((g) => g.items.length);
  }, [query]);
  if (!open) return null;
  const close = () => setUi({ shortcutsOpen: false });
  const q = query.trim().toLowerCase();
  const mouse = MOUSE.filter((m) => !q || `${m.keys} ${m.text}`.toLowerCase().includes(q));

  return (
    <Dialog title="Tastenkürzel" icon={<Keyboard size={18} />} onClose={close} wide testId="shortcuts-dialog">
      <label className="help-search sc-search">
        <Search size={14} />
        <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Befehl oder Taste suchen …" />
      </label>
      <div className="sc-grid">
        {groups.map((g) => (
          <section key={g.group} className="sc-group">
            <h4>{g.group}</h4>
            {g.items.map((a) => (
              <div key={a.id} className="sc-row">
                <span className="sc-label">{a.label.replace(/…$/, '')}</span>
                <Keys text={a.shortcut!} />
              </div>
            ))}
          </section>
        ))}
        {mouse.length > 0 && (
          <section className="sc-group">
            <h4>Maus & Zeichenfläche</h4>
            {mouse.map((m) => (
              <div key={m.keys} className="sc-row">
                <span className="sc-label">{m.text}</span>
                <span className="sc-keys">
                  <kbd>{m.keys}</kbd>
                </span>
              </div>
            ))}
          </section>
        )}
      </div>
      <p className="faint sc-note">
        Auf dem Mac entspricht <kbd>Strg</kbd> der Taste <kbd>⌘</kbd>. Alle Befehle findest du auch über die Befehlssuche (<kbd>Strg</kbd>+<kbd>K</kbd>).
      </p>
    </Dialog>
  );
}
