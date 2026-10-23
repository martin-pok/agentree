// Export série „Noční směna“: každý <section class="post"> jako PNG 1080 × 1350 (Instagram 4 : 5)
// a dvojnásobek 2160 × 2700 pro LinkedIn a ostré zobrazení na Retině.
//   node scripts/satoshi.mjs && PLAYWRIGHT_PATH=… node branding/social/ig-2026-10/render.mjs
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'export');
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.png': 'image/png' };

await fs.access(path.join(ROOT, 'public/fonts/satoshi/Satoshi-Variable.woff2')).catch(() => {
  throw new Error('Chybí Satoshi – spusť nejdřív `node scripts/satoshi.mjs`.');
});
const server = http.createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = p.startsWith('/public/') ? path.join(ROOT, p) : path.join(HERE, p === '/' ? 'posty.html' : p);
  try { res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' }); res.end(await fs.readFile(file)); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/`;
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const chyby = [];
for (const scale of [1, 2]) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 1400 }, deviceScaleFactor: scale });
  page.on('console', (m) => { if (m.type() === 'error') chyby.push(m.text()); });
  page.on('requestfailed', (r) => chyby.push(`načtení ${r.url()}`));
  await page.goto(url);
  await page.waitForFunction(() => document.documentElement.dataset.hotovo === '1');
  const pismo = await page.evaluate(() => document.fonts.check('500 40px Satoshi'));
  if (!pismo) throw new Error('Satoshi se nenačetlo.');
  for (const post of await page.$$('.post')) {
    const id = await post.getAttribute('id');
    await post.screenshot({ path: path.join(OUT, `${id}${scale === 2 ? '@2x' : ''}.png`) });
  }
  await page.close();
}
await browser.close();
server.close();
if (chyby.length) { console.error(chyby.join('\n')); process.exit(1); }
console.log(`Hotovo: ${OUT}`);
