import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { cileHledani, hledejCile, skore, doplneni, useky } from '../public/js/hledani.js';

// Vyhledávání (⌘K, public/js/hledani.js): najde i sekce uvnitř stránek a jednotlivá nastavení,
// ne jen názvy stránek. Dřív „limity“ nenašly nic.

const nazvy = (dotaz) => hledejCile(dotaz).map((c) => c.label);

test('hledání: „limity“ najde limity v Přehledu, ve Statistikách i upozornění na limit', () => {
  const vysledky = hledejCile('limity');
  const kde = vysledky.map((c) => `${c.kde}|${c.label}`);
  assert.ok(kde.includes('Přehled|Limity předplatných'), kde.join('\n'));
  assert.ok(kde.includes('Statistiky|Limity a kredity'), kde.join('\n'));
  assert.ok(vysledky.some((c) => c.prepinac === 'limits'), 'přepínač „Docházející limit předplatného“');
  // Sekce vede na konkrétní místo stránky, ne jen na stránku.
  const statistiky = vysledky.find((c) => c.label === 'Limity a kredity');
  assert.deepEqual([statistiky.route, statistiky.region], ['#/statistiky', 'limits']);
});

test('hledání: tvary slov, diakritika, velká písmena a překlep o jeden znak', () => {
  for (const dotaz of ['limit', 'limitů', 'LIMITY', 'limty', 'limity ']) {
    assert.ok(nazvy(dotaz).includes('Limity a kredity'), dotaz);
  }
  assert.deepEqual(nazvy('nocni ticho'), ['Noční ticho']);
  assert.ok(nazvy('tichy').includes('Noční ticho'), 'synonymum „tichý“ ~ „ticho“');
});

test('hledání: jednotlivé nastavení vede na kartu i přepínač', () => {
  const [ticho] = hledejCile('noční ticho');
  assert.equal(ticho.route, '#/nastaveni');
  assert.equal(ticho.karta, 'notifications');
  assert.equal(ticho.prepinac, 'quietHours');
  assert.equal(ticho.kde, 'Nastavení › Kdy a jak tě upozornit');
});

test('hledání: synonyma česky i anglicky, víc slov musí sedět všechna', () => {
  assert.equal(nazvy('tmavý režim')[0], 'Vzhled');
  assert.equal(nazvy('dark mode')[0], 'Vzhled');
  assert.equal(nazvy('zkratky')[0], 'Nápověda a zkratky');
  assert.ok(nazvy('export csv').includes('Záznamy nákladů'));
  assert.ok(nazvy('rozpočet').includes('Rozpočty'));
  assert.deepEqual(nazvy('limity vzhled'), [], 'každé slovo musí někde sedět');
  assert.deepEqual(nazvy('xyzzy'), []);
});

test('hledání: shoda jen přes cestu nezašumí vedle přímé shody', () => {
  // „vzhled“ stojí i v cestě „Nastavení › Účet a vzhled“ u Licence a Jazyka – ty se neukážou.
  assert.deepEqual(nazvy('vzhled'), ['Vzhled']);
});

test('hledání: skóre upřednostní shodu v názvu před shodou v synonymech', () => {
  assert.ok(skore('limity', [['Limity a kredity', 3]]) > skore('limity', [['Statistiky', 3], ['limity', 2]]));
  assert.equal(skore('', [['cokoli', 3]]), 0);
});

test('našeptávání: doplní zbytek názvu bez ohledu na diakritiku, jinak nic', () => {
  assert.equal(doplneni('lim', 'Limity a kredity'), 'ity a kredity');
  assert.equal(doplneni('nocni', 'Noční ticho'), ' ticho');
  assert.equal(doplneni('ticho', 'Noční ticho'), '', 'jen od začátku názvu');
  assert.equal(doplneni('Noční ticho', 'Noční ticho'), '', 'celý název už není co doplnit');
  assert.equal(doplneni('', 'Vzhled'), '');
});

test('zvýraznění: úseky sedí na původní text i s diakritikou a tvarem slova', () => {
  const text = 'Okna limitů';
  const [[od, po]] = useky(text, 'limity');
  assert.equal(text.slice(od, po), 'limit');
  assert.deepEqual(useky('Noční ticho', 'nocni').map(([a, b]) => 'Noční ticho'.slice(a, b)), ['Noční']);
  assert.deepEqual(useky('Vzhled', ''), []);
});

// Pojistka proti rozjetí indexu s aplikací: každý cíl musí na své stránce pořád existovat.
test('hledání: každá sekce, karta i přepínač v indexu na stránce opravdu je', async () => {
  const zdroj = (soubor) => fs.readFile(new URL(`../public/js/views/${soubor}.js`, import.meta.url), 'utf8');
  const POHLED = { prehled: 'overview', statistiky: 'stats', utrata: 'spend', projekty: 'projects' };
  const nastaveni = await zdroj('settings');
  for (const c of cileHledani()) {
    if (c.druh === 'sekce') {
      const soubor = POHLED[c.route.slice(2)];
      assert.ok(soubor, `sekce ${c.label} míří na stránku bez pohledu: ${c.route}`);
      const text = await zdroj(soubor);
      assert.ok(text.includes(`data-region="${c.region}"`), `${c.route}: chybí data-region="${c.region}" (${c.label})`);
      if (c.klik) assert.ok(text.includes(c.klik.replace(/^\[|\]$/g, '')), `${c.route}: chybí ${c.klik}`);
      assert.ok(text.includes(`tr('${c.label}')`), `${c.route}: název „${c.label}“ na stránce není`);
    }
    if (c.karta) assert.match(nastaveni, new RegExp(`'${c.karta}'`), `Nastavení: chybí karta ${c.karta}`);
    if (c.prepinac) assert.ok(nastaveni.includes(`key: '${c.prepinac}'`), `Nastavení: chybí přepínač ${c.prepinac}`);
  }
  // Stránky v indexu odpovídají cestám v menu.
  const app = await fs.readFile(new URL('../public/js/app.js', import.meta.url), 'utf8');
  for (const c of cileHledani().filter((x) => x.druh === 'stranka')) {
    assert.ok(app.includes(c.route.slice(2)), `app.js nezná cestu ${c.route}`);
  }
});
