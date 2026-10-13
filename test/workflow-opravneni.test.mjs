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
  'release.yml': { znacka: 'push nového tagu', vydani: 'koncept vydání přes gh release', audit: 'GitHub vyžaduje write token k čistě čtecímu přístupu k neveřejnému Draftu' },
  'publish.yml': { zverejnit: 'zveřejnění konceptu' },
  'prepare-preview-draft.yml': { prepare: 'jen spuštění existujícího release.yml (actions:write)' },
  'audit-release-draft.yml': { verify: 'pro čtení neveřejného Draftu GitHub vyžaduje push oprávnění, žádná mutace' },

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

test('draft audit: elevated token only views private draft, never changes release or repository', () => {
  const audit = workflowy.find(({ f }) => f === 'audit-release-draft.yml')?.yml || '';
  assert.match(audit, /^  verify:\n[\s\S]*?^    permissions:\n      contents: write\n      actions: read/m);
  const commands = skripty(audit).join('\n');
  assert.match(commands, /gh api/);
  assert.match(commands, /verify-release-assets\.mjs/);
  assert.doesNotMatch(commands, /gh release (?:create|edit|upload)|git push|--draft=false/,
    'Draft visibility must not grant a path to publication or binary mutation');
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

test('historical preview delivery listeners do not fire on every completed CI run', () => {
  const previews = soubory.filter((name) => /^release-\d{4}-preview\.yml$/.test(name));
  assert.deepEqual(previews, [], 'completed preview versions must not retain active workflow_run listeners');
  assert.ok(soubory.includes('release.yml'), 'manual release build must remain available');
  assert.ok(soubory.includes('publish.yml'), 'explicit publication workflow must remain available');
});


test('CI does not start duplicate push and pull_request matrices for feature branches', () => {
  const workflow = workflowy.find(({ f }) => f === 'test.yml')?.yml || '';
  const triggers = workflow.slice(0, workflow.indexOf('\nconcurrency:'));
  assert.match(triggers, /\n  push:\n    branches: \[main\]/, 'push CI belongs to main only');
  assert.match(triggers, /\n  pull_request:/, 'feature branches run the complete matrix through a PR');
  assert.match(triggers, /\n  workflow_dispatch:/, 'maintainers can explicitly run CI');
  assert.doesNotMatch(triggers, /branches: \['\*\*'\]/, 'all-branches push CI duplicates PR checks');
  assert.match(workflow, /cancel-in-progress: true/, 'new commits cancel obsolete PR runs');
});


test('automatic draft preparation has only workflow dispatch rights, never release write rights', () => {
  const draft = workflowy.find(({ f }) => f === 'prepare-preview-draft.yml')?.yml || '';
  assert.match(draft, /^  prepare:\n[\s\S]*?^    permissions:\n      contents: read\n      actions: write /m);
  assert.doesNotMatch(draft, /contents: write|packages: write|issues: write|pull-requests: write/);
  assert.match(draft, /workflow_run:\n    workflows: \['Testy'\]/);
  assert.match(draft, /github\.event\.workflow_run\.conclusion == 'success'/);
  assert.match(draft, /inputs\[expected_sha\]=\$TESTED_SHA/);
  assert.doesNotMatch(skripty(draft).join('\n'), /gh release (create|edit)|--draft=false|--latest/);
});
