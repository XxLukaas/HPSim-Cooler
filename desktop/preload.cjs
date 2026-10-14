/**
 * Brücke zwischen Oberfläche und Hauptprozess (siehe src/io/desktop.ts).
 * Läuft in einer Sandbox und gibt der Webseite nur diese wenigen Funktionen frei.
 */
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

let openHandler = null;
const queued = [];

ipcRenderer.on('hpsim:open-file', (_e, file) => {
  if (openHandler) openHandler(file);
  else queued.push(file);
});

contextBridge.exposeInMainWorld('hpsimDesktop', {
  platform: process.platform,
  openFiles: () => ipcRenderer.invoke('hpsim:open-files'),
  saveFile: (opts) => ipcRenderer.invoke('hpsim:save-file', opts),
  onOpenFile: (cb) => {
    openHandler = cb;
    for (const f of queued.splice(0)) cb(f);
    ipcRenderer.invoke('hpsim:ready');
  },
  setDirty: (dirty) => ipcRenderer.send('hpsim:set-dirty', !!dirty),
});
