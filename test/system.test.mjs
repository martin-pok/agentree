import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

// Rozhraní mluví o počítači, na kterém Agenteeq běží: na Macu „tento Mac“ a ⌘, na Windows a Linuxu
// „tento počítač“ a Ctrl. Systém posílá server (src/platform.js#SYSTEM → <html data-system> a
// host.system), klient ho čte v public/js/system.js. Dřív rozhraní na Windows tvrdilo „Běží na tomto
// Macu“ a radilo stisknout ⌘K.

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function vPrehlizeci(system, lang, kod) {
  const script = `
    globalThis.document = { documentElement: { lang: ${JSON.stringify(lang)}, dataset: ${system ? `{ system: ${JSON.stringify(system)} }` : '{}'} } };
    const s = await import('./public/js/system.js');
    const i = await import('./public/js/i18n.js');
    const vysledek = await (async () => { ${kod} })();
    console.log(JSON.stringify(vysledek));
  `;
  return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], { cwd: ROOT, encoding: 'utf8' }));
}

const POPIS = `return {
  system: s.SYSTEM,
  zkratka: s.zkratka('K'),
  mod: s.MOD,
  aria: s.ariaZkratka('K'),
  meta: s.modifikator({ metaKey: true, ctrlKey: false }),
  ctrl: s.modifikator({ metaKey: false, ctrlKey: true }),
  tomto: i.tomtoPocitaci(),
  tohoto: i.tohotoPocitace(),
  tento: i.tentoPocitac(),
  tvem: i.tvemPocitaci(),
  vetou: i.tr('Běží na {0}', i.tomtoPocitaci()),
  podle: i.podleSystemu(),
};`;

test('Mac: „tento Mac“ a zkratky s ⌘ (metaKey)', () => {
  const r = vPrehlizeci('macos', 'cs', POPIS);
  assert.deepEqual(r, {
    system: 'macos', zkratka: '⌘K', mod: '⌘', aria: 'Meta+K', meta: true, ctrl: false,
    tomto: 'tomto Macu', tohoto: 'tohoto Macu', tento: 'tento Mac', tvem: 'tvém Macu', vetou: 'Běží na tomto Macu', podle: 'macOS',
  });
  const en = vPrehlizeci('macos', 'en', POPIS);
  assert.equal(en.vetou, 'Runs on this Mac');
  assert.equal(en.tvem, 'your Mac');
});

test('Windows: „tento počítač“ a zkratky s Ctrl (ctrlKey), žádný ⌘', () => {
  const r = vPrehlizeci('windows', 'cs', POPIS);
  assert.deepEqual(r, {
    system: 'windows', zkratka: 'Ctrl+K', mod: 'Ctrl', aria: 'Control+K', meta: false, ctrl: true,
    tomto: 'tomto počítači', tohoto: 'tohoto počítače', tento: 'tento počítač', tvem: 'tvém počítači', vetou: 'Běží na tomto počítači', podle: 'Windows',
  });
  const en = vPrehlizeci('windows', 'en', POPIS);
  assert.equal(en.vetou, 'Runs on this computer');
  assert.equal(en.tomto, 'this computer');
  assert.doesNotMatch(JSON.stringify(en), /Mac|⌘/);
});

test('Linux mluví o počítači a bez údaje platí macOS (web, ukázka)', () => {
  const linux = vPrehlizeci('linux', 'en', POPIS);
  assert.equal(linux.zkratka, 'Ctrl+K');
  assert.equal(linux.tomto, 'this computer');
  assert.equal(linux.podle, 'the system');
  assert.equal(vPrehlizeci('linux', 'cs', POPIS).podle, 'systému');
  assert.equal(vPrehlizeci(null, 'cs', POPIS).system, 'macos');
  assert.equal(vPrehlizeci('neznamy', 'cs', POPIS).zkratka, '⌘K');
});

async function klientskeSoubory() {
  const out = [];
  const projdi = async (dir) => {
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) await projdi(p);
      else if (e.name.endsWith('.js')) out.push(p);
    }
  };
  await projdi(path.join(ROOT, 'public/js'));
  return out;
}

test('klávesové zkratky jdou přes modifikator(e), ne přes metaKey || ctrlKey', async () => {
  // Na Macu Ctrl+K v textovém poli maže do konce řádku a na Windows klávesa Win+K patří systému –
  // zkratka proto poslouchá jen modifikátor, který na daném systému zkratky opravdu mají.
  const nalezy = [];
  for (const f of await klientskeSoubory()) {
    const rel = path.relative(ROOT, f);
    // Plynulé posouvání (ctrl = přiblížení trackpadem) a psaní do výběru modifikátory jen vylučují.
    if (/plynule-posouvani|selects/.test(rel)) continue;
    const s = await fs.readFile(f, 'utf8');
    if (/metaKey\s*\|\|\s*e?\.?ctrlKey|ctrlKey\s*\|\|\s*e?\.?metaKey/.test(s)) nalezy.push(rel);
  }
  assert.deepEqual(nalezy, []);
});

test('značka ⌘ a „tento Mac“ nestojí v klientu napevno', async () => {
  const nalezy = [];
  for (const f of await klientskeSoubory()) {
    const rel = path.relative(ROOT, f).split(path.sep).join('/');
    // Slovníky a historie vydání (Co je nového) popisují, co platilo; system.js a i18n.js jsou ten šev.
    // Rozcestník bez serveru (connect.js) a účet na webu (ucet-web.js) žádný počítač za sebou nemají –
    // mluví o Macu, pro který se Agenteeq stahuje.
    if (/i18n\/|i18n\.js$|whats-new-data|system\.js$|connect\.js$|ucet-web\.js$/.test(rel)) continue;
    const s = await fs.readFile(f, 'utf8');
    s.split('\n').forEach((cely, i) => {
      if (/^\s*(\/\/|\/?\*)/.test(cely)) return;
      const radek = cely.replace(/\s\/\/ .*$|\/\*.*?\*\//g, '');
      if (radek.includes('⌘')) nalezy.push(`${rel}:${i + 1} ⌘`);
      if (/\b(tomto|tohoto|tomhle|tenhle|tento|tvém|tvého) Mac/.test(radek)) nalezy.push(`${rel}:${i + 1} ${radek.trim().slice(0, 80)}`);
    });
  }
  assert.deepEqual(nalezy, []);
});
