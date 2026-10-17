import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { launchTargets } from '../src/launcher.js';
import { ovladani } from '../public/js/views/skills.js';

const zdroj = (p) => fs.readFile(new URL(`../${p}`, import.meta.url), 'utf8');

// Prázdná obrazovka je první, co uživatel po instalaci uvidí. Tyhle testy hlídají, že mu
// Agenteeq v tu chvíli neukáže ovládání, které nemá co ovládat, ani čísla, která nemá odkud vzít.

test('Dovednosti: ovládání se ukáže jen tam, kde má co ovládat', () => {
  const prazdno = ovladani({ pocet: 0, zdroju: 0, puvodu: 0 });
  assert.deepEqual(prazdno, { hledani: false, zdroje: false, popis: false, razeni: false, puvod: false },
    'nad prázdným seznamem nemá smysl hledat, řadit ani filtrovat');

  // Jeden zdroj znamená, že „Vše" i ten zdroj vrátí tentýž seznam – přepínač mezi nimi je past.
  const jedinyZdroj = ovladani({ pocet: 4, zdroju: 1, puvodu: 1 });
  assert.equal(jedinyZdroj.zdroje, false);
  assert.equal(jedinyZdroj.puvod, false);
  assert.equal(jedinyZdroj.hledani, true, 'hledat se dá i mezi dovednostmi z jednoho zdroje');
  assert.equal(jedinyZdroj.razeni, true);

  assert.equal(ovladani({ pocet: 1, zdroju: 1, puvodu: 1 }).razeni, false, 'jednu položku není podle čeho seřadit');
  assert.deepEqual(ovladani({ pocet: 9, zdroju: 3, puvodu: 2 }),
    { hledani: true, zdroje: true, popis: true, razeni: true, puvod: true });
});

// Pod zadáním stojí jen poznámka cíle, a to jen tam, kde říká něco, co jinde není (schránka,
// chybějící model). Obecná nápověda režimu („Otevře aplikaci…“, „Běží na tvých předplatných…“)
// opakovala to, co už říká přepínač režimu, a uživatel ji četl u každého spuštění znovu.
test('spuštění agenta: žádná obecná nápověda režimu, poznámka cíle se neopakuje', async () => {
  const kod = await zdroj('public/js/launcher-ui.js');
  assert.doesNotMatch(kod, /MODE_HINT/, 'nápověda režimu se vrátila do launcher-ui.js');
  assert.match(kod, /fill\(root, 'note', esc\(t\.note \|\| ''\)\)/, 'pod zadáním smí stát jen poznámka cíle');

  const env = {
    bins: { claude: '/opt/bin/claude', codex: '/opt/bin/codex', gemini: '/opt/bin/gemini', qwen: '/opt/bin/qwen' },
    chatgptApp: true,
    claudeApp: true,
    ollama: { ok: true, models: [{ name: 'llama3.2:3b' }] },
  };
  const fraze = [/ve schránce/gi, /⌘V/g, /prohlížeč/gi, /na tvém Macu/gi, /zdarma/gi, /předplatn/gi];
  const cile = [...launchTargets(env), ...launchTargets({ ...env, ollama: { ok: true, models: [] } })];
  for (const t of cile) {
    for (const f of fraze) {
      const kolik = (t.note || '').match(f)?.length || 0;
      assert.ok(kolik <= 1, `${t.id} opakuje ${f}: „${t.note}"`);
    }
    assert.doesNotMatch(t.note || '', /předplatn/i, `${t.id}: poznámka nemá ujišťovat o předplatném`);
  }
  const bezModelu = cile.filter((t) => t.id === 'ollama').at(-1);
  assert.match(bezModelu.note, /model/, 'Ollama bez modelu musí říct, co chybí');
});

