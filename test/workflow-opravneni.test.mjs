import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

// Workflowy v .github/workflows sestavují a zakládají vydání, ke kterému vedou tlačítka Stáhnout.
// Token workflow proto smí jen to, co daná úloha opravdu potřebuje, cizí akce jsou připnuté na
// commit a nic, co přichází zvenku (jméno tagu, vstup ručního spuštění, data události), se
// nevkládá do textu skriptu. Bez závislostí: workflowy mají pevné odsazení (úloha 2 mezery,
// krok 6), takže stačí čtení po řádcích.

const DIR = new URL('../.github/workflows/', import.meta.url);
const soubory = (await fs.readdir(DIR)).filter((f) => /\.ya?ml$/.test(f)).sort();
const workflowy = await Promise.all(soubory.map(async (f) => ({ f, yml: await fs.readFile(new URL(f, DIR), 'utf8') })));

// Úlohy, které smějí zapisovat – a proč. Cokoli dalšího se zápisem je chyba.
const ZAPIS = {
  'release.yml': { znacka: 'push nového tagu', vydani: 'koncept vydání přes gh release' },
  'publish.yml': { zverejnit: 'zveřejnění konceptu' },
};

// Klíč na nejvyšší úrovni i s odsazenými řádky pod ním (`permissions: {}` i víceřádkový zápis).
const blok = (yml, klic) => yml.match(new RegExp(`^${klic}:[^\\n]*\\n(?: +[^\\n]*\\n)*`, 'm'));

function ulohy(yml) {
  const telo = yml.slice(yml.search(/^jobs:\s*$/m));
  const casti = telo.split(/^ {2}(?=[\w-]+:\s*$)/m).slice(1);
  return Object.fromEntries(casti.map((c) => [c.match(/^([\w-]+):/)[1], c]));
}

const kroky = (uloha) => uloha.split(/^ {6}- /m).slice(1);

// Text všech `run:` skriptů: jednořádkových i blokových (`|`, `>`), blok končí u menšího odsazení.
function skripty(yml) {
  const radky = yml.split('\n');
  const vysledek = [];
  for (let i = 0; i < radky.length; i++) {
    const m = radky[i].match(/^(\s*)(?:- )?run:\s*(.*)$/);
    if (!m) continue;
    const odsazeni = radky[i].indexOf('run:');
    if (!/^[|>]/.test(m[2])) { vysledek.push(m[2]); continue; }
    const text = [];
    while (i + 1 < radky.length && (radky[i + 1].trim() === '' || radky[i + 1].search(/\S/) > odsazeni)) text.push(radky[++i]);
    vysledek.push(text.join('\n'));
  }
  return vysledek;
}

test('workflowy: výchozí práva tokenu jen pro čtení, zápis jen u vyjmenovaných úloh', () => {
  assert.ok(workflowy.length >= 5, 'workflowy se nenačetly');
  for (const { f, yml } of workflowy) {
    const nahore = blok(yml, 'permissions');
    assert.ok(nahore, `${f}: chybí permissions na nejvyšší úrovni – bez nich má token výchozí práva repozitáře`);
    assert.doesNotMatch(nahore[0], /write/, `${f}: zápis nepatří do výchozích práv, jen k úloze, která ho potřebuje`);
    for (const [jmeno, uloha] of Object.entries(ulohy(yml))) {
      const zapis = /^ {4}permissions:[^\n]*\n(?: {6}[^\n]*\n)*/m.exec(uloha)?.[0].match(/write/);
      if (ZAPIS[f]?.[jmeno]) assert.ok(zapis, `${f} → ${jmeno}: potřebuje zápis (${ZAPIS[f][jmeno]})`);
      else assert.ok(!zapis, `${f} → ${jmeno}: úloha nemá důvod zapisovat`);
    }
  }
  for (const [f, seznam] of Object.entries(ZAPIS)) {
    const uloh = ulohy(workflowy.find((w) => w.f === f).yml);
    for (const jmeno of Object.keys(seznam)) assert.ok(uloh[jmeno], `${f}: úloha ${jmeno} zmizela – uprav i ZAPIS v tomto testu`);
  }
});

