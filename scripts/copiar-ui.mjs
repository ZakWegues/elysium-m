// Copia o renderer das telas inteligentes (elysium/ui-render/dist/render.html) para assets/ui.
// Rodar depois de `node scripts/build.mjs` no ui-render; o teste telas.test.ts confere a cópia.
import fs from 'node:fs';
import path from 'node:path';

const origem = path.resolve(import.meta.dirname, '..', '..', 'elysium', 'ui-render', 'dist', 'render.html');
const destino = path.resolve(import.meta.dirname, '..', 'assets', 'ui', 'render.html');
fs.mkdirSync(path.dirname(destino), { recursive: true });
fs.copyFileSync(origem, destino);
console.log(`render.html copiado (${Math.round(fs.statSync(destino).size / 1024)} KB)`);
