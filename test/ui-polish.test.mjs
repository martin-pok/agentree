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
  assert.match(ui, /err: 'err'/, 'chybový tón má červený druh');
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
  const src = await zdroj('public/js/cropper.js');
  assert.match(src, /TYPES = \['image\/png', 'image\/jpeg', 'image\/webp'\]/);
  assert.match(src, /Nahraj obrázek ve formátu PNG, JPG nebo WebP/);
  assert.match(src, /cover: \{ w: 1400, h: 400/, 'karta má poměr 7 : 2 a rozlišení pro Retinu');
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
  assert.match(html, /Výstup[\s\S]*?>99 %/);
  assert.match(html, /Vstup[\s\S]*?<1 %/);
  assert.match(html, /technická režie/);
  const bez = tokenBreakdown({ input: 5, output: 10 });
  assert.doesNotMatch(bez, /Cache/, 'bez cache se sekce nekreslí');
});

test('klikatelný text vypadá jako ovládací prvek a kalendář nahrazuje systémový', async () => {
  const css = await zdroj('public/styles.css');
  assert.match(css, /\.link \{[^}]*box-shadow: inset 0 0 0 1px var\(--line\)[^}]*color: var\(--ink\)/, 'odkaz nesmí být šedý popisek');
  assert.match(css, /\.link:hover \{ background: var\(--action\)/, 'při najetí se plocha vyplní');
  assert.match(css, /\.lim-all > summary \{[^}]*box-shadow: inset 0 0 0 1px var\(--line\)/);
  const app = await zdroj('public/js/app.js');
  assert.match(app, /startDatePickers\(\)/);
  const dp = await zdroj('public/js/datepicker.js');
  assert.match(dp, /inp\.type = 'text'/, 'systémový kalendář se nekreslí');
  assert.doesNotMatch(dp, /select:not/, 'výběr z nabídky patří selects.js');
});

test('poslední zadání jde rozbalit a bere celý text z přepisu', async () => {
  const s = await zdroj('public/js/views/session.js');
  assert.match(s, /data-quote-toggle/);
  assert.match(s, /role === 'user' && e\.text/);
  const css = await zdroj('public/styles.css');
  assert.match(css, /\.quote\.is-clamped \{[^}]*-webkit-line-clamp: 5/);
});

