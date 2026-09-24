import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { sekceZmen, napovedaProMac, poznamky } from '../scripts/release-notes.mjs';

const zdroj = (p) => fs.readFile(new URL(`../${p}`, import.meta.url), 'utf8');

const CHANGELOG = [
  '# Changelog',
  '',
  '## 0.13.0 – 2026-10-01 · Něco nového',
  '',
  '- První změna.',
  '- Druhá změna.',
  '',
  '## 0.12.0 – 2026-09-15 · Starší vydání',
  '',
  '- Něco staršího.',
  '',
].join('\n');

test('popis vydání bere změny z CHANGELOG.md, ne z paměti', () => {
  const { nadpis, telo } = sekceZmen(CHANGELOG, '0.13.0');
  assert.match(nadpis, /^0\.13\.0 – 2026-10-01 · Něco nového$/);
  assert.equal(telo, '- První změna.\n- Druhá změna.', 'sekce končí u dalšího nadpisu');
  assert.equal(sekceZmen(CHANGELOG, '0.12.0').telo, '- Něco staršího.', 'poslední sekce sahá do konce souboru');

  // Vydání bez popisu změn je horší než žádné – skript to má zastavit, ne mlčky pustit dál.
  assert.throws(() => sekceZmen(CHANGELOG, '0.99.0'), /0\.99\.0/);
  assert.throws(() => sekceZmen('# Changelog\n\n## 0.1.0 – x\n\n## 0.0.9 – y\n\n- a\n', '0.1.0'), /prázdná/);
});

// Ad-hoc podepsanou aplikaci macOS po stažení odmítne hláškou „je poškozená“. Poškozená není,
// ale uživatel to neví. Kdyby to v popisu nestálo, vypadalo by vydání jako vadné.
test('popis říká pravdu o podpisu, i když je nepříjemná', () => {
  const adhoc = napovedaProMac('ad-hoc');
  assert.match(adhoc, /není podepsaný Developer ID/);
  assert.match(adhoc, /xattr -dr com\.apple\.quarantine/, 'bez příkazu je varování k ničemu');

  const podepsano = napovedaProMac('Developer ID');
  assert.match(podepsano, /notarizovaná/);
  assert.doesNotMatch(podepsano, /xattr/, 'u podepsaného buildu by návod na karanténu jen strašil');
});

test('popis slibuje jen soubory, které opravdu jsou', () => {
  const jenMac = poznamky({
    changelog: CHANGELOG,
    verze: '0.13.0',
    soubory: [{ jmeno: 'Agenteeq-0.13.0-macOS-arm64.zip', bajtu: 34_000_000 }],
  });
  assert.match(jenMac, /Agenteeq-0\.13\.0-macOS-arm64\.zip.*32\.4 MB/);
  assert.doesNotMatch(jenMac, /Windows/, 'aplikace pro Windows u vydání není, tak se o ní nepíše');
  assert.match(jenMac, /macOS 14 nebo novější/);

  const bezMacu = poznamky({
    changelog: CHANGELOG,
    verze: '0.13.0',
    soubory: [{ jmeno: 'agenteeq-extension-0.13.0.zip', bajtu: 240_000 }],
  });
  assert.doesNotMatch(bezMacu, /Instalace na Macu/, 'bez aplikace pro Mac nemá návod na instalaci co instalovat');
  assert.doesNotMatch(bezMacu, /macOS 14/);

  // Řazení podle abecedy by postavilo „Windows“ před „macOS“ (velké W je před malým m).
  const obojí = poznamky({
    changelog: CHANGELOG,
    verze: '0.13.0',
    soubory: [
      { jmeno: 'Agenteeq-0.13.0-Windows-x64.zip', bajtu: 32_500_000 },
      { jmeno: 'Agenteeq-0.13.0-macOS-arm64.zip', bajtu: 34_000_000 },
    ],
  });
  assert.ok(obojí.indexOf('macOS-arm64') < obojí.indexOf('Windows-x64'), 'Mac je hlavní platforma a patří první');
  assert.match(obojí, /nebyla vyzkoušena na skutečném počítači/, 'o neověřeném Windows se mlčet nesmí');
});

test('popis pro aktuální verzi se dá sestavit', async () => {
  const verze = JSON.parse(await zdroj('package.json')).version;
  const text = poznamky({ changelog: await zdroj('CHANGELOG.md'), verze });
  assert.ok(text.length > 200, 'popis aktuálního vydání nesmí být prázdný');
});

// Zveřejnění je krok ven ke stažení a patří člověku. Kdyby workflow vydání rovnou publikoval,
// stačilo by omylem strčit tag a venku je verze, kterou nikdo neviděl.
test('workflow zakládá vydání jako koncept, nepublikuje ho', async () => {
  const yml = await zdroj('.github/workflows/release.yml');
  assert.match(yml, /gh release create "\$TAG"[\s\S]{0,120}--draft/, 'nové vydání musí vznikat jako koncept');
  assert.match(yml, /node scripts\/release-notes\.mjs/, 'popis se skládá skriptem, ne ručně');
  assert.match(yml, /permissions:\s*\n\s*contents: write/, 'bez práva zápisu vydání nevznikne');
  // Intel větev smí odpadnout, hlavní build ne.
  assert.match(yml, /needs\.mac\.result == 'success'/);
  assert.doesNotMatch(yml, /needs\.mac-intel\.result == 'success'/);
});

// Vydání jde spustit i bez terminálu (Actions → Run workflow). Chybějící tag pak založí CI –
// ale jen z main a jen pro verzi, která je v package.json, a všechny buildy čekají, až tag je.
test('ruční spuštění založí tag jen z main a jen pro verzi z package.json', async () => {
  const yml = await zdroj('.github/workflows/release.yml');
  const znacka = yml.match(/\n  znacka:\n([\s\S]*?)\n  mac:\n/)?.[1];
  assert.ok(znacka, 'úloha „znacka“ musí být první');
  assert.match(znacka, /if: github\.event_name == 'workflow_dispatch'/);
  assert.match(znacka, /\$GITHUB_REF" != "refs\/heads\/main"/, 'nový tag jen z main');
  assert.match(znacka, /"v\$VERZE" != "\$TAG"/, 'tag musí sedět s verzí v package.json');
  assert.match(znacka, /git ls-remote --exit-code --tags origin/, 'existující tag se jen použije, nepřepíše');
  for (const uloha of ['mac', 'mac-intel', 'windows', 'rozsireni']) {
    assert.match(yml, new RegExp(`\\n  ${uloha}:\\n    name: [^\\n]+\\n    needs: znacka\\n`), `${uloha} čeká na tag`);
  }
});
