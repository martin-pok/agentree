import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import EN from '../public/js/i18n/en.js';
import { ze } from '../public/js/predlozky.js';
import { vytvorPrekladac, vytvorPrelozData } from '../public/js/texty-serveru.js';
import { clipSlova } from '../src/util.js';
import { createSession, summarize } from '../src/model.js';
import { AlertEngine } from '../src/alerts.js';
import { budgetAlertCandidates } from '../src/spend.js';
import { fakeDatastore } from './helpers.mjs';

// Texty a tvary z předstartovního QA (tři persony): čeština, která zůstala v angličtině, špatné
// tvary podle počtu („3 potřebuje tebe“, „Dalších 3 je“, „0 z 4“), názvy useknuté uprostřed
// slova, sekundy v upozorněních a osa grafu s „2k“ vedle „2 tis.“.

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const HOUR = 3600e3;
// Modul klientu načtený v daném jazyce (i18n.js čte <html lang> při načtení).
const vKlientu = (lang, kod) => execFileSync(process.execPath, ['--input-type=module', '-e', `globalThis.document = { documentElement: { lang: '${lang}' } };\n${kod}`], { cwd: ROOT, encoding: 'utf8' });

test('z/ze před číslem: podle vyslovené číslovky (ze 2, 3, 4, 6, 7, 12…, 20…, 100; z 1, 5, 8, 10, 1 000)', () => {
  const zeCisla = [2, 3, 4, 6, 7, 12, 13, 14, 16, 17, 20, 23, 30, 45, 60, 77, 100, 150, 200, 300, 400, 600, 700, 2000, 7000, 100000, 2e6];
  const zCisla = [0, 1, 5, 8, 9, 10, 11, 15, 18, 19, 50, 52, 80, 99, 500, 800, 900, 1000, 1500, 5000, 1e6, 5e6, 1e9];
  for (const n of zeCisla) assert.equal(ze(n), true, `ze ${n}`);
  for (const n of zCisla) assert.equal(ze(n), false, `z ${n}`);
  assert.equal(ze(2.5), true, 'desetinná místa nerozhodují');
  assert.equal(ze(NaN), false);
});

// Každá věta „{0} z {1}“ (počet z celku) musí mít i tvar se „ze“ a vybírat mezi nimi podle ze(): dřív
// aplikace psala „0 z 4 hotovo“ a „0 z 7 s měřeným limitem“. Kusy věty, které stojí hned za číslem
// (`${merene} ${tr('z {0} s měřeným limitem')}`), jsou vyjmenované; „z {0}“ před jménem nebo datem
// sem nepatří.
const KUSY_ZA_CISLEM = ['z {0} s měřeným limitem', 'z {0}'];
test('z/ze: každá věta s „z {n}“ v rozhraní má i tvar se „ze“', async () => {
  const chybi = [];
  const projdi = async (dir) => {
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== 'i18n') await projdi(p); continue; }
      if (!e.name.endsWith('.js')) continue;
      const s = await fs.readFile(p, 'utf8');
      const klice = new Set([...s.matchAll(/\b(?:tr|ui)\('((?:[^'\\]|\\.)*)'/g)].map((m) => m[1]));
      for (const k of klice) {
        if (!/\{\d\} z \{\d\}/.test(k) && !KUSY_ZA_CISLEM.includes(k)) continue;
        if (/ z \{\d\} dne$/.test(k)) continue; // tvar jen pro jeden den: „z 1 dne“
        if (!klice.has(k.replace(/(^|\s)z (\{\d\})/, '$1ze $2'))) chybi.push(`${path.relative(ROOT, p)}: ${k}`);
        if (!new RegExp(`\\bze\\([^)]*\\)\\s*\\?[^:]*'${k.replace(/(^|\s)z (\{\d\})/, '$1ze $2').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`).test(s)) chybi.push(`${path.relative(ROOT, p)}: tvar se „ze“ nevybírá ze(): ${k}`);
      }
    }
  };
  await projdi(path.join(ROOT, 'public/js'));
  await projdi(path.join(ROOT, 'src'));
  assert.deepEqual(chybi, []);
  // Pevný počet se rovnou píše správně.
  assert.match(await fs.readFile(path.join(ROOT, 'src/connectors/cloud-billing.js'), 'utf8'), /'Připojeno \{0\} ze 2 API\.'/);
});

test('z/ze: rozpočet v upozornění ze serveru („ze 200“) se v angličtině přeloží', () => {
  const [a] = budgetAlertCandidates({ monthKey: '2026-09', currency: 'USD', budgets: [{ scope: 'total', label: 'Celkem', spent: 180, budget: 200, pct: 90 }] });
  assert.match(a.body, /^Tento měsíc .+ ze .+\.$/);
  const trServer = vytvorPrekladac(EN.server, EN.texty, 'en-GB');
  assert.match(trServer(a.body), /^.+ of .+ this month\.$/);
  const [b] = budgetAlertCandidates({ monthKey: '2026-09', currency: 'USD', budgets: [{ scope: 'total', label: 'Celkem', spent: 450, budget: 500, pct: 90 }] });
  assert.match(b.body, /^Tento měsíc .+ z .+\.$/);
});

