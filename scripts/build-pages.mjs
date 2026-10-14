// Baut die eigenständige Einzeldatei-Version und legt sie als index.html in den
// Hauptordner – so funktioniert GitHub Pages direkt („Deploy from a branch“).
// Aufruf: npm run build:pages
import { copyFileSync, existsSync, writeFileSync } from 'node:fs';

const src = 'dist-standalone/index.html';
if (!existsSync(src)) {
  console.error('dist-standalone/index.html fehlt – zuerst "npm run build:standalone" ausführen.');
  process.exit(1);
}
copyFileSync(src, 'index.html');
copyFileSync(src, 'HPSim-Studio.html');
writeFileSync('.nojekyll', '');
console.log('index.html und HPSim-Studio.html aktualisiert.');
