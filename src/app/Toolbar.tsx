import {
  FastForward,
  FlaskConical,
  Gauge,
  Pause,
  Pencil,
  Play,
  Redo2,
  RotateCcw,
  Shuffle,
  SkipBack,
  StepForward,
  Undo2,
  Grid3x3,
  Magnet,
  Trash2,
  Copy,
  ClipboardPaste,
  Sparkles,
} from 'lucide-react';
import { IconButton } from '../components/ui';
import { formatNumber } from '../sim/engine';
import { activeTab, setMode, setTool, useApp, type Mode } from '../store/appStore';
import { setAnimate, setSpeed, simBack, simPause, simRandomStep, simReset, simRun, simStep, useSim } from '../store/simStore';
import { isEnabled, runAction, TOOLS } from './actions';

const MODES: { mode: Mode; label: string; icon: typeof Pencil; key: string }[] = [
  { mode: 'edit', label: 'Bearbeiten', icon: Pencil, key: 'F2' },
  { mode: 'sim', label: 'Simulieren', icon: Play, key: 'F5' },
  { mode: 'analysis', label: 'Analysieren', icon: FlaskConical, key: 'F6' },
];

/** Geschwindigkeit als Schieberegler (logarithmisch 0,25 … 60 Schritte/s). */
function SpeedSlider({ tabId, speed }: { tabId: string; speed: number }) {
  const toSlider = (v: number) => Math.log(v / 0.25) / Math.log(240);
  const fromSlider = (x: number) => 0.25 * Math.pow(240, x);
  return (
    <label className="row" style={{ gap: 6 }} title="Geschwindigkeit (Schritte pro Sekunde)">
      <Gauge size={16} className="muted" />
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={toSlider(speed)}
        onChange={(e) => setSpeed(tabId, fromSlider(Number(e.target.value)))}
        style={{ width: 110, accentColor: 'var(--success)' }}
        aria-label="Geschwindigkeit"
        data-testid="speed-slider"
      />
      <span className="mono" style={{ minWidth: 54, fontSize: 12 }}>
        {speed >= 10 ? Math.round(speed) : formatNumber(speed, 1)}/s
      </span>
    </label>
  );
}

function SimControls() {
  const tab = useApp((s) => activeTab(s));
  const sess = useSim((s) => (tab ? s.sessions[tab.id] : undefined));
  if (!tab || !sess) return null;
  const id = tab.id;
  const running = sess.run === 'running' || sess.run === 'replay';
  const fast = sess.run === 'fast';
  return (
    <>
      <div className="toolbar-group">
        <IconButton icon={<RotateCcw size={17} />} title="Zurücksetzen (F8)" onClick={() => simReset(id)} testId="sim-reset" />
        <IconButton icon={<SkipBack size={17} />} title="Schritt zurück (Umschalt+F10)" disabled={!sess.past.length} onClick={() => simBack(id)} testId="sim-back" />
        <IconButton
          icon={<StepForward size={17} />}
          title="Einzelschritt (Leertaste / F10)"
          onClick={() => {
            if (sess.run !== 'stopped') simPause(id);
            simStep(id);
          }}
          testId="sim-step"
        />
        <IconButton
          icon={running ? <Pause size={17} /> : <Play size={17} />}
          title={running ? 'Pause (F9)' : 'Start (F9)'}
          active={running}
          onClick={() => (running ? simPause(id) : simRun(id, 'running'))}
          testId="sim-run"
        />
        <IconButton
          icon={fast ? <Pause size={17} /> : <FastForward size={17} />}
          title={fast ? 'Schnelllauf anhalten' : 'Schnelllauf ohne Animation (F11)'}
          active={fast}
          onClick={() => (fast ? simPause(id) : simRun(id, 'fast'))}
          testId="sim-fast"
        />
        <IconButton icon={<Shuffle size={17} />} title="Token-Spiel: eine zufällige aktivierte Transition schalten (F7)" onClick={() => simRandomStep(id)} testId="sim-random" />
      </div>
      <SpeedSlider tabId={id} speed={sess.speed} />
      <label className="toggle" title="Marken entlang der Kanten animieren">
        <input type="checkbox" checked={sess.animate} onChange={(e) => setAnimate(id, e.target.checked)} />
        <span className="toggle-track" />
        <span>Animation</span>
      </label>
      <div className="toolbar-sep" />
      <div className="row" style={{ gap: 14, fontVariantNumeric: 'tabular-nums' }} data-testid="sim-counters">
        <span>
          <span className="muted">Schritt </span>
          <b data-testid="sim-step-count">{formatNumber(sess.state.step)}</b>
        </span>
        <span>
          <span className="muted">Zeit </span>
          <b>{formatNumber(sess.state.time, 3)}</b> <span className="muted">{tab.doc.settings.sim.timeUnit}</span>
        </span>
        {sess.status === 'deadlock' && <span className="badge danger">Verklemmung</span>}
        {(sess.status === 'step-limit' || sess.status === 'time-limit') && <span className="badge warning">Limit erreicht</span>}
        {sess.run === 'replay' && <span className="badge accent">Wiedergabe …</span>}
      </div>
    </>
  );
}

