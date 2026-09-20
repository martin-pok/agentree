import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const zdroj = (p) => fs.readFile(new URL(`../${p}`, import.meta.url), 'utf8');

// Uživatel viděl čtyři černé „Nabídka agentů obnovena“ pod sebou a v levém panelu nadpis
// „Živá data“, který opakoval stav z hlavičky. Tyhle testy hlídají, že se to nevrátí.

test('toast je vždy jen jeden a rozlišuje úspěch, chybu a poznámku', async () => {
  const ui = await zdroj('public/js/ui.js');
  assert.doesNotMatch(ui, /children\.length > 4/, 'zásobník toastů se nesmí vrátit');
  assert.match(ui, /box\.replaceChildren\(\)/, 'nový toast nahrazuje starý');
  assert.match(ui, /velvet: 'err', coral: 'err'/, 'chybové tóny mají červený druh');
  assert.match(ui, /role', kind === 'err' \? 'alert' : 'status'/, 'chyba se čtečkám ohlásí hned');
  const css = await zdroj('public/styles.css');
  for (const k of ['ok', 'err']) assert.match(css, new RegExp(`\\.toast--${k} \\{ background: var\\(--toast-${k}\\)`));
});

test('levý panel už neopakuje „Živá data“', async () => {
  const app = await zdroj('public/js/app.js');
  assert.doesNotMatch(app, /Živá data/);
});

test('rozbalovací limity vypisují všechny nástroje a u neměřených to říkají', async () => {
  const { limitsAll, allToolLimits } = await import('../public/js/limits-ui.js');
  const now = Date.now();
  const state = {
    limits: [{ id: 'codex:codex:primary', app: 'Codex', label: 'Limit 5 h', provider: 'openai', usedPercent: 34, windowMinutes: 300, resetsAt: now + 3_600_000, at: now - 60_000 }],
    connectors: [
      { id: 'codex', state: 'connected' },
      { id: 'gemini-cli', state: 'missing', detail: 'Gemini CLI na tomto Macu není.' },
      { id: 'cursor', state: 'connected' },
    ],
    sessions: new Map(),
  };
  assert.equal(allToolLimits(state, now).length, 7, 'každý sledovaný nástroj má řádek');
  const html = limitsAll(state, now);
  assert.match(html, /Limit 5 h<\/span><b>34 %/);
  assert.match(html, /Gemini CLI na tomto Macu není/);
  assert.match(html, /Limit se z místních dat zjistit nedá/, 'Cursor nemá měřený limit a má to říct');
  assert.doesNotMatch(html, /undefined|NaN/);
});

test('heatDetails spočítá dny, podíl nástroje a možné dny okna', async () => {
  const { heatDetails } = await import('../public/js/data.js');
  const { hourTs } = await import('../public/js/format.js');
  const now = new Date(2026, 8, 20, 12, 0).getTime();
  const key = (d, h) => new Date(new Date(2026, 8, d, h, 0).getTime()).toISOString().slice(0, 13);
  const kdy = (k) => { const x = new Date(hourTs(k)); return [(x.getDay() + 6) % 7, x.getHours()]; };
  const k1 = key(14, 9); // v okně, dvakrát ve stejné hodině stejného týdne v týdnu
  const k2 = key(7, 9);
  const sessions = [
    { app: 'Codex · ChatGPT app', hourly: { [k1]: 300, [k2]: 100 } },
    { app: 'Claude Code', hourly: { [k1]: 100 } },
  ];
  const d = heatDetails(sessions, now, 30);
  const [r, h] = kdy(k1);
  const c = d[r][h];
  assert.equal(c.tokens, 500);
  assert.equal(c.dny, 2, 'aktivní ve dvou různých dnech');
  assert.equal(c.top.app, 'Codex');
  assert.equal(Math.round(c.top.share * 100), 80);
  assert.ok(c.mozne >= 4 && c.mozne <= 5, 'třicetidenní okno má 4–5 stejných dnů v týdnu');
  const prazdna = d.flat().find((x) => x.tokens === 0);
  assert.equal(prazdna.top, null);
});

test('obrázek projektu jinak než PNG, JPG a WebP se odmítne dřív, než se cokoli nahraje', async () => {
  const src = await zdroj('public/js/projects-ui.js');
  assert.match(src, /MEDIA_TYPES = \['image\/png', 'image\/jpeg', 'image\/webp'\]/);
  assert.match(src, /Nahraj obrázek ve formátu PNG, JPG nebo WebP/);
  const css = await zdroj('public/styles.css');
  for (const p of ['aurora', 'dune', 'noir', 'lagoon', 'ember', 'orchid', 'graphite', 'sage']) assert.match(css, new RegExp(`\\.cover--${p} \\{`), `chybí přechod ${p}`);
});

test('odznaky upozornění ukazují nejvýš „10+“ a obrys zaostření se v rolovacích řádcích neořezává', async () => {
  const app = await zdroj('public/js/app.js');
  assert.doesNotMatch(app, /99\+/);
  assert.equal((app.match(/'10\+'/g) || []).length, 3, 'postranní panel, zvonek i nabídka Více');
  const css = await zdroj('public/styles.css');
  assert.match(css, /\.launch-chips :focus-visible[^}]*outline-offset: -3px/);
  assert.match(css, /\.nav \{[^}]*align-content: center/, 'nabídka se nesmí natahovat přes celou výšku');
});

test('složení tokenů má samostatné měřítko pro spotřebu a cache', async () => {
  const { tokenBreakdown } = await import('../public/js/charts.js');
  const html = tokenBreakdown({ input: 11_000, output: 2_150_000, cacheWrite: 17_600_000, cacheRead: 1_140_000_000 });
  // Výstup je 99 % spotřeby a vstup 1 % – poměr se nesmí utopit pod čtením z cache.
  assert.match(html, /Výstup[\s\S]*?99 %/);
  assert.match(html, /Vstup[\s\S]*?1 %/);
  assert.match(html, /technická režie/);
  const bez = tokenBreakdown({ input: 5, output: 10 });
  assert.doesNotMatch(bez, /Cache/, 'bez cache se sekce nekreslí');
});
