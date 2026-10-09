import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

// Vizuální a textové opravy Přehledu, Agentů a detailu agenta. Kde jde o chování (věty podle
// stavu), testuje se přímo funkce; kde o sazbu, hlídá se pravidlo v CSS nebo šabloně.

const zdroj = (p) => fs.readFile(new URL(`../${p}`, import.meta.url), 'utf8');
const pravidlo = (css, sel) => css.match(new RegExp(`^${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`, 'm'))?.[1] ?? null;

// --- Přehled: pozdrav, box Stav agentů a dlaždice neříkají totéž třikrát ---

test('Stav agentů: jedna věta se správným tvarem podle počtu', async () => {
  const { stavAgentu } = await import('../public/js/stav-vety.js');
  assert.deepEqual(['1', '2', '5'].map((n) => stavAgentu({ cekaji: Number(n) }).veta), ['Potřebuje tě 1 agent', 'Potřebují tě 2 agenti', 'Potřebuje tě 5 agentů']);
  assert.deepEqual([1, 3, 6].map((n) => stavAgentu({ selhalo: n }).veta), ['Selhal 1 agent', 'Selhali 3 agenti', 'Selhalo 6 agentů']);
  assert.deepEqual([1, 2, 5].map((n) => stavAgentu({ limit: n }).veta), ['Na limit narazil 1 agent', 'Na limit narazili 2 agenti', 'Na limit narazilo 5 agentů']);
  assert.equal(stavAgentu({ selhalo: 1, limit: 1 }).veta, 'Problém mají 2 agenti');
  assert.equal(stavAgentu({ selhalo: 3, limit: 2, cekaji: 4 }).stav, 'problem', 'problém má přednost před čekáním');
  assert.equal(stavAgentu({ pracuje: 2 }).veta, 'Vše běží v pořádku');
  assert.equal(stavAgentu({}).veta, 'V pořádku, nikdo nepracuje');
  for (const s of [stavAgentu({ cekaji: 1 }), stavAgentu({ selhalo: 2 })]) assert.doesNotMatch(s.veta, /agentů: \d/, 'žádné „agentů: N“');
});

test('Stav agentů: selhání zjišťování se nikdy nevydává za „nic neběží“', async () => {
  const { stavAgentu } = await import('../public/js/stav-vety.js');
  const nevim = stavAgentu({ procesyNevim: true });
  assert.equal(nevim.stav, 'nevim');
  assert.match(nevim.veta, /Nepodařilo se zjistit/);
  assert.equal(nevim.poznamka, '', 'věta už to říká, poznámka by to opakovala');
  // Když má přednost jiná zpráva, selhání zjišťování nezmizí – nese ho poznámka.
  for (const vstup of [{ cekaji: 1 }, { selhalo: 1 }, { pracuje: 3 }]) {
    const s = stavAgentu({ ...vstup, procesyNevim: true });
    assert.doesNotMatch(s.veta, /nikdo nepracuje/);
    if (s.stav !== 'nevim') assert.match(s.poznamka, /Nepodařilo se zjistit/);
  }
  assert.equal(stavAgentu({ cekaji: 1 }).poznamka, '');
});

