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
  // Jednorázový workflow pro výslovně požadovanou 0.46.1 testovací verzi:
  // actions:write jen k ručnímu dispatch vydání a contents:write výhradně
  // ke zveřejnění ověřeného draftu jako prerelease (nikoli jako latest).
  'release-0461-preview.yml': {
    'start-preview-build': 'spustit zkontrolované release.yml přes workflow_dispatch',
    'publish-preview': 'publikovat jen ověřený v0.46.1 prerelease s úplnými přílohami',
  },
  'release-0462-preview.yml': {
    'start-preview-build': 'spustit konkrétní zelený v0.46.2 build',
    'publish-preview': 'po dokončení release buildu zveřejnit pouze ověřený preview',
  },

  'release-0463-preview.yml': {
    'start-preview-build': 'spustit ověřený v0.46.3 build po zeleném main CI',
    'publish-preview': 'zveřejnit jen shodný tag a úplnou ověřenou binárku jako prerelease',
  },
  'release-0464-preview.yml': {
    'start-preview-build': 'sestavit jen zelený 0.46.4 candidate ze stejného main SHA',
    'publish-preview': 'ověřit shodný tag, binaries a SHA-256 manifest',
  },
  'release-0465-preview.yml': {
    'start-preview-build': 'spustit vydání 0.46.5 pouze po zeleném main CI',
    'publish-preview': 'ověřit shodný tag, hotový build a SHA-256 manifest',
  },
  'release-0466-preview.yml': {
    'start-preview-build': 'spustit přesnou 0.46.6 pouze po zeleném main CI',
    'publish-preview': 'ověřit shodný tag, kompletní přílohy a SHA-256 manifest',
  },
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

test('0.46.1 preview resumes failed builds without republishing existing releases', () => {
  const preview = workflowy.find((w) => w.f === 'release-0461-preview.yml')?.yml;
  assert.ok(preview, 'preview workflow must exist');
  const start = ulohy(preview)['start-preview-build'];
  assert.ok(start, 'preview build job must exist');
  assert.match(start, /gh release view v0\.46\.1 --repo "\$REPO" --json isDraft,assets/,
    'inspect both release draft status and assets before deciding to skip');
  assert.match(start, /agenteeq-extension-0\.46\.1\.zip/,
    'extension artifact is mandatory for a complete draft');
  assert.match(start, /Draft is complete; independent publish-preview job checks release gates/,
    'complete draft should use the main-CI publication path, not repeat an expensive build');
  assert.doesNotMatch(start, /Existing complete draft may have missed publication; resuming gated release workflow/,
    'complete draft must not enter repeated release-build dispatches');
  assert.match(start, /Release draft missing assets; retrying the artifact build/,
    'incomplete draft must be recoverable');
  assert.match(start, /gh release view v0\.46\.1 --repo "\$REPO"/,
    'check for an existing draft or published release before dispatch');
  assert.match(start, /gh api "repos\/\$REPO\/git\/ref\/tags\/v0\.46\.1"/,
    'detect an existing tag without suppressing recovery');
  assert.doesNotMatch(start, /Release tag already exists; no duplicate build/,
    'tag existence alone must not block a retry after build failure');
  assert.match(start, /gh workflow run release\.yml --repo "\$REPO" --ref main -f tag=v0\.46\.1/,
    'resume through the existing gated release workflow');
});

test('0.46.1 preview can publish an already completed draft after green main CI', () => {
  const preview = workflowy.find((w) => w.f === 'release-0461-preview.yml')?.yml;
  assert.ok(preview, 'missing preview workflow');
  const publish = ulohy(preview)['publish-preview'];
  assert.ok(publish, 'publication job must exist');
  assert.match(publish, /github\.event\.workflow_run\.name == 'Testy'/,
    'green main CI must be an independent publication trigger');
  assert.match(publish, /github\.event\.workflow_run\.name == 'Vydání'/,
    'retain the direct release workflow trigger');
  assert.match(publish, /github\.event\.workflow_run\.conclusion == 'success'/);
  assert.match(publish, /github\.event\.workflow_run\.head_branch == 'main'/);
  assert.match(publish, /MAIN_SHA.*BUILD_SHA/,
    'CI-triggered publication must reject a stale main commit');
  assert.match(publish, /TAG_SHA/,
    'published assets must retain their exact release tag identity');
  assert.match(publish, /actions\/workflows\/test\.yml\/runs\?head_sha=\$TAG_SHA/,
    'original tag commit must already have green complete CI');
  assert.match(publish, /\.name==\$name and \.size>100000/,
    'all expected binary artifacts must have plausible nonzero sizes');
  assert.match(publish, /--draft=false --prerelease --latest=false/,
    'preview must not replace stable latest release');
});

