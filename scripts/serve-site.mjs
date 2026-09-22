// Náhled sestaveného webu. Jen pro vývoj: statické soubory z dist/web, žádné API.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { buildSite } from './build-site.mjs';

const TYPY = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.json': 'application/json', '.xml': 'application/xml', '.txt': 'text/plain', '.ico': 'image/x-icon' };
const { out } = await buildSite();
const koren = path.resolve(out);

const server = http.createServer(async (req, res) => {
  const cesta = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/+/, '') || 'index.html';
  for (const kandidat of [cesta, `${cesta}/index.html`]) {
    const soubor = path.resolve(koren, kandidat);
    if (soubor !== koren && !soubor.startsWith(koren + path.sep)) break;
    try {
      const telo = await fs.readFile(soubor);
      res.writeHead(200, { 'Content-Type': `${TYPY[path.extname(soubor)] || 'application/octet-stream'}; charset=utf-8`, 'Cache-Control': 'no-store' }).end(telo);
      return;
    } catch { /* Zkus ještě adresářový index, než pošleš hlavičky. */ }
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Nenalezeno');
});

const port = Number(process.env.PORT) || 4631;
server.listen(port, '127.0.0.1', () => console.log(`Náhled webu běží na http://127.0.0.1:${port}`));
