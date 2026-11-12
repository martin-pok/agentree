// Náhled pro sdílení odkazu na web (og:image, twitter:image) 1200×630 v češtině a angličtině.
// Spouštět po změně vzhledu aplikace nebo snímků v site/detail: `node scripts/og-image.mjs`.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { buildSite } from './build-site.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { out } = await buildSite();
const typ = { '.css': 'text/css', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png' };
const TEXTY = {
  cs: { h1: 'Každý agent má svůj úkol. Ty máš přehled.', lead: 'Claude Code, Codex, Cursor i&nbsp;webové chaty v&nbsp;jednom přehledu.', tag: 'Pro Mac a Windows', shot: '/detail/prehled.webp' },
  en: { h1: 'Every agent has a task. You have the overview.', lead: 'Claude Code, Codex, Cursor and web chats in one overview.', tag: 'For Mac and Windows', shot: '/detail/prehled-en.webp' },
};
const stranka = (t) => `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/fonts/fonts.css"><style>
html,body{margin:0;width:1200px;height:630px;overflow:hidden;background:#0C0B10}
body{font-family:'Satoshi',system-ui,sans-serif;color:#F4F3F7;position:relative}
.zare{position:absolute;inset:0;background:radial-gradient(640px 420px at 82% 18%,rgba(118,101,201,.42),transparent 70%),radial-gradient(520px 360px at 8% 110%,rgba(62,138,110,.22),transparent 70%)}
.text{position:absolute;left:72px;top:72px;width:520px}
.znacka{display:flex;align-items:center;gap:14px;font-size:30px;font-weight:500;letter-spacing:-.01em}
.znacka img{width:52px;height:52px}
h1{margin:64px 0 0;font-size:52px;line-height:1.08;font-weight:500;letter-spacing:-.025em;text-wrap:balance}
p{margin:24px 0 0;font-size:22px;line-height:1.45;color:#A9A3B4;font-weight:400;text-wrap:pretty}
.stitek{position:absolute;left:72px;bottom:64px;display:inline-flex;align-items:center;height:40px;padding:0 18px;border-radius:999px;background:rgba(244,243,247,.08);box-shadow:inset 0 0 0 1px rgba(244,243,247,.14);font-size:17px;font-weight:500;color:#F4F3F7}
.okno{position:absolute;left:640px;top:84px;width:760px;height:570px;border-radius:20px;overflow:hidden;background:#16141D;box-shadow:0 0 0 1px rgba(255,255,255,.10),0 40px 80px -20px rgba(0,0,0,.7)}
.okno img{width:100%;height:auto;display:block}
</style></head><body><div class="zare"></div>
<div class="text"><div class="znacka"><img src="/brand/agenteeq-mark-dark.svg" alt="">Agenteeq</div><h1>${t.h1}</h1><p>${t.lead}</p></div>
<div class="stitek">${t.tag}</div>
<div class="okno"><img src="${t.shot}" alt=""></div>
</body></html>`;
const server = http.createServer(async (req, res) => {
  const p = new URL(req.url, 'http://x').pathname;
  if (p.startsWith('/__og-')) { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(stranka(TEXTY[p.slice(6, 8)])); return; }
  try { const f = path.join(out, p); res.writeHead(200, { 'content-type': typ[path.extname(f)] || 'application/octet-stream' }).end(await fs.readFile(f)); } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}`;
const b = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
for (const j of ['cs', 'en']) {
  const page = await b.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.goto(`${url}/__og-${j}`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  const fonty = await page.evaluate(() => [...document.fonts].filter((f) => f.family.includes('Satoshi')).map((f) => `${f.weight}:${f.status}`));
  const vyska = await page.evaluate(() => document.querySelector('.text').getBoundingClientRect().bottom);
  console.log(j, 'Satoshi', fonty.join(' '), '| konec textu', Math.round(vyska), 'px');
  await page.screenshot({ path: path.resolve(`site/og-${j}.jpg`), type: 'jpeg', quality: 88 });
  await page.close();
}
await b.close();
server.close();