test('výběry v přepínačích mají tučnější písmo a tlačítko na tmavém pásu je čitelné', async () => {
  const css = await zdroj('public/styles.css');
  assert.match(css, /\.seg button\[aria-pressed='true'\] \{[^}]*font-weight: 500/);
  assert.match(css, /\.pulse-bar \.pb-all \{[^}]*color: #F4F3F7/, 'bílé tlačítko se světlým textem se nesmí vrátit');
  assert.match(css, /\.budget-cards \{[^}]*auto-fit/, 'jediná karta rozpočtu vyplní celou šířku');
  const sk = await zdroj('public/js/views/skills.js');
  assert.match(sk, /class="sk-filtr" data-blok="zdroje"[\s\S]*class="sk-filtr" data-blok="puvod"/, 'filtry jsou popsané řádky pod sebou');
});

test('zelená plocha s textem používá bílé písmo na tmavší zelené', async () => {
  const css = await zdroj('public/styles.css');
  assert.match(css, /\.nav-badge \{[^}]*background: var\(--teal-solid\); color: #fff/, 'odznak nesmí mít černé písmo na světlé zelené');
  assert.match(css, /\.appearance-icon \{ background: var\(--teal-solid\); color: #fff/);
  assert.doesNotMatch(css, /\.nav-badge \{[^}]*background: var\(--teal\);/);
});

test('logo projektu vyplní celý rámeček a karty se dají přetahovat i ovládat klávesnicí', async () => {
  const css = await zdroj('public/styles.css');
  assert.match(css, /\.plogo img \{[^}]*object-fit: cover/);
  assert.doesNotMatch(css, /\.plogo img \{[^}]*padding/);
  const r = await zdroj('public/js/reorder.js');
  assert.match(r, /e\.altKey/, 'Alt + šipky');
  assert.match(r, /layoutRect/, 'cíl se hledá podle rozvržení, ne podle rozpracované animace');
});

test('ovládací prvky mají v tmavém režimu světlou plochu s tmavým písmem', async () => {
  const css = await zdroj('public/styles.css');
  assert.match(css, /html\[data-theme='dark'\] \{[^}]*--action: #F5F2F8;[^}]*--on-action: #16141D/s);
  for (const sel of ['\\.btn--primary', "\\.seg button\\[aria-pressed='true'\\]", "\\.switch\\[aria-checked='true'\\]"]) {
    assert.match(css, new RegExp(`${sel} \\{[^}]*background: var\\(--action\\)`), `${sel} musí používat --action`);
  }
  assert.doesNotMatch(css, /\.btn--primary \{[^}]*ink-surface/, 'tmavá plocha na tmavém pozadí se nesmí vrátit');
});

test('nabídka na výšku se od nabídky na šířku liší jen rozestupy, ne vzhledem', async () => {
  const css = await zdroj('public/styles.css');
  const blok = css.match(/@media \(orientation: portrait\) and \(min-width: 881px\) and \(min-height: 1100px\) \{[\s\S]*?\n\}/)?.[0] || '';
  assert.ok(blok, 'pravidlo pro monitor na výšku chybí');
  // Smí se měnit jen rozestup a výška cíle. Všechno ostatní se dědí, aby nabídka vypadala stejně.
  const povolene = /^\s*(?:\.nav \{ gap: [^}]+\}|\.nav a \{ min-height: [^}]+\}|@media[^{]*\{|\}|\/\*[\s\S]*?\*\/|)$/;
  for (const radek of blok.split('\n').slice(1, -1)) {
    assert.match(radek, povolene, `pravidlo navíc pro monitor na výšku: ${radek.trim()}`);
  }
  for (const zakazane of ['background', 'color:', 'box-shadow', 'transform', 'border-radius', 'font-size', ':hover', 'aria-current', '::before', '--tile']) {
    assert.ok(!blok.includes(zakazane), `nabídka na výšku nesmí předefinovat „${zakazane}“ – vznikl by druhý vzhled`);
  }
});


// Tentýž limit hlásil na Přehledu „0 %“, ve Statistikách „Obnoven“ a rozbalený seznam „obnoveno“.
// Tři zobrazení, tři různá tvrzení o jednom čísle. Popis stavu proto vzniká na jednom místě.
test('obnovené i vyčerpané okno limitu hlásí všechna tři zobrazení stejně', async () => {
  const { limitState, limitWindows, limitGauges } = await import('../public/js/ui.js');
  const { limitsAll } = await import('../public/js/limits-ui.js');
  const now = Date.UTC(2026, 8, 21, 12);
  const obnovene = { id: 'codex:codex:primary', app: 'Codex', label: 'Limit 5 h', provider: 'openai', usedPercent: 34, windowMinutes: 300, resetsAt: now - 60_000, at: now - 3_600_000 };
  const s = limitState(obnovene, now);
  assert.equal(s.label, 'Obnoveno');
  assert.equal(s.pct, 0, 'pruh je prázdný');
  assert.doesNotMatch(s.advice, /^Obnoveno –/, 'popisek se nesmí opakovat vedle stejného slova');

  const stav = { limits: [obnovene], connectors: [{ id: 'codex', state: 'connected' }], sessions: new Map() };
  for (const html of [limitWindows([obnovene], now), limitGauges([obnovene], now).join(''), limitsAll(stav, now)]) {
    assert.match(html, /Obnoveno/, 'všude stejné slovo');
    assert.doesNotMatch(html, />0 %|>34 %/, 'žádné zastaralé ani vymyšlené číslo');
  }

  const vycerpane = { ...obnovene, reached: true, resetsAt: now + 3_600_000, usedPercent: 100 };
  assert.equal(limitState(vycerpane, now).label, 'Vyčerpáno');
  for (const html of [limitWindows([vycerpane], now), limitGauges([vycerpane], now).join(''), limitsAll({ ...stav, limits: [vycerpane] }, now)]) {
    assert.match(html, /Vyčerpáno/);
  }
});

// Osa „Dnešní směna“ brala jen prvních sedm agentů a zbytek tiše zahodila. U nástroje, který má
// hlídat všechny agenty, je zamlčení horší než delší seznam – pod osou proto stojí, kolik jich chybí.
test('časová osa přiznává agenty, kteří se na ni nevešli', async () => {
  const src = await zdroj('public/js/views/overview.js');
  assert.match(src, /const TIMELINE_MAX = 7;/);
  assert.match(src, /const skryto = vybrane\.length - rows\.length;/);
  assert.match(src, /Dalších \$\{skryto\} je/, 'počet skrytých agentů je vidět');
  assert.match(src, /class="tl-more" href="#\/agenti"/, 'a vede na seznam, kde jsou všichni');
  assert.doesNotMatch(src, /\.slice\(0, 7\)/, 'napevno zapsaná sedmička bez vysvětlení');
});

// „Neuloženo…“ (čekám na doťukání) a „Neuloženo“ (zápis selhal) se lišily třemi tečkami. Kdo přišel
// o podklady projektu, poznal to až po zavření okna.
test('selhané uložení podkladů projektu je vidět na první pohled', async () => {
  const src = await zdroj('public/js/views/project.js');
  assert.match(src, /stavUlozeni\(statusEl, 'chyba', 'Neuložilo se! Zkopíruj si text\.'\)/);
  assert.match(src, /classList\.toggle\('is-error', stav === 'chyba'\)/, 'chyba má vlastní barvu');
  assert.match(src, /setAttribute\('role', stav === 'chyba' \? 'alert'/, 'čtečka ji ohlásí hned');
  assert.match(src, /Podklady se neuložily: \$\{err\.message\}/, 'toast říká, čeho se chyba týká');
  assert.doesNotMatch(src, /textContent = 'Neuloženo'/, 'text k nerozeznání od čekání');
  const css = await zdroj('public/styles.css');
  assert.match(css, /\[data-notes-status\]\.is-error \{ color: var\(--velvet-ink\)/);
});

test('pro červený toast existuje jediný název tónu', async () => {
  const ui = await zdroj('public/js/ui.js');
  assert.match(ui, /const TOAST_KIND = \{ ink: 'ok', ok: 'ok', err: 'err', info: 'info', action: 'action' \};/);
  assert.match(ui, /TOAST_KIND\[tone\] \|\| 'info'/, 'neznámý tón se nesmí tvářit jako úspěch');
  for (const f of ['app.js', 'ui.js', 'launcher-ui.js', 'projects-ui.js', 'views/spend.js', 'views/settings.js', 'views/session.js', 'views/project.js', 'views/projects.js', 'views/agents.js', 'views/alerts.js', 'views/skills.js', 'views/overview.js', 'avatars.js']) {
    const src = await zdroj(`public/js/${f}`);
    assert.doesNotMatch(src, /toast\([^;]*tone: '(velvet|coral)'/s, `${f} používá starý název tónu`);
  }
});

// Dovednosti, historie plánu a extra usage se načítaly jednou za běh aplikace. Kdo mezitím přidal
// SKILL.md nebo odpracoval další hodinu, viděl stará čísla a neměl jak poznat, že jsou stará.
test('stránky s daty ze souborů je načítají při každém otevření', async () => {
  const skills = await zdroj('public/js/views/skills.js');
  assert.match(skills, /if \(v\.items\) update\(\);\s*\n\s*load\(\);/, 'seznam se obnoví při každém otevření');
  assert.doesNotMatch(skills, /if \(!v\.items\) load\(\);/, 'načtení jen při prvním otevření');
  for (const f of ['views/stats.js', 'views/spend.js']) {
    const src = await zdroj(`public/js/${f}`);
    assert.doesNotMatch(src, /if \(v\.usage === undefined\) \{\s*\n?\s*v\.usage = null;\s*\n?\s*(loadUsage\(\);|api\.planUsage)/, `${f}: historie se čte jen jednou za běh`);
  }
});

test('statické soubory nesou značku verze, aby prohlížeč nestahoval totéž dokola', async () => {
  const http = await zdroj('src/http.js');
  assert.match(http, /const znacka = \(file, body\) =>/, 'značka se počítá z obsahu');
  assert.match(http, /createHash\('sha1'\)\.update\(body\)/, 'z obsahu, ne z času změny');
  assert.match(http, /if \(req\.headers\['if-none-match'\] === etag\) \{/, 'opakovaný dotaz dostane 304');
  assert.match(http, /res\.writeHead\(304, \{ \.\.\.SECURITY, ETag: etag/);
  assert.match(http, /'Cache-Control': asset \? 'private, max-age=31536000, immutable' : 'no-cache', ETag: etag/, 'kód a styly se vždy ověří u serveru');
});

// Nabídka je mřížka. Bez určené šířky sloupce si ji vezme podle nejdelší položky („Upozornění“
// s odznakem „10+“), přeteče panel a odsazení vlevo a vpravo přestane být stejné.
test('nabídka se vejde do panelu a název se umí zkrátit', async () => {
  const css = await zdroj('public/styles.css');
  assert.match(css, /\.nav \{[^}]*grid-template-columns: minmax\(0, 1fr\)/, 'šířka sloupce musí být určená');
  assert.match(css, /\.nav a > span \{[^}]*min-width: 0;[^}]*text-overflow: ellipsis/, 'dlouhý název se zkrátí');
});
