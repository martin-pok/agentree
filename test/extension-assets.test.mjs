import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { zip, buildExtension } from '../scripts/build-extension.mjs';
import { tempDir } from './helpers.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const hash = async (p) => crypto.createHash('sha256').update(await fs.readFile(p)).digest('hex');

// Okno rozšíření má vypadat jako menší sestra aplikace – a to stojí a padá s tím, že používá
// tatáž písma. Kopie v extension/fonts je nutná (Chrome vidí jen složku rozšíření), a právě proto
// se musí hlídat: jinak by se po výměně písma v aplikaci obě plochy tiše rozešly.
test('rozšíření: písma jsou bajt po bajtu tatáž jako v aplikaci', async () => {
  for (const soubor of ['urbanist-300.ttf', 'urbanist-500.ttf', 'onest-400.ttf', 'onest-500.ttf']) {
    const app = path.join(ROOT, 'public/fonts', soubor);
    const ext = path.join(ROOT, 'extension/fonts', soubor);
    assert.equal(await hash(ext), await hash(app), `${soubor} se rozešel s public/fonts`);
  }
  const css = await fs.readFile(path.join(ROOT, 'extension/fonts/fonts.css'), 'utf8');
  // Okno má dvě rodiny písma (Urbanist na čísla a nadpisy, Onest na text) – každá další je navíc.
  const rodiny = [...new Set([...css.matchAll(/font-family: '([^']+)'/g)].map((m) => m[1]))].sort();
  assert.deepEqual(rodiny, ['Onest', 'Urbanist']);
  const soubory = (await fs.readdir(path.join(ROOT, 'extension/fonts'))).filter((f) => f.endsWith('.ttf'));
  for (const soubor of soubory) assert.ok(css.includes(`./${soubor}`), `${soubor} v balíčku, ale okno ho nenačítá`);
  assert.equal(/font-weight: (6|7|8|9)00/.test(css), false, 'maximální váha písma je 500');
});

test('rozšíření: loga služeb jsou tatáž jako v aplikaci a licence jde s nimi', async () => {
  const loga = (await fs.readdir(path.join(ROOT, 'extension/logos'))).filter((f) => f.endsWith('.svg'));
  assert.ok(loga.length >= 9, 'každá sledovaná služba má logo');
  for (const soubor of loga) assert.equal(await hash(path.join(ROOT, 'extension/logos', soubor)), await hash(path.join(ROOT, 'public/logos', soubor)), `${soubor} se rozešel s public/logos`);
  const readme = await fs.readFile(path.join(ROOT, 'extension/logos/README.md'), 'utf8');
  assert.match(readme, /MIT/);
  assert.match(readme, /Copyright \(c\) LobeHub/);
  // Okno odkazuje jen na loga, která v balíčku opravdu jsou.
  const okno = await fs.readFile(path.join(ROOT, 'extension/popup.js'), 'utf8');
  for (const [, klic] of okno.matchAll(/\['[\w-]+', '[^']+', '(\w+)'\]/g)) assert.ok(loga.includes(`${klic}.svg`), `chybí logo ${klic}.svg`);
});

test('rozšíření: licence písem jdou do balíčku s nimi (OFL to vyžaduje)', async () => {
  // Každé písmo v balíčku má vedle sebe svou licenci (urbanist-500.ttf → urbanist-OFL.txt).
  const soubory = await fs.readdir(path.join(ROOT, 'extension/fonts'));
  for (const rodina of new Set(soubory.filter((f) => f.endsWith('.ttf')).map((f) => f.replace(/-\d{3}\.ttf$/, '').replace(/-/g, '')))) {
    assert.ok(soubory.includes(`${rodina}-OFL.txt`), `chybí licence ${rodina}-OFL.txt`);
  }
});

test('rozšíření: okno používá tokeny aplikace a nekreslí těžší písmo než 500', async () => {
  const popup = await fs.readFile(path.join(ROOT, 'extension/popup.html'), 'utf8');
  const styles = await fs.readFile(path.join(ROOT, 'public/styles.css'), 'utf8');
  // Klíčové barvy identity „koncertní sál“ musí být shodné s :root aplikace, ne přibližné.
  for (const token of ['--stage: #121019', '--paper: #F4F3F7', '--ink: #16141D', '--brass: #C99A3E']) {
    assert.ok(popup.includes(token), `okno rozšíření nemá token ${token}`);
    assert.ok(styles.includes(token), `aplikace nemá token ${token} – sjednoť obě strany`);
  }
  assert.ok(popup.includes('fonts/fonts.css'), 'okno načítá písma aplikace');
  const vahy = [...popup.matchAll(/font-weight:\s*(\d{3})/g)].map((m) => Number(m[1]));
  assert.equal(vahy.some((v) => v > 500), false, `příliš těžké písmo: ${vahy.filter((v) => v > 500).join(', ')}`);
  assert.match(popup, /prefers-reduced-motion/, 'omezení pohybu se respektuje');
  assert.match(popup, /prefers-color-scheme: dark/, 'tmavý režim je součástí okna');
});

// Balíček se skládá vlastní rutinou (žádné závislosti), takže musí být doloženo, že vzniklý ZIP
// opravdu jde rozbalit a že z něj vypadnou tytéž bajty, které do něj šly.
test('balíček: vlastní ZIP je platný a obsah se rozbalí beze změny', async () => {
  const data = {
    'manifest.json': Buffer.from('{"manifest_version":3}', 'utf8'),
    'fonts/onest-400.ttf': crypto.randomBytes(4096),
    'diakritika.txt': Buffer.from('příliš žluťoučký kůň úpěl ďábelské ódy', 'utf8'),
  };
  const archiv = zip(Object.entries(data).map(([rel, body]) => ({ rel, body })));

  // Rozbalení z centrálního adresáře: tak to dělá Chrome i každý běžný nástroj.
  const konec = archiv.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(konec > 0, 'archiv má koncový záznam');
  const pocet = archiv.readUInt16LE(konec + 10);
  assert.equal(pocet, 3);

  assert.equal(archiv.readUInt32LE(konec + 16), archiv.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])), 'koncový záznam ukazuje na centrální adresář');
  let off = 0; // položky leží od začátku archivu, centrální adresář až za nimi
  for (const [rel, body] of Object.entries(data)) {
    assert.equal(archiv.readUInt32LE(off), 0x04034b50, `${rel}: hlavička položky`);
    const metoda = archiv.readUInt16LE(off + 8);
    const velikost = archiv.readUInt32LE(off + 18);
    const jmeno = archiv.readUInt16LE(off + 26);
    assert.equal(archiv.subarray(off + 30, off + 30 + jmeno).toString('utf8'), rel);
    const data0 = archiv.subarray(off + 30 + jmeno, off + 30 + jmeno + velikost);
    const rozbaleno = metoda === 8 ? zlib.inflateRawSync(data0) : data0;
    assert.deepEqual(Buffer.from(rozbaleno), body, `${rel}: obsah se nezměnil`);
    off += 30 + jmeno + velikost;
  }
});

test('balíček: sestavení projde jen se sjednocenou verzí a nese všechny části rozšíření', async () => {
  const out = await tempDir('ext-zip-');
  const r = await buildExtension({ out });
  const app = JSON.parse(await fs.readFile(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(r.version, app.version, 'verze balíčku = verze aplikace');
  assert.match(r.file, /agenteeq-extension-\d+\.\d+\.\d+\.zip$/);

  const archiv = await fs.readFile(r.file);
  for (const musi of ['manifest.json', 'background.js', 'content.js', 'sites.js', 'popup.html', 'popup.js', 'icons/icon-128.png', 'fonts/onest-400.ttf']) {
    assert.ok(archiv.includes(Buffer.from(musi, 'utf8')), `v balíčku chybí ${musi}`);
  }
  // Skryté soubory a smetí z macOS do obchodu nepatří.
  for (const nesmi of ['.DS_Store', '__MACOSX']) assert.equal(archiv.includes(Buffer.from(nesmi, 'utf8')), false, `balíček obsahuje ${nesmi}`);

  // Dvě sestavení téhož kódu musí dát tentýž soubor (pevné datum, seřazené pořadí).
  const druhy = await buildExtension({ out: await tempDir('ext-zip-2-') });
  assert.equal(
    crypto.createHash('sha256').update(await fs.readFile(druhy.file)).digest('hex'),
    crypto.createHash('sha256').update(archiv).digest('hex'),
    'balíček není deterministický',
  );
});