test('0.46.2 preview only runs after successful main push CI and publishes after its own release build', () => {
  const preview = workflowy.find((w) => w.f === 'release-0462-preview.yml')?.yml;
  assert.ok(preview, 'missing 0.46.2 preview workflow');
  const jobs = ulohy(preview);
  assert.ok(jobs['start-preview-build'] && jobs['publish-preview']);
  const start = jobs['start-preview-build'];
  const publish = jobs['publish-preview'];
  assert.match(start, /github\.event\.workflow_run\.event == 'push'/);
  assert.match(start, /github\.event\.workflow_run\.conclusion == 'success'/);
  assert.match(start, /github\.event\.workflow_run\.head_branch == 'main'/);
  assert.match(start, /MAIN_SHA.*TESTED_SHA/);
  assert.match(start, /VERSION.*0\.46\.2/);
  assert.match(start, /gh workflow run release\.yml --repo "\$REPO" --ref main -f tag=v0\.46\.2/);
  assert.match(publish, /needs: start-preview-build/);
  assert.match(publish, /TAG_SHA.*TESTED_SHA/);
  assert.match(publish, /actions\/workflows\/release\.yml\/runs\?head_sha=\$TAG_SHA/);
  assert.match(publish, /"Agenteeq-macOS-arm64.dmg"/);
  assert.match(publish, /"agenteeq-extension-0\.46\.2.zip"/);
  assert.match(publish, /\.size > 100000/);
  assert.match(publish, /--draft=false --prerelease --latest=false/);
  assert.doesNotMatch(skripty(preview).join('\n'), /--latest(?:\s|$)/, 'preview cannot be latest');
});

test('0.46.3 icon preview is pinned to exact green main SHA and never promoted to stable latest', () => {
  const wf = workflowy.find(({ f }) => f === 'release-0463-preview.yml')?.yml;
  assert.ok(wf, 'missing 0.46.3 preview workflow');
  const jobs = ulohy(wf);
  const start = jobs['start-preview-build'];
  const publish = jobs['publish-preview'];
  assert.ok(start && publish);
  assert.match(start, /github\.event\.workflow_run\.event == 'push'/);
  assert.match(start, /github\.event\.workflow_run\.head_branch == 'main'/);
  assert.match(start, /github\.event\.workflow_run\.conclusion == 'success'/);
  assert.match(start, /MAIN_SHA.*TESTED_SHA/);
  assert.match(start, /VERSION.*0\.46\.3/);
  assert.match(start, /gh workflow run release\.yml --repo "\$REPO" --ref main -f tag=v0\.46\.3/);
  assert.match(publish, /TAG_SHA.*TESTED_SHA/);
  assert.match(publish, /actions\/workflows\/release\.yml\/runs\?head_sha=\$TAG_SHA/);
  assert.match(publish, /agenteeq-extension-0\.46\.3\.zip/);
  assert.match(publish, /\.size > 100000/);
  assert.match(publish, /--draft=false --prerelease --latest=false/);
});

