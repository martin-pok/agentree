import { createRequire } from 'node:module';
import { pripravUkazku } from './demo-fixture.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const [out, trasy = 'prehled,agenti', sirky = '1440,375', motion = 'no-preference'] = process.argv.slice(2);
const demo = await pripravUkazku({}, { oznacit: false });
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
try {
  for (const w of sirky.split(',').map(Number)) for (const t of trasy.split(',')) {
    const p = await b.newPage({ viewport: { width: w, height: 1000 }, reducedMotion: motion, serviceWorkers: 'block' });
    const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
    await p.goto(`${demo.url}/#/${t}`); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(1500);
    const font = await p.evaluate(() => document.fonts.check('16px Satoshi'));
    await p.screenshot({ path: `${out}/${t}-${w}.png`, fullPage: process.env.FULL === '1' });
    console.log(t, w, 'satoshi', font, 'overflow', await p.evaluate(() => document.documentElement.scrollWidth > innerWidth), errs);
    await p.close();
  }
} finally { await b.close(); await demo.close(); process.exit(0); }
