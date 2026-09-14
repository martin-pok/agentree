import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
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
  assert.match(log, new RegExp(`^## ${version.replace(/\./g, '\\.')} — `, 'm'), `CHANGELOG.md nemá sekci „## ${version} — …“`);
});
