import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { sekceZmen, napovedaProMac, poznamky, nazevVydani, nadpisyPodNazev } from '../scripts/release-notes.mjs';

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

// Popis vydání je slib ke stažení. Od účtu a synchronizace (0.25.0) už „nic neposílá na
// internet“ neplatí – a kurzy ČNB se stahovaly i předtím.
test('popis vydání říká pravdu o tom, co odchází na internet', async () => {
  const verze = JSON.parse(await zdroj('package.json')).version;
  const text = poznamky({ changelog: await zdroj('CHANGELOG.md'), verze });
  assert.doesNotMatch(text, /nic neposílá na internet/);
  assert.match(text, /kurzy ČNB/);
  assert.match(text, /účet Agenteeq, kam při zapnuté synchronizaci\s+odcházejí jen souhrnná čísla/);
  assert.match(text, /Text konverzací, jejich názvy ani kód počítač neopouštějí/);
});

// Nadpisy popisu vydání mimo kódové bloky: [úroveň, text].
const nadpisy = (md) => {
  let vKodu = false;
  const out = [];
  for (const r of md.split('\n')) {
    if (/^\s*(```|~~~)/.test(r)) { vKodu = !vKodu; continue; }
    const m = !vKodu && r.match(/^(#{1,6})\s+(.*)$/);
    if (m) out.push([m[1].length, m[2]]);
  }
  return out;
};

// Osnova bez skoků: začíná `##` (h1 je název vydání na GitHubu), nikdy nesestoupí o víc než
// jednu úroveň a nic není nad `##`.
const cistaOsnova = (md) => {
  const h = nadpisy(md);
  assert.equal(h[0]?.[0], 2, `popis začíná nadpisem ## (je: ${JSON.stringify(h[0])})`);
  for (let i = 1; i < h.length; i++) {
    assert.ok(h[i][0] >= 2, `nadpis „${h[i][1]}“ je nad úrovní ##`);
    assert.ok(h[i][0] <= h[i - 1][0] + 1, `„${h[i][1]}“ (${h[i][0]}) přeskakuje úroveň pod „${h[i - 1][1]}“ (${h[i - 1][0]})`);
  }
  return h;
};

// Dřív byl název `###` (stejně jako skupiny změn pod ním a hlouběji než „## Ke stažení“)
// a začínal malým písmenem, protože se bral z CHANGELOG.md tak, jak navazuje na datum.
test('popis vydání má čistou osnovu nadpisů a název s velkým písmenem', async () => {
  assert.equal(nazevVydani('0.29.0 – 2026-09-27 · nové okno rozšíření, párování bez kódu'), 'Nové okno rozšíření, párování bez kódu');
  assert.equal(nazevVydani('0.13.0 – 2026-10-01 · účet · synchronizace'), 'Účet · synchronizace', 'další „·“ patří do názvu');
  assert.equal(nazevVydani('0.13.0 – 2026-10-01'), '0.13.0 – 2026-10-01', 'bez názvu zůstane verze a datum');

  const log = [
    '# Changelog',
    '',
    '## 0.14.0 – 2026-10-02 · čistší osnova',
    '',
    '#### Hlouběji, než je třeba',
    '',
    '- Změna.',
    '',
    '```bash',
    '# komentář v ukázce není nadpis',
    'npm test',
    '```',
    '',
    '##### Podskupina',
    '',
    '- Další změna.',
    '',
  ].join('\n');
  assert.equal(nadpisyPodNazev('#### A\n\n##### B\n'), '### A\n\n#### B\n', 'nejvyšší nadpis těla je o úroveň pod názvem');
  assert.equal(nadpisyPodNazev('- jen body\n'), '- jen body\n');

  const text = poznamky({
    changelog: log,
    verze: '0.14.0',
    soubory: [
      { jmeno: 'Agenteeq-0.14.0-macOS-arm64.zip', bajtu: 34_000_000 },
      { jmeno: 'Agenteeq-0.14.0-Windows-x64.zip', bajtu: 32_500_000 },
      { jmeno: 'agenteeq-extension-0.14.0.zip', bajtu: 240_000 },
    ],
  });
  assert.ok(text.startsWith('## Čistší osnova\n'), 'název je ## s velkým počátečním písmenem');
  assert.match(text, /\n# komentář v ukázce není nadpis\n/, 'obsah kódového bloku zůstane, jak je');
  assert.deepEqual(cistaOsnova(text), [
    [2, 'Čistší osnova'],
    [3, 'Hlouběji, než je třeba'],
    [4, 'Podskupina'],
    [2, 'Ke stažení'],
    [2, 'Instalace na Macu'],
    [2, 'Co Agenteeq potřebuje'],
  ]);

  // Skutečný CHANGELOG pro aktuální verzi, se všemi přílohami, aby se ukázaly všechny sekce.
  const verze = JSON.parse(await zdroj('package.json')).version;
  const aktualni = poznamky({
    changelog: await zdroj('CHANGELOG.md'),
    verze,
    soubory: [`Agenteeq-${verze}-macOS-arm64.zip`, `Agenteeq-${verze}-Windows-x64.zip`, `agenteeq-extension-${verze}.zip`]
      .map((jmeno) => ({ jmeno, bajtu: 1_000_000 })),
  });
  const h = cistaOsnova(aktualni);
  assert.match(h[0][1], /^\p{Lu}/u, 'název vydání začíná velkým písmenem');
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

// Zveřejnění je krok ven ke stažení: jen na ruční spuštění z main, jen koncept (zveřejněné
// vydání se nepřepisuje) a jen s přílohou, na kterou vede tlačítko Stáhnout na webu.
test('zveřejnění: jen ručně z main, jen koncept a s přílohou pro tlačítko Stáhnout', async () => {
  const yml = await zdroj('.github/workflows/publish.yml');
  assert.match(yml, /^on:\s*\n\s*workflow_dispatch:/m, 'zveřejnění se spouští jen ručně');
  assert.doesNotMatch(yml, /^\s*(push|schedule|release|workflow_run):/m, 'nikdy samo od sebe');
  assert.match(yml, /\$GITHUB_REF" != "refs\/heads\/main"/);
  assert.match(yml, /\^v\[0-9\]\+/, 'tag se ověří dřív, než se s ním cokoli dělá');
  assert.match(yml, /if \(!v\.isDraft\)[^\n]*process\.exit\(1\)/, 'zveřejněné vydání se nepřepisuje');
  assert.match(yml, /a\.name === "Agenteeq-macOS-arm64\.zip"/, 'bez stálé přílohy by tlačítko Stáhnout vedlo do prázdna');
  assert.match(yml, /node scripts\/release-notes\.mjs/, 'popis skládá skript, ne ruka');
  assert.match(yml, /\/releases\/download\/\$TAG\/Agenteeq-macOS-arm64\.zip/, 'po zveřejnění se ověří odkaz ke stažení');
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
