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
  'release.yml': { znacka: 'push nového tagu', vydani: 'koncept vydání přes gh release', audit: 'GitHub vyžaduje write token k čistě čtecímu přístupu k neveřejnému Draftu', uklid: 'smazání překonaných nezveřejněných Draftů (prune-drafts.yml)' },
  'smazat-prekonane-vetve.yml': { smazat: 'jednorázové smazání devíti vlastníkem schválených větví' },
  'uklid-vetvi.yml': { uklid: 'smazání větví, jejichž hlava je sloučený PR; main, chráněné a otevřené větve nemění' },
  'prune-drafts.yml': { uklid: 'smazání nezveřejněných Draftů starších než nejvyšší verze; zveřejněná vydání a tagy nemění' },
  'publish.yml': { zverejnit: 'zveřejnění konceptu' },
  'prepare-preview-draft.yml': { prepare: 'jen spuštění existujícího release.yml (actions:write)' },
  'publish-v0.46.57-once.yml': { 'release-preview': 'pouze dispatch existujících release.yml a publish.yml pro v0.46.57 Preview po zeleném main CI' },
  'merge-pr341-once.yml': { 'merge-exact-candidate': 'jen PR #341 na neměnném HEAD po úspěšných Testy a CodeQL; jediný squash merge' },
  'audit-release-draft.yml': { verify: 'pro čtení neveřejného Draftu GitHub vyžaduje push oprávnění, žádná mutace' },
  'scorecard.yml': { scorecard: 'nahrání výsledků do code scanning (security-events) a ověření původu přes OIDC (id-token); do repozitáře nezapisuje' },
  'codeql.yml': { analyze: 'nahrání výsledků CodeQL do code scanning (security-events); do repozitáře nezapisuje' },
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

test('OpenSSF Scorecard: zapisuje jen výsledky skenu, ne do repozitáře', () => {
  const sc = workflowy.find(({ f }) => f === 'scorecard.yml')?.yml;
  if (!sc) return;
  const prava = /^ {4}permissions:\n((?: {6}[^\n]*\n)*)/m.exec(ulohy(sc).scorecard)?.[1] || '';
  const zapis = prava.split('\n').filter((r) => /write/.test(r)).map((r) => r.trim().split(':')[0]).sort();
  assert.deepEqual(zapis, ['id-token', 'security-events'], 'jen code scanning a OIDC, žádné contents/actions/pull-requests: write');
  assert.match(prava, /contents: read/);
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
      // Od 13. 10. 2026 i akce GitHubu (actions/*) jen na SHA (OpenSSF Scorecard: Pinned-Dependencies).
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
  assert.match(workflow, /cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/, 'new commits cancel obsolete PR runs');
  assert.match(workflow, /group: test-.*\$\{\{ github\.head_ref \|\| github\.sha \}\}/, 'každý commit na main má vlastní skupinu, nikdy se neruší ani nenahradí');
});


test('automatic draft preparation has only workflow dispatch rights, never release write rights', () => {
  const draft = workflowy.find(({ f }) => f === 'prepare-preview-draft.yml')?.yml || '';
  assert.match(draft, /^  prepare:\n[\s\S]*?^    permissions:\n      contents: read\n      actions: write /m);
  assert.doesNotMatch(draft, /contents: write|packages: write|issues: write|pull-requests: write/);
  assert.match(draft, /^on:\n  workflow_dispatch:\n/m, 'kandidát jen na pokyn');
  assert.match(draft, /test\.yml\/runs\?head_sha=\$TESTED_SHA&event=push&status=success/, 'a jen ze zeleného CI');
  assert.match(draft, /inputs\[expected_sha\]=\$TESTED_SHA/);
  assert.doesNotMatch(skripty(draft).join('\n'), /gh release (create|edit)|--draft=false|--latest/);
});

