/**
 * Interaktives Tutorial (ui.tutorialStep != null). Eine Hinweiskarte führt
 * Schritt für Schritt zum ersten simulierten Netz. Jeder Schritt erkennt
 * selbst, wann er erledigt ist, und schaltet automatisch weiter.
 */
import { Check, ChevronLeft, GraduationCap, PartyPopper, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { activeTab, newDocument, setUi, useApp, type AppState } from '../store/appStore';
import { getSession, useSim } from '../store/simStore';
import './help.css';

interface Step {
  title: string;
  text: ReactNode;
  /** CSS-Selektor des Bedienelements, das hervorgehoben wird */
  target?: string;
  /** Ist der Schritt erledigt? (fehlt = manuell mit „Weiter“) */
  done?: (s: AppState) => boolean;
}

function count(s: AppState, type: string): number {
  const doc = activeTab(s)?.doc;
  if (!doc) return 0;
  let n = 0;
  for (const id of doc.order) if (doc.elements[id]?.type === type) n++;
  return n;
}

function hasArc(s: AppState, from: 'place' | 'transition'): boolean {
  const doc = activeTab(s)?.doc;
  if (!doc) return false;
  return doc.order.some((id) => {
    const el = doc.elements[id];
    return el?.type === 'arc' && doc.elements[el.source]?.type === from;
  });
}

const K = ({ children }: { children: ReactNode }) => <kbd>{children}</kbd>;

const STEPS: Step[] = [
  {
    title: 'Willkommen!',
    text: (
      <>
        In wenigen Minuten baust du dein erstes Petri-Netz: Eine <b>Maschine</b> verarbeitet <b>Teile</b>. Du zeichnest es, simulierst es und lässt es analysieren.
        <br />
        <span className="muted">Jeder Schritt schaltet automatisch weiter, sobald du ihn erledigt hast.</span>
      </>
    ),
  },
  {
    title: 'Eine Stelle setzen',
    text: (
      <>
        Wähle oben das Werkzeug <b>Stelle</b> (Kreis, Taste <K>P</K>) und klicke links auf die Zeichenfläche. Die Stelle steht für „Teile warten“.
      </>
    ),
    target: '[data-testid="tool-place"]',
    done: (s) => count(s, 'place') >= 1,
  },
  {
    title: 'Eine Transition setzen',
    text: (
      <>
        Jetzt das Ereignis: Wähle <b>Transition</b> (Balken, Taste <K>T</K>) und klicke rechts neben die Stelle. Sie steht für „bearbeiten“.
      </>
    ),
    target: '[data-testid="tool-transition"]',
    done: (s) => count(s, 'transition') >= 1,
  },
  {
    title: 'Verbinden',
    text: (
      <>
        Wähle das Werkzeug <b>Kante</b> (Pfeil, Taste <K>K</K>) und <b>ziehe</b> mit gedrückter Maustaste von der Stelle bis auf die Transition – fertig ist die
        Kante.
      </>
    ),
    target: '[data-testid="tool-arc"]',
    done: (s) => hasArc(s, 'place'),
  },
  {
    title: 'Wohin geht das Teil?',
    text: (
      <>
        Ziehe mit dem Kantenwerkzeug nun von der Transition <b>ins Leere</b> nach rechts: HPSim Studio legt dort automatisch eine neue Stelle an und verbindet
        sie. Sie steht für „Teil fertig“.
      </>
    ),
    done: (s) => hasArc(s, 'transition') && count(s, 'place') >= 2,
  },
  {
    title: 'Marken hinzufügen',
    text: (
      <>
        Drücke <K>V</K> (Auswahl) und klicke die erste Stelle an. Rechts im Eigenschaftenbereich stellst du bei <b>Marken</b> z. B. <b>3</b> ein – drei Teile warten.
      </>
    ),
    target: '[data-testid="prop-tokens"]',
    done: (s) => {
      const doc = activeTab(s)?.doc;
      return !!doc && doc.order.some((id) => {
        const el = doc.elements[id];
        return el?.type === 'place' && el.tokens > 0;
      });
    },
  },
  {
    title: 'Ab in die Simulation',
    text: (
      <>
        Wechsle oben in den Modus <b>Simulieren</b> (oder <K>F5</K>). Die Transition ist jetzt grün umrandet: Sie ist <b>aktiviert</b>.
      </>
    ),
    target: '[data-testid="mode-sim"]',
    done: (s) => activeTab(s)?.mode === 'sim',
  },
  {
    title: 'Schalten!',
    text: (
      <>
        <b>Klicke auf die grüne Transition.</b> Eine Marke wandert von „wartet“ nach „fertig“. Das ist die Schaltregel: Marken werden aus den Eingängen genommen
        und in die Ausgänge gelegt.
      </>
    ),
    done: (s) => {
      const tab = activeTab(s);
      const sess = tab ? getSession(tab.id) : null;
      return !!sess && sess.state.step >= 1;
    },
  },
  {
    title: 'Laufen lassen',
    text: (
      <>
        Starte die Simulation mit <b>▶</b> (<K>F9</K>). Unten siehst du Protokoll und Diagramm. Wenn keine Marken mehr warten, meldet HPSim Studio eine{' '}
        <b>Verklemmung</b> – nichts kann mehr schalten.
      </>
    ),
    target: '[data-testid="sim-run"]',
    done: (s) => {
      const tab = activeTab(s);
      const sess = tab ? getSession(tab.id) : null;
      return !!sess && (sess.run !== 'stopped' || sess.state.step >= 3);
    },
  },
  {
    title: 'Analysieren',
    text: (
      <>
        Wechsle in den Modus <b>Analysieren</b> (<K>F6</K>). Rechts siehst du, ob dein Netz beschränkt, lebendig oder verklemmungsfrei ist – mit Erklärung und
        Zustandsgraph.
      </>
    ),
    target: '[data-testid="mode-analysis"]',
    done: (s) => activeTab(s)?.mode === 'analysis',
  },
  {
    title: 'Geschafft! 🎉',
    text: (
      <>
        Du kennst jetzt die Grundlagen. Ideen zum Weitermachen:
        <ul>
          <li>Verbinde „fertig“ über eine zweite Transition zurück zu „wartet“ – dann läuft das Netz endlos.</li>
          <li>Gib der Transition eine Verzögerung (Zeitverhalten im Eigenschaftenbereich).</li>
          <li>Schau dir die Beispiele auf der Startseite an oder öffne die Hilfe mit <K>F1</K>.</li>
        </ul>
      </>
    ),
  },
];

export function Tutorial() {
  const step = useApp((s) => s.ui.tutorialStep);
  const [justDone, setJustDone] = useState(false);
  const current = step !== null ? STEPS[Math.min(step, STEPS.length - 1)] : null;

  // Für das Tutorial ein Netz bereitstellen
  useEffect(() => {
    if (step === null) return;
    const s = useApp.getState();
    if (!activeTab(s) || s.ui.showStart) {
      if (!activeTab(s)) newDocument();
      else setUi({ showStart: false });
    }
  }, [step]);

  // Erledigte Schritte erkennen (App- und Simulationszustand beobachten)
  useEffect(() => {
    if (step === null || !current?.done) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const check = () => {
      if (timer || !current.done!(useApp.getState())) return;
      setJustDone(true);
      timer = setTimeout(() => {
        setJustDone(false);
        if (useApp.getState().ui.tutorialStep === step) setUi({ tutorialStep: step + 1 });
      }, 650);
    };
    check();
    const u1 = useApp.subscribe(check);
    const u2 = useSim.subscribe(check);
    return () => {
      u1();
      u2();
      if (timer) clearTimeout(timer);
      setJustDone(false);
    };
  }, [step, current]);

  // Bedienelement hervorheben
  useEffect(() => {
    if (!current?.target) return;
    let el: Element | null = null;
    const apply = () => {
      const found = document.querySelector(current.target!);
      if (found === el) return;
      el?.classList.remove('tutorial-target');
      el = found;
      el?.classList.add('tutorial-target');
    };
    apply();
    const iv = setInterval(apply, 400);
    return () => {
      clearInterval(iv);
      el?.classList.remove('tutorial-target');
    };
  }, [current]);

  if (step === null || !current) return null;
  const last = step >= STEPS.length - 1;
  const close = () => setUi({ tutorialStep: null });

  return (
    <div className={`tutorial${justDone ? ' done' : ''}`} role="dialog" aria-label="Tutorial" data-testid="tutorial">
      <div className="tutorial-head">
        {last ? <PartyPopper size={17} /> : <GraduationCap size={17} />}
        <span className="tutorial-count">
          Schritt {step + 1} von {STEPS.length}
        </span>
        <span className="spacer" />
        <button type="button" className="tutorial-x" onClick={close} title="Tutorial beenden" aria-label="Tutorial beenden">
          <X size={15} />
        </button>
      </div>
      <div className="tutorial-progress">
        <div style={{ width: `${((step + (justDone ? 1 : 0)) / (STEPS.length - 1)) * 100}%` }} />
      </div>
      <h3>
        {justDone && <Check size={17} className="tutorial-check" />}
        {current.title}
      </h3>
      <div className="tutorial-text">{current.text}</div>
      <div className="tutorial-actions">
        {step > 0 && (
          <button type="button" className="btn sm ghost" onClick={() => setUi({ tutorialStep: step - 1 })}>
            <ChevronLeft size={14} /> Zurück
          </button>
        )}
        <span className="spacer" />
        {last ? (
          <button type="button" className="btn sm primary" onClick={close} data-testid="tutorial-finish">
            Fertig
          </button>
        ) : current.done ? (
          <button type="button" className="btn sm ghost" onClick={() => setUi({ tutorialStep: step + 1 })} data-testid="tutorial-skip">
            Überspringen
          </button>
        ) : (
          <button type="button" className="btn sm primary" onClick={() => setUi({ tutorialStep: step + 1 })} data-testid="tutorial-next">
            {step === 0 ? 'Los geht’s' : 'Weiter'}
          </button>
        )}
      </div>
    </div>
  );
}
