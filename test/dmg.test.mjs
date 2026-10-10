// Instalátor pro Mac (DMG) se dá sestavit jen na macOS – hdiutil jinde není. Tady se proto hlídá
// tvar příkazů (čistá funkce planDmg) a to, že workflow Vydání obraz opravdu sestaví, přiloží
// a zkopíruje pod stálé jméno, na které vede web. Skutečný obraz ověří až běh na runneru s macOS
// (docs/INSTALL.md, „Instalátor DMG“).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { planDmg, jmenoDmg, SVAZEK, odpojSvazek, ODSTUPY_ODPOJENI } from '../scripts/build-dmg.mjs';

const zdroj = (p) => fs.readFile(new URL(`../${p}`, import.meta.url), 'utf8');

test('DMG: obraz vzniká z hotového ZIPu, se zástupcem Aplikací a jen nástroji macOS', () => {
  const plan = planDmg({ verze: '1.2.3', dist: '/r/dist', docasna: '/private/tmp/x' });
  assert.equal(plan.zip, '/r/dist/Agenteeq-1.2.3-macOS-arm64.zip', 'obsah je tatáž aplikace jako ve vydání');
  assert.equal(plan.dmg, '/r/dist/Agenteeq-1.2.3-macOS-arm64.dmg');
  assert.equal(jmenoDmg('1.2.3'), 'Agenteeq-1.2.3-macOS-arm64.dmg');
  const nastroje = plan.kroky.map(([prikaz]) => prikaz);
  assert.deepEqual(nastroje, ['ditto', 'ln', 'xcrun', 'hdiutil', 'hdiutil', 'osascript', 'hdiutil', 'hdiutil', 'hdiutil'],
    'branded DMG requires background, Finder geometry, read-only conversion and verification');
  for (const [prikaz, argumenty] of plan.kroky) {
    assert.ok(Array.isArray(argumenty), `${prikaz}: arguments are passed as argv`);
  }
  const [extract, link, art, writable, attach, layout, detach, convert, verify] = plan.kroky.map(([,args])=>args);
  assert.deepEqual(extract, ['-x', '-k', plan.zip, '/private/tmp/x/obsah']);
  assert.deepEqual(link, ['-s', '/Applications', '/private/tmp/x/obsah/Applications']);
  assert.match(art[1], /DmgBackground.swift$/);
  assert.equal(writable[0], 'create');
  assert.ok(writable.includes('UDRW'), 'Finder layout needs writable disk');
  assert.equal(attach[0], 'attach');
  assert.equal(layout[0], '-e');
  assert.match(layout[1], /set background picture/);
  assert.match(layout[1], /set position of item "Agenteeq.app"/);
  assert.match(layout[1], /set position of item "Applications"/);
  assert.equal(detach[0], 'detach');
  assert.equal(convert[0], 'convert');
  assert.ok(convert.includes('UDZO'), 'published disk must be compressed read-only');
  assert.deepEqual(verify, ['verify', plan.dmg]);
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

test('DMG: zaneprázdněný svazek se odpojí na další pokus, -force až úplně nakonec', () => {
  const zaneprazdneny = () => Object.assign(new Error('hdiutil: couldn\'t eject "disk7" - Resource busy'), { status: 16 });
  const volani = [];
  const pauzy = [];
  let selhani = 2;
  const pokusu = odpojSvazek('/t/mounted', { spust: (a) => { volani.push(a); if (selhani-- > 0) throw zaneprazdneny(); }, cekej: (ms) => pauzy.push(ms) });
  assert.equal(pokusu, 3);
  assert.deepEqual(volani, [['detach', '/t/mounted'], ['detach', '/t/mounted'], ['detach', '/t/mounted']], 'bez -force, dokud to jde jinak');
  assert.deepEqual(pauzy, [1000, 2000]);

  const vsechna = [];
  assert.throws(() => odpojSvazek('/t/mounted', { spust: (a) => { vsechna.push(a); throw zaneprazdneny(); }, cekej: () => {} }), /Resource busy/);
  assert.equal(vsechna.length, ODSTUPY_ODPOJENI.length);
  assert.deepEqual(vsechna.at(-1), ['detach', '-force', '/t/mounted']);
  assert.ok(vsechna.slice(0, -1).every((a) => !a.includes('-force')));
});
