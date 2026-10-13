import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

// README tvrdilo „297 testů“, když jich bylo 395, a nabízelo ke stažení verzi 0.12.0, když byla
// aktuální 0.18.2. Dokumentace, která se rozejde s produktem, je horší než žádná: čtenář podle ní
// hledá soubor, co neexistuje. Tyhle testy drží čísla u reality – ne na kus přesně, ale v mezích,
// kdy je údaj ještě pravdivý.

const zdroj = (p) => fs.readFile(new URL(`../${p}`, import.meta.url), 'utf8');
const verze = JSON.parse(await zdroj('package.json')).version;

test('verze v README odpovídá vydané verzi', async () => {
  const readme = await zdroj('README.md');
  assert.ok(readme.includes('**'+verze+'**'), 'README musí uvádět současnou pracovní verzi');
  // Odkaz vede na přílohu se stálým jménem v posledním vydání – stejně jako tlačítko na webu.
  // Adresa s číslem verze by po každém vydání ukazovala do prázdna.
  assert.match(readme, /releases\/latest\/download\/Agenteeq-macOS-arm64\.dmg/, 'README má odkazovat na stálý DMG instalátor posledního vydání');
});

test('počet testů v dokumentaci se neliší o víc než desetinu', async () => {
  const dir = new URL('../test/', import.meta.url);
  let skutecnost = 0;
  for (const f of await fs.readdir(dir)) {
    if (!f.endsWith('.test.mjs')) continue;
    // Počítají se i vnořené testy (`t.test(...)`), protože i ty runner vypíše jako samostatný test.
    // Soubor se čte přes URL, ne přes `dir.pathname` – z „/D:/…“ by na Windows vzniklo „D:\D:\…“.
    skutecnost += (await fs.readFile(new URL(f, dir), 'utf8')).match(/^\s*(?:await )?(?:t\.)?test\(/gm)?.length || 0;
  }
  for (const [soubor, re] of [['README.md', /npm test\s+# (\d+) testů/], ['docs/TESTING.md', /\*\*Aktuální inventář automatických testů:\*\* (\d+) deklarovaných testů/]]) {
    const uvedeno = Number((await zdroj(soubor)).match(re)?.[1]);
    assert.ok(uvedeno, `${soubor}: počet testů se nepodařilo najít`);
    const odchylka = Math.abs(uvedeno - skutecnost) / skutecnost;
    assert.ok(odchylka <= 0.1, `${soubor} uvádí ${uvedeno} testů, ve složce jich je ${skutecnost} (rozdíl ${Math.round(odchylka * 100)} %)`);
  }
});

test('changelog a „Co je nového“ znají vydanou verzi', async () => {
  assert.match(await zdroj('CHANGELOG.md'), new RegExp(`^## ${verze.replace(/\./g, '\\.')} – `, 'm'), 'CHANGELOG nemá záznam k této verzi');
  assert.match(await zdroj('public/js/whats-new-data.js'), new RegExp(`version: '${verze.replace(/\./g, '\\.')}'`), '„Co je nového“ nemá záznam k této verzi');
  assert.equal(JSON.parse(await zdroj('extension/manifest.json')).version, verze, 'rozšíření má jinou verzi než aplikace');
});

// docs/TESTING.md slibuje, že se test přeskočí „s důvodem“. `skip: podmínka` bez textu ale
// runner vypíše jen „# SKIP“ a z výpisu nejde poznat, jestli test chybí schválně, nebo omylem.
// Každá větev výrazu u skip/todo proto musí končit textem důvodu (`podmínka && 'důvod'`).
test('přeskočený test říká proč', async () => {
  const dir = new URL('../test/', import.meta.url);
  const retezec = /(?:^|&&|\?|:)\s*(['"`])[^'"`]+\1\s*$/;
  const bezZavorek = (v) => v.trim().replace(/^\((.*)\)$/s, '$1').trim();
  const sDuvodem = (vyraz, zdrojTestu, hloubka = 0) => vyraz.split('||').map(bezZavorek).every((vetev) => {
    if (retezec.test(vetev)) return true;
    const konstanta = hloubka === 0 && vetev.match(/^[A-Za-z_$][\w$]*$/)
      && zdrojTestu.match(new RegExp(`const ${vetev} = ([^;]+);`));
    return Boolean(konstanta) && sDuvodem(konstanta[1], zdrojTestu, 1);
  });
  const bezDuvodu = [];
  for (const f of await fs.readdir(dir)) {
    if (!f.endsWith('.test.mjs')) continue;
    const text = await fs.readFile(new URL(f, dir), 'utf8');
    const kod = text.split('\n').filter((r) => !r.trim().startsWith('//')).join('\n');
    for (const m of kod.matchAll(/\b(skip|todo):\s*([^}\n]+)/g)) {
      if (!sDuvodem(m[2], text)) bezDuvodu.push(`${f}: ${m[1]}: ${m[2].trim()}`);
    }
    for (const m of kod.matchAll(/\bt\.(skip|todo)\(\s*\)/g)) bezDuvodu.push(`${f}: ${m[0]}`);
  }
  assert.deepEqual(bezDuvodu, [], 'u přeskočení chybí důvod (`podmínka && \'důvod\'`)');

  // Kontrola sama musí starý tvar poznat, jinak by byla k ničemu.
  assert.equal(sDuvodem("process.platform !== 'win32'", ''), false);
  assert.equal(sDuvodem('BEZ_PRAV || process.getuid?.() === 0', "const BEZ_PRAV = x && 'důvod';"), false);
  assert.equal(sDuvodem("process.platform !== 'win32' && 'jen Windows'", ''), true);
});


test('publikace nesmí vynechat ZIP Chrome extension stejné verze', async () => {
  const workflow = await zdroj('.github/workflows/publish.yml');
  assert.match(workflow, /const expectedExtension = `agenteeq-extension-\$\{process\.env\.TAG\.slice\(1\)\}\.zip`;/);
  assert.match(workflow, /"Agenteeq-Windows-x64\.zip", expectedExtension\]/);
  assert.match(workflow, /if \(!v\.assets\.some\(\(a\) => a\.name === stala\)\)/);
});


test('publikace releasu vyžaduje úspěšné CI přesného označeného commitu', async () => {
  const workflow = await zdroj('.github/workflows/publish.yml');
  assert.match(workflow, /actions: read/, 'release musí mít jen čtecí přístup k výsledkům Actions');
  assert.match(workflow, /Ověřit zelené CI označeného commitu/);
  assert.match(workflow, /verify-publish-tag\.mjs "\$TAG" --write verified-tag-sha\.txt/, 'SHA se musí odvozovat z tagu, ne aktuálního main');
  assert.match(await zdroj('scripts/verify-publish-tag.mjs'), /git\/ref\/tags\/\$\{tag\}/);
  assert.match(workflow, /actions\/workflows\/test\.yml\/runs\?head_sha=\$\{SHA\}/);
  assert.match(workflow, /r\.head_sha === process\.env\.GH_SHA && r\.status === "completed" && r\.conclusion === "success"/);
  assert.ok(workflow.indexOf('Ověřit zelené CI označeného commitu') < workflow.indexOf('      - name: Zveřejnit\n'), 'kontrola musí blokovat publikaci');
});


test('publish Preview stays prerelease and never overwrites stable Latest', async () => {
  const workflow = await zdroj('.github/workflows/publish.yml');
  assert.match(workflow, /default: preview/, 'manual publish must default to Preview');
  assert.match(workflow, /CONFIRM_STABLE: /, 'Stable needs a separate explicit confirmation');
  assert.match(workflow, /if \[ "\$CONFIRM_STABLE" != "true" \]/, 'Stable cannot publish without opt-in');
  assert.match(workflow, /gh release edit "\$TAG" --notes-file poznamky\.md --draft=false --prerelease --latest=false/, 'Preview must not become Latest');
  assert.match(workflow, /gh release edit "\$TAG" --notes-file poznamky\.md --draft=false --prerelease=false --latest/, 'only Stable may become Latest');
  assert.match(workflow, /test "\$LATEST" != "\$TAG"/, 'verify Preview did not become Latest');
  assert.match(workflow, /test "\$LATEST" = "\$TAG"/, 'verify Stable became Latest');
});


test('roadmap current sprint must not refer to an obsolete release', async () => {
  const doc = await zdroj('docs/ROADMAP.md');
  const current = doc.slice(doc.indexOf('## Právě teď'), doc.indexOf('## Backlog'));
  const { version } = JSON.parse(await zdroj('package.json'));
  assert.ok(current.includes(version + ' Preview'), 'active roadmap must mention current package version ' + version);
  const readiness = await zdroj('docs/RELEASE-READINESS.md');
  const instructions = readiness.slice(readiness.indexOf('## Jaký je další postup'), readiness.indexOf('## Co zůstává'));
  assert.ok(instructions.includes('`v' + version + '` jako Preview'), 'publish instructions must name current candidate v' + version);
  assert.doesNotMatch(current, /Zdrojová verze 0\.46\.1|Vydání 0\.46\.1 bez nesouladu/, 'historical releases are not current work');
  assert.match(current, /UAT/, 'device acceptance must remain an explicit gate');
});
