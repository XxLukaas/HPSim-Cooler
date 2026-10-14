/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `vite build --mode standalone` erzeugt eine einzelne HTML-Datei,
// die ohne Server per Doppelklick im Browser läuft.
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), ...(mode === 'standalone' ? [viteSingleFile()] : [])],
  build: {
    outDir: mode === 'standalone' ? 'dist-standalone' : 'dist',
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
}));