test('pozdrav na Přehledu radí, co dál – bez počtů a bez vysvětlování, kde co je', async () => {
  const { vetaPozdravu } = await import('../public/js/stav-vety.js');
  const vety = [
    vetaPozdravu({ cekaji: 1 }), vetaPozdravu({ cekaji: 3 }), vetaPozdravu({ cekaji: 7, pracuji: 2 }),
    vetaPozdravu({ pracuji: 1 }), vetaPozdravu({ pracuji: 4 }), vetaPozdravu({}),
  ];
  for (const v of vety) {
    assert.doesNotMatch(v, /\d/, `počty patří dlaždicím: „${v}“`);
    assert.doesNotMatch(v, /Najdeš|pod polem/, `bez vysvětlivek: „${v}“`);
  }
  assert.match(vetaPozdravu({ cekaji: 1 }), /agent potřebuje/);
  assert.match(vetaPozdravu({ cekaji: 2 }), /agenti potřebují/);
  assert.match(vetaPozdravu({ pracuji: 1 }), /agent doběhne/);
  assert.match(vetaPozdravu({ pracuji: 2 }), /agenti doběhnou/);
  const studio = await zdroj('public/js/home-studio.js');
  assert.match(studio, /pulz\.textContent = vetaPozdravu\(/, 'pozdrav bere větu z jednoho místa');
  const prehled = await zdroj('public/js/views/overview.js');
  assert.match(prehled, /stavAgentu\(\{/, 'box Stav agentů bere větu z jednoho místa');
  assert.doesNotMatch(prehled + studio, /čeká agentů: \{0\}/);
});

// --- Pomocník nesmí zakrývat obsah ---

test('obsah má dole bezpečnou zónu pro tlačítko Pomocníka, spočtenou z jeho rozměrů', async () => {
  const css = await zdroj('public/workbench.css');
  // Tlačítko i zóna berou stejné proměnné – změna velikosti nebo odstupu tlačítka zónu posune s sebou.
  assert.match(pravidlo(css, '.pomocnik') || '', /bottom: var\(--pm-spodek\)/);
  assert.match(pravidlo(css, '.pm-fab') || '', /width: var\(--pm-fab\); height: var\(--pm-fab\)/);
  const zona = pravidlo(css, 'body:has(> .pomocnik:not([hidden])) .main');
  assert.ok(zona, 'chybí rezerva pod obsahem, když je Pomocník vidět');
  assert.match(zona, /padding-bottom: calc\(var\(--pm-spodek\) \+ var\(--pm-fab\) \+ \d+px\)/);
  assert.match(pravidlo(css, 'html:has(body > .pomocnik:not([hidden]))') || '', /scroll-padding-bottom: calc\(var\(--pm-spodek\) \+ var\(--pm-fab\)/, 'prvek z klávesnice nesmí zajet pod tlačítko');
  // Na telefonu je tlačítko nad spodní lištou – zóna to musí znát přes tutéž proměnnou.
  const telefon = css.slice(css.indexOf('@media (max-width: 880px) {\n  :root { --pm-fab'));
  assert.match(telefon, /--pm-spodek: calc\(max\(12px, env\(safe-area-inset-bottom\)\) \+ 84px\)/);
});

// --- Popisky filtrů bez verzálek s prostrkáním ---

test('popisky filtrů a dnů v kalendáři nejsou verzálky s prostrkáním', async () => {
  const css = await zdroj('public/styles.css');
  for (const sel of ['.filtry-popis', '.sk-filtr-popis', '.cal-dow span']) {
    const p = pravidlo(css, sel);
    assert.ok(p, `chybí pravidlo ${sel}`);
    assert.doesNotMatch(p, /text-transform: uppercase/, `${sel}: verzálky`);
    assert.doesNotMatch(p, /letter-spacing: \.?\d*[1-9]/, `${sel}: prostrkání`);
  }
});

// --- Detail agenta ---

test('detail agenta: tlačítko k pokračování je jen v kartě s požadavkem, ne i v hlavičce', async () => {
  const s = await zdroj('public/js/views/session.js');
  assert.match(s, /const akceVBanneru = Boolean\(s\.open\?\.length\) && \(s\.status === 'needs_input'/);
  assert.match(s, /\$\{s\.proces \|\| akceVBanneru \? '' : openButtons\(s\)\}/, 'hlavička vynechá tlačítka, která nese karta');
  // Karta nese všechna tlačítka, ne jen první dvě – z hlavičky se nic neztratí.
  const banner = s.slice(s.indexOf("fill(el, 'banner'"), s.indexOf("fill(el, 'live'"));
  assert.doesNotMatch(banner, /openButtons\(s, \{ small: true, max: \d \}\)/);
  assert.match(s, /\$\{akce \? `<div class="session-actions">/, 'prázdná lišta akcí nenechá v hlavičce díru');
});

test('detail agenta: přepis má přirozenou výšku a nejvýš sahá jako boční sloupec', async () => {
  const s = await zdroj('public/js/views/session.js');
  assert.match(s, /<div class="transcript-misto"><section class="card transcript"/);
  const css = await zdroj('public/styles.css');
  assert.match(pravidlo(css, '.transcript-misto') || '', /contain: size/, 'místo pro přepis se do výšky řádku nepočítá');
  assert.match(pravidlo(css, '.transcript') || '', /max-height: 100%/);
  const seznam = pravidlo(css, '.transcript-list') || '';
  assert.match(seznam, /flex: 0 1 auto; min-height: 0/);
  assert.doesNotMatch(seznam, /flex: 1 1 0/, 'seznam se nesmí natahovat do prázdna');
  assert.doesNotMatch(css, /\.transcript-list \{[^}]*[^-]height: clamp/, 'pevná výška na telefonu by krátký přepis zase natáhla');
});

// --- Agenti ---

test('Agenti: nápověda k prohlížeči není položka seznamu „bez přepisu“ ani v jeho počtu', async () => {
  const a = await zdroj('public/js/views/agents.js');
  assert.match(a, /const pocet = bezi\.length \+ lokalni\.length;/);
  assert.doesNotMatch(a, /\(web \? 1 : 0\)/);
  assert.doesNotMatch(a, /<ul class="runtime-list">\$\{web\}/, 'nápověda nepatří do seznamu');
  assert.match(a, /<aside class="card pad runtime-note runtime-web"/);
});

test('Agenti: zelená tečka pracujícího agenta drží u svého textu', async () => {
  const a = await zdroj('public/js/views/agents.js');
  // Dřív byla tečka a text dva sourozenci v zalamovaném podpisu karty: text odjel na další řádek
  // a tečka visela sama za čipem projektu.
  assert.match(a, /<span class="sub-live"><span class="live-dot" aria-hidden="true"><\/span><span>\$\{esc\(s\.activity/);
  const css = await zdroj('public/styles.css');
  assert.match(pravidlo(css, '.sub-live') || '', /display: inline-flex/);
});