function EditControls() {
  const tool = useApp((s) => s.tool);
  const tab = useApp((s) => activeTab(s));
  if (!tab) return null;
  const grid = tab.doc.settings.grid;
  return (
    <>
      <div className="toolbar-group" role="toolbar" aria-label="Werkzeuge">
        {TOOLS.slice(0, 5).map((t) => (
          <IconButton
            key={t.tool}
            icon={<t.icon size={17} />}
            title={`${t.label} (${t.key.toUpperCase()})`}
            active={tool === t.tool}
            onClick={() => setTool(t.tool)}
            testId={`tool-${t.tool}`}
          />
        ))}
      </div>
      <div className="toolbar-group" role="toolbar" aria-label="Zeichnen">
        {TOOLS.slice(5).map((t) => (
          <IconButton
            key={t.tool}
            icon={<t.icon size={17} />}
            title={`${t.label} (${t.key.toUpperCase()})`}
            active={tool === t.tool}
            onClick={() => setTool(t.tool)}
            testId={`tool-${t.tool}`}
          />
        ))}
      </div>
      <div className="toolbar-group">
        <IconButton icon={<Undo2 size={17} />} title="Rückgängig (Strg+Z)" disabled={!tab.past.length} onClick={() => runAction('edit.undo')} testId="undo" />
        <IconButton icon={<Redo2 size={17} />} title="Wiederholen (Strg+Y)" disabled={!tab.future.length} onClick={() => runAction('edit.redo')} testId="redo" />
      </div>
      <div className="toolbar-group">
        <IconButton icon={<Copy size={16} />} title="Kopieren (Strg+C)" disabled={!isEnabled('edit.copy')} onClick={() => runAction('edit.copy')} />
        <IconButton icon={<ClipboardPaste size={16} />} title="Einfügen (Strg+V)" onClick={() => runAction('edit.paste')} />
        <IconButton icon={<Trash2 size={16} />} title="Löschen (Entf)" disabled={!tab.selection.length} onClick={() => runAction('edit.delete')} testId="delete" />
      </div>
      <div className="toolbar-group">
        <IconButton icon={<Grid3x3 size={16} />} title="Raster anzeigen" active={grid.visible} onClick={() => runAction('view.grid')} />
        <IconButton icon={<Magnet size={16} />} title="Am Raster ausrichten (Alt beim Ziehen = frei)" active={grid.snapNet} onClick={() => runAction('view.snap')} />
      </div>
    </>
  );
}

export function Toolbar() {
  const tab = useApp((s) => activeTab(s));
  const showStart = useApp((s) => s.ui.showStart);
  if (!tab || showStart) {
    return (
      <div className="toolbar">
        <span className="muted">Willkommen bei HPSim Studio – dem modernen Petri-Netz-Simulator.</span>
        <span className="spacer" />
        <button className="btn sm ghost" onClick={() => runAction('view.palette')}>
          <Sparkles size={14} /> Befehlspalette <kbd>Strg K</kbd>
        </button>
      </div>
    );
  }
  return (
    <div className="toolbar">
      <div className="mode-switch" role="tablist" aria-label="Modus">
        {MODES.map((m) => (
          <button
            key={m.mode}
            type="button"
            role="tab"
            aria-selected={tab.mode === m.mode}
            className={`mode-btn ${m.mode}${tab.mode === m.mode ? ' active' : ''}`}
            title={`${m.label} (${m.key})`}
            onClick={() => setMode(m.mode)}
            data-testid={`mode-${m.mode}`}
          >
            <m.icon size={15} />
            {m.label}
          </button>
        ))}
      </div>
      <div className="toolbar-sep" />
      {tab.mode === 'edit' && <EditControls />}
      {tab.mode === 'sim' && <SimControls />}
      {tab.mode === 'analysis' && (
        <span className="muted">Zustandsraum, Invarianten und Eigenschaften des Netzes – Ergebnisse rechts im Analysebereich.</span>
      )}
    </div>
  );
}