test('0.46.4 icon preview is pinned to exact green main SHA and never promoted to stable latest', () => {
  const wf = workflowy.find(({ f }) => f === 'release-0464-preview.yml')?.yml;
  assert.ok(wf, 'missing 0.46.4 preview workflow');
  const jobs = ulohy(wf);
  const start = jobs['start-preview-build'];
  const publish = jobs['publish-preview'];
  assert.ok(start && publish);
  assert.match(start, /github\.event\.workflow_run\.event == 'push'/);
  assert.match(start, /github\.event\.workflow_run\.head_branch == 'main'/);
  assert.match(start, /github\.event\.workflow_run\.conclusion == 'success'/);
  assert.match(start, /MAIN_SHA.*TESTED_SHA/);
  assert.match(start, /VERSION.*0\.46\.4/);
  assert.match(start, /gh workflow run release\.yml --repo "\$REPO" --ref main -f tag=v0\.46\.4/);
  assert.match(publish, /TAG_SHA.*TESTED_SHA/);
  assert.match(publish, /actions\/workflows\/release\.yml\/runs\?head_sha=\$TAG_SHA/);
  assert.match(publish, /agenteeq-extension-0\.46\.4\.zip/);
  assert.match(publish, /\.size > 100000/);
  assert.match(publish, /--draft=false --prerelease --latest=false/);
});


test('0.46.4 Preview publication additionally requires the independent SHA256SUMS asset', () => {
  const workflow = workflowy.find(({ f }) => f === 'release-0464-preview.yml')?.yml;
  assert.ok(workflow);
  assert.match(ulohy(workflow)['publish-preview'], /SHA256SUMS\.txt/);
  assert.match(ulohy(workflow)['publish-preview'], /\.size > 100/);
});

test('0.46.5 Preview delivery is version-pinned, SHA256-verified and never marked stable latest', () => {
  const workflow = workflowy.find(({ f }) => f === 'release-0465-preview.yml')?.yml;
  assert.ok(workflow, 'missing 0.46.5 Preview delivery workflow');
  const jobs = ulohy(workflow);
  const start = jobs['start-preview-build'];
  const publish = jobs['publish-preview'];
  assert.ok(start && publish);
  assert.match(start, /github\.event\.workflow_run\.event == 'push'/);
  assert.match(start, /github\.event\.workflow_run\.conclusion == 'success'/);
  assert.match(start, /github\.event\.workflow_run\.head_branch == 'main'/);
  assert.match(start, /MAIN_SHA.*TESTED_SHA/);
  assert.match(start, /VERSION.*0\.46\.5/);
  assert.match(start, /gh workflow run release\.yml --repo "\$REPO" --ref main -f tag=v0\.46\.5/);
  assert.match(publish, /TAG_SHA.*TESTED_SHA/);
  assert.match(publish, /actions\/workflows\/release\.yml\/runs\?head_sha=\$TAG_SHA/);
  assert.match(publish, /agenteeq-extension-0\.46\.5\.zip/);
  assert.match(publish, /SHA256SUMS\.txt/);
  assert.match(publish, /--draft=false --prerelease --latest=false/);
});


test('0.46.6 Preview publication requires verified exact-SHA main CI, binaries and manifest', () => {
  const workflow = workflowy.find(({ f }) => f === 'release-0466-preview.yml')?.yml;
  assert.ok(workflow, 'missing 0.46.6 Preview delivery workflow');
  const jobs = ulohy(workflow);
  const start = jobs['start-preview-build'];
  const publish = jobs['publish-preview'];
  assert.ok(start && publish);
  assert.match(start, /github\.event\.workflow_run\.event == 'push'/);
  assert.match(start, /github\.event\.workflow_run\.conclusion == 'success'/);
  assert.match(start, /github\.event\.workflow_run\.head_branch == 'main'/);
  assert.match(start, /MAIN_SHA.*TESTED_SHA/);
  assert.match(start, /VERSION.*0\.46\.6/);
  assert.match(start, /gh workflow run release\.yml --repo "\$REPO" --ref main -f tag=v0\.46\.6/);
  assert.match(publish, /TAG_SHA.*TESTED_SHA/);
  assert.match(publish, /actions\/workflows\/release\.yml\/runs\?head_sha=\$TAG_SHA/);
  assert.match(publish, /Agenteeq-macOS-arm64\.dmg/);
  assert.match(publish, /agenteeq-extension-0\.46\.6\.zip/);
  assert.match(publish, /SHA256SUMS\.txt/);
  assert.match(publish, /--draft=false --prerelease --latest=false/);
});
