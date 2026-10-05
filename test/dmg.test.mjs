// Instalátor pro Mac (DMG) se dá sestavit jen na macOS – hdiutil jinde není. Tady se proto hlídá
// tvar příkazů (čistá funkce planDmg) a to, že workflow Vydání obraz opravdu sestaví, přiloží
// a zkopíruje pod stálé jméno, na které vede web. Skutečný obraz ověří až běh na runneru s macOS
// (docs/INSTALL.md, „Instalátor DMG“).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { planDmg, jmenoDmg, SVAZEK } from '../scripts/build-dmg.mjs';

const zdroj = (p) => fs.readFile(new URL(`../${p}`, import.meta.url), 'utf8');

test('DMG: obraz vzniká z hotového ZIPu, se zástupcem Aplikací a jen nástroji macOS', () => {
  const plan = planDmg({ verze: '1.2.3', dist: '/r/dist', docasna: '/private/tmp/x' });
  assert.equal(plan.zip, '/r/dist/Agenteeq-1.2.3-macOS-arm64.zip', 'obsah je tatáž aplikace jako ve vydání');
  assert.equal(plan.dmg, '/r/dist/Agenteeq-1.2.3-macOS-arm64.dmg');
  assert.equal(jmenoDmg('1.2.3'), 'Agenteeq-1.2.3-macOS-arm64.dmg');
  const nastroje = plan.kroky.map(([prikaz]) => prikaz);
  assert.deepEqual(nastroje, ['ditto', 'ln', 'hdiutil', 'hdiutil'], 'ad-hoc build se nepodepisuje ani nenotarizuje');
  for (const [prikaz, argumenty] of plan.kroky) {
    assert.ok(Array.isArray(argumenty), `${prikaz}: argumenty jako pole – žádný shell`);
  }
  const [rozbal, odkaz, vytvor, over] = plan.kroky.map(([, argumenty]) => argumenty);
  assert.deepEqual(rozbal, ['-x', '-k', plan.zip, '/private/tmp/x/obsah']);
  assert.deepEqual(odkaz, ['-s', '/Applications', '/private/tmp/x/obsah/Applications'], 'přetažení na Aplikace je celá instalace');
  assert.deepEqual(vytvor, ['create', '-volname', SVAZEK, '-srcfolder', '/private/tmp/x/obsah', '-fs', 'HFS+', '-format', 'UDZO', '-ov', plan.dmg]);
  assert.deepEqual(over, ['verify', plan.dmg], 'poškozený obraz se do vydání nedostane');
  assert.equal(SVAZEK, 'Agenteeq');
});

test('DMG: s Developer ID se obraz podepíše a s profilem i notarizuje', () => {
  const podepsany = planDmg({ verze: '1.2.3', dist: '/d', docasna: '/t', identita: 'Developer ID Application: X (ABC)' });
  assert.deepEqual(podepsany.kroky.at(-1), ['codesign', ['--force', '--sign', 'Developer ID Application: X (ABC)', '--timestamp', '/d/Agenteeq-1.2.3-macOS-arm64.dmg']]);
  const notarizovany = planDmg({ verze: '1.2.3', dist: '/d', docasna: '/t', identita: 'Developer ID Application: X (ABC)', notarProfil: 'agenteeq-notary' });
  assert.deepEqual(notarizovany.kroky.slice(-2).map(([p, a]) => [p, a[0]]), [['xcrun', 'notarytool'], ['xcrun', 'stapler']]);
});

test('DMG: skript nemá závislosti, nespouští shell a mimo macOS skončí srozumitelně', async () => {
  const skript = await zdroj('scripts/build-dmg.mjs');
  const importy = [...skript.matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]);
  assert.ok(importy.length > 0);
  for (const modul of importy) assert.match(modul, /^node:/, `${modul}: jen standardní knihovna Node`);
  assert.doesNotMatch(skript, /shell:\s*true|\bexec\(|execSync\(/, 'příkazy jen jako argv');
  assert.match(skript, /process\.platform !== 'darwin'/);
  assert.match(skript, /hdiutil jinde není/);
  const balicek = JSON.parse(await zdroj('package.json'));
  assert.equal(balicek.scripts['build:dmg'], 'node scripts/build-dmg.mjs');
  assert.match(await zdroj('scripts/release-mac.mjs'), /run\('npm', \['run', 'build:mac'\]\);\nrun\('npm', \['run', 'build:dmg'\]\);/, 'vydání z Macu sestaví i DMG');
});

test('DMG: workflow Vydání ho sestaví po aplikaci, přiloží a zkopíruje pod stálé jméno', async () => {
  const yml = await zdroj('.github/workflows/release.yml');
  const mac = yml.match(/\n {2}mac:\n([\s\S]*?)\n {2}windows:\n/)?.[1];
  assert.ok(mac, 'úloha mac');
  assert.match(mac, /runs-on: macos-latest/, 'hdiutil je jen na macOS');
  assert.ok(mac.indexOf('run: npm run build:mac') < mac.indexOf('run: npm run build:dmg'), 'DMG až po ZIPu, ze kterého vzniká');
  assert.match(mac, /dist\/Agenteeq-\*-macOS-\*\.dmg/, 'DMG patří k artefaktům úlohy');
  assert.match(yml, /-name '\*\.dmg'/, 'přílohy vydání sbírají i DMG');
  assert.match(yml, /zkopiruj 'Agenteeq-\*-macOS-arm64\.dmg' Agenteeq-macOS-arm64\.dmg/);
  assert.match(yml, /zkopiruj 'Agenteeq-\*-Windows-x64\.zip' Agenteeq-Windows-x64\.zip/, 'tlačítko pro Windows potřebuje stálé jméno');
  assert.match(yml, /zkopiruj 'Agenteeq-\*-macOS-arm64\.zip' Agenteeq-macOS-arm64\.zip/);
  assert.match(yml, /return 1/, 'chybějící příloha zastaví vydání');
  assert.match(yml, /gh release create "\$TAG" prilohy\/\*\.zip prilohy\/\*\.dmg/);
  assert.match(yml, /gh release upload "\$TAG" prilohy\/\*\.zip prilohy\/\*\.dmg --clobber/);
});
