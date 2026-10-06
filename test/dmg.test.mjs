import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { planDmg, nazevDmg, DMG_STALE } from '../scripts/dmg.mjs';
import { BALICEK_MAC } from '../scripts/build-site.mjs';

// `hdiutil` je jen na macOS, takže samotný obraz se tu sestavit nedá. Ověřuje se plán: přesné
// příkazy s argumenty, které scripts/build-macos.mjs spustí bez shellu.
const CESTY = {
  app: '/private/tmp/agenteeq-mac-build-x/Agenteeq.app',
  staging: '/private/tmp/agenteeq-mac-build-x/dmg',
  dmg: '/repo/dist/Agenteeq-1.2.3-macOS-arm64.dmg',
};

test('DMG: okno s aplikací a zkratkou na Aplikace, komprimovaný obraz a kontrola', () => {
  assert.deepEqual(planDmg(CESTY), [
    ['ditto', [CESTY.app, '/private/tmp/agenteeq-mac-build-x/dmg/Agenteeq.app']],
    ['ln', ['-s', '/Applications', '/private/tmp/agenteeq-mac-build-x/dmg/Applications']],
    ['hdiutil', ['create', '-volname', 'Agenteeq', '-srcfolder', CESTY.staging, '-ov', '-format', 'UDZO', CESTY.dmg]],
    ['hdiutil', ['verify', CESTY.dmg]],
  ]);
  // Ad-hoc podpis obrazu by nic nedokazoval; aplikace uvnitř má svůj podpis z ditto beze změny.
  assert.ok(!planDmg({ ...CESTY, identity: '-' }).some(([prikaz]) => prikaz === 'codesign'));
});

test('DMG: s Developer ID se obraz podepíše, s profilem i notarizuje a dostane lístek', () => {
  const identity = 'Developer ID Application: Někdo (TEAM123)';
  const podepsany = planDmg({ ...CESTY, identity });
  assert.deepEqual(podepsany.find(([p]) => p === 'codesign'), ['codesign', ['--force', '--sign', identity, '--timestamp', CESTY.dmg]]);
  assert.ok(!podepsany.some(([, a]) => a.includes('notarytool')), 'bez profilu se nenotarizuje');

  const notarizovany = planDmg({ ...CESTY, identity, notaryProfile: 'agenteeq-notary' });
  const poradi = notarizovany.map(([p, a]) => `${p} ${a[0]}`);
  assert.deepEqual(poradi.slice(2), ['hdiutil create', 'codesign --force', 'xcrun notarytool', 'xcrun stapler', 'hdiutil verify'],
    'podpis před notarizací, lístek před kontrolou');
  assert.deepEqual(notarizovany[4][1], ['notarytool', 'submit', CESTY.dmg, '--keychain-profile', 'agenteeq-notary', '--wait']);
  assert.throws(() => planDmg({ ...CESTY, notaryProfile: 'agenteeq-notary' }), /Developer ID/, 'notarizace bez podpisu nedává smysl');
});

test('DMG: cesty se nevkládají do shellu a musí být úplné', () => {
  // Složka s mezerou a ampersandem je běžné jméno – argv ji předá jako jeden argument.
  const divna = { app: '/Users/x/Design & Web/Agenteeq.app', staging: '/Users/x/Design & Web/dmg', dmg: '/Users/x/Design & Web/a.dmg' };
  const plan = planDmg(divna);
  assert.equal(plan[2][1].at(-1), divna.dmg);
  assert.equal(plan[0][1][0], divna.app);
  assert.throws(() => planDmg({ ...CESTY, dmg: 'dist/a.dmg' }), /absolutní/);
  assert.throws(() => planDmg({ ...CESTY, app: '/tmp/Jiny.app' }), /Agenteeq\.app/);
  assert.throws(() => planDmg({ ...CESTY, dmg: '/tmp/a.zip' }), /\.dmg/);
});

test('DMG: jméno s verzí z buildu, stálé jméno pro tlačítko na webu', async () => {
  assert.equal(nazevDmg('1.2.3', 'arm64'), 'Agenteeq-1.2.3-macOS-arm64.dmg');
  assert.equal(DMG_STALE, 'Agenteeq-macOS-arm64.dmg');
  assert.equal(BALICEK_MAC, DMG_STALE, 'tlačítko pro Mac na webu stahuje DMG');
  const build = await fs.readFile(new URL('../scripts/build-macos.mjs', import.meta.url), 'utf8');
  assert.match(build, /import \{ planDmg, nazevDmg \} from '\.\/dmg\.mjs';/);
  assert.match(build, /for \(const \[command, args\] of planDmg\(\{ app, staging, dmg, identity, notaryProfile \}\)\) run\(command, args\);/);
  // Build běží jen na macOS; jinde skončí hned na začátku, ne v půlce u hdiutil.
  assert.match(build, /if \(process\.platform !== 'darwin'\) throw/);
  // ZIP zůstává: z něj instaluje install.sh i aktualizace v aplikaci (hledají přesné jméno).
  assert.match(build, /ditto', \['-c', '-k', '--sequesterRsrc', '--keepParent', app, archive\]/);
});
