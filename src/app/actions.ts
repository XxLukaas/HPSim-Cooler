/**
 * Zentrales Verzeichnis aller Befehle. Menüs, Befehlspalette, Kontextmenüs und
 * Tastenkürzel greifen auf dieselben Aktionen zu.
 */
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  ArrowLeftRight,
  BookOpen,
  BringToFront,
  Circle,
  ClipboardPaste,
  Copy,
  CopyPlus,
  Download,
  Eraser,
  FastForward,
  FileDown,
  FileImage,
  FileJson,
  FilePlus2,
  FileText,
  FlaskConical,
  FolderOpen,
  Grid3x3,
  Group,
  Hand,
  Keyboard,
  LayoutGrid,
  Magnet,
  Maximize,
  Minus,
  MousePointer2,
  MoveRight,
  Moon,
  Pause,
  PenLine,
  Play,
  Printer,
  Redo2,
  RotateCcw,
  RotateCw,
  Save,
  Scissors,
  Search,
  SendToBack,
  Settings,
  Shuffle,
  SkipBack,
  Spline,
  Square,
  StepForward,
  Sun,
  Trash2,
  Type,
  Undo2,
  Ungroup,
  Waypoints,
  ZoomIn,
  ZoomOut,
  RectangleVertical,
  Hexagon,
  Info,
  Pencil,
  GraduationCap,
  Sparkles,
  ListChecks,
  type LucideIcon,
} from 'lucide-react';
import { compileNet } from '../sim/engine';
import { netAsText } from '../analysis/matrix';
import { exportPng, exportSvg, printDoc } from '../io/exportImage';
import { downloadBlob, openFromPicker, saveData, saveTab } from '../io/files';
import { exportPnml } from '../io/pnml';
import {
  alignElements,
  distributeElements,
  groupElements,
  reorder,
  reverseArcs,
  rotateTransitions,
  ungroupElements,
  type AlignMode,
} from '../model/ops';
import type { NetDoc } from '../model/types';
import {
  activeTab,
  ask,
  clearSelection,
  closeTabNow,
  copySelection,
  cutSelection,
  deleteSelection,
  duplicateSelection,
  fitView,
  isDirty,
  newDocument,
  pasteElements,
  redo,
  selectAll,
  setMode,
  setTool,
  setUi,
  toast,
  undo,
  updateDoc,
  useApp,
  zoomAt,
  setView,
  type Tool,
  tryParseClipboardText,
} from '../store/appStore';
import {
  adoptMarking,
  getSession,
  setSpeed,
  simBack,
  simPause,
  simRandomStep,
  simReset,
  simRun,
  simStep,
} from '../store/simStore';

export type ActionGroup = 'Datei' | 'Bearbeiten' | 'Anordnen' | 'Ansicht' | 'Werkzeuge' | 'Simulation' | 'Analyse' | 'Hilfe';

export interface Action {
  id: string;
  label: string;
  group: ActionGroup;
  /** Anzeige, z. B. „Strg+S“ */
  shortcut?: string;
  /** Tastenkombinationen, z. B. „mod+s“ (mod = Strg bzw. ⌘) */
  keys?: string[];
  icon?: LucideIcon;
  /** Zusätzliche Suchbegriffe für die Befehlspalette */
  keywords?: string;
  run: () => void;
  enabled?: () => boolean;
  checked?: () => boolean;
}

const tab = () => activeTab();
const hasTab = () => !!tab();
const editMode = () => tab()?.mode === 'edit';
const simMode = () => tab()?.mode === 'sim';
const hasSelection = () => (tab()?.selection.length ?? 0) > 0;
const editSel = () => editMode() && hasSelection();
const docOf = (): NetDoc | null => tab()?.doc ?? null;
const session = () => getSession(tab()?.id);

function selectedOfType(type: string): string[] {
  const t = tab();
  if (!t) return [];
  return t.selection.filter((id) => t.doc.elements[id]?.type === type);
}

function align(mode: AlignMode) {
  const t = tab();
  if (!t) return;
  const ids = t.selection;
  updateDoc((d) => alignElements(d as NetDoc, ids, mode));
}

