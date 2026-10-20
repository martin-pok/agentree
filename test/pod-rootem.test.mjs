// Testy pravidla „selhání zjišťování se nehlásí jako zjištěný stav“ (CLAUDE.md) si nečitelnost
// vyrábějí přes chmod. Root ale přečte a zapíše všechno, takže se pod ním přeskakovaly – v kontejneru
// (cloudové sezení, Docker) by tak to pravidlo nikdo neověřil. Pod rootem je tady spustíme znovu
// jako neprivilegovaný uživatel nobody a chceme vidět, že opravdu proběhly a prošly.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const NOBODY = 65534;

// Soubor → název testu, který se pod rootem přeskočí.
const POD_ROOTEM_PRESKOCENE = {
  'necitelna-slozka.test.mjs': 'Claude Code a Codex: nečitelná složka = stav chyby s důvodem, ne „zatím bez konverzací“',
  'resilience.test.mjs': 'uložení nastavení, které na disku selže, se nehlásí jako úspěch',
  'security-hardening.test.mjs': 'reliability: a permission problem is not masked as corruption',
};

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('seznam testů přeskakovaných pod rootem je úplný', async () => {
  const soubory = (await fs.readdir(path.join(root, 'test'))).filter((f) => f.endsWith('.test.mjs') && f !== 'pod-rootem.test.mjs');
  const sRootem = [];
  for (const f of soubory) {
    const text = await fs.readFile(path.join(root, 'test', f), 'utf8');
    if (/getuid\?\.\(\) === 0/.test(text) && f !== 'dokumentace.test.mjs') sRootem.push(f);
  }
  assert.deepEqual(sRootem.sort(), Object.keys(POD_ROOTEM_PRESKOCENE).sort(), 'nový test přeskakovaný pod rootem patří i sem');
});

const NE_ROOT = (process.platform === 'win32' && 'Windows nemá uživatele root')
  || (process.getuid?.() !== 0 && 'nejsme root, testy výše běží přímo');

for (const [soubor, nazev] of Object.entries(POD_ROOTEM_PRESKOCENE)) {
  test(`pod rootem jako nobody: ${soubor}`, { skip: NE_ROOT }, async (t) => {
    // Vlastní dočasná složka mimo TMPDIR: `npm test` dává rootovi soukromou (0700), do které
    // nobody nevidí. Slouží zároveň jako HOME i TMPDIR a po testu se smaže.
    const home = await fs.mkdtemp(path.join('/tmp', 'agenteeq-nobody-'));
    t.after(() => fs.rm(home, { recursive: true, force: true }));
    await fs.chown(home, NOBODY, NOBODY);
    // Bez NODE_TEST_CONTEXT: s ní by vnořený `node --test` soubory tiše nespustil.
    const env = { ...process.env, HOME: home, TMPDIR: home, TEMP: home, TMP: home };
    delete env.NODE_TEST_CONTEXT;
    const child = spawn(process.execPath, ['--test', '--test-reporter=tap', '--test-name-pattern', `^${escRe(nazev)}$`, path.join(root, 'test', soubor)], {
      uid: NOBODY, gid: NOBODY, cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    const kod = await new Promise((r) => child.once('exit', r));
    assert.equal(kod, 0, out);
    assert.match(out, new RegExp(`^ok \\d+ - ${escRe(nazev)}$`, 'm'), 'test musí proběhnout, ne se přeskočit');
    assert.match(out, /^# skipped 0$/m, out);
  });
}
