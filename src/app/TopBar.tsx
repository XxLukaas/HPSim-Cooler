import { HelpCircle, Moon, Plus, Search, Sun, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { actionItem, openMenu, SEP, type MenuItem } from '../components/ContextMenu';
import { IconButton } from '../components/ui';
import { isDirty, newDocument, setActive, setUi, useApp } from '../store/appStore';
import { closeTab } from './actions';

export const MENUS: { label: string; items: () => MenuItem[] }[] = [
  {
    label: 'Datei',
    items: () => [
      actionItem('file.new'),
      actionItem('file.open'),
      actionItem('file.start'),
      SEP,
      actionItem('file.save'),
      actionItem('file.saveAs'),
      SEP,
      { heading: 'Exportieren' },
      actionItem('file.exportPng'),
      actionItem('file.exportSvg'),
      actionItem('file.exportPnml'),
      actionItem('file.exportText'),
      actionItem('sim.exportCsv'),
      SEP,
      actionItem('file.print'),
      SEP,
      actionItem('file.close'),
    ],
  },
  {
    label: 'Bearbeiten',
    items: () => [
      actionItem('edit.undo'),
      actionItem('edit.redo'),
      SEP,
      actionItem('edit.cut'),
      actionItem('edit.copy'),
      actionItem('edit.paste'),
      actionItem('edit.duplicate'),
      actionItem('edit.delete'),
      SEP,
      actionItem('edit.selectAll'),
      actionItem('edit.find'),
      SEP,
      actionItem('edit.docSettings'),
    ],
  },
  {
    label: 'Anordnen',
    items: () => [
      actionItem('arrange.group'),
      actionItem('arrange.ungroup'),
      SEP,
      actionItem('arrange.front'),
      actionItem('arrange.forward'),
      actionItem('arrange.backward'),
      actionItem('arrange.back'),
      SEP,
      {
        label: 'Ausrichten',
        children: [
          actionItem('arrange.alignLeft'),
          actionItem('arrange.alignHCenter'),
          actionItem('arrange.alignRight'),
          SEP,
          actionItem('arrange.alignTop'),
          actionItem('arrange.alignVCenter'),
          actionItem('arrange.alignBottom'),
          SEP,
          actionItem('arrange.distributeH'),
          actionItem('arrange.distributeV'),
        ],
      },
      actionItem('arrange.rotate'),
      actionItem('arrange.reverse'),
      actionItem('arrange.straighten'),
      actionItem('arrange.resetLabels'),
    ],
  },
  {
    label: 'Ansicht',
    items: () => [
      actionItem('view.zoomIn'),
      actionItem('view.zoomOut'),
      actionItem('view.zoom100'),
      actionItem('view.fit'),
      SEP,
      actionItem('view.grid'),
      actionItem('view.snap'),
      actionItem('view.minimap'),
      SEP,
      actionItem('view.left'),
      actionItem('view.right'),
      actionItem('view.bottom'),
      SEP,
      actionItem('view.theme'),
      actionItem('view.palette'),
    ],
  },
  {
    label: 'Simulation',
    items: () => [
      actionItem('mode.edit'),
      actionItem('mode.sim'),
      SEP,
      actionItem('sim.step'),
      actionItem('sim.run'),
      actionItem('sim.fast'),
      actionItem('sim.back'),
      actionItem('sim.random'),
      actionItem('sim.reset'),
      SEP,
      actionItem('sim.faster'),
      actionItem('sim.slower'),
      SEP,
      actionItem('sim.adopt'),
      actionItem('sim.exportCsv'),
    ],
  },
  {
    label: 'Analyse',
    items: () => [actionItem('mode.analysis'), actionItem('analysis.validate'), SEP, actionItem('file.exportText')],
  },
  {
    label: 'Hilfe',
    items: () => [actionItem('help.open'), actionItem('help.tutorial'), actionItem('help.shortcuts'), SEP, actionItem('help.about')],
  },
];

function Logo() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="6" cy="12" r="4.2" stroke="white" strokeWidth="2" />
      <circle cx="6" cy="12" r="1.5" fill="white" />
      <rect x="13" y="5" width="3" height="14" rx="1" fill="white" />
      <path d="M10.5 12h2.2M16.5 12h3" stroke="white" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function TopBar() {
  const tabs = useApp((s) => s.tabs);
  const activeId = useApp((s) => s.activeId);
  const theme = useApp((s) => s.ui.theme);
  const showStart = useApp((s) => s.ui.showStart);
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const open = (i: number, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setOpenIdx(i);
    openMenu(r.left, r.bottom + 4, MENUS[i].items(), `menubar-${i}`);
    // Status zurücksetzen, sobald das Menü geschlossen wird
    const unsub = setInterval(() => {
      if (!document.querySelector('.menu')) {
        setOpenIdx(null);
        clearInterval(unsub);
      }
    }, 150);
  };

  return (
    <header className="topbar" ref={barRef}>
      <div className="brand" onClick={() => setUi({ showStart: true })} title="Startseite">
        <div className="brand-logo">
          <Logo />
        </div>
        <span className="brand-name">
          HPSim<small>Studio</small>
        </span>
      </div>
      <nav className="menubar" aria-label="Hauptmenü">
        {MENUS.map((m, i) => (
          <button
            key={m.label}
            type="button"
            className={`menubar-item${openIdx === i ? ' open' : ''}`}
            data-testid={`menu-${m.label}`}
            onPointerDown={(e) => {
              e.stopPropagation();
              if (openIdx === i && document.querySelector('.menu')) {
                setOpenIdx(null);
                return;
              }
              open(i, e.currentTarget);
            }}
            onMouseEnter={(e) => {
              if (openIdx !== null && openIdx !== i && document.querySelector('.menu')) open(i, e.currentTarget);
            }}
          >
            {m.label}
          </button>
        ))}
      </nav>
      <div className="tabs" role="tablist">
        {tabs.map((t) => (
          <div
            key={t.id}
            role="tab"
            aria-selected={t.id === activeId && !showStart}
            className={`tab${t.id === activeId && !showStart ? ' active' : ''}`}
            onClick={() => setActive(t.id)}
            onAuxClick={(e) => {
              if (e.button === 1) void closeTab(t.id);
            }}
            title={t.fileName ?? t.doc.meta.title}
            data-testid="doc-tab"
          >
            {isDirty(t) && Object.keys(t.doc.elements).length > 0 && <span className="tab-dirty" title="Ungespeicherte Änderungen" />}
            <span className="tab-title">{t.doc.meta.title}</span>
            <button
              type="button"
              className="tab-close"
              title="Schließen"
              aria-label={`${t.doc.meta.title} schließen`}
              onClick={(e) => {
                e.stopPropagation();
                void closeTab(t.id);
              }}
            >
              <X size={13} />
            </button>
          </div>
        ))}
        <IconButton small icon={<Plus size={16} />} title="Neues Netz (Strg+N)" onClick={() => newDocument()} testId="new-tab" />
      </div>
      <IconButton small icon={<Search size={16} />} title="Befehlspalette (Strg+K)" onClick={() => setUi({ commandPalette: true })} />
      <IconButton
        small
        icon={theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        title={theme === 'dark' ? 'Helles Design' : 'Dunkles Design'}
        onClick={() => setUi({ theme: theme === 'dark' ? 'light' : 'dark' })}
        testId="theme-toggle"
      />
      <IconButton small icon={<HelpCircle size={16} />} title="Hilfe (F1)" onClick={() => setUi({ helpTopic: 'start' })} />
    </header>
  );
}
