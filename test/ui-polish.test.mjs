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
  assert.match(html, /Cursor[\s\S]*Bez údajů o limitu/, 'Cursor nemá měřený limit a má to říct');
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
    { app: 'Codex · aplikace', hourly: { [k1]: 300, [k2]: 100 } },
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
  assert.match(dp, /toLocaleDateString\(LOCALE, \{ day: 'numeric', month: 'numeric', year: 'numeric' \}\)/, 'zobrazené datum následuje jazyk aplikace');
  assert.doesNotMatch(dp, /select:not/, 'výběr z nabídky patří selects.js');
});

test('účet odkazuje na zásady soukromí ve zvoleném jazyce', async () => {
  const settings = await zdroj('public/js/views/settings.js');
  assert.match(settings, /jazyk\(\) === 'en' \? 'en\/privacy' : 'soukromi'/);
  assert.match(settings, /tr\('Zásady ochrany soukromí'\)/);
});

// Nabídka nebo kalendář mimo modální okno (aria-modal) zmizí ze stromu přístupnosti – čtečka
// obrazovky by v dialogu nepřečetla ani jednu službu. Ve skutečném prohlížeči to hlídá qa:desktop.
test('nabídky a kalendář v modálním okně jsou uvnitř něj a ve vrchní vrstvě', async () => {
  const sel = await zdroj('public/js/selects.js');
  assert.match(sel, /\(button\.closest\('\[aria-modal="true"\]'\) \|\| document\.body\)\.append\(panel\)/);
  assert.match(sel, /panel\.setAttribute\('popover', 'manual'\)[\s\S]*panel\.showPopover\?\.\(\)/);
  const dp = await zdroj('public/js/datepicker.js');
  assert.match(dp, /\(trigger\.closest\('\[aria-modal="true"\]'\) \|\| document\.body\)\.appendChild\(pop\)/);
  assert.match(dp, /pop\.setAttribute\('popover', 'manual'\);\s*pop\.showPopover\?\.\(\);\s*place\(/, 'kalendář se měří až ve vrchní vrstvě');
  assert.doesNotMatch(sel + dp, /document\.body\.append(Child)?\((panel|pop)\)/, 'nic se nevkládá natvrdo do body');
  const css = await zdroj('public/desktop.css');
  assert.match(css, /\.picker-option\[aria-selected='true'\]::after \{ content: '✓'; content: '✓' \/ '';/, 'fajfka nemá být v názvu položky pro čtečku');
});

// Zakázaný výběr (vypnuté „Dokončený úkol“, vypnuté noční ticho) zasekl celé Nastavení: sync()
// zapisoval `button.disabled = true` při každém průchodu, zápis atributu je mutace i beze změny
// a pozorovatel na ni znovu zavolal sync(). Ve skutečném prohlížeči to hlídá qa:tvary.
test('zakázaný výběr nerozjede nekonečnou smyčku pozorovatele', async () => {
  const sel = await zdroj('public/js/selects.js');
  assert.match(sel, /if \(button\.disabled !== select\.disabled\) button\.disabled = select\.disabled;/);
  assert.doesNotMatch(sel, /^\s*button\.disabled = select\.disabled;/m);
});

test('poslední zadání jde rozbalit a bere celý text z přepisu', async () => {
  const s = await zdroj('public/js/views/session.js');
  assert.match(s, /data-quote-toggle/);
  assert.match(s, /role === 'user' && e\.text/);
  const css = await zdroj('public/styles.css');
  assert.match(css, /\.quote\.is-clamped \{[^}]*-webkit-line-clamp: 5/);
});

test('volby v přepínačích mají stálý řez písma a tlačítko na tmavém pásu je čitelné', async () => {
  const css = await zdroj('public/styles.css');
  // Popisek tlačítka má vždy Onest 500. Kdyby vybraná volba ztučněla, text by při výběru poskočil do šířky.
  assert.match(css, /\.seg button \{[^}]*font-weight: 500/);
  assert.doesNotMatch(css, /\.seg button\[aria-pressed='true'\] \{[^}]*font-weight/);
  assert.doesNotMatch(css, /\.lchip\[aria-checked='true'\] \{[^}]*font-weight/);
  assert.match(css, /\.pulse-bar \.pb-all \{[^}]*color: var\(--pb-ink\)/, 'tlačítko v pruhu má barvu textu pruhu, ne světlý text na světlé ploše');
  assert.match(css, /\.budget-cards \{[^}]*auto-fit/, 'jediná karta rozpočtu vyplní celou šířku');
  const sk = await zdroj('public/js/views/skills.js');
  assert.match(sk, /class="sk-filtr" data-blok="zdroje"[\s\S]*class="sk-filtr" data-blok="puvod"/, 'filtry jsou popsané řádky pod sebou');
});

test('zelená plocha s textem používá bílé písmo na tmavší zelené', async () => {
  const css = await zdroj('public/styles.css');
  assert.match(css, /\.nav-badge \{[^}]*background: var\(--action\); color: var\(--on-action\)/, 'odznak je plná plocha akce s kontrastním písmem');
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
  assert.match(css, /html\[data-theme='dark'\] \{[^}]*--action: #EEF1F7;[^}]*--on-action: #0E1220/s);
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
  // \r?\n: pracovní kopie na Windows může mít CRLF a `\r` na konci řádku by regex odmítl.
  for (const radek of blok.split(/\r?\n/).slice(1, -1)) {
    assert.match(radek, povolene, `pravidlo navíc pro monitor na výšku: ${radek.trim()}`);
  }
  for (const zakazane of ['background', 'color:', 'box-shadow', 'transform', 'border-radius', 'font-size', ':hover', 'aria-current', '::before', '--tile']) {
    assert.ok(!blok.includes(zakazane), `nabídka na výšku nesmí předefinovat „${zakazane}“ – vznikl by druhý vzhled`);
  }
});


// Po resetu nemáme nový odečet. Staré procento ani „Obnoveno“ nesmí v živých oknech zůstat.
test('po resetu staré okno zmizí ze všech živých zobrazení', async () => {
  const { limitState, limitWindows, limitGauges } = await import('../public/js/ui.js');
  const { limitsAll } = await import('../public/js/limits-ui.js');
  const now = Date.UTC(2026, 8, 21, 12);
  const obnovene = { id: 'codex:codex:primary', app: 'Codex', label: 'Limit 5 h', provider: 'openai', usedPercent: 34, windowMinutes: 300, resetsAt: now - 60_000, at: now - 3_600_000 };
  const s = limitState(obnovene, now);
  assert.equal(s.label, 'Obnoveno');
  assert.equal(s.pct, 0, 'pruh je prázdný');
  assert.doesNotMatch(s.advice, /^Obnoveno –/, 'popisek se nesmí opakovat vedle stejného slova');

  const stav = { limits: [obnovene], connectors: [{ id: 'codex', state: 'connected' }], sessions: new Map() };
  for (const html of [limitWindows([obnovene], now), limitGauges([obnovene], now).join(''), limitsAll(stav, now)])
    assert.doesNotMatch(html, /Obnoveno|>0 %|>34 %/, 'bez nového odečtu žádný živý limit');

  const vycerpane = { ...obnovene, reached: true, resetsAt: now + 3_600_000, usedPercent: 100, at: now };
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
  assert.match(src, /tr\('Dalších \{0\} je', skryto\)/, 'počet skrytých agentů je vidět');
  assert.match(src, /class="tl-more" href="#\/agenti"/, 'a vede na seznam, kde jsou všichni');
  assert.doesNotMatch(src, /\.slice\(0, 7\)/, 'napevno zapsaná sedmička bez vysvětlení');
});

// „Neuloženo…“ (čekám na doťukání) a „Neuloženo“ (zápis selhal) se lišily třemi tečkami. Kdo přišel
// o podklady projektu, poznal to až po zavření okna.
test('selhané uložení podkladů projektu je vidět na první pohled', async () => {
  const src = await zdroj('public/js/views/project.js');
  assert.match(src, /stavUlozeni\(statusEl, 'chyba', tr\('Neuložilo se! Zkopíruj si text\.'\)\)/);
  assert.match(src, /classList\.toggle\('is-error', stav === 'chyba'\)/, 'chyba má vlastní barvu');
  assert.match(src, /setAttribute\('role', stav === 'chyba' \? 'alert'/, 'čtečka ji ohlásí hned');
  assert.match(src, /\$\{tr\('Podklady se neuložily:'\)\} \$\{err\.message\}/, 'toast říká, čeho se chyba týká');
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

// Chování hlaviček (natrvalo jen se značkou obsahu, jinak no-cache + 304) hlídá test/cerstvost.test.mjs.
test('statické soubory nesou značku verze, aby prohlížeč nestahoval totéž dokola', async () => {
  const http = await zdroj('src/http.js');
  const verze = await zdroj('src/verze-souboru.js');
  assert.match(verze, /export const znackaObsahu = \(telo\) => crypto\.createHash\('sha1'\)\.update\(telo\)/, 'značka se počítá z obsahu, ne z času změny');
  assert.match(http, /const znacka = znackaObsahu\(body\);/);
  assert.match(http, /if \(req\.headers\['if-none-match'\] === etag\) \{/, 'opakovaný dotaz dostane 304');
  assert.match(http, /res\.writeHead\(304, \{ \.\.\.SECURITY, ETag: etag/);
});

// Nabídka je mřížka. Bez určené šířky sloupce si ji vezme podle nejdelší položky („Upozornění“
// s odznakem „10+“), přeteče panel a odsazení vlevo a vpravo přestane být stejné.
test('nabídka se vejde do panelu a název se umí zkrátit', async () => {
  const css = await zdroj('public/styles.css');
  assert.match(css, /\.nav \{[^}]*grid-template-columns: minmax\(0, 1fr\)/, 'šířka sloupce musí být určená');
  assert.match(css, /\.nav a > span \{[^}]*min-width: 0;[^}]*text-overflow: ellipsis/, 'dlouhý název se zkrátí');
});

// Obrázky na kartách projektů problikávaly: každé překreslení mřížky (přetažení karty, příchod
// živých dat) vyrobilo nový <img>, který prohlížeč vykresloval znovu, a pod ním prosvitl přechod.
test('překreslení mřížky projektů zachová karty i jejich obrázky', async () => {
  const src = await zdroj('public/js/views/projects.js');
  assert.match(src, /function sesadKarty\(box, html\)/, 'mřížka se sesazuje po kartách, ne přepisem celku');
  assert.match(src, /if \(stara\.outerHTML === nova\.outerHTML\) \{ nova\.replaceWith\(stara\); continue; \}/, 'nezměněná karta zůstane');
  assert.match(src, /puvodni\.src === novy\.src\) novy\.replaceWith\(puvodni\)/, 'u změněné karty se převezme původní obrázek');
  assert.doesNotMatch(src, /fill\(el, 'grid', `<div class="pgrid">/, 'mřížka se nesmí přepisovat celá');
});

test('stav připojení se jmenuje „Připojeno“ a vybraná pilulka má jediný obrys', async () => {
  const app = await zdroj('public/js/app.js');
  assert.match(app, /live: \['dot--live', tr\('Připojeno'\), tr\('Připojeno'\)\]/);
  assert.doesNotMatch(app, /'Živě'/);
  const css = await zdroj('public/styles.css');
  const vybrana = css.match(/\.lchip\[aria-checked='true'\] \{[^}]*\}/)?.[0] || '';
  assert.ok(vybrana, 'pravidlo pro vybranou pilulku chybí');
  assert.doesNotMatch(vybrana, /box-shadow/, 'obrys dvakrát (border + shadow) vypadá jako stín');
  assert.equal((css.match(/^\.lchip \{/gm) || []).length, 1, 'jméno .lchip nesmí mít dvě různé komponenty');
});

test('období nabízejí kalendářní „Dnes“ i 14 dní a nepletou se s posledními 24 hodinami', async () => {
  const { periodBuckets } = await import('../public/js/data.js');
  const ted = new Date(2026, 8, 21, 8, 30).getTime(); // ráno: rolling okno sahá do včerejší noci
  const dnes = periodBuckets('today', ted);
  const den = periodBuckets('day', ted);
  assert.equal(new Date(dnes.since).getHours(), 0, '„Dnes“ začíná o půlnoci');
  assert.equal(new Date(dnes.since).getDate(), 21);
  assert.ok(den.since < dnes.since, '„24 hodin“ sahá do předchozího dne – proto obě období vedle sebe');
  assert.equal(dnes.starts.length, 9, 'v 8:30 má dnešek devět hodinových sloupců');
  assert.equal(periodBuckets('fortnight', ted).starts.length, 14);
  const stats = await zdroj('public/js/views/stats.js');
  assert.match(stats, /\['today', tr\('Dnes'\)\], \['day', tr\('24 hodin'\)\], \['week', tr\('7 dní'\)\], \['fortnight', tr\('14 dní'\)\], \['month', tr\('30 dní'\)\]/);
});

// Vyhledávání (⌘K) překrývá celou stránku. Po dojetí seznamu na konec se ale začala posouvat
// stránka vzadu – kolečko patří tomu, co je navrchu, ne tomu, co je pod překryvem.
test('překryvy drží posouvání uvnitř sebe a zamykají stránku pod sebou', async () => {
  const ui = await zdroj('public/js/ui.js');
  const paleta = ui.slice(ui.indexOf('export function createPalette'));
  assert.match(paleta, /root\.hidden = false;[\s\S]{0,400}?document\.body\.classList\.add\('has-modal'\)/, 'otevření vyhledávání musí zamknout stránku');
  assert.match(paleta, /root\.hidden = true;[\s\S]{0,300}?document\.body\.classList\.remove\('has-modal'\)/, 'zavření ji musí odemknout');
  const css = await zdroj('public/styles.css');
  assert.match(css, /body\.has-modal \{ overflow: hidden; \}/);
  // Každá rolovatelná oblast uvnitř překryvu musí posouvání zadržet.
  for (const trida of ['.palette-list', '.pop-list', '.modal', '.sheet', '.fb-list', '.pick-list']) {
    const pravidlo = css.match(new RegExp(`\\${trida} \\{[^}]*overflow-y: auto[^}]*\\}`))?.[0] || '';
    assert.ok(pravidlo, `${trida}: pravidlo s rolováním nenalezeno`);
    assert.match(pravidlo, /overscroll-behavior: contain/, `${trida} pustí posouvání na stránku pod sebou`);
  }
});

// Tlačítko na průvodce bylo obrysové na prázdném řádku a splývalo s pozadím. Banner ho udrží vidět
// a jeho popis musí souhlasit s počtem kroků, jinak slibuje něco jiného, než co uživatel dostane.
test('banner průvodce sedí s obsahem průvodce', async () => {
  const settings = await zdroj('public/js/views/settings.js');
  const welcome = await zdroj('public/js/welcome.js');
  assert.match(settings, /class="guide-banner"/);
  assert.match(settings, /<button class="btn btn--primary" type="button" data-welcome>/, 'výzva má být plné tlačítko, ne obrys');
  const kroku = (welcome.match(/^\s*\{ tag: tr\('/gm) || []).length;
  const cislovky = { 4: 'Čtyři', 5: 'Pět', 6: 'Šest', 7: 'Sedm' };
  assert.match(settings, new RegExp(`<p>\\$\\{tr\\('${cislovky[kroku]} obrazovek`), `průvodce má ${kroku} kroků – banner musí slíbit stejný počet`);
  // Průvodce musí mluvit o tom, co aplikace umí teď.
  for (const [co, kde] of [['limits', 'ukázka limitů'], ['ověřené API náklady', 'ověřené náklady'], ['logo klienta', 'obrázky projektů'], ['data jen čte', 'zabezpečení spárovaného telefonu']]) {
    assert.ok(welcome.includes(co), `průvodce nezmiňuje ${kde}`);
  }
});

// Průvodce je vodorovná karta. Bez určené výšky se na vysokém okně natáhl přes celou obrazovku
// do úzkého sloupce a vizuál plaval uprostřed prázdna.
test('průvodce drží vodorovný tvar a na nízkém okně ustoupí', async () => {
  const css = await zdroj('public/desktop.css');
  const karta = css.match(/\.welcome-dialog \{[^}]*\}/)?.[0] || '';
  assert.match(karta, /width: min\(920px, calc\(100vw - 40px\)\)/);
  assert.match(karta, /height: min\(600px, calc\(100dvh - 40px\)\)/, 'výška se musí držet u šířky');
  assert.doesNotMatch(css, /\.welcome-art \{[^}]*min-height: 500px/, 'vizuál nesmí diktovat výšku karty');
  assert.match(css, /\.welcome-content \{[^}]*overflow-y: auto/, 'delší text si odroluje uvnitř karty');
  assert.match(css, /@media \(min-width: 721px\) and \(max-height: 700px\) \{[^@]*\.welcome-dialog \{ height: calc\(100dvh - 32px\)/s, 'na nízkém okně se karta stáhne');
});

test('ikona průvodce je kreslená čárou v barvě textu, ne obrázek s pevnou barvou', async () => {
  const icons = await zdroj('public/js/icons.js');
  assert.match(icons, /export const BULB = `<svg viewBox="0 0 64 64"/);
  assert.match(icons, /stroke="currentColor"/, 'barva se dědí z textu, takže platí pro oba režimy');
  assert.doesNotMatch(icons, /BULB[\s\S]{0,400}fill="#/, 'žádná napevno zapsaná barva');
  const settings = await zdroj('public/js/views/settings.js');
  assert.match(settings, /<span class="guide-art" aria-hidden="true">\$\{BULB\}<\/span>/, 'vložené inline – <img> by barvu textu nezdědil');
  const css = await zdroj('public/styles.css');
  const art = css.match(/\.guide-art \{[^}]*\}/)?.[0] || '';
  assert.doesNotMatch(art, /linear-gradient/, 'barevný přechod s bublinami se nevrací');
  assert.match(art, /color: var\(--ink\)/);
});

// Rozbalený seznam limitů protáhl pravý sloupec a pod levým zůstalo prázdno (naměřeno 253 px).
test('poslední aktivita doplní řádky podle volného místa pod sloupcem', async () => {
  const src = await zdroj('public/js/views/overview.js');
  assert.match(src, /function doplnAktivitu\(el, celkem\)/);
  assert.match(src, /const mezera = druhy\.getBoundingClientRect\(\)\.height - mujSloupec\.getBoundingClientRect\(\)\.height;/, 'počítá se z naměřené výšky, ne odhadem');
  assert.match(src, /Math\.max\(AKTIVIT_MIN, Math\.min\(AKTIVIT_MAX, celkem, v\.aktivit \+ zmena\)\)/, 'počet řádků má dolní i horní mez');
  assert.match(src, /watchBalance\(el\.querySelector\('\.ov'\), \(\) => doplnAktivitu/, 'spouští se i při změně výšky, ne jen při nových datech');
  assert.doesNotMatch(src, /all\.slice\(0, 6\)/, 'napevno zapsaná šestka');
  const balance = await zdroj('public/js/balance.js');
  assert.match(balance, /export function watchBalance\(box, onZmena\)/);
});

// Plynulé posouvání kolečkem má web i aplikace stejné. Dřív ho web nesl ve vlastní kopii –
// dvě kopie se rozejdou (oprava v jedné, chyba v druhé). Chování měří qa:site a qa:desktop.
test('plynulé posouvání je jeden modul pro web i aplikaci a během posouvání nenaskakují karty', async () => {
  const lp = await zdroj('site/lp.js');
  assert.match(lp, /import \{ plynulePosouvani \} from '\/js\/plynule-posouvani\.js';/);
  assert.doesNotMatch(lp, /addEventListener\('wheel'/, 'web nesmí mít vlastní obsluhu kolečka');
  for (const html of ['site/index.html', 'site/en/index.html']) {
    assert.match(await zdroj(html), /<script type="module" src="\/lp\.js"><\/script>/, `${html}: lp.js musí být modul, jinak import neprojde`);
  }
  const app = await zdroj('public/js/app.js');
  assert.match(app, /import \{[^}]*\bplynulePosouvani\b[^}]*\} from '\.\/plynule-posouvani\.js';/);
  assert.match(app, /skocNa\(0\)/, 'navigace musí přerušit dojezd kolečka');
  assert.match(app, /^plynulePosouvani\(\);$/m);
  assert.match(app, /document\.documentElement\.classList\.add\('is-scrolling'\)/);
  const css = await zdroj('public/styles.css');
  // Hover efekty, které kartu zvednou nebo obarví, se během posouvání vypnou; ukazatel a klik ne.
  for (const pravidlo of ['.pcard:hover {', '.skill:hover {', '.appearance-option:hover {', '.row:hover {', '.prow:hover {', '[data-tip]:hover::before']) {
    assert.ok(css.includes(`:where(html:not(.is-scrolling)) ${pravidlo}`), `${pravidlo} během posouvání naskakuje`);
  }
  assert.doesNotMatch(css, /is-scrolling[^{]*\{[^}]*pointer-events: none/, 'vypnutý ukazatel spolkne klik (WebKit při kliknutí posouvá)');
});

test('Útrata: automaticky rozpoznaný plán nenutí ruční cenu ani nezobrazuje domněnku', async () => {
  const src = await zdroj('public/js/views/spend.js');
  assert.match(src, /filter\(\(p\) => p\.detected\)/);
  assert.doesNotMatch(src, /data-action="(?:add|license-add|plan-edit)"|openAddEntry/,
    'Útrata nesmí nabízet ruční zápis ani další licenci');
  assert.doesNotMatch(src, /Cena nezjištěna/, 'neznámá částka se nemá tvářit jako údaj k doplnění');
  assert.match(src, /Zjištěno z účtu Claude Code/, 'u plánu je vidět, odkud je zjištěný');
  assert.match(src, /title="\$\{esc\(p\.evidence\)\}"/, 'přesný kód poskytovatele jde ověřit v nápovědě');
  assert.doesNotMatch(src, /Předplatné a dokoupené extra usage[^\n]*zapisuj ručně/,
    'sekce nesmí končit plošnou výzvou k ručnímu opisování');
});

test('Upozornění: ikona, čas a „přečteno“ leží na jedné ose a čas neuskakuje', async () => {
  const src = await zdroj('public/js/views/alerts.js');
  // Čas není součást řádku s titulkem (dřív seděl nahoře a skákal podle délky textu).
  assert.doesNotMatch(src, /alert-top/);
  assert.match(src, /<time class="alert-time"/);
  // Sloupec tlačítka zůstává i u přečtené položky, jinak se čas posune doprava.
  assert.match(src, /<span class="alert-act">\$\{a\.read \? '' :/);
  const css = await zdroj('public/styles.css');
  const radek = css.match(/^\.alert-item \{ display: grid;[^}]*\}/m)?.[0] || '';
  assert.match(radek, /grid-template-columns: 40px minmax\(0, 1fr\) auto 40px/);
  assert.match(radek, /align-items: center/, 'ikona, čas i tlačítko jsou svisle na středu karty');
  assert.match(css, /\.alert-act \{[^}]*width: 40px; height: 40px;/);
});

test('Načítání: souvislá animace značky bez teček a bez kostry obrazovky pod scénou', async () => {
  const { loaderHtml } = await import('../public/js/loader.js');
  const html = loaderHtml('Načítám…');
  // Kmen a dvě větve jsou samostatné tahy, aby uzly naskočily přesně, když k nim tah doroste.
  assert.equal((html.match(/class="lm-stroke /g) || []).length, 3);
  assert.equal((html.match(/class="lm-node /g) || []).length, 3);
  const css = await zdroj('public/loader.css');
  // Při mezeře 100 začíná další úsek na konci tahu a kulaté zakončení tam nakreslí tečku.
  const [, carka, mezera] = css.match(/\.lm-stroke \{[^}]*stroke-dasharray: (\d+) (\d+)/);
  assert.ok(Number(mezera) > Number(carka), 'mezera čárkování musí být delší než tah');
  assert.match(css, /\.lm-stroke \{[^}]*opacity: 0;/, 'složený tah je skrytý, jinak ukáže tečku nulové délky');
  // Uzly naskakují měřítkem, ne poloprůhledně (šedé skvrny).
  assert.match(css, /\.lm-node \{[^}]*transform: scale\(0\);[^}]*transform-box: fill-box;/);
  const omezeny = css.slice(css.indexOf('prefers-reduced-motion'));
  for (const s of ['.lm-root', '.lm-stroke', '.loader-orbit']) assert.ok(omezeny.includes(s), `${s} se při omezeném pohybu nezastaví`);

  const app = await zdroj('public/js/app.js');
  assert.match(app, /viewEl\.classList\.toggle\('is-loading', !state\.loaded\)/);
  const styles = await zdroj('public/styles.css');
  assert.match(styles, /\.view\.is-loading > :not\(\.loader-wrap\) \{ display: none !important; \}/);
  // Na telefonu by „Připojuji…“ ukrojilo nadpis na „Přeh…“; totéž už říká scéna.
  assert.match(app, /connecting: \['dot--connecting'/);
  assert.match(styles, /\.conn-pill:has\(\.dot--connecting\) \{ display: none; \}/);
  // Profil a patička drží do načtení svůj tvar, aby nabídka po načtení neposkočila.
  assert.match(app, /class="p-skel"[^`]*class="avatar is-loading"/);
  assert.match(app, /budget-src"><span><span class="skel-text/);
  assert.match(app, /source-version p-skel/);
  assert.match(styles, /\.source-version\.p-skel \{ display: block; \}/);
});

test('karta projektu má pevnou výšku, ať v ní data přicházejí jakkoli', async () => {
  const css = await zdroj('public/styles.css');
  const view = await zdroj('public/js/views/projects.js');
  const pravidlo = (sel) => css.match(new RegExp(`^${sel.replace(/[.]/g, '\\.')} \\{([^}]*)\\}`, 'm'))?.[1] || '';
  // Čísla v patičce se nikdy nezalomí do druhého řádku a patička i poslední řádek mají pevnou výšku.
  assert.doesNotMatch(pravidlo('.pcard-foot'), /flex-wrap:\s*wrap/);
  assert.match(pravidlo('.pcard-foot'), /height: 32px/);
  assert.match(pravidlo('.pcard-time'), /height: 30px/);
  assert.match(pravidlo('.pcard-stat'), /white-space: nowrap/);
  assert.match(pravidlo('.pcard-spark'), /height: 40px/);
  assert.match(pravidlo('.pcard-desc'), /-webkit-line-clamp: 2;[^}]*min-height: 42px/);
  // Loga služeb (přibývají s daty) jsou v řádku s časem, ne mezi čísly, kde by vynutila zalomení.
  assert.match(view, /<span class="pcard-time">[^\n]*logoStack\(st\.services, 4\)/);
  assert.doesNotMatch(view, /<span class="pcard-foot">[\s\S]*?logoStack[\s\S]*?<\/span>\s*<span class="pcard-time">/);
});

test('filtry na Agentech drží jednu mřížku: popisky ve sloupci, řádky 56 px, nic se nezalamuje', async () => {
  const css = await zdroj('public/styles.css');
  const view = await zdroj('public/js/views/agents.js');
  const pravidlo = (sel) => css.match(new RegExp(`^${sel.replace(/[.]/g, '\\.')} \\{([^}]*)\\}`, 'm'))?.[1] || '';
  // Řádky karty: stejná mřížka (popisek | čipy | akce vpravo) a pevná výška.
  assert.match(pravidlo('.filtry-rada'), /grid-template-columns: 72px minmax\(0, 1fr\) auto;[^}]*min-height: 56px/);
  // Čipy v řádku se nezalamují (roluje se), takže řádek nemá dvě výšky.
  assert.match(pravidlo('.chips--rada'), /flex-wrap: nowrap;[^}]*overflow-x: auto/);
  // Každý řádek má viditelný popisek, který skupinu i pojmenuje pro čtečku.
  for (const id of ['ag-f-zdroj', 'ag-f-sluzba', 'ag-f-projekt']) {
    assert.match(view, new RegExp(`<span class="filtry-popis" id="${id}">`));
    assert.match(view, new RegExp(`aria-labelledby="${id}"`));
  }
  // Hledání i „Vybrat“ jsou v pravém sloupci karty, ne volně ve vlastním řádku.
  assert.match(view, /<div class="filtry-rada">[\s\S]*?<label class="search-field">/);
  assert.match(pravidlo('.filtry-rada > .btn, .filtry-rada > .search-field'), /grid-column: 3; justify-self: end/);
  // Nápověda k přetažení už nevisí jako text za čipy (zalamovala se pod ně).
  assert.doesNotMatch(view, /chips-hint/);
  assert.match(view, /data-project-drop="\$\{esc\(p\.id\)\}" title="\$\{tahni\}"/);
});

test('obnova má zřetelný stav bez vypnutí ovládacího prvku a respektuje omezený pohyb', async () => {
  const app = await zdroj('public/js/app.js');
  const css = await zdroj('public/styles.css');
  assert.match(app, /function spustObnovu\(button\)/);
  assert.match(app, /button\.setAttribute\('aria-busy', 'true'\)/);
  assert.match(app, /button\.classList\.add\('is-refreshing'\)/);
  assert.match(app, /button\.getAttribute\('aria-busy'\) === 'true'/, 'druhý refresh se nesmí spustit souběžně');
  assert.doesNotMatch(app.slice(app.indexOf("data-action === 'rescan'"), app.indexOf("data-action === 'rescan'") + 900), /button\.disabled\s*=/, 'stav obnovy nesmí změnit geometrii ani fokus tlačítka');
  assert.match(css, /#refresh-app\.is-refreshing \.icon \{ animation: refresh-rotation/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?#refresh-app\.is-refreshing \.icon \{ animation: none/);
});

test('Útrata bez připojeného API: na telefonu drží ikona, text a tlačítko jednu osu', async () => {
  const css = await zdroj('public/styles.css');
  // Mobilní .spend-hero centruje text kvůli prstenci rozpočtu; karta bez API je ale řádek
  // ikona – text – tlačítko a centrovaný text se od obou odtrhl.
  assert.match(css, /\.spend-hero\.is-unavailable \{ text-align: left; align-items: center; \}/);
  assert.match(css, /\.spend-hero\.is-unavailable > \.btn \{ margin-left: 44px; \}/);
});
