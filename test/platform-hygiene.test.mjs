// Hlídač pravidla z CLAUDE.md: rozdíl mezi systémy patří jen do src/platform.js.
//
// Bez něj se to rozleze zpátky. Předpoklady o macOS se do kódu nedostaly naráz – přibývaly
// po jednom, vždy jako „tady je to přece jasné“, a dohromady z nich byla aplikace, která
// mimo macOS mlčela. Tenhle test je proto psaný tak, aby spadl na PRVNÍM takovém řádku,
// ne až na dvacátém.
//
// Není to zákaz psát platformový kód. Je to zákaz psát ho potichu jinde.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

// Soubory, které o systému rozhodovat smějí, a proč.
const VYJIMKY = {
  'src/platform.js': 'sem platformové rozdíly patří – je to ten šev',
  'src/config.js': 'podle systému zapíná a vypíná celé funkce (nativeNotify, keychain, openApps…)',
  'src/launch-agent.js': 'LaunchAgent je mechanismus macOS; stráž musí stát před prvním zápisem',
};

async function souboryVSrc() {
  const out = [];
  const projdi = async (dir) => {
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) await projdi(p);
      else if (e.name.endsWith('.js')) out.push(p);
    }
  };
  await projdi(path.join(ROOT, 'src'));
  return out.sort();
}

const relativne = (p) => path.relative(ROOT, p).split(path.sep).join('/');

test('o systému rozhoduje jen src/platform.js (a dvě doložené výjimky)', async () => {
  const nalezy = [];
  for (const soubor of await souboryVSrc()) {
    const rel = relativne(soubor);
    if (VYJIMKY[rel]) continue;
    const radky = (await fs.readFile(soubor, 'utf8')).split('\n');
    radky.forEach((radek, i) => {
      if (radek.includes('process.platform')) nalezy.push(`${rel}:${i + 1}  ${radek.trim()}`);
    });
  }
  assert.deepEqual(nalezy, [], `process.platform patří do src/platform.js:\n${nalezy.join('\n')}`);
});

// Příkazy, které na jednom systému jsou a na jiném ne. Když je někdo zavolá napřímo,
// vznikne konektor, který mimo macOS tiše vrací prázdno – přesně to, co se tu stalo
// s `ps` a `lsof`, než dostaly protějšek v PowerShellu.
const JEN_POSIX = ['ps', 'lsof', 'pgrep', 'which', 'open', 'pbcopy', 'id'];

test('POSIXové příkazy se nevolají napřímo mimo platformový šev', async () => {
  const nalezy = [];
  for (const soubor of await souboryVSrc()) {
    const rel = relativne(soubor);
    if (rel === 'src/platform.js') continue;
    // openers.js a launcher.js sahají na macOS mechanismy (open -a, AppleScript,
    // přihlašovací shell) a jsou celé za branou config.openApps / config.launchAgents.
    if (rel === 'src/openers.js' || rel === 'src/launcher.js') continue;
    const radky = (await fs.readFile(soubor, 'utf8')).split('\n');
    radky.forEach((radek, i) => {
      for (const cmd of JEN_POSIX) {
        if (new RegExp(`run\\(\\s*'${cmd}'`).test(radek)) nalezy.push(`${rel}:${i + 1}  run('${cmd}'…)`);
      }
    });
  }
  assert.deepEqual(nalezy, [], `tyhle příkazy mimo macOS nejsou – zaveď protějšek v src/platform.js:\n${nalezy.join('\n')}`);
});

test('výjimky v tomhle testu odpovídají skutečnosti', async () => {
  // Kdyby výjimka přestala platit (soubor zmizí nebo už process.platform nepoužívá),
  // musí zmizet i odsud – jinak by test tiše povoloval něco, co už není potřeba.
  for (const [rel, duvod] of Object.entries(VYJIMKY)) {
    const text = await fs.readFile(path.join(ROOT, rel), 'utf8').catch(() => null);
    assert.ok(text !== null, `${rel} už neexistuje, smaž výjimku`);
    assert.ok(text.includes('process.platform'), `${rel} už process.platform nepoužívá, smaž výjimku (${duvod})`);
  }
});

// Cestu posuzuje server i rozhraní a musí ji posuzovat stejně. Kdyby se rozešly,
// objevilo by se tlačítko, které server odmítne – chyba viditelná až u uživatele.
test('server i rozhraní poznají absolutní cestu stejně', async () => {
  const { jeAbsolutniCesta: server } = await import('../src/platform.js');
  const { jeAbsolutniCesta: rozhrani } = await import('../public/js/format.js');
  const pripady = [
    '/Users/jana/web', '/home/jana/web', 'C:\\Users\\jana\\web', 'D:/projekt',
    '\\\\server\\sdileni', 'relativni/cesta', '', '~/web', 'web', 'C:web',
  ];
  for (const p of pripady) {
    assert.equal(server(p), rozhrani(p), `neshoda na ${JSON.stringify(p)}`);
  }
});
