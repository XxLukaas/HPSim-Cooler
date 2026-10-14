/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));

/** Im Entwicklungsserver liegt src/ außerhalb von web/ – Einstiegspunkt über /@fs/ laden. */
function devEntry(): Plugin {
  const fsPath = '/@fs/' + projectRoot.replace(/\\/g, '/').replace(/^\/+/, '');
  return {
    name: 'hpsim-dev-entry',
    apply: 'serve',
    transformIndexHtml: {
      order: 'pre',
      handler: (html) => html.replace('../src/main.tsx', `${fsPath}src/main.tsx`),
    },
  };
}

// Die Quell-HTML liegt in web/, damit im Hauptordner die fertig gebaute
// index.html für GitHub Pages liegen kann (siehe scripts/build-pages.mjs).
// `vite build --mode standalone` erzeugt eine einzelne HTML-Datei,
// die ohne Server per Doppelklick im Browser läuft.
export default defineConfig(({ mode }) => ({
  root: fileURLToPath(new URL('./web', import.meta.url)),
  base: './',
  plugins: [react(), devEntry(), ...(mode === 'standalone' ? [viteSingleFile()] : [])],
  build: {
    outDir: fileURLToPath(new URL(mode === 'standalone' ? './dist-standalone' : './dist', import.meta.url)),
    emptyOutDir: true,
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
  },
  server: {
    fs: { allow: [projectRoot] },
  },
  test: {
    root: projectRoot,
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
}));