// Osa grafu je tvrzení o řádu čísel. Nad prázdnými daty by `niceMax` vrátil 4 a graf by
// nakreslil stupnici „4 Kč, 3 Kč, 2 Kč…" nad prázdnou plochou – vymyšlené měřítko místo dat.
test('Útrata: graf za posledních 6 měsíců bez dat nekreslí vymyšlenou osu', async () => {
  const kod = await zdroj('public/js/views/spend.js');
  assert.match(kod, /const jeCoUkazat = sp\.months\.some\(\(m\) => m\.total > 0\) \|\| total > 0;/,
    'rozhodnutí „je co ukázat" musí zůstat vázané na skutečná data');
  const usek = kod.slice(kod.indexOf('const jeCoUkazat'), kod.indexOf("fill(el, 'mlegend'"));
  assert.match(usek, /jeCoUkazat \? columnChart\(\{/, 'graf se kreslí jen když jsou data');
  assert.match(usek, /: emptyState\(\{ title: tr\('Zatím žádné ověřené náklady'\)/, 'jinak prázdný stav');
});

// Issue #255 – prázdný profil (čerstvá instalace bez agentů, projektů, upozornění, dovedností
// a připojených zdrojů). Každá obrazovka ukáže jeden prázdný stav s větou a hlavní akcí a schová
// ovládání a dlaždice, které by nad prázdnými daty vypadaly jako změřené nuly. Vykreslení měří
// v prohlížeči scripts/qa-prazdny-profil.mjs (spouští ho qa:tvary i qa:contrast); tady se hlídá,
// že rozhodnutí v kódu a pokrytí v QA nezmizí.
test('prázdný profil: každá obrazovka má prázdný stav s hlavní akcí a schová falešné nuly', async () => {
  const pohled = async (jmeno) => zdroj(`public/js/views/${jmeno}.js`);
  const overview = await pohled('overview');
  assert.match(overview, /const prazdno = !everything\.length && !all\.length && !procesyNevim;/,
    'Přehled: prázdno se odvozuje ze skutečných dat a selhání výpisu procesů mezi něj nepatří');
  assert.match(overview, /for \(const n of el\.querySelectorAll\('\[data-jen-s-daty\]'\)\) n\.hidden = prazdno;/);
  for (const oblast of ['tl-h', 'chart-h', 'td-h', 'act-h']) assert.match(overview, new RegExp(`aria-labelledby="${oblast}"[^>]*data-jen-s-daty`), `Přehled: ${oblast} se v prázdnu schová`);
  assert.match(overview, /data-region="meter" data-jen-s-daty/);
  assert.match(overview, /dvojice\.dataset\.jenSDaty = ''/, 'stav agentů se čtyřmi nulami se v prázdnu schová');

  const agents = await pohled('agents');
  assert.match(agents, /for \(const n of el\.querySelectorAll\('\[data-jen-s-agenty\]'\)\) n\.hidden = !all\.length;/, 'Agenti: filtry s nulami se nad prázdným seznamem schovají');

  const alerts = await pohled('alerts');
  assert.match(alerts, /\[data-region="toolbar"\]'\)\.hidden = !items\.length;/);
  assert.match(alerts, /data-karta="notifications">\$\{ICON\.sliders\}\$\{tr\('Nastavit upozornění'\)\}<\/a>`,\n\s*\} : \{ title: tr\('Nic k zobrazení'\) \}/);

  const projects = await pohled('projects');
  assert.match(projects, /\[data-region="toolbar"\]'\)\.hidden = !items\.length;/);
  assert.doesNotMatch(projects, /pintro/, 'první projekt má stejný prázdný stav jako ostatní obrazovky');

  const stats = await pohled('stats');
  assert.match(stats, /if \(sessionsList\(\)\.length \|\| agentsList\(\)\.length\) return false;/);
  assert.match(stats, /v\.historie\.chyba \|\| Object\.keys\(v\.historie\.dny \|\| \{\}\)\.length/,
    'nenačtená historie se nevydává za prázdnou');

  const session = await pohled('session');
  assert.match(session, /t\.nenalezeno = err\.status === 404;/, '„nenalezeno“ a „nepodařilo se načíst“ jsou dvě různé věci');
  assert.match(session, /!t\.nenalezeno \? tr\('Agenta se nepodařilo načíst'\)/);

  for (const [jmeno, kod] of [['overview', overview], ['agents', agents], ['alerts', alerts], ['projects', projects], ['stats', stats], ['session', session], ['skills', await pohled('skills')]]) {
    assert.match(kod, /emptyState\(/, `${jmeno}: prázdný stav jde přes sdílené emptyState()`);
    assert.match(kod, /btn btn--primary/, `${jmeno}: prázdný stav má jednu hlavní akci`);
  }
});

test('prázdný profil: QA kontrast i tvary měří prázdné obrazovky a hlídají hlavní akci', async () => {
  const { PRAZDNE_OBRAZOVKY } = await import('../scripts/qa-prazdny-profil.mjs');
  for (const trasa of ['prehled', 'agenti', 'projekty', 'statistiky', 'utrata', 'upozorneni', 'dovednosti', 'agent/neexistuje']) {
    assert.match(PRAZDNE_OBRAZOVKY[trasa] || '', /btn--primary/, `/${trasa} musí mít v prázdném profilu hlavní akci`);
  }
  assert.ok('nastaveni' in PRAZDNE_OBRAZOVKY, 'Nastavení se v prázdném profilu aspoň měří');
  for (const skript of ['scripts/qa-tvary.mjs', 'scripts/qa-contrast.mjs']) {
    assert.match(await zdroj(skript), /await projdiPrazdnyProfil\(browser, \{/, `${skript} musí projít prázdný profil`);
  }
  assert.match(await zdroj('scripts/qa-contrast.mjs'), /rezimy: \['light', 'dark'\]/, 'kontrast prázdného profilu ve Dni i v Noci');
});

test('Útrata: zástupný účet „Nelze ověřit“ se ukáže jen u nástroje, který na počítači je', async () => {
  globalThis.window ??= { addEventListener() {}, matchMedia: () => ({ matches: false }) };
  const { providerAccountsHtml } = await import('../public/js/views/spend.js');
  const sp = { providerAccounts: [
    { provider: 'anthropic', id: null, active: false, state: 'unavailable', limits: [] },
    { provider: 'openai', id: null, active: false, state: 'unavailable', limits: [] },
  ] };
  const chybi = [{ id: 'claude-code', state: 'missing' }, { id: 'codex', state: 'missing' }];
  assert.equal(providerAccountsHtml(sp, chybi), '', 'prázdný profil nemá tvrdit účty, které uživatel nemá');
  const html = providerAccountsHtml(sp, [{ id: 'claude-code', state: 'ok' }, { id: 'codex', state: 'missing' }]);
  assert.match(html, /Claude Code/);
  assert.doesNotMatch(html, /Codex/);
  // Odhlášení je zjištěný fakt, ne zástupný řádek – zůstává i bez nalezeného zdroje.
  assert.match(providerAccountsHtml({ providerAccounts: [{ provider: 'anthropic', id: null, active: false, state: 'signed_out', limits: [] }] }, chybi), /Odhlášeno/);
});
