/** Startseite mit „Neu“, „Öffnen“, Beispielen und zuletzt verwendeten Netzen. */
import {
  ArrowLeft,
  BookOpen,
  Clock,
  FilePlus2,
  FlaskConical,
  FolderOpen,
  GraduationCap,
  History,
  LineChart,
  MessageCircleQuestion,
  MonitorSmartphone,
  MousePointerClick,
  Redo2,
  Save,
  Sparkles,
  Trash2,
  Upload,
  Zap,
} from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { NetContent } from '../editor/NetRender';
import { paletteFor } from '../editor/palette';
import { EXAMPLES, type ExampleInfo } from '../examples';
import { clearRecent, openRecent, readRecent } from '../io/files';
import { contentBounds, expandRect } from '../model/geometry';
import type { NetDoc } from '../model/types';
import { newDocument, openDocument, setUi, toast, useApp } from '../store/appStore';
import { runAction } from './actions';
import './start.css';

const CATEGORIES: ExampleInfo['category'][] = ['Grundlagen', 'Klassiker', 'Zeit & Zufall', 'Original-HPSim'];

const Preview = memo(function Preview({ doc, theme }: { doc: NetDoc; theme: 'dark' | 'light' }) {
  const p = paletteFor(theme);
  const b = contentBounds(doc);
  if (!b) return <div className="example-preview empty" />;
  const v = expandRect(b, 24);
  return (
    <svg className="example-preview" viewBox={`${v.x} ${v.y} ${v.w} ${v.h}`} preserveAspectRatio="xMidYMid meet" aria-hidden>
      <NetContent doc={doc} p={p} />
    </svg>
  );
});

function counts(doc: NetDoc) {
  let places = 0;
  let trans = 0;
  for (const id of doc.order) {
    const t = doc.elements[id]?.type;
    if (t === 'place') places++;
    else if (t === 'transition') trans++;
  }
  return { places, trans };
}

const FEATURES = [
  { icon: Redo2, title: 'Rückgängig & Wiederholen', text: 'Unbegrenzt – gab es im Original nicht.' },
  { icon: Zap, title: 'Token-Animation', text: 'Marken wandern sichtbar über die Kanten.' },
  { icon: MessageCircleQuestion, title: '„Warum schaltet das nicht?“', text: 'Jede Bedingung im Klartext erklärt.' },
  { icon: LineChart, title: 'Diagramme & Statistik', text: 'Live-Verlauf, Mittelwerte, Durchsatz, CSV.' },
  { icon: FlaskConical, title: 'Netzanalyse', text: 'Zustandsgraph, Verklemmungen, Invarianten.' },
  { icon: Upload, title: 'Alte .hps-Dateien', text: 'Netze aus HPSim 1.x direkt öffnen.' },
  { icon: Save, title: 'Automatische Sicherung', text: 'Nichts geht verloren – auch nicht bei Abstürzen.' },
  { icon: MonitorSmartphone, title: 'Überall', text: 'Im Browser, offline oder als Desktop-App.' },
];