test('workflowy: každé `uses:` je připnuté na 40místný commit s verzí v komentáři (jen lokální ./ výjimka)', () => {
  let nalezeno = 0;
  for (const { f, yml } of workflowy) {
    for (const [, odkaz, poznamka] of yml.matchAll(/^\s*(?:-\s+)?uses:\s*(\S+)([^\n]*)/gm)) {
      if (odkaz.startsWith('./')) continue; // znovupoužitelný workflow z téhož commitu
      nalezeno++;
      assert.match(odkaz, /^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/, `${f}: ${odkaz} není připnuté na celý commit (tag ani větev nestačí)`);
      assert.match(poznamka, /^\s+#\s*v\d+\.\d+\.\d+\s*$/, `${f}: u ${odkaz} chybí přesná verze v komentáři (# vX.Y.Z)`);
    }
  }
  assert.ok(nalezeno >= 40, 'čtení nenašlo žádné akce – test by prošel naprázdno');
});

test('workflowy: kód ze spuštěného běhu (workflow_run.head_sha) se nikdy nestahuje checkoutem', () => {
  for (const { f, yml } of workflowy) {
    for (const krok of yml.split(/^\s*- /m).filter((k) => /uses:\s*actions\/checkout@/.test(k))) {
      assert.doesNotMatch(krok, /ref:[^\n]*(?:workflow_run|head_sha|pull_request\.head)/, `${f}: checkout nesmí stáhnout ref z cizího běhu nebo PR (Scorecard: Dangerous-Workflow)`);
    }
  }
  const prepare = workflowy.find((w) => w.f === 'prepare-preview-draft.yml').yml;
  // Brána místo toho porovnává výchozí checkout s otestovaným SHA i s aktuálním main.
  assert.match(prepare, /"\$\(git rev-parse HEAD\)" != "\$TESTED_SHA"/);
  assert.match(prepare, /"\$CURRENT_MAIN" != "\$TESTED_SHA"/);
  const audit = workflowy.find((w) => w.f === 'audit-release-draft.yml').yml;
  // Ověření přesného zdroje zůstává: SHA tagu musí sedět s SHA úspěšného sestavení.
  assert.match(audit, /EXPECTED_RELEASE_SHA: \$\{\{ github\.event\.workflow_run\.head_sha \}\}/);
  assert.match(audit, /Successful build belongs to a different commit than the release tag/);
});

test('CodeQL: JavaScript, práva jen čtení + security-events u úlohy, bez uloženého tokenu', () => {
  const codeql = workflowy.find(({ f }) => f === 'codeql.yml')?.yml || '';
  assert.match(codeql, /^permissions:\n  contents: read\n/m);
  assert.match(codeql, /^    permissions:\n      contents: read\n      security-events: write/m);
  assert.match(codeql, /languages: javascript-typescript/);
  assert.match(codeql, /\n  push:\n    branches: \[main\]/);
  assert.match(codeql, /\n  pull_request:\n    branches: \[main\]/);
  assert.match(codeql, /\n  schedule:/);
  assert.match(codeql, /persist-credentials: false/);
});

test('Dependabot hlídá akce v workflowech, týdně a s malým počtem otevřených PR', async () => {
  const dependabot = await fs.readFile(new URL('../.github/dependabot.yml', import.meta.url), 'utf8');
  assert.match(dependabot, /package-ecosystem: github-actions/);
  assert.match(dependabot, /interval: weekly/);
  assert.match(dependabot, /open-pull-requests-limit: [1-5]\b/);
  assert.match(dependabot, /groups:/);
  // Projekt nemá žádné závislosti (AGENTS.md); npm ekosystem by hlídal prázdný seznam.
  const balicek = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(balicek.dependencies, undefined);
  assert.equal(balicek.devDependencies, undefined);
  assert.doesNotMatch(dependabot, /package-ecosystem: npm/);
});

test('workflowy: nástroje QA se nespouštějí přes `npx` (při chybějícím balíčku by stáhl libovolnou verzi)', () => {
  for (const { f, yml } of workflowy) {
    assert.doesNotMatch(skripty(yml).join('\n'), /\bnpx\b/, `${f}: npx bez přesné verze`);
  }
});
