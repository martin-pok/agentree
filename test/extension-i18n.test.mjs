import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

// Angličtina okna rozšíření (extension/i18n.js) a názvu v Chromu (extension/_locales). Každý
// český text v okně musí mít anglický překlad se stejnými proměnnými, slovník nesmí nést nic
// navíc a manifest musí mít obě jazykové verze v limitech Chromu.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cti = (f) => fs.readFile(path.join(ROOT, f), 'utf8');

async function nactiI18n(jazyk) {
  const kontext = vm.createContext({ chrome: { i18n: { getMessage: (k) => (k === 'jazyk' ? jazyk : '') } } });
  vm.runInContext(await cti('extension/i18n.js'), kontext);
  return kontext.AgenteeqI18n;
}
const CESKE = /[ěščřžýáíéůúďťňóĚŠČŘŽÝÁÍÉŮÚĎŤŇÓ]/;
const bezKomentaru = (js) => js.split('\n').filter((r) => !r.trim().startsWith('//')).join('\n');
const promenne = (t) => [...t.matchAll(/\{(\d+)\}/g)].map((m) => m[1]).sort().join(',');

test('rozšíření: každý český text v okně má anglický překlad a slovník nic navíc', async () => {
  const { EN } = await nactiI18n('en');
  const js = bezKomentaru(await cti('extension/popup.js')) + bezKomentaru(await cti('extension/sites.js'));
  const html = await cti('extension/popup.html');
  const trojice = new Set(Object.keys(EN.mnozne).flatMap((k) => k.split('|')));

  // Texty z kódu: každý řetězec s českými znaky je text rozhraní (loga a klíče jsou bez diakritiky).
  // Výjimkou jsou selektory CSS, které na stránkách služeb hledají česká tlačítka (Zastavit).
  const zKodu = [...js.matchAll(/'([^'\n]*)'/g)].map((m) => m[1]).filter((t) => CESKE.test(t) && !/[[\]=]/.test(t));
  // Texty z HTML: obsah prvků s data-i18n / data-i18n-html a přeložené atributy.
  const normuj = (t) => t.replace(/&nbsp;/g, ' ').replace(/ /g, ' ').trim();
  const zHtml = [
    ...[...html.matchAll(/<(\w+)[^>]*\sdata-i18n(?:-html)?(?:\s[^>]*)?>([\s\S]*?)<\/\1>/g)].map((m) => normuj(m[2])),
    ...[...html.matchAll(/<[^>]*data-i18n-attr="([^"]+)"[^>]*>/g)].flatMap((m) => m[1].split(',').map((a) => normuj((m[0].match(new RegExp(`\\s${a}="([^"]*)"`)) || [])[1] || ''))),
  ].filter(Boolean);

  // Texty předané do tr() (i ty bez diakritiky, třeba „tato karta“), včetně obou větví podmínky.
  // Řetězce se berou postupně zleva; porovnání v podmínce (pohled === 'sluzby') texty nejsou.
  const doTr = [...js.matchAll(/\btr\(([^()]*?)(?:,|\))/g)].flatMap((m) => [...m[1].matchAll(/'([^'\n]*)'/g)]
    .filter((x) => !/[=!]==\s*$/.test(m[1].slice(0, x.index))).map((x) => x[1]));
  const chybi = [...zKodu, ...zHtml, ...doTr].filter((t) => !(t in EN.texty) && !trojice.has(t));
  assert.deepEqual([...new Set(chybi)], [], 'texty bez anglického překladu');
  for (const [cs, en] of Object.entries(EN.texty)) assert.equal(promenne(en), promenne(cs), `proměnné nesedí: ${cs}`);
  // Názvy služeb bez diakritiky, které se překládají (ostatní jsou značky a zůstávají).
  const pouzite = new Set([...zKodu, ...zHtml, ...doTr, 'Codex na webu']);
  const navic = Object.keys(EN.texty).filter((k) => !pouzite.has(k));
  assert.deepEqual(navic, [], 'slovník nese texty, které okno nepoužívá');
});

test('rozšíření: jazyk okna se řídí _locales, česká i anglická podoba', async () => {
  const cs = await nactiI18n('cs');
  const en = await nactiI18n('en');
  assert.equal(cs.jazyk(), 'cs');
  assert.equal(en.jazyk(), 'en');
  assert.equal(cs.tr('Připojeno'), 'Připojeno');
  assert.equal(en.tr('Připojeno'), 'Connected');
  assert.equal(en.tr('odpovídá · {0}', '0:42'), 'replying · 0:42');
  assert.equal(cs.mnozne(3, 'otevřená konverzace', 'otevřené konverzace', 'otevřených konverzací'), 'otevřené konverzace');
  assert.equal(cs.mnozne(5, 'otevřená konverzace', 'otevřené konverzace', 'otevřených konverzací'), 'otevřených konverzací');
  assert.equal(en.mnozne(1, 'otevřená konverzace', 'otevřené konverzace', 'otevřených konverzací'), 'open conversation');
  assert.equal(en.mnozne(0, 'otevřená konverzace', 'otevřené konverzace', 'otevřených konverzací'), 'open conversations');
  // Bez API Chromu (mimo rozšíření) zůstává čeština, nic nespadne.
  const kontext = vm.createContext({});
  vm.runInContext(await cti('extension/i18n.js'), kontext);
  assert.equal(kontext.AgenteeqI18n.jazyk(), 'cs');
});

test('rozšíření: manifest má název a popis v obou jazycích a v limitech Chromu', async () => {
  const manifest = JSON.parse(await cti('extension/manifest.json'));
  const zpravy = {};
  for (const jazyk of ['cs', 'en']) zpravy[jazyk] = JSON.parse(await cti(`extension/_locales/${jazyk}/messages.json`));
  assert.deepEqual(Object.keys(zpravy.cs).sort(), Object.keys(zpravy.en).sort(), 'obě jazykové verze mají tytéž zprávy');
  assert.ok(zpravy[manifest.default_locale], 'výchozí jazyk má vlastní složku');
  const odkazy = JSON.stringify(manifest).match(/__MSG_(\w+)__/g).map((m) => m.slice(6, -2));
  for (const klic of odkazy) for (const jazyk of ['cs', 'en']) assert.ok(zpravy[jazyk][klic]?.message, `${jazyk}: chybí ${klic}`);
  for (const jazyk of ['cs', 'en']) {
    assert.ok(zpravy[jazyk].nazev.message.length <= 75, `${jazyk}: název je delší než 75 znaků`);
    assert.ok(zpravy[jazyk].popis.message.length <= 132, `${jazyk}: popis je delší než 132 znaků`);
    assert.equal(zpravy[jazyk].jazyk.message, jazyk, 'okno pozná jazyk ze stejné složky jako manifest');
  }
  // Okno načte slovník dřív než skripty, které ho používají.
  const html = await cti('extension/popup.html');
  assert.ok(html.indexOf('i18n.js') < html.indexOf('sites.js') && html.indexOf('sites.js') < html.indexOf('popup.js'));
});
