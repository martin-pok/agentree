#!/usr/bin/env node
// Vyrenderuje podklady pro Chrome Web Store ze zdrojů v source/ do export/ ve skutečném Chromu (headless,
// protokol DevTools přes pipe). Přesné rozměry v CSS pixelech, poměr 1:1. Spuštění: node render.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (f) => pathToFileURL(path.join(here, 'source', f)).href;
const exp = path.join(here, 'export');
fs.mkdirSync(exp, { recursive: true });
const JOBS = [
  { url: src('icon.svg'), w: 128, h: 128, out: 'icon-128.png', transparent: true },
  { url: src('icon.svg'), w: 48, h: 48, zoom: 48 / 128, out: 'icon-48.png', transparent: true },
  { url: src('icon.svg'), w: 32, h: 32, zoom: 32 / 128, out: 'icon-32.png', transparent: true },
  { url: src('icon-16.svg'), w: 16, h: 16, out: 'icon-16.png', transparent: true },
  { url: src('promo-small.html'), w: 440, h: 280, out: 'promo-small-440x280.png' },
  { url: src('marquee.html'), w: 1400, h: 560, out: 'marquee-1400x560.png' },
  ...(process.env.SCREENSHOTS ? JSON.parse(process.env.SCREENSHOTS) : []),
];
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'agenteeq-render-'));
const chrome = spawn(process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  [`--user-data-dir=${profile}`, '--remote-debugging-pipe', '--headless=new', '--no-first-run', '--hide-scrollbars', '--allow-file-access-from-files', 'about:blank'],
  { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });
let buf = Buffer.alloc(0), seq = 0; const w = new Map();
chrome.stdio[4].on('data', (d) => { buf = Buffer.concat([buf, d]); let i; while ((i = buf.indexOf(0)) >= 0) { const m = JSON.parse(buf.subarray(0, i)); buf = buf.subarray(i + 1); if (m.id && w.has(m.id)) { w.get(m.id)(m); w.delete(m.id); } } });
const cdp = (method, params = {}, sessionId) => new Promise((res, rej) => { const id = ++seq; w.set(id, (m) => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result))); chrome.stdio[3].write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + '\0'); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  await sleep(1200);
  for (const job of JOBS) {
    const { targetId } = await cdp('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp('Target.attachToTarget', { targetId, flatten: true });
    await cdp('Page.enable', {}, sessionId);
    await cdp('Emulation.setDeviceMetricsOverride', { width: job.w, height: job.h, deviceScaleFactor: 1, mobile: false }, sessionId);
    if (job.transparent) await cdp('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } }, sessionId);
    await cdp('Page.navigate', { url: job.url }, sessionId);
    await sleep(job.wait || 900);
    if (job.zoom) await cdp('Runtime.evaluate', { expression: `document.documentElement.style.zoom='${job.zoom}';document.body&&(document.body.style.margin='0');true` }, sessionId);
    if (job.eval) await cdp('Runtime.evaluate', { expression: job.eval, awaitPromise: true }, sessionId);
    await cdp('Runtime.evaluate', { expression: 'document.fonts ? document.fonts.ready.then(() => true) : true', awaitPromise: true }, sessionId);
    await sleep(300);
    const shot = await cdp('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: job.w, height: job.h, scale: 1 }, captureBeyondViewport: false }, sessionId);
    fs.writeFileSync(path.join(exp, job.out), Buffer.from(shot.data, 'base64'));
    console.log(`✓ ${job.out}`);
    await cdp('Target.closeTarget', { targetId });
  }
} finally {
  try { await cdp('Browser.close'); } catch {}
  setTimeout(() => { chrome.kill('SIGKILL'); fs.rmSync(profile, { recursive: true, force: true }); process.exit(0); }, 800);
}
