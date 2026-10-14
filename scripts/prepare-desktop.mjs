/**
 * Kopiert die gebaute Einzeldatei-App nach desktop/app/, damit Electron sie laden kann.
 * Vorher: npm run build:standalone
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const src = `${root}dist-standalone/index.html`;
if (!existsSync(src)) {
  console.error('dist-standalone/index.html fehlt – bitte zuerst „npm run build:standalone“ ausführen.');
  process.exit(1);
}
mkdirSync(`${root}desktop/app`, { recursive: true });
copyFileSync(src, `${root}desktop/app/index.html`);
console.log('desktop/app/index.html aktualisiert.');