test('popisky počtů agentů se shodují s číslem (1 pracuje, 3 pracují, 5 pracuje) i anglicky', async () => {
  const { popisPoctu } = await import('../public/js/stav-vety.js');
  assert.deepEqual([1, 3, 5, 0].map((n) => popisPoctu('needs_input', n)), ['potřebuje tebe', 'potřebují tebe', 'potřebuje tebe', 'potřebuje tebe']);
  assert.deepEqual([1, 2, 7].map((n) => popisPoctu('working', n)), ['pracuje', 'pracují', 'pracuje']);
  assert.deepEqual([1, 4, 5].map((n) => popisPoctu('failed', n)), ['selhal', 'selhali', 'selhalo']);
  assert.deepEqual([1, 2, 9].map((n) => popisPoctu('waiting', n)), ['čeká na zadání', 'čekají na zadání', 'čeká na zadání']);
  assert.equal(popisPoctu('limited', 3), 'na limitu');
  const en = JSON.parse(vKlientu('en', `const { popisPoctu } = await import('./public/js/stav-vety.js');
    console.log(JSON.stringify([popisPoctu('needs_input', 1), popisPoctu('needs_input', 3), popisPoctu('working', 2), popisPoctu('failed', 1), popisPoctu('limited', 2)]));`));
  assert.deepEqual(en, ['needs you', 'need you', 'working', 'failed', 'at limit']);
  // Box Stav agentů, odznak v nabídce i přehled účtu berou popisek odtud, ne pevný text.
  const prehled = await fs.readFile(path.join(ROOT, 'public/js/views/overview.js'), 'utf8');
  assert.doesNotMatch(prehled, /tr\('(?:pracuje|potřebuje tebe|selhalo|limit)'\)/);
  assert.doesNotMatch(await fs.readFile(path.join(ROOT, 'public/js/app.js'), 'utf8'), /\$\{working\} pracuje/);
  assert.doesNotMatch(await fs.readFile(path.join(ROOT, 'public/js/ucet-web.js'), 'utf8'), /\['working', 'pracuje'/);
});

// Tvary se berou přímo z volání plural() v kódu obrazovek, takže test hlídá skutečný text.
async function tvary(soubor, promenna, zacatek = '') {
  const src = await fs.readFile(path.join(ROOT, soubor), 'utf8');
  const m = src.match(new RegExp(`plural\\(${promenna}, ('${zacatek}[^']*'), ('[^']*'), ('[^']*')\\)`));
  assert.ok(m, `${soubor}: plural(${promenna}, …) chybí`);
  return m.slice(1).join(', ');
}

test('Přehled: „Další 3 jsou v sekci Agenti“, ne „Dalších 3 je“; uvítání: „1 nalezená konverzace“', async () => {
  const osa = await tvary('public/js/views/overview.js', 'skryto', 'Další je');
  const nalezeno = await tvary('public/js/welcome.js', 'n');
  const cs = JSON.parse(vKlientu('cs', `const { plural } = await import('./public/js/format.js');
    const osa = (n) => plural(n, ${osa}).replace('{0}', n);
    const nalezeno = (n) => plural(n, ${nalezeno});
    console.log(JSON.stringify([osa(1), osa(3), osa(10), nalezeno(1), nalezeno(2), nalezeno(5)]));`));
  assert.deepEqual(cs, ['Další je v sekci Agenti.', 'Další 3 jsou v sekci Agenti.', 'Dalších 10 je v sekci Agenti.', 'nalezená konverzace', 'nalezené konverzace', 'nalezených konverzací']);
});

test('časová osa a „Právě teď“ při mnoha agentech: kapsle s textem, ne odkaz bez tvaru a prázdná karta', async () => {
  const prehled = await fs.readFile(path.join(ROOT, 'public/js/views/overview.js'), 'utf8');
  const css = await fs.readFile(path.join(ROOT, 'public/styles.css'), 'utf8');
  // Odkaz pod osou je kapsle .link (32 px, --r-full); věta s počtem stojí vedle něj jako text.
  assert.match(prehled, /<p class="tl-more"><a class="link" href="#\/agenti">/);
  assert.doesNotMatch(prehled, /<a class="tl-more"/);
  // Karta „+5“ bez popisku je pryč: kapsle říká, kolik agentů a kde jsou.
  assert.doesNotMatch(prehled, /pb-agent--more|>\+\$\{live\.length - STRIP_MAX\}</);
  assert.match(prehled, /class="pb-dalsi"><a class="link" href="#\/agenti">\$\{esc\(plural\(n, 'Další agent v sekci Agenti'/);
  assert.doesNotMatch(css, /\.pb-agent--more/);
  // CI měří i tenhle stav: QA skripty mají víc než 7 řádků osy a víc než 12 živých agentů.
  const { MNOHO_AGENTU } = await import('../scripts/qa-agenti.mjs');
  assert.ok(MNOHO_AGENTU > 12);
  for (const f of ['scripts/qa-tvary.mjs', 'scripts/qa-contrast.mjs']) {
    const skript = await fs.readFile(path.join(ROOT, f), 'utf8');
    assert.match(skript, /pridejMnohoAgentu\(app\.app\.store\)/, f);
    // Osa je ve sbaleném „Průběh dne a spotřeba“; zavřené <details> se nevykreslí ani neměří.
    assert.match(skript, /details\.home-history'\); if \(d\) d\.open = true;/, f);
  }
});

test('název konverzace se zkracuje na hranici slova s „…“ a celý zůstává ve fullTitle', () => {
  const dlouhy = 'Kompletní redesign klientského portálu včetně navigace, mobilního menu, přístupnosti a všech formulářů pro objednávky a reklamace';
  const kratky = clipSlova(dlouhy, 100);
  assert.ok(kratky.length <= 100, kratky);
  assert.ok(kratky.endsWith('…'), kratky);
  assert.equal(kratky, 'Kompletní redesign klientského portálu včetně navigace, mobilního menu, přístupnosti a všech…');
  assert.ok(dlouhy.startsWith(kratky.slice(0, -1)), 'konec před výpustkou je celé slovo z původního textu');
  assert.equal(clipSlova('Krátký název', 100), 'Krátký název');
  assert.equal(clipSlova('a'.repeat(150), 100), `${'a'.repeat(99)}…`, 'jedno dlouhé slovo se usekne');
  assert.equal(clipSlova('slovo, další slovo', 8), 'slovo…', 'čárka před výpustkou nezůstane');

  const now = Date.now();
  const s = createSession({ connector: 'claude-code', localId: 'dlouhy', provider: 'anthropic', app: 'Claude Code' });
  s.title = dlouhy;
  s.lastAt = now;
  const sum = summarize(s, now, 24 * HOUR);
  assert.equal(sum.title, kratky);
  assert.equal(sum.fullTitle, dlouhy);
  s.title = 'Krátký název';
  assert.equal(summarize(s, now, 24 * HOUR).fullTitle, '', 'nezkrácený název se neopakuje');
});

test('upozornění na limit: čas obnovy bez sekund, v angličtině ve zvyklém zápisu', () => {
  const datastore = fakeDatastore();
  const store = { emit() {}, on() {}, list: () => [], limitList: () => [] };
  const alerts = new AlertEngine({ store, datastore, notifier: { native: async () => true } });
  const kdy = new Date(2026, 9, 13, 4, 9, 56).getTime();
  alerts.onLimit({ id: 'l1', app: 'Claude Code', label: 'Limit 5 h', reached: true, resetsAt: kdy }, null);
  alerts.onLimit({ id: 'l2', app: 'Codex', label: 'Týdenní limit', reached: false, usedPercent: 85, resetsAt: kdy }, { usedPercent: 10 });
  assert.deepEqual(datastore.data.alerts.map((a) => a.body), ['Obnoví se 13. 10. 2026 04:09.', 'Obnoví se 13. 10. 2026 04:09.']);
  const prelozData = vytvorPrelozData(vytvorPrekladac(EN.server, EN.texty, 'en-GB'));
  const en = prelozData(structuredClone(datastore.data.alerts)).map((a) => a.body);
  assert.deepEqual(en, ['Resets 13/10/2026, 04:09.', 'Resets 13/10/2026, 04:09.']);
});

test('osa grafu tokenů píše „tis.“ a „M“ jako čísla vedle ní (fmtTok), anglicky „k“ a „M“', () => {
  const cs = JSON.parse(vKlientu('cs', `const { fmtAxis } = await import('./public/js/format.js'); console.log(JSON.stringify([500, 1500, 2000, 1.5e6, 2e9].map(fmtAxis)));`));
  assert.deepEqual(cs, ['500', '1,5 tis.', '2 tis.', '1,5 M', '2 mld.']);
  const en = JSON.parse(vKlientu('en', `const { fmtAxis } = await import('./public/js/format.js'); console.log(JSON.stringify([500, 1500, 1.5e6, 2e9].map(fmtAxis)));`));
  assert.deepEqual(en, ['500', '1.5k', '1.5\u00a0M', '2\u00a0bn']);
});
