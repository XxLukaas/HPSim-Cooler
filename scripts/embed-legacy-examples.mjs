// Bettet die Original-Beispielnetze von HPSim 1.1 (tests/fixtures/legacy/*.hps)
// als Base64 in src/examples/legacyData.ts ein. Aufruf: npm run examples
import { readFileSync, writeFileSync } from 'node:fs';

const files = ['time_sample', 'demo_net', 'prozess_connect', 'prozess_simple_connect'];
let out = '/* Automatisch erzeugt von scripts/embed-legacy-examples.mjs – nicht von Hand bearbeiten. */\n';
out += '/** Original-Beispielnetze von HPSim 1.1 (© 1999–2001 H. Anschütz) im .hps-Binärformat, Base64-kodiert. */\n';
out += 'export const LEGACY_EXAMPLES: Record<string, string> = {\n';
for (const f of files) {
  const b64 = readFileSync(`tests/fixtures/legacy/${f}.hps`).toString('base64');
  out += `  ${f}:\n    '${b64.match(/.{1,120}/g).join("' +\n    '")}',\n`;
}
out += '};\n';
writeFileSync('src/examples/legacyData.ts', out);
console.log('src/examples/legacyData.ts geschrieben');
