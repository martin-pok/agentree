import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncExtension } from '../src/extension-install.js';
import { tempDir } from './helpers.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

async function fakeExtension(dir, verze) {
  await fs.mkdir(path.join(dir, 'icons'), { recursive: true });
  await fs.writeFile(path.join(dir, 'manifest.json'), JSON.stringify({ version: verze, name: 'Agenteeq' }));
  await fs.writeFile(path.join(dir, 'background.js'), `// ${verze}`);
  await fs.writeFile(path.join(dir, 'icons', 'icon-16.png'), 'png');
}

test('rozšíření se zkopíruje mimo balíček aplikace', async () => {
  const zdroj = await tempDir('ext-src-');
  const data = await tempDir('ext-data-');
  await fakeExtension(zdroj, '1.0.0');
  const r = await syncExtension({ zdroj, dataDir: data });
  assert.equal(r.copied, true);
  assert.equal(r.path, path.join(data, 'extension'));
  assert.equal(JSON.parse(await fs.readFile(path.join(r.path, 'manifest.json'), 'utf8')).version, '1.0.0');
  assert.ok(await fs.stat(path.join(r.path, 'icons', 'icon-16.png')), 'ikony se kopírují taky');
});

// Tohle je jádro věci: Chrome si pamatuje cestu ke složce. Když aktualizace aplikace smaže celý
// balíček, kopie v datové složce musí zůstat, jinak si Chrome rozšíření sám vypne.
test('kopie přežije, když se balíček aplikace celý vymění', async () => {
  const zdroj = await tempDir('ext-src-');
  const data = await tempDir('ext-data-');
  await fakeExtension(zdroj, '1.0.0');
  const prvni = await syncExtension({ zdroj, dataDir: data });

  await fs.rm(zdroj, { recursive: true, force: true });   // „aktualizace“ = balíček je pryč
  const obsah = await fs.readFile(path.join(prvni.path, 'manifest.json'), 'utf8');
  assert.equal(JSON.parse(obsah).version, '1.0.0', 'rozšíření zůstalo na svém místě');

  // Nový balíček s novou verzí kopii obnoví na stejné cestě – Chrome nemusí nic přenastavovat.
  await fakeExtension(zdroj, '2.0.0');
  const druhy = await syncExtension({ zdroj, dataDir: data });
  assert.equal(druhy.path, prvni.path, 'cesta se nemění');
  assert.equal(druhy.copied, true);
  assert.equal(druhy.previous, '1.0.0');
  assert.equal(JSON.parse(await fs.readFile(path.join(druhy.path, 'manifest.json'), 'utf8')).version, '2.0.0');
});

test('beze změny verze se na složku nesahá', async () => {
  const zdroj = await tempDir('ext-src-');
  const data = await tempDir('ext-data-');
  await fakeExtension(zdroj, '1.0.0');
  await syncExtension({ zdroj, dataDir: data });
  const cil = path.join(data, 'extension', 'background.js');
  const pred = (await fs.stat(cil)).mtimeMs;
  await new Promise((r) => setTimeout(r, 20));
  const znovu = await syncExtension({ zdroj, dataDir: data });
  assert.equal(znovu.copied, false, 'stejná verze = žádné kopírování');
  assert.equal((await fs.stat(cil)).mtimeMs, pred, 'soubor zůstal nedotčený');
});

test('když zdroj chybí, vrátí se srozumitelný důvod a nespadne to', async () => {
  const data = await tempDir('ext-data-');
  const r = await syncExtension({ zdroj: path.join(data, 'neexistuje'), dataDir: data });
  assert.equal(r.copied, false);
  assert.match(r.reason, /chybí/i);
});

test('manifest rozšíření drží verzi aplikace a má ikony pro Chrome', async () => {
  const manifest = JSON.parse(await fs.readFile(path.join(ROOT, 'extension/manifest.json'), 'utf8'));
  const balicek = JSON.parse(await fs.readFile(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(manifest.version, balicek.version, 'verze rozšíření a aplikace se musí shodovat');
  for (const velikost of ['16', '32', '48', '128']) {
    assert.ok(manifest.icons?.[velikost], `chybí ikona ${velikost}`);
    assert.ok(manifest.action?.default_icon?.[velikost], `chybí ikona ${velikost} pro tlačítko v liště`);
    const soubor = path.join(ROOT, 'extension', manifest.icons[velikost]);
    assert.ok((await fs.stat(soubor)).size > 0, `soubor ikony ${velikost} chybí nebo je prázdný`);
  }
});

test('rozšíření mluví jen s Agenteeq na tomto počítači', async () => {
  const manifest = JSON.parse(await fs.readFile(path.join(ROOT, 'extension/manifest.json'), 'utf8'));
  // Kromě aplikace na tomto počítači jen weby, kde rozšíření čte stav konverzace (content skripty).
  // Oprávnění k nim slouží jen k vložení skriptu do už otevřených karet po instalaci či aktualizaci.
  assert.deepEqual(manifest.host_permissions, ['http://127.0.0.1:4620/*', ...manifest.content_scripts[0].matches], 'žádná jiná adresa tam nepatří');
  const pozadi = await fs.readFile(path.join(ROOT, 'extension/background.js'), 'utf8');
  const adresy = [...pozadi.matchAll(/https?:\/\/[^'"`\s)]+/g)].map((m) => m[0]);
  assert.deepEqual([...new Set(adresy)], ['http://127.0.0.1:4620'], 'data nesmí odejít nikam jinam');
});

// Po aktualizaci rozšíření (z obchodu přichází sama) by otevřené karty do obnovení nic nehlásily
// a nepovedené odeslání by se nezopakovalo, dokud se v konverzaci něco nezmění. Obojí by znamenalo
// agenta, který v Agenteeq chybí, přestože v prohlížeči běží.
test('rozšíření nepřehlédne otevřenou konverzaci: po aktualizaci, po výpadku aplikace i v klidu', async () => {
  const pozadi = await fs.readFile(path.join(ROOT, 'extension/background.js'), 'utf8');
  const obsah = await fs.readFile(path.join(ROOT, 'extension/content.js'), 'utf8');
  assert.match(pozadi, /reason === 'install' \|\| reason === 'update'\) vlozDoOtevrenychKaret\(\)/);
  assert.match(pozadi, /chrome\.scripting\.executeScript\(\{ target: \{ tabId: karta\.id \}, files: skript\.js \}\)/);
  assert.match(pozadi, /send\(msg\.payload, sender\?\.tab\)\.then\(\(ok\) => sendResponse\(\{ ok \}\)/, 'obsahový skript se dozví, že odeslání nevyšlo');
  assert.match(obsah, /if \(!r\?\.ok\) lastSig = ''/, 'a zkusí to znovu při dalším průchodu');
  assert.match(obsah, /payload\.generating \? 10000 : 60000/, 'klidná konverzace se ohlásí aspoň jednou za minutu');
});
