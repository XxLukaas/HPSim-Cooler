/**
 * HPSim Studio – Desktop-Version (Electron, Hauptprozess).
 *
 * Lädt die fertig gebaute Einzeldatei-App (app/index.html) und stellt ihr über
 * preload.cjs echte Datei-Dialoge, Dateizuordnungen (.hpsim, .hps, .pnml) und
 * eine Rückfrage bei ungespeicherten Änderungen zur Verfügung.
 */
'use strict';

const { app, BrowserWindow, dialog, ipcMain, Menu, shell } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');

const SUPPORTED = /\.(hpsim|json|hps|pnml|xml)$/i;
const MAX_FILE_SIZE = 200 * 1024 * 1024;

/** @type {BrowserWindow | null} */
let win = null;
let dirty = false;
let rendererReady = false;
/** Dateien, die vor dem Start der Oberfläche geöffnet werden sollten */
const pending = [];

function filesFromArgs(argv) {
  return argv.slice(app.isPackaged ? 1 : 2).filter((a) => !a.startsWith('-') && SUPPORTED.test(a));
}

async function readForRenderer(filePath) {
  const stat = await fs.stat(filePath);
  if (!stat.isFile()) throw new Error('Keine Datei.');
  if (stat.size > MAX_FILE_SIZE) throw new Error('Die Datei ist zu groß.');
  const data = await fs.readFile(filePath);
  return { name: path.basename(filePath), path: filePath, data: new Uint8Array(data) };
}

async function sendOpen(filePath) {
  if (!win || !rendererReady) {
    pending.push(filePath);
    return;
  }
  try {
    const file = await readForRenderer(filePath);
    win.webContents.send('hpsim:open-file', file);
  } catch (err) {
    dialog.showErrorBox('Datei konnte nicht geöffnet werden', `${filePath}\n\n${err instanceof Error ? err.message : String(err)}`);
  }
  if (win.isMinimized()) win.restore();
  win.focus();
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'HPSim Studio',
    backgroundColor: '#0b0f16',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  win.once('ready-to-show', () => win && win.show());
  win.loadFile(path.join(__dirname, 'app', 'index.html'));

  // Links (z. B. in der Hilfe) im Standardbrowser öffnen, nie im App-Fenster
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) {
      e.preventDefault();
      if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    }
  });

  win.on('close', (e) => {
    if (!dirty || !win) return;
    const choice = dialog.showMessageBoxSync(win, {
      type: 'warning',
      buttons: ['Schließen', 'Abbrechen'],
      defaultId: 1,
      cancelId: 1,
      title: 'Ungespeicherte Änderungen',
      message: 'Es gibt ungespeicherte Änderungen.',
      detail: 'Offene Netze werden automatisch gesichert und beim nächsten Start wiederhergestellt. Trotzdem schließen?',
    });
    if (choice === 1) e.preventDefault();
  });
  win.on('closed', () => {
    win = null;
    rendererReady = false;
  });
}

// ── Kommunikation mit der Oberfläche

ipcMain.handle('hpsim:ready', async () => {
  rendererReady = true;
  const list = pending.splice(0);
  for (const p of list) await sendOpen(p);
});

ipcMain.handle('hpsim:open-files', async () => {
  if (!win) return [];
  const res = await dialog.showOpenDialog(win, {
    title: 'Netz öffnen',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Petri-Netze', extensions: ['hpsim', 'hps', 'pnml', 'json', 'xml'] },
      { name: 'Alle Dateien', extensions: ['*'] },
    ],
  });
  if (res.canceled) return [];
  const out = [];
  for (const p of res.filePaths) {
    try {
      out.push(await readForRenderer(p));
    } catch (err) {
      dialog.showErrorBox('Datei konnte nicht gelesen werden', `${p}\n\n${err instanceof Error ? err.message : String(err)}`);
    }
  }
  for (const p of res.filePaths) app.addRecentDocument(p);
  return out;
});

ipcMain.handle('hpsim:save-file', async (_e, opts) => {
  if (!win || !opts || typeof opts.suggestedName !== 'string') return null;
  let target = typeof opts.path === 'string' && opts.path ? opts.path : null;
  if (!target) {
    const res = await dialog.showSaveDialog(win, {
      title: 'Speichern',
      defaultPath: opts.suggestedName,
      filters: Array.isArray(opts.filters) ? opts.filters : undefined,
    });
    if (res.canceled || !res.filePath) return null;
    target = res.filePath;
  }
  const data = typeof opts.data === 'string' ? Buffer.from(opts.data, 'utf8') : Buffer.from(opts.data);
  // Sicher speichern: erst in eine temporäre Datei, dann umbenennen (kein halbes Netz bei Abstürzen)
  const tmp = `${target}.${process.pid}.tmp`;
  await fs.writeFile(tmp, data);
  await fs.rename(tmp, target);
  app.addRecentDocument(target);
  return target;
});

ipcMain.on('hpsim:set-dirty', (_e, value) => {
  dirty = !!value;
  if (win && process.platform === 'darwin') win.setDocumentEdited(dirty);
});

// ── Start

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    for (const f of filesFromArgs(argv)) sendOpen(f);
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  // macOS: Doppelklick auf eine Datei im Finder
  app.on('open-file', (e, filePath) => {
    e.preventDefault();
    sendOpen(filePath);
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(
      process.platform === 'darwin'
        ? Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }])
        : null,
    );
    for (const f of filesFromArgs(process.argv)) pending.push(f);
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