function safeName(doc: NetDoc) {
  return (doc.meta.title || 'Netz').replace(/[\\/:*?"<>|]+/g, '_');
}

export async function closeTab(id: string): Promise<void> {
  const t = useApp.getState().tabs.find((x) => x.id === id);
  if (!t) return;
  if (isDirty(t) && Object.keys(t.doc.elements).length > 0) {
    const r = await ask({
      title: 'Änderungen speichern?',
      message: `„${t.doc.meta.title}“ enthält ungespeicherte Änderungen.`,
      confirmLabel: 'Speichern',
      extraLabel: 'Verwerfen',
      cancelLabel: 'Abbrechen',
    });
    if (r === 'cancel') return;
    if (r === 'confirm') {
      const ok = await saveTab(id);
      if (!ok) return;
    }
  }
  closeTabNow(id);
}

function setGrid(patch: Partial<NetDoc['settings']['grid']>) {
  updateDoc((d) => {
    Object.assign(d.settings.grid, patch);
  });
}

const TOOLS: { tool: Tool; label: string; key: string; icon: LucideIcon; keywords?: string }[] = [
  { tool: 'select', label: 'Auswählen', key: 'v', icon: MousePointer2, keywords: 'markieren zeiger' },
  { tool: 'pan', label: 'Verschieben (Hand)', key: 'h', icon: Hand, keywords: 'pan scrollen' },
  { tool: 'place', label: 'Stelle', key: 'p', icon: Circle, keywords: 'platz zustand kreis' },
  { tool: 'transition', label: 'Transition', key: 't', icon: RectangleVertical, keywords: 'ereignis balken' },
  { tool: 'arc', label: 'Kante', key: 'k', icon: MoveRight, keywords: 'pfeil verbindung arc' },
  { tool: 'text', label: 'Text', key: 'x', icon: Type, keywords: 'beschriftung kommentar' },
  { tool: 'rect', label: 'Rechteck', key: 'r', icon: Square, keywords: 'kasten rahmen' },
  { tool: 'ellipse', label: 'Ellipse', key: 'e', icon: Circle, keywords: 'kreis oval' },
  { tool: 'line', label: 'Linie', key: 'l', icon: Minus, keywords: 'strich' },
  { tool: 'poly', label: 'Linienzug / Polygon', key: 'y', icon: Hexagon, keywords: 'polygon vieleck' },
];

export const ACTIONS: Action[] = [
  // ── Datei
  { id: 'file.new', label: 'Neues Netz', group: 'Datei', shortcut: 'Strg+N', keys: ['mod+n', 'alt+n'], icon: FilePlus2, run: () => newDocument() },
  { id: 'file.open', label: 'Öffnen / Importieren…', group: 'Datei', shortcut: 'Strg+O', keys: ['mod+o'], icon: FolderOpen, keywords: 'hps laden pnml importieren', run: () => void openFromPicker() },
  { id: 'file.save', label: 'Speichern', group: 'Datei', shortcut: 'Strg+S', keys: ['mod+s'], icon: Save, enabled: hasTab, run: () => void saveTab() },
  { id: 'file.saveAs', label: 'Speichern unter…', group: 'Datei', shortcut: 'Strg+Umschalt+S', keys: ['mod+shift+s'], icon: Save, enabled: hasTab, run: () => void saveTab(undefined, true) },
  {
    id: 'file.exportPnml',
    label: 'Exportieren als PNML…',
    group: 'Datei',
    icon: FileJson,
    keywords: 'xml austausch',
    enabled: hasTab,
    run: async () => {
      const d = docOf();
      if (!d) return;
      try {
        await saveData({ suggestedName: `${safeName(d)}.pnml`, data: exportPnml(d), mime: 'application/xml', extension: '.pnml', description: 'PNML-Datei' });
      } catch (err) {
        toast('error', 'PNML-Export fehlgeschlagen', err instanceof Error ? err.message : String(err));
      }
    },
  },
  { id: 'file.exportSvg', label: 'Exportieren als SVG-Grafik…', group: 'Datei', icon: FileImage, keywords: 'bild vektor', enabled: hasTab, run: () => void (docOf() && exportSvg(docOf()!)) },
  { id: 'file.exportPng', label: 'Exportieren als PNG-Bild…', group: 'Datei', icon: FileImage, keywords: 'bild bitmap screenshot', enabled: hasTab, run: () => void (docOf() && exportPng(docOf()!, 2)) },
  {
    id: 'file.exportText',
    label: 'Netz als Text exportieren (Inzidenzmatrix)…',
    group: 'Datei',
    icon: FileText,
    keywords: 'matrix markierungsvektor export net',
    enabled: hasTab,
    run: () => {
      const d = docOf();
      if (!d) return;
      downloadBlob(`${safeName(d)}.txt`, netAsText(compileNet(d), d.meta.title), 'text/plain;charset=utf-8');
    },
  },
  { id: 'file.print', label: 'Drucken…', group: 'Datei', shortcut: 'Strg+P', keys: ['mod+p'], icon: Printer, enabled: hasTab, run: () => docOf() && printDoc(docOf()!) },
  {
    id: 'file.close',
    label: 'Netz schließen',
    group: 'Datei',
    shortcut: 'Strg+W',
    keys: ['mod+w', 'alt+w'],
    icon: Trash2,
    enabled: hasTab,
    run: () => {
      const t = tab();
      if (t) void closeTab(t.id);
    },
  },
  { id: 'file.start', label: 'Startseite / Beispiele', group: 'Datei', icon: LayoutGrid, keywords: 'beispiele willkommen home', run: () => setUi({ showStart: true }) },

  // ── Bearbeiten
  { id: 'edit.undo', label: 'Rückgängig', group: 'Bearbeiten', shortcut: 'Strg+Z', keys: ['mod+z'], icon: Undo2, enabled: () => !!tab()?.past.length, run: undo },
  { id: 'edit.redo', label: 'Wiederholen', group: 'Bearbeiten', shortcut: 'Strg+Y', keys: ['mod+y', 'mod+shift+z'], icon: Redo2, enabled: () => !!tab()?.future.length, run: redo },
  { id: 'edit.cut', label: 'Ausschneiden', group: 'Bearbeiten', shortcut: 'Strg+X', keys: ['mod+x'], icon: Scissors, enabled: editSel, run: cutSelection },
  { id: 'edit.copy', label: 'Kopieren', group: 'Bearbeiten', shortcut: 'Strg+C', keys: ['mod+c'], icon: Copy, enabled: hasSelection, run: () => void copySelection() },
  {
    id: 'edit.paste',
    label: 'Einfügen',
    group: 'Bearbeiten',
    shortcut: 'Strg+V',
    keys: ['mod+v'],
    icon: ClipboardPaste,
    enabled: editMode,
    run: async () => {
      if (useApp.getState().clipboard) {
        pasteElements();
        return;
      }
      try {
        const text = await navigator.clipboard?.readText();
        const els = text ? tryParseClipboardText(text) : null;
        if (els) pasteElements(els);
      } catch {
        /* kein Zugriff auf die Zwischenablage */
      }
    },
  },
  { id: 'edit.duplicate', label: 'Duplizieren', group: 'Bearbeiten', shortcut: 'Strg+D', keys: ['mod+d'], icon: CopyPlus, enabled: editSel, run: duplicateSelection },
  { id: 'edit.delete', label: 'Löschen', group: 'Bearbeiten', shortcut: 'Entf', keys: ['delete', 'backspace'], icon: Trash2, enabled: editSel, run: deleteSelection },
  { id: 'edit.selectAll', label: 'Alles auswählen', group: 'Bearbeiten', shortcut: 'Strg+A', keys: ['mod+a'], icon: MousePointer2, enabled: hasTab, run: selectAll },
  { id: 'edit.deselect', label: 'Auswahl aufheben', group: 'Bearbeiten', shortcut: 'Esc', icon: Eraser, enabled: hasSelection, run: clearSelection },
  {
    id: 'edit.find',
    label: 'Element suchen…',
    group: 'Bearbeiten',
    shortcut: 'Strg+F',
    keys: ['mod+f'],
    icon: Search,
    enabled: hasTab,
    run: () => {
      setUi({ leftOpen: true, leftTab: 'explorer' });
      setTimeout(() => window.dispatchEvent(new Event('hpsim:focus-search')), 30);
    },
  },
  {
    id: 'edit.docSettings',
    label: 'Netz-Einstellungen…',
    group: 'Bearbeiten',
    icon: Settings,
    keywords: 'eigenschaften raster zeitbasis simulation dokument extras properties',
    enabled: hasTab,
    run: () => setUi({ settingsOpen: true }),
  },

  // ── Anordnen
  { id: 'arrange.group', label: 'Gruppieren', group: 'Anordnen', shortcut: 'Strg+G', keys: ['mod+g'], icon: Group, enabled: editSel, run: () => { const ids = tab()!.selection; updateDoc((d) => void groupElements(d as NetDoc, ids)); } },
  { id: 'arrange.ungroup', label: 'Gruppierung aufheben', group: 'Anordnen', shortcut: 'Strg+Umschalt+G', keys: ['mod+shift+g'], icon: Ungroup, enabled: editSel, run: () => { const ids = tab()!.selection; updateDoc((d) => ungroupElements(d as NetDoc, ids)); } },
  { id: 'arrange.front', label: 'In den Vordergrund', group: 'Anordnen', shortcut: 'Strg+Umschalt+]', keys: ['mod+shift+]'], icon: BringToFront, enabled: editSel, run: () => { const ids = tab()!.selection; updateDoc((d) => reorder(d as NetDoc, ids, 'front')); } },
  { id: 'arrange.back', label: 'In den Hintergrund', group: 'Anordnen', shortcut: 'Strg+Umschalt+[', keys: ['mod+shift+['], icon: SendToBack, enabled: editSel, run: () => { const ids = tab()!.selection; updateDoc((d) => reorder(d as NetDoc, ids, 'back')); } },
  { id: 'arrange.forward', label: 'Eine Ebene nach vorne', group: 'Anordnen', shortcut: 'Strg+]', keys: ['mod+]'], icon: BringToFront, enabled: editSel, run: () => { const ids = tab()!.selection; updateDoc((d) => reorder(d as NetDoc, ids, 'forward')); } },
  { id: 'arrange.backward', label: 'Eine Ebene nach hinten', group: 'Anordnen', shortcut: 'Strg+[', keys: ['mod+['], icon: SendToBack, enabled: editSel, run: () => { const ids = tab()!.selection; updateDoc((d) => reorder(d as NetDoc, ids, 'backward')); } },
  { id: 'arrange.rotate', label: 'Transition drehen (90°)', group: 'Anordnen', shortcut: 'Strg+R', keys: ['mod+r'], icon: RotateCw, enabled: () => editMode() && selectedOfType('transition').length > 0, run: () => { const ids = selectedOfType('transition'); updateDoc((d) => rotateTransitions(d as NetDoc, ids)); } },
  {
    id: 'arrange.reverse',
    label: 'Kantenrichtung umkehren',
    group: 'Anordnen',
    icon: ArrowLeftRight,
    enabled: () => editMode() && selectedOfType('arc').length > 0,
    run: () => {
      const ids = selectedOfType('arc');
      let n = 0;
      updateDoc((d) => {
        n = reverseArcs(d as NetDoc, ids);
      });
      if (!n) toast('info', 'Nicht möglich', 'Nur normale Kanten ohne Gegenkante können umgekehrt werden.');
    },
  },
  {
    id: 'arrange.straighten',
    label: 'Knickpunkte entfernen',
    group: 'Anordnen',
    icon: Spline,
    enabled: () => editMode() && selectedOfType('arc').length > 0,
    run: () => {
      const ids = selectedOfType('arc');
      updateDoc((d) => {
        for (const id of ids) {
          const el = d.elements[id];
          if (el?.type === 'arc') el.points = [];
        }
      });
    },
  },
  {
    id: 'arrange.resetLabels',
    label: 'Beschriftungen zurücksetzen',
    group: 'Anordnen',
    icon: RotateCcw,
    enabled: editSel,
    run: () => {
      const ids = tab()!.selection;
      updateDoc((d) => {
        for (const id of ids) {
          const el = d.elements[id];
          if (el?.type === 'place') {
            el.nameOffset = null;
            el.capOffset = null;
          } else if (el?.type === 'transition') {
            el.nameOffset = null;
            el.delayOffset = null;
          } else if (el?.type === 'arc') el.labelOffset = null;
        }
      });
    },
  },
  { id: 'arrange.alignLeft', label: 'Links ausrichten', group: 'Anordnen', icon: AlignStartVertical, enabled: editSel, run: () => align('left') },
  { id: 'arrange.alignHCenter', label: 'Horizontal zentrieren', group: 'Anordnen', icon: AlignCenterVertical, enabled: editSel, run: () => align('hcenter') },
  { id: 'arrange.alignRight', label: 'Rechts ausrichten', group: 'Anordnen', icon: AlignEndVertical, enabled: editSel, run: () => align('right') },
  { id: 'arrange.alignTop', label: 'Oben ausrichten', group: 'Anordnen', icon: AlignStartHorizontal, enabled: editSel, run: () => align('top') },
  { id: 'arrange.alignVCenter', label: 'Vertikal zentrieren', group: 'Anordnen', icon: AlignCenterHorizontal, enabled: editSel, run: () => align('vcenter') },
  { id: 'arrange.alignBottom', label: 'Unten ausrichten', group: 'Anordnen', icon: AlignEndHorizontal, enabled: editSel, run: () => align('bottom') },
  { id: 'arrange.distributeH', label: 'Horizontal verteilen', group: 'Anordnen', icon: ArrowLeftRight, enabled: editSel, run: () => { const ids = tab()!.selection; updateDoc((d) => distributeElements(d as NetDoc, ids, 'h')); } },
  { id: 'arrange.distributeV', label: 'Vertikal verteilen', group: 'Anordnen', icon: ArrowLeftRight, enabled: editSel, run: () => { const ids = tab()!.selection; updateDoc((d) => distributeElements(d as NetDoc, ids, 'v')); } },

  // ── Werkzeuge
  ...TOOLS.map(
    (t): Action => ({
      id: `tool.${t.tool}`,
      label: `Werkzeug: ${t.label}`,
      group: 'Werkzeuge',
      shortcut: t.key.toUpperCase(),
      keys: [t.key],
      icon: t.icon,
      keywords: t.keywords,
      enabled: () => editMode() || t.tool === 'select' || t.tool === 'pan',
      checked: () => useApp.getState().tool === t.tool,
      run: () => setTool(t.tool),
    }),
  ),

  // ── Ansicht
  { id: 'view.zoomIn', label: 'Vergrößern', group: 'Ansicht', shortcut: 'Strg++', keys: ['mod+=', 'mod++', '+', '='], icon: ZoomIn, enabled: hasTab, run: () => zoomAt(1.25) },
  { id: 'view.zoomOut', label: 'Verkleinern', group: 'Ansicht', shortcut: 'Strg+-', keys: ['mod+-', '-'], icon: ZoomOut, enabled: hasTab, run: () => zoomAt(0.8) },
  {
    id: 'view.zoom100',
    label: 'Originalgröße (100 %)',
    group: 'Ansicht',
    shortcut: 'Strg+0',
    keys: ['mod+0', '0'],
    icon: Search,
    enabled: hasTab,
    run: () => {
      const t = tab();
      if (t) zoomAt(1 / t.view.zoom);
    },
  },
  { id: 'view.fit', label: 'Ganzes Netz anzeigen', group: 'Ansicht', shortcut: 'F', keys: ['f', 'mod+shift+f'], icon: Maximize, keywords: 'einpassen zoom port', enabled: hasTab, run: () => fitView() },
  { id: 'view.grid', label: 'Raster anzeigen', group: 'Ansicht', shortcut: "Strg+'", keys: ["mod+'"], icon: Grid3x3, enabled: hasTab, checked: () => !!docOf()?.settings.grid.visible, run: () => setGrid({ visible: !docOf()?.settings.grid.visible }) },
  { id: 'view.snap', label: 'Am Raster ausrichten', group: 'Ansicht', icon: Magnet, enabled: hasTab, checked: () => !!docOf()?.settings.grid.snapNet, run: () => { const on = !docOf()?.settings.grid.snapNet; setGrid({ snapNet: on, snapDecor: on }); } },
  { id: 'view.left', label: 'Explorer anzeigen', group: 'Ansicht', shortcut: 'Strg+1', keys: ['mod+1'], icon: ListChecks, checked: () => useApp.getState().ui.leftOpen, run: () => setUi({ leftOpen: !useApp.getState().ui.leftOpen }) },
  { id: 'view.right', label: 'Eigenschaften anzeigen', group: 'Ansicht', shortcut: 'Strg+2', keys: ['mod+2'], icon: PenLine, checked: () => useApp.getState().ui.rightOpen, run: () => setUi({ rightOpen: !useApp.getState().ui.rightOpen }) },
  { id: 'view.bottom', label: 'Simulationsbereich anzeigen', group: 'Ansicht', shortcut: 'Strg+3', keys: ['mod+3'], icon: FileText, checked: () => useApp.getState().ui.bottomOpen, run: () => setUi({ bottomOpen: !useApp.getState().ui.bottomOpen }) },
  { id: 'view.minimap', label: 'Übersichtskarte anzeigen', group: 'Ansicht', icon: Waypoints, checked: () => useApp.getState().ui.minimap, run: () => setUi({ minimap: !useApp.getState().ui.minimap }) },
  {
    id: 'view.theme',
    label: 'Helles/dunkles Design umschalten',
    group: 'Ansicht',
    shortcut: 'Strg+Umschalt+L',
    keys: ['mod+shift+l'],
    icon: Moon,
    keywords: 'dark light farbe theme',
    run: () => setUi({ theme: useApp.getState().ui.theme === 'dark' ? 'light' : 'dark' }),
  },
  { id: 'view.palette', label: 'Befehlspalette', group: 'Ansicht', shortcut: 'Strg+K', keys: ['mod+k', 'mod+shift+p'], icon: Sparkles, run: () => setUi({ commandPalette: true }) },
  { id: 'view.reset', label: 'Ansicht zurücksetzen', group: 'Ansicht', icon: RotateCcw, enabled: hasTab, run: () => setView({ x: 40, y: 40, zoom: 1 }) },

  // ── Modi
  { id: 'mode.edit', label: 'Modus: Bearbeiten', group: 'Simulation', shortcut: 'F2', keys: ['f2'], icon: Pencil, enabled: hasTab, checked: editMode, run: () => setMode('edit') },
  { id: 'mode.sim', label: 'Modus: Simulieren', group: 'Simulation', shortcut: 'F5', keys: ['f5'], icon: Play, enabled: hasTab, checked: simMode, run: () => setMode('sim') },
  { id: 'mode.analysis', label: 'Modus: Analysieren', group: 'Analyse', shortcut: 'F6', keys: ['f6'], icon: FlaskConical, enabled: hasTab, checked: () => tab()?.mode === 'analysis', run: () => setMode('analysis') },

  // ── Simulation
  {
    id: 'sim.step',
    label: 'Einzelschritt',
    group: 'Simulation',
    shortcut: 'F10 / Leertaste',
    keys: ['f10', 'mod+enter'],
    icon: StepForward,
    enabled: simMode,
    run: () => {
      const s = session();
      if (s) {
        if (s.run !== 'stopped') simPause(s.tabId);
        simStep(s.tabId);
      }
    },
  },
  {
    id: 'sim.run',
    label: 'Start / Pause',
    group: 'Simulation',
    shortcut: 'F9',
    keys: ['f9'],
    icon: Play,
    enabled: simMode,
    run: () => {
      const s = session();
      if (!s) return;
      if (s.run === 'stopped') simRun(s.tabId, 'running');
      else simPause(s.tabId);
    },
  },
  { id: 'sim.fast', label: 'Schnelllauf', group: 'Simulation', shortcut: 'F11', keys: ['f11'], icon: FastForward, enabled: simMode, run: () => { const s = session(); if (s) simRun(s.tabId, 'fast'); } },
  { id: 'sim.pause', label: 'Pause', group: 'Simulation', icon: Pause, enabled: () => simMode() && session()?.run !== 'stopped', run: () => { const s = session(); if (s) simPause(s.tabId); } },
  { id: 'sim.back', label: 'Schritt zurück', group: 'Simulation', shortcut: 'Umschalt+F10', keys: ['shift+f10', 'mod+backspace'], icon: SkipBack, enabled: () => simMode() && !!session()?.past.length, run: () => { const s = session(); if (s) simBack(s.tabId); } },
  { id: 'sim.reset', label: 'Zurücksetzen', group: 'Simulation', shortcut: 'F8', keys: ['f8'], icon: RotateCcw, enabled: simMode, run: () => { const s = session(); if (s) simReset(s.tabId); } },
  { id: 'sim.random', label: 'Zufällige Transition schalten (Token-Spiel)', group: 'Simulation', shortcut: 'F7', keys: ['f7'], icon: Shuffle, enabled: simMode, run: () => { const s = session(); if (s) simRandomStep(s.tabId); } },
  { id: 'sim.faster', label: 'Schneller', group: 'Simulation', shortcut: 'Num +', icon: FastForward, enabled: simMode, run: () => { const s = session(); if (s) setSpeed(s.tabId, s.speed * 1.5); } },
  { id: 'sim.slower', label: 'Langsamer', group: 'Simulation', shortcut: 'Num -', icon: SkipBack, enabled: simMode, run: () => { const s = session(); if (s) setSpeed(s.tabId, s.speed / 1.5); } },
  { id: 'sim.adopt', label: 'Aktuelle Markierung als Anfangsmarkierung übernehmen', group: 'Simulation', icon: Download, enabled: simMode, run: () => { const s = session(); if (s) adoptMarking(s.tabId); } },
  {
    id: 'sim.exportCsv',
    label: 'Markierungsverlauf als CSV exportieren…',
    group: 'Simulation',
    icon: FileDown,
    keywords: 'excel ausgabedatei output file tabelle',
    enabled: () => !!session(),
    run: () => {
      const s = session();
      if (!s) return;
      const csv = s.history.toCsv(s.net.placeNames, s.net.transitions.map((t) => t.name));
      downloadBlob(`${safeName(s.doc)}_Verlauf.csv`, '﻿' + csv, 'text/csv;charset=utf-8');
      if (s.history.decimated) toast('info', 'Hinweis', 'Der Verlauf war sehr lang und wurde für den Export ausgedünnt.');
    },
  },

  // ── Analyse
  { id: 'analysis.validate', label: 'Netz prüfen', group: 'Analyse', icon: ListChecks, keywords: 'fehler warnungen validieren', enabled: hasTab, run: () => setUi({ leftOpen: true, leftTab: 'issues' }) },

  // ── Hilfe
  { id: 'help.open', label: 'Hilfe & Grundlagen', group: 'Hilfe', shortcut: 'F1', keys: ['f1'], icon: BookOpen, keywords: 'anleitung handbuch was ist', run: () => setUi({ helpTopic: 'start' }) },
  { id: 'help.tutorial', label: 'Interaktives Tutorial starten', group: 'Hilfe', icon: GraduationCap, keywords: 'erste schritte lernen', run: () => setUi({ tutorialStep: 0 }) },
  { id: 'help.shortcuts', label: 'Tastenkürzel', group: 'Hilfe', shortcut: '?', keys: ['?', 'shift+?'], icon: Keyboard, run: () => setUi({ shortcutsOpen: true }) },
  { id: 'help.about', label: 'Über HPSim Studio', group: 'Hilfe', icon: Info, run: () => setUi({ helpTopic: 'about' }) },
];

export const ACTION_MAP: Record<string, Action> = Object.fromEntries(ACTIONS.map((a) => [a.id, a]));

export function runAction(id: string): void {
  const a = ACTION_MAP[id];
  if (!a) return;
  if (a.enabled && !a.enabled()) return;
  try {
    a.run();
  } catch (err) {
    toast('error', `„${a.label}“ fehlgeschlagen`, err instanceof Error ? err.message : String(err));
  }
}

export function isEnabled(id: string): boolean {
  const a = ACTION_MAP[id];
  return !!a && (!a.enabled || a.enabled());
}

export const THEME_ICON = { dark: Moon, light: Sun };
export { TOOLS };

/** Normalisiert ein Tastaturereignis zu einer Zeichenkette wie „mod+shift+z“. */
export function eventKey(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('mod');
  if (e.altKey) parts.push('alt');
  let key = e.key.toLowerCase();
  if (key === ' ') key = 'space';
  if (key === 'esc') key = 'escape';
  if (e.shiftKey && key.length > 1) parts.push('shift');
  else if (e.shiftKey && /^[a-z0-9]$/.test(key)) parts.push('shift');
  parts.push(key);
  return parts.join('+');
}

const KEY_INDEX = new Map<string, Action>();
for (const a of ACTIONS) for (const k of a.keys ?? []) KEY_INDEX.set(k, a);

/** Liefert die Aktion zu einem Tastaturereignis (oder undefined). */
export function actionForEvent(e: KeyboardEvent): Action | undefined {
  return KEY_INDEX.get(eventKey(e));
}
