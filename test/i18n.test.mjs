import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import EN from '../public/js/i18n/en.js';
import { execFileSync } from 'node:child_process';

// Angličtina rozhraní (public/js/i18n.js). Zdrojem textů je čeština v kódu v tr('…'); slovník
// public/js/i18n/en.js k ní drží překlad. Chybějící překlad by se v angličtině ukázal česky,
// proto tenhle test hlídá úplnost, proměnné, značky a to, že slovník nenese staré texty.

const ROOT = fileURLToPath(new URL('..', import.meta.url));

test('i18n: serverové akce se přeloží při vykreslení a cizí popisky zůstanou escapované', () => {
  const script = `
    globalThis.document = { documentElement: { lang: 'en' } };
    const { openButtons } = await import('./public/js/ui.js');
    const labels = ['Otevřít v Codexu', 'Otevřít Claude', 'Otevřít v Cursoru', 'Otevřít ve VS Code', 'Otevřít konverzaci', 'Pokračovat v Terminálu', 'Otevřít složku', 'Přepnout do LM Studio', 'constructor', undefined, '<img src=x onerror=alert(1)>'];
    console.log(openButtons({ id: 'fixture', open: labels.map(label => ({ id: 'terminal', label })) }, { max: labels.length }));
  `;
  const html = execFileSync(process.execPath, ['--input-type=module', '-e', script], { cwd: ROOT, encoding: 'utf8' });
  for (const label of ['Open in Codex', 'Open Claude', 'Open in Cursor', 'Open in VS Code', 'Open conversation', 'Continue in Terminal', 'Open folder', 'Switch to LM Studio']) assert.ok(html.includes(label), label);
  assert.doesNotMatch(html, /Pokračovat|Otevřít|Přepnout|<img src=x/);
  assert.match(html, />constructor<\/button>/);
  assert.doesNotMatch(html, /function Object|undefined/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});
const CZ = /[áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]/;

async function soubory(dir) {
  const out = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...await soubory(p));
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

const retezec = (zapis) => JSON.parse(`"${zapis.replace(/\\'/g, "'").replace(/"/g, '\\"')}"`);

async function vyuziti() {
  const klice = new Map();
  const mnozne = new Map();
  for (const f of await soubory(path.join(ROOT, 'public/js'))) {
    if (f.includes(`${path.sep}i18n${path.sep}`)) continue;
    const s = await fs.readFile(f, 'utf8');
    const rel = path.relative(ROOT, f);
    for (const m of s.matchAll(/\btr\('((?:[^'\\]|\\.)*)'/g)) klice.set(retezec(m[1]), rel);
    // První argument (počet) může být libovolně složitý výraz se závorkami uvnitř
    // (`new Set(...).size`) – nezávorkuje se, jen se hledají tři textové tvary až k uzavírací závorce.
    for (const m of s.matchAll(/\bplural\([\s\S]*?,\s*'([^']*)',\s*'([^']*)',\s*'([^']*)'\s*\)/g)) mnozne.set(`${m[1]}|${m[2]}|${m[3]}`, rel);
  }
  return { klice, mnozne };
}

const promenne = (s) => [...s.matchAll(/\{(\d+)\}/g)].map((m) => m[1]).sort().join(',');
const znacky = (s) => [...s.matchAll(/<\/?([a-z][a-z0-9]*)\b[^>]*>/g)].map((m) => m[0].replace(/\s+/g, ' ')).sort().join('|');

test('i18n: každý text rozhraní má anglický překlad', async () => {
  const { klice } = await vyuziti();
  assert.ok(klice.size > 1000, `čekali jsme přes tisíc textů, našli jsme ${klice.size}`);
  const chybi = [...klice].filter(([k]) => !(k in EN.texty)).map(([k, f]) => `${f}: ${k.slice(0, 80)}`);
  assert.deepEqual(chybi, [], 'texty bez překladu v public/js/i18n/en.js');
});

test('i18n: každý tvar podle počtu má anglické tvary', async () => {
  const { mnozne } = await vyuziti();
  const chybi = [...mnozne].filter(([k]) => !Array.isArray(EN.mnozne[k]) || EN.mnozne[k].length !== 2).map(([k, f]) => `${f}: ${k}`);
  assert.deepEqual(chybi, []);
});

test('i18n: překlad nese stejné proměnné a značky jako čeština', () => {
  const vadne = [];
  for (const [cz, en] of Object.entries(EN.texty)) {
    if (promenne(cz) !== promenne(en)) vadne.push(`proměnné: ${cz.slice(0, 60)}`);
    if (znacky(cz) !== znacky(en)) vadne.push(`značky: ${cz.slice(0, 60)}`);
    if (!en.trim()) vadne.push(`prázdný překlad: ${cz.slice(0, 60)}`);
  }
  assert.deepEqual(vadne, []);
});

test('i18n: v angličtině nezůstala čeština a slovník nenese staré texty', async () => {
  const { klice, mnozne } = await vyuziti();
  const cesky = Object.entries(EN.texty).filter(([, en]) => CZ.test(en)).map(([cz]) => cz.slice(0, 60));
  assert.deepEqual(cesky, [], 'anglický překlad obsahuje češtinu');
  for (const tvary of Object.values(EN.mnozne)) for (const t of tvary) assert.doesNotMatch(t, CZ);
  const stare = Object.keys(EN.texty).filter((k) => !klice.has(k)).map((k) => k.slice(0, 60));
  assert.deepEqual(stare, [], 'slovník drží texty, které už v kódu nejsou');
  assert.deepEqual(Object.keys(EN.mnozne).filter((k) => !mnozne.has(k)), []);
});

// ---------------------------------------------------------------------------------------------
// Texty ze serveru. Server píše česky a texty rozhraní označuje ui('…') (src/texty.js); klient je
// v angličtině přeloží podle public/js/i18n/en-server.js (public/js/texty-serveru.js). Dřív tu
// test hlídal jen klienta, a tak v angličtině zůstávaly české režimy spouštění, stavy zdrojů,
// chybové hlášky i titulky upozornění.

// Literály a šablony v kódu bez komentářů. Šablona vrací své pevné části a proměnné jako {0}, {1}…
function literaly(src) {
  const out = [];
  const n = src.length;
  const radek = (pos) => src.slice(0, pos).split('\n').length;
  const retezecKonec = (j) => {
    const q = src[j];
    let k = j + 1;
    while (k < n && src[k] !== q) k += src[k] === '\\' ? 2 : 1;
    return k;
  };
  const sablona = (j) => {
    let k = j + 1;
    let text = '';
    let promenna = 0;
    while (k < n && src[k] !== '`') {
      if (src[k] === '\\') { text += src[k + 1]; k += 2; continue; }
      if (src[k] === '$' && src[k + 1] === '{') {
        let hloubka = 1;
        k += 2;
        while (k < n && hloubka) {
          if (src[k] === '`') { k = sablona(k).konec + 1; continue; }
          if (src[k] === "'" || src[k] === '"') { const e = retezecKonec(k); out.push({ druh: 'retezec', text: src.slice(k + 1, e), od: k, radek: radek(k) }); k = e + 1; continue; }
          if (src[k] === '{') hloubka++;
          if (src[k] === '}') hloubka--;
          k++;
        }
        text += `{${promenna++}}`;
        continue;
      }
      text += src[k];
      k++;
    }
    return { konec: k, text };
  };
  let i = 0;
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i + 2) + 2; continue; }
    if (c === '`') { const s = sablona(i); out.push({ druh: 'sablona', text: s.text, od: i, radek: radek(i) }); i = s.konec + 1; continue; }
    if (c === "'" || c === '"') { const e = retezecKonec(i); out.push({ druh: 'retezec', text: src.slice(i + 1, e), od: i, radek: radek(i) }); i = e + 1; continue; }
    // Regulární výraz po znaku, za kterým nemůže stát dělení.
    if (c === '/' && /(?:[(,=:[!&|?{};]|^)\s*$/.test(src.slice(Math.max(0, i - 20), i))) {
      let k = i + 1;
      let trida = false;
      while (k < n && src[k] !== '\n') {
        if (src[k] === '\\') { k += 2; continue; }
        if (src[k] === '[') trida = true;
        else if (src[k] === ']') trida = false;
        else if (src[k] === '/' && !trida) break;
        k++;
      }
      i = k + 1;
      continue;
    }
    i++;
  }
  return out.map((l) => ({ ...l, ui: /\bui\(\s*$/.test(src.slice(Math.max(0, l.od - 6), l.od)) }));
}

async function souboryServeru() {
  const out = [];
  const projdi = async (dir) => {
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) await projdi(p);
      else if (e.name.endsWith('.js')) out.push(p);
    }
  };
  await projdi(path.join(ROOT, 'src'));
  return out.sort();
}
const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/');
const literal = (s) => s.replace(/\\(['"\\])/g, '$1').replace(/\\n/g, '\n');

// Upozornění se ukládají česky (data.json), rozhraní je překládá samo a do systému je server pošle
// přeložené (src/texty.js#prekladac). Titulky
// upozornění se proto překládají na klientu podle vzorů odvozených přímo ze šablon v alerts.js –
// když se text upozornění změní, test řekne, že chybí překlad.
const JEN_KLIENT = ['src/alerts.js'];

async function textyServeru() {
  const klice = new Map();
  for (const f of await souboryServeru()) {
    const src = await fs.readFile(f, 'utf8');
    const soubor = rel(f);
    // Souhrn upozornění (textSouhrnu) skládá server sám v jazyce z Nastavení – klient ho podruhé
    // nepřekládá, jeho texty proto do slovníku nepatří.
    const souhrnOd = src.indexOf('const SKUPINY');
    const souhrnDo = src.indexOf('\n}\n', src.indexOf('export function textSouhrnu'));
    const vSouhrnu = (od) => souhrnOd >= 0 && souhrnDo > souhrnOd && od > souhrnOd && od < souhrnDo;
    for (const l of literaly(src)) {
      if (l.druh === 'retezec' && l.ui) klice.set(literal(l.text), soubor);
      if (!JEN_KLIENT.includes(soubor) || vSouhrnu(l.od) || /^[#/]/.test(l.text)) continue;
      // Věty upozornění: šablony (kromě klíčů pro deduplikaci) a české texty. „{0}: {1} na {2} %“
      // diakritiku nemá, a přesto je to věta.
      const pred = src.slice(Math.max(0, l.od - 20), l.od);
      if (l.druh === 'sablona' && !/key:\s*$/.test(pred) && /[a-zá-ž]{2}/i.test(l.text.replace(/\{\d+\}/g, ''))) klice.set(l.text, soubor);
      if (l.druh === 'retezec' && CZ.test(l.text)) klice.set(literal(l.text), soubor);
    }
  }
  return klice;
}

test('i18n: každý text ze serveru (ui()) má anglický překlad a slovník nenese staré', async () => {
  const klice = await textyServeru();
  assert.ok(klice.size > 300, `čekali jsme stovky textů ze serveru, našli jsme ${klice.size}`);
  const chybi = [...klice].filter(([k]) => !Object.hasOwn(EN.server, k)).map(([k, f]) => `${f}: ${k.slice(0, 90)}`);
  assert.deepEqual(chybi, [], 'texty ze serveru bez překladu v public/js/i18n/en-server.js');
  const stare = Object.keys(EN.server).filter((k) => !klice.has(k)).map((k) => k.slice(0, 80));
  assert.deepEqual(stare, [], 'en-server.js drží texty, které server už neposílá');
  const vadne = [];
  for (const [cz, en] of Object.entries(EN.server)) {
    if (promenne(cz) !== promenne(en)) vadne.push(`proměnné: ${cz.slice(0, 60)}`);
    if (!en.trim()) vadne.push(`prázdný překlad: ${cz.slice(0, 60)}`);
    if (CZ.test(en)) vadne.push(`čeština v překladu: ${cz.slice(0, 60)}`);
    // Vzor, který je celý jen z proměnných, by „přeložil“ cokoli.
    if (/^[\s\W]*(\{\d+\}[\s\W]*)+$/.test(cz)) vadne.push(`vzor bez pevného textu: ${cz}`);
  }
  assert.deepEqual(vadne, []);
});

// Texty v src/, které do rozhraní nejdou, a proč. Položka je celý text, nebo (od 16 znaků) jeho začátek.
const MIMO_ROZHRANI = {
  'src/platform.js': ['\n$ErrorActionPreference'], // skript PowerShellu
  'src/datastore.js': ['Neplatný JSON', 'Neplatný kořen dat', 'obnoveno ze zálohy', 'začínám od výchozích hodnot'], // vnitřní kód chyby a log
  'src/extension-install.js': ['Zdrojová složka rozšíření chybí.', 'Kopii rozšíření se nepodařilo vytvořit: '], // jen log při startu
  'src/hooks-installer.js': ['Neplatný token', 'Neplatná cesta k hlavičkám hooku', 'not object', 'curl -s -m 1 -X POST'], // vnitřní chyby a text ve stavovém řádku Claude Code
  'src/http.js': ['<!doctype html><meta', 'index.html nemá <html', 'Access removed'], // stránka pro prohlížeč bez klíče okna, chyba vývojáře
  // Stránka, na kterou se prohlížeč vrátí z přihlášení Google (mimo okno aplikace, zatím jen česky).
  'src/ucet-stranka.js': null,
  'src/projects.js': ['Potřebuje rozhodnutí', 'Vyčerpaný limit', 'Čeká na zadání', 'Nečinná', 'Zahájeno', 'Poslední aktivita', 'Počet zadání', 'Hodiny s aktivitou (30 dní)', 'Složka', 'Mimo okno sledování'], // hlavička a stavy v CSV
  'src/spend.js': ['Ručně', 'Měsíc', 'Datum platby', 'Služba', 'Účet / licence', 'Opakování', 'Poznámka', 'Částka', 'Měna', 'Kurz na', 'Částka v', 'měsíčně', 'měsíčně do', 'jednorázově', 'Předplatné'], // CSV
  'src/tunnel.js': ['binárka ({0}) nebo', '"cloudflared" v PATH', '"ngrok" v PATH; běžící', 'uživatel spustí "'], // technický popis, rozhraní ho nezobrazuje
  'src/connectors/local-agents.js': ['vysoká', 'nízká'], // kód jistoty, klient ho porovnává
  'src/connectors/claude-code.js': ['týden {0} %'], // stavový řádek v Claude Code
  'src/alerts.js': null, // celý soubor: překládá klient (viz JEN_KLIENT)
  'src/webpush.js': ['invalid subscription keys'],
  'src/pomocnik.js': ['Pomáháš uživateli najít jeho dřívější konverzace s AI.'], // pokyn pro lokální model, ne text rozhraní // vnitřní chyba, posli() ji změní na zrušení odběru
  'src/verze-souboru.js': ['Stránka nemá </head>', 'sw.js nemá řádek „const CACHE'], // chyba vývojáře při úpravě index.html nebo sw.js
};
const mimoRozhrani = (soubor, text) => (MIMO_ROZHRANI[soubor] || []).some((z) => text === z || (z.length >= 16 && text.startsWith(z)));

test('i18n: česká věta v src/ jde do rozhraní jen přes ui()', async () => {
  const nalezy = [];
  for (const f of await souboryServeru()) {
    const soubor = rel(f);
    if (soubor === 'src/texty.js' || MIMO_ROZHRANI[soubor] === null) continue;
    const src = await fs.readFile(f, 'utf8');
    for (const l of literaly(src)) {
      if (l.ui || !CZ.test(l.text)) continue;
      const text = l.druh === 'retezec' ? literal(l.text) : l.text;
      if (/^Agenteeq:/.test(text) || /console\.(log|error|warn)\([^)]*$|\blog\(\s*$/.test(src.slice(Math.max(0, l.od - 60), l.od))) continue; // log
      if (mimoRozhrani(soubor, text)) continue;
      nalezy.push(`${soubor}:${l.radek} ${l.druh === 'sablona' ? '`' : "'"}${text.slice(0, 90)}`);
    }
  }
  assert.deepEqual(nalezy, [], 'text pro rozhraní obal voláním ui() ze src/texty.js (proměnné jako {0}) a přidej překlad do en-server.js; text mimo rozhraní zapiš do MIMO_ROZHRANI s důvodem');
});

// Věty bez diakritiky („Projekt neexistuje.“) první test nepozná. Chyby, stavy a popisky se proto
// hlídají i podle místa, kam míří.
test('i18n: chybové hlášky, stavy a popisky ze serveru jsou označené ui()', async () => {
  const nalezy = [];
  const POLE = /\b(?:error|detail|reason|hint|message|chyba|zprava|text|title|body|description|note|label|activity)\s*:\s*$|\berrors(?:\.\w+|\['[^']+'\])\s*=\s*$/;
  for (const f of await souboryServeru()) {
    const soubor = rel(f);
    if (MIMO_ROZHRANI[soubor] === null) continue;
    const src = await fs.readFile(f, 'utf8');
    for (const l of literaly(src)) {
      if (l.ui || l.druh !== 'retezec') continue;
      const pred = src.slice(Math.max(0, l.od - 40), l.od);
      if (!POLE.test(pred) && !/HttpError\(\d+,\s*$|\bfail\(\s*$|new Error\(\s*$/.test(pred)) continue;
      const text = literal(l.text);
      // Věta = aspoň dvě slova s malými písmeny nebo slovo s tečkou na konci; jména a kódy ne.
      if (!/[a-zá-ž]{2,}\s+[a-zá-ž]{2,}|[a-zá-ž]{3,}[.…]$/.test(text)) continue;
      if (mimoRozhrani(soubor, text)) continue;
      nalezy.push(`${soubor}:${l.radek} '${text.slice(0, 80)}'`);
    }
  }
  assert.deepEqual(nalezy, []);
});
