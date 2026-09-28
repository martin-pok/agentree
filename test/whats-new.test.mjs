import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { RELEASES, compareVersions, unseenReleases } from '../public/js/whats-new-data.js';

// Uživatel musí vědět, co se v aplikaci změnilo. Vydání bez záznamu v „Co je nového“ neprojde.

test('aktuální verze aplikace má záznam v „Co je nového“', async () => {
  const { version } = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.ok(RELEASES.some((r) => r.version === version), `chybí záznam pro ${version} v public/js/whats-new-data.js`);
});

test('vydání jdou od nejnovějšího a každé má datum, název a body', () => {
  for (let i = 1; i < RELEASES.length; i++) assert.ok(compareVersions(RELEASES[i - 1].version, RELEASES[i].version) > 0, 'špatné pořadí');
  for (const r of RELEASES) {
    assert.match(r.version, /^\d+\.\d+\.\d+$/);
    assert.match(r.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(r.title.length > 5);
    assert.ok(r.items.length > 0 && r.items.every((t) => typeof t === 'string' && t.length > 10));
  }
});

// Anglické rozhraní ukazuje anglický záznam. Každé vydání ho musí mít se stejným počtem bodů,
// jinak by se v angličtině ukázalo česky, nebo by něco chybělo.
const CZ = /[áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]/;
test('každé vydání má anglický název a stejný počet bodů', () => {
  for (const r of RELEASES) {
    assert.ok(r.en && typeof r.en.title === 'string' && r.en.title.length > 5, `${r.version}: chybí en.title`);
    assert.equal(r.en.items?.length, r.items.length, `${r.version}: jiný počet bodů v en`);
    assert.doesNotMatch(r.en.title, CZ, `${r.version}: čeština v en.title`);
    for (const t of r.en.items) {
      assert.ok(typeof t === 'string' && t.length > 10, r.version);
      // Uvozovky „…“ smějí citovat češtinu (třeba rozbitou diakritiku ve schránce), jinak ne.
      assert.doesNotMatch(t.replace(/“[^”]*”/g, ''), CZ, `${r.version}: čeština v bodu: ${t.slice(0, 60)}`);
    }
  }
});

test('„Co je nového“ vybírá text podle jazyka rozhraní', () => {
  const kod = (lang) => `globalThis.document = { documentElement: { lang: '${lang}', dataset: {} } }; const { textVydani } = await import('./public/js/whats-new.js'); const { RELEASES } = await import('./public/js/whats-new-data.js'); console.log(JSON.stringify(RELEASES.map(textVydani).map((t) => t.title)));`;
  const spust = (lang) => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', kod(lang)], { cwd: new URL('..', import.meta.url), encoding: 'utf8' }));
  assert.deepEqual(spust('cs'), RELEASES.map((r) => r.title));
  assert.deepEqual(spust('en'), RELEASES.map((r) => r.en.title));
});

test('ukáže se jen to, co uživatel ještě neviděl', () => {
  const [nejnovejsi, druha, treti] = RELEASES;
  assert.deepEqual(unseenReleases(treti.version, nejnovejsi.version).map((r) => r.version), [nejnovejsi.version, druha.version]);
  assert.deepEqual(unseenReleases(nejnovejsi.version, nejnovejsi.version), []);
  assert.deepEqual(unseenReleases('', nejnovejsi.version).map((r) => r.version), [nejnovejsi.version], 'bez historie jen aktuální vydání');
  assert.deepEqual(unseenReleases(druha.version, druha.version), [], 'budoucí záznamy se neukazují starší verzi');
});

test('porovnání verzí je číselné, ne textové', () => {
  assert.ok(compareVersions('0.10.0', '0.9.9') > 0);
  assert.ok(compareVersions('1.0.0', '0.99.99') > 0);
  assert.equal(compareVersions('0.11.0', '0.11.0'), 0);
});

// Technický záznam změn pro vydavatele a podporu musí držet krok s aplikací stejně jako „Co je nového“.
test('CHANGELOG.md má záznam pro aktuální verzi', async () => {
  const { version } = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const log = await fs.readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
  assert.match(log, new RegExp(`^## ${version.replace(/\./g, '\\.')} – `, 'm'), `CHANGELOG.md nemá sekci „## ${version} – …“`);
});
