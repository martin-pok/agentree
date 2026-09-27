// Statický server pro QA skripty (qa-contrast, qa-tvary): sestavený web a složka rozšíření.
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

// Malý statický server pro sestavený web – hosting se tu simulovat nedá a `file://` by rozbilo
// absolutní cesty, na kterých stránka stojí.
export function staticServer(dir) {
  const TYPY = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ttf': 'font/ttf', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8' };
  const server = http.createServer(async (req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html';
    const koren = path.resolve(dir) + path.sep;
    for (const kandidat of [rel, `${rel}/index.html`, 'index.html']) {
      // Porovnání s oddělovačem na konci: bez něj by `dist/web-jine` prošlo jako `dist/web`.
      const soubor = path.resolve(dir, kandidat);
      if (!soubor.startsWith(koren)) break;
      try {
        const body = await fs.readFile(soubor);
        res.writeHead(200, { 'Content-Type': TYPY[path.extname(soubor)] || 'application/octet-stream' }).end(body);
        return;
      } catch { /* zkusíme další kandidát */ }
    }
    res.writeHead(404).end();
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` })));
}
