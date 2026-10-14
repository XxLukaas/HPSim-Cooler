/** Hilfe-Dialog (ui.helpTopic != null): Themenliste mit Suche und bebilderten Seiten. */
import { BookOpen, ChevronLeft, ChevronRight, GraduationCap, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { IconButton } from '../components/ui';
import { setUi, useApp } from '../store/appStore';
import { TOPIC_MAP, TOPICS, type Topic } from './topics';
import './help.css';

const GROUPS: Topic['group'][] = ['Erste Schritte', 'Modellieren', 'Programm', 'Mehr'];

export function HelpDialog() {
  const topicId = useApp((s) => s.ui.helpTopic);
  const [query, setQuery] = useState('');
  const bodyRef = useRef<HTMLDivElement>(null);
  const topic = topicId ? (TOPIC_MAP[topicId] ?? TOPICS[0]) : null;

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [topicId]);

  useEffect(() => {
    if (!topicId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setUi({ helpTopic: null });
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [topicId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return TOPICS;
    return TOPICS.filter((t) => `${t.title} ${t.keywords}`.toLowerCase().includes(q));
  }, [query]);

  if (!topic) return null;
  const idx = TOPICS.indexOf(topic);
  const prev = idx > 0 ? TOPICS[idx - 1] : null;
  const next = idx < TOPICS.length - 1 ? TOPICS[idx + 1] : null;
  const close = () => setUi({ helpTopic: null });

  return (
    <div className="backdrop" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="help" role="dialog" aria-modal="true" aria-label="Hilfe" data-testid="help-dialog">
        <aside className="help-nav">
          <div className="help-nav-head">
            <BookOpen size={17} />
            <b>Hilfe</b>
          </div>
          <label className="help-search">
            <Search size={14} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Thema suchen …" aria-label="Hilfe durchsuchen" />
          </label>
          <nav>
            {GROUPS.map((g) => {
              const items = filtered.filter((t) => t.group === g);
              if (!items.length) return null;
              return (
                <div key={g} className="help-group">
                  <div className="help-group-title">{g}</div>
                  {items.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className={`help-nav-item${t === topic ? ' active' : ''}`}
                      onClick={() => setUi({ helpTopic: t.id })}
                      data-testid={`help-topic-${t.id}`}
                    >
                      <t.icon size={15} />
                      {t.title}
                    </button>
                  ))}
                </div>
              );
            })}
            {!filtered.length && <div className="faint help-empty">Kein Thema gefunden.</div>}
          </nav>
          <button
            type="button"
            className="btn sm help-tutorial"
            onClick={() => {
              close();
              setUi({ tutorialStep: 0 });
            }}
          >
            <GraduationCap size={14} /> Interaktives Tutorial
          </button>
        </aside>
        <article className="help-main">
          <header className="help-head">
            <topic.icon size={20} />
            <h2>{topic.title}</h2>
            <IconButton icon={<X size={17} />} title="Schließen (Esc)" onClick={close} small />
          </header>
          <div className="help-body" ref={bodyRef}>
            {topic.body()}
          </div>
          <footer className="help-foot">
            {prev ? (
              <button type="button" className="btn sm ghost" onClick={() => setUi({ helpTopic: prev.id })}>
                <ChevronLeft size={14} /> {prev.title}
              </button>
            ) : (
              <span />
            )}
            {next && (
              <button type="button" className="btn sm ghost" onClick={() => setUi({ helpTopic: next.id })}>
                {next.title} <ChevronRight size={14} />
              </button>
            )}
          </footer>
        </article>
      </div>
    </div>
  );
}