export function StartScreen() {
  const theme = useApp((s) => s.ui.theme);
  const hasTabs = useApp((s) => s.tabs.length > 0);
  const [recent, setRecent] = useState(() => readRecent());
  const docs = useMemo(() => {
    const m = new Map<string, NetDoc>();
    for (const ex of EXAMPLES) {
      try {
        m.set(ex.id, ex.build());
      } catch (err) {
        console.error('Beispiel konnte nicht erzeugt werden', ex.id, err);
      }
    }
    return m;
  }, []);

  const openExample = (ex: ExampleInfo) => {
    try {
      openDocument(ex.build());
    } catch (err) {
      toast('error', 'Beispiel konnte nicht geöffnet werden', err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="start" data-testid="start-screen">
      <div className="start-inner">
        <section className="start-hero">
          <div className="start-logo" aria-hidden>
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none">
              <circle cx="6" cy="12" r="4.2" stroke="white" strokeWidth="2" />
              <circle cx="6" cy="12" r="1.5" fill="white" />
              <rect x="13" y="5" width="3" height="14" rx="1" fill="white" />
              <path d="M10.5 12h2.2M16.5 12h3" stroke="white" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <div className="start-hero-text">
            <h1>
              HPSim Studio <span className="badge accent">2.0</span>
            </h1>
            <p>Petri-Netze entwerfen, simulieren und verstehen.</p>
          </div>
          {hasTabs && (
            <button className="btn" onClick={() => setUi({ showStart: false })}>
              <ArrowLeft size={16} /> Zurück zum Netz
            </button>
          )}
        </section>

        <section className="start-actions">
          <button className="start-card primary" onClick={() => newDocument()} data-testid="start-new">
            <FilePlus2 size={26} />
            <span className="start-card-title">Neues Netz</span>
            <span className="start-card-text">Leere Zeichenfläche – leg direkt los.</span>
          </button>
          <button className="start-card" onClick={() => runAction('file.open')} data-testid="start-open">
            <FolderOpen size={26} />
            <span className="start-card-title">Öffnen / Importieren</span>
            <span className="start-card-text">.hpsim, alte HPSim-Dateien (.hps) und PNML – auch per Drag & Drop.</span>
          </button>
          <button
            className="start-card"
            onClick={() => {
              newDocument();
              setUi({ tutorialStep: 0 });
            }}
            data-testid="start-tutorial"
          >
            <GraduationCap size={26} />
            <span className="start-card-title">Tutorial starten</span>
            <span className="start-card-text">In 5 Minuten zum ersten simulierten Netz.</span>
          </button>
          <button className="start-card" onClick={() => setUi({ helpTopic: 'petri' })}>
            <BookOpen size={26} />
            <span className="start-card-title">Was sind Petri-Netze?</span>
            <span className="start-card-text">Grundlagen einfach erklärt – mit Bildern.</span>
          </button>
        </section>

        {recent.length > 0 && (
          <section className="start-section">
            <div className="start-section-head">
              <h2>
                <History size={18} /> Zuletzt verwendet
              </h2>
              <button
                className="btn sm ghost"
                onClick={() => {
                  clearRecent();
                  setRecent([]);
                }}
              >
                <Trash2 size={14} /> Liste leeren
              </button>
            </div>
            <div className="recent-list">
              {recent.map((r) => (
                <button key={r.fileName + r.date} className="recent-item" onClick={() => openRecent(r)} title={r.fileName}>
                  <Clock size={15} className="muted" />
                  <span className="recent-title">{r.title}</span>
                  <span className="recent-file muted">{r.fileName}</span>
                  <span className="recent-date faint">{new Date(r.date).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="start-section">
          <div className="start-section-head">
            <h2>
              <Sparkles size={18} /> Beispiele
            </h2>
            <span className="muted">Klick öffnet das Beispiel als neues Netz – das Original bleibt unverändert.</span>
          </div>
          {CATEGORIES.map((cat) => (
            <div key={cat} className="example-group">
              <h3>{cat}</h3>
              <div className="example-grid">
                {EXAMPLES.filter((e) => e.category === cat).map((ex) => {
                  const doc = docs.get(ex.id);
                  const c = doc ? counts(doc) : { places: 0, trans: 0 };
                  return (
                    <button key={ex.id} className="example-card" onClick={() => openExample(ex)} data-testid={`example-${ex.id}`}>
                      {doc ? <Preview doc={doc} theme={theme} /> : <div className="example-preview empty" />}
                      <span className="example-body">
                        <span className="example-title">{ex.title}</span>
                        <span className="example-text">{ex.description}</span>
                        <span className="example-meta">
                          {c.places} Stellen · {c.trans} Transitionen
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </section>

        <section className="start-section">
          <div className="start-section-head">
            <h2>
              <MousePointerClick size={18} /> Neu gegenüber HPSim 1.1
            </h2>
          </div>
          <div className="feature-grid">
            {FEATURES.map((f) => (
              <div key={f.title} className="feature">
                <f.icon size={20} />
                <div>
                  <div className="feature-title">{f.title}</div>
                  <div className="feature-text">{f.text}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <footer className="start-footer faint">
          HPSim Studio – unabhängige Neuentwicklung des Petri-Netz-Simulators HPSim (© 1999–2001 Henryk Anschütz). Deine Netze werden automatisch in
          diesem Browser gesichert.
        </footer>
      </div>
    </div>
  );
}
