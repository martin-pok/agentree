// Náhled sestaveného webu. Jen pro vývoj: statické soubory z dist/web, žádné API.
//
// Posílá stejné hlavičky jako hosting – čte je z vercel.json (hlavickyHostingu), takže se v prohlížeči
// dá ověřit, že CSP a ostatní hlavičky webu nic nerozbijí (konzole bez porušení CSP).
import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPY = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.xml': 'application/xml', '.txt': 'text/plain', '.sh': 'text/plain', '.ico': 'image/x-icon' };

export const nactiVercel = () => JSON.parse(readFileSync(path.join(root, 'vercel.json'), 'utf8'));

// Hlavičky z vercel.json pro danou cestu. `source` je ve vzorech, které web používá, zároveň platný
// regulární výraz (skupiny v závorkách), takže ho stačí ukotvit. Platí všechna pravidla, která na
// cestu sedí, a pozdější přepíše stejnojmennou hlavičku dřívějšího – stejně jako na hostingu.
export function hlavickyHostingu(cesta, konfigurace = nactiVercel()) {
  const out = {};
  for (const pravidlo of konfigurace.headers || []) {
    if (!new RegExp(`^${pravidlo.source}$`).test(cesta)) continue;
    for (const { key, value } of pravidlo.headers) out[key] = value;
  }
  return out;
}

export function serveSite(koren, { konfigurace = nactiVercel() } = {}) {
  return http.createServer(async (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const cesta = pathname.replace(/^\/+/, '') || 'index.html';
    const hlavicky = hlavickyHostingu(pathname, konfigurace);
    for (const kandidat of [cesta, `${cesta}/index.html`, `${cesta}.html`]) {
      const soubor = path.resolve(koren, kandidat);
      if (soubor !== koren && !soubor.startsWith(koren + path.sep)) break;
      try {
        const telo = await fs.readFile(soubor);
        res.writeHead(200, { 'Content-Type': `${TYPY[path.extname(soubor)] || 'application/octet-stream'}; charset=utf-8`, 'Cache-Control': 'no-store', ...hlavicky }).end(telo);
        return;
      } catch { /* Zkus ještě adresářový index, než pošleš hlavičky. */ }
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', ...hlavicky }).end('Nenalezeno');
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { buildSite } = await import('./build-site.mjs');
  const { out } = await buildSite();
  const port = Number(process.env.PORT) || 4631;
  serveSite(path.resolve(out)).listen(port, '127.0.0.1', () => console.log(`Náhled webu běží na http://127.0.0.1:${port}`));
}