test('workflowy: žádný pull_request_target a nic zvenku vložené do textu skriptu', () => {
  for (const { f, yml } of workflowy) {
    // pull_request_target běží s tokenem cílového repozitáře nad kódem z cizí větve.
    assert.doesNotMatch(yml, /pull_request_target/, `${f}: pull_request_target`);
    for (const skript of skripty(yml)) {
      // Výraz `${{ … }}` GitHub dosadí do textu dřív, než ho shell přečte: jméno tagu nebo vstup
      // `$(…)` by se vykonal jako příkaz. Hodnota patří do `env:` a skript ji čte jako "$PROMENNA".
      assert.doesNotMatch(skript, /\$\{\{/, `${f}: výraz \${{ }} přímo ve skriptu run:\n${skript}`);
    }
  }
  // Pojistka, že čtení skriptů opravdu něco najde (jinak by test prošel naprázdno).
  const vydani = skripty(workflowy.find((w) => w.f === 'release.yml').yml).join('\n');
  assert.match(vydani, /gh release create "\$TAG"/);
  assert.match(vydani, /--title "Agenteeq \$VERZE"/);
});

test('workflowy: cizí akce připnuté na celý commit, checkout bez uloženého tokenu, kde se nepushuje', () => {
  for (const { f, yml } of workflowy) {
    for (const [, akce, verze, poznamka] of yml.matchAll(/uses:\s*([\w.-]+\/[\w./-]+)@(\S+)([^\n]*)/g)) {
      // Akce GitHubu (actions/*) zůstávají na hlavní verzi jako v celém repozitáři; cizí jen na SHA.
      if (akce.startsWith('actions/')) continue;
      assert.match(verze, /^[0-9a-f]{40}$/, `${f}: ${akce} musí být připnutá na celý commit, ne na ${verze}`);
      assert.match(poznamka, /#\s*v\d/, `${f}: u ${akce} chybí verze v komentáři`);
    }
    for (const [jmeno, uloha] of Object.entries(ulohy(yml))) {
      const pushuje = /git push/.test(uloha);
      for (const krok of kroky(uloha).filter((k) => /uses: actions\/checkout@/.test(k))) {
        if (pushuje) assert.doesNotMatch(krok, /persist-credentials: false/, `${f} → ${jmeno}: git push potřebuje token z checkoutu`);
        else assert.match(krok, /persist-credentials: false/, `${f} → ${jmeno}: úloha nepushuje, token v .git/config tam nemá co dělat`);
      }
    }
  }
});

test('workflowy: vydání zůstává konceptem a souběžné běhy pro týž tag se nepředbíhají', () => {
  const vydani = workflowy.find((w) => w.f === 'release.yml').yml;
  // V úvodním komentáři `--draft=false` stojí jako návod pro člověka; ve skriptech být nesmí.
  assert.doesNotMatch(skripty(vydani).join('\n'), /--draft=false|--latest|make_latest/, 'zveřejňuje jen člověk (publish.yml)');
  assert.match(blok(vydani, 'concurrency')?.[0] || '', /group: vydani-\$\{\{ inputs\.tag \|\| github\.ref_name \}\}\n\s*cancel-in-progress: false/);
  // Tajemství podpisu jen v krocích sestavení aplikace, ne v celé úloze ani workflow.
  for (const [jmeno, uloha] of Object.entries(ulohy(vydani))) {
    const sTajemstvim = kroky(uloha).filter((k) => /secrets\./.test(k));
    for (const k of sTajemstvim) assert.match(k, /run: npm run build:(?:mac|dmg)/, `release.yml → ${jmeno}: tajemství mimo krok sestavení`);
  }
  assert.doesNotMatch(vydani.slice(0, vydani.search(/^jobs:/m)), /secrets\./, 'tajemství nepatří do env celého workflow');
});
