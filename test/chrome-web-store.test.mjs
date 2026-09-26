import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { adresaObchodu, CHROME_WEB_STORE_URL } from '../public/js/obchod.js';
import { rozsireniNaWebu } from '../scripts/build-site.mjs';
import { startTestServer, api } from './helpers.mjs';

// Rozšíření jde do Chrome Web Store (docs/CHROME-WEB-STORE.md). Obchod odmítne balíček nebo
// podklady, které nesplní jeho limity – a odmítnutí stojí dny čekání na novou kontrolu. Proto se
// to hlídá tady, ne až ve formuláři obchodu.

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const cti = (p) => fs.readFile(path.join(ROOT, p), 'utf8');
const rozmeryPng = async (p) => {
  const b = await fs.readFile(path.join(ROOT, p));
  assert.equal(b.subarray(1, 4).toString(), 'PNG', `${p} není PNG`);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
};

test('Chrome Web Store: manifest v limitech obchodu a s nejmenšími oprávněními', async () => {
  const m = JSON.parse(await cti('extension/manifest.json'));
  const pkg = JSON.parse(await cti('package.json'));
  assert.equal(m.manifest_version, 3);
  assert.equal(m.version, pkg.version, 'verze rozšíření jde s aplikací');
  assert.ok(m.name.length <= 75, `název má ${m.name.length} znaků, obchod bere nejvýš 75`);
  assert.ok(m.short_name.length <= 12, 'krátký název nejvýš 12 znaků');
  assert.ok(m.description.length <= 132, `popis má ${m.description.length} znaků, obchod bere nejvýš 132`);
  assert.equal(m.key, undefined, 'klíč do balíčku pro obchod nepatří – ID přidělí obchod');
  assert.deepEqual(m.permissions, ['storage', 'alarms'], 'každé oprávnění musí mít zdůvodnění v docs/CHROME-WEB-STORE.md');
  assert.deepEqual(m.host_permissions, ['http://127.0.0.1:4620/*'], 'data jdou jen do aplikace na tomtéž počítači');
  for (const [velikost, soubor] of Object.entries(m.icons)) {
    assert.deepEqual(await rozmeryPng(`extension/${soubor}`), [Number(velikost), Number(velikost)], soubor);
  }
  // Žádný kód ze sítě (Manifest V3 ho zakazuje a obchod to kontroluje).
  const popup = await cti('extension/popup.html');
  assert.doesNotMatch(popup, /<script[^>]+src="https?:/);
  const doc = await cti('docs/CHROME-WEB-STORE.md');
  for (const opravneni of [...m.permissions, '127.0.0.1', 'content_scripts']) assert.ok(doc.includes(opravneni), `zdůvodnění pro ${opravneni} v docs/CHROME-WEB-STORE.md`);
});

test('Chrome Web Store: podklady mají přesně rozměry, které obchod přijme', async () => {
  for (const n of [1, 2, 3]) assert.deepEqual(await rozmeryPng(`branding/chrome-web-store/export/snimek-${n}-1280x800.png`), [1280, 800]);
  assert.deepEqual(await rozmeryPng('branding/chrome-web-store/export/promo-small-440x280.png'), [440, 280]);
  assert.deepEqual(await rozmeryPng('branding/chrome-web-store/export/marquee-1400x560.png'), [1400, 560]);
  assert.deepEqual(await rozmeryPng('branding/chrome-web-store/export/icon-128.png'), [128, 128]);
});

test('Chrome Web Store: zásady ochrany soukromí jsou na webu v obou jazycích a popisují rozšíření pravdivě', async () => {
  for (const [soubor, pravidla] of [
    ['site/soukromi/index.html', [/127\.0\.0\.1/, /text tvých zpráv/i, /Limited Use/, /Frankfurt/, /Smazat účet/]],
    ['site/en/privacy/index.html', [/127\.0\.0\.1/, /text of your messages/i, /Limited Use/, /Frankfurt/, /Delete account/]],
  ]) {
    const html = await cti(soubor);
    for (const p of pravidla) assert.match(html, p, `${soubor}: ${p}`);
    // Každá služba, na které rozšíření běží, musí být v zásadách vyjmenovaná.
    const m = JSON.parse(await cti('extension/manifest.json'));
    for (const vzor of m.content_scripts[0].matches) {
      const host = new URL(vzor.replace('*', 'x')).hostname.replace(/^www\./, '');
      assert.ok(html.includes(host), `${soubor}: chybí ${host}`);
    }
  }
  assert.match(await cti('site/index.html'), /href="\/soukromi"/, 'odkaz z patičky');
  assert.match(await cti('site/en/index.html'), /href="\/en\/privacy"/);
  const mapa = await cti('site/sitemap.xml');
  assert.match(mapa, /\/soukromi<\/loc>/);
  assert.match(mapa, /\/en\/privacy<\/loc>/);
});

test('Chrome Web Store: jedna adresa přepne web z ruční instalace na „Přidat do Chromu“', async () => {
  assert.equal(adresaObchodu('https://evil.example/detail/abcdefghijklmnopabcdefghijklmnop'), '');
  assert.equal(adresaObchodu('https://chromewebstore.google.com/detail/agenteeq/abcdefghijklmnopabcdefghijklmnop'), 'https://chromewebstore.google.com/detail/agenteeq/abcdefghijklmnopabcdefghijklmnop');
  assert.equal(adresaObchodu('https://chromewebstore.google.com/detail/agenteeq/ABC'), '', 'ID rozšíření je 32 písmen a–p');
  const url = 'https://chromewebstore.google.com/detail/agenteeq/abcdefghijklmnopabcdefghijklmnop';
  for (const soubor of ['site/index.html', 'site/en/index.html']) {
    const html = await cti(soubor);
    const rucne = rozsireniNaWebu(html, '');
    assert.match(rucne, /chrome:\/\/extensions/);
    assert.doesNotMatch(rucne, /data-obchod-chrome|rozsireni:|data-rozsireni-doba/);
    const obchod = rozsireniNaWebu(html, url);
    assert.ok(obchod.includes(`href="${url}"`));
    assert.doesNotMatch(obchod, /chrome:\/\/extensions|Načíst rozbalené|Load unpacked|rozsireni:|data-rozsireni-doba/);
    assert.match(obchod, /<span class="detail-tag">2 (minuty|minutes)<\/span>/);
  }
  assert.throws(() => rozsireniNaWebu('<p>bez značek</p>', ''), /značky/);
});

test('Chrome Web Store: aplikace zná adresu obchodu a otevírá ho jen z tohoto Macu', async () => {
  const srv = await startTestServer();
  try {
    const klient = api(srv.url);
    const st = await klient.get('/api/state');
    assert.equal(st.body.integrations.extension.obchod, adresaObchodu(CHROME_WEB_STORE_URL));
    const zTelefonu = await fetch(`${srv.url}/api/extension/obchod`, { method: 'POST', headers: { 'X-Forwarded-For': '100.64.0.9' } });
    assert.equal(zTelefonu.status, 403);
    const r = await klient.send('POST', '/api/extension/obchod', {});
    if (CHROME_WEB_STORE_URL) assert.equal(r.status, 200);
    else assert.equal(r.status, 409, 'dokud rozšíření v obchodě není, nic se nepředstírá');
  } finally {
    await srv.close();
  }
});
