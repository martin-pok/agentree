import test from 'node:test';
import assert from 'node:assert/strict';

// Modul rozcestníku sahá při načtení na `location`, proto ho dáme minimální náhradu okna.
globalThis.location = { protocol: 'https:', hostname: 'priklad.example', host: 'priklad.example' };
const { normalizovatAdresu, jeStatickaKopie } = await import('../public/js/connect.js');

test('adresa v domácí síti jede po http a doplní se jí port', () => {
  assert.equal(normalizovatAdresu('192.168.1.10'), 'http://192.168.1.10:4620/');
  assert.equal(normalizovatAdresu(' 192.168.1.10:4620 '), 'http://192.168.1.10:4620/');
  assert.equal(normalizovatAdresu('macbook.local'), 'http://macbook.local/');
});

test('tunel venku jede po https na svém jménu', () => {
  assert.equal(normalizovatAdresu('mac.tail1a2b.ts.net'), 'https://mac.tail1a2b.ts.net/');
  assert.equal(normalizovatAdresu('https://neco.trycloudflare.com'), 'https://neco.trycloudflare.com/');
  assert.equal(normalizovatAdresu('http://10.0.0.5:4620'), 'http://10.0.0.5:4620/');
});

test('co není adresa, se nikam neotevře', () => {
  for (const vstup of ['', '   ', 'javascript:alert(1)', 'data:text/html,<b>', 'file:///etc/passwd', 'https://uzivatel:heslo@mac.ts.net', 'http://', '??']) {
    assert.equal(normalizovatAdresu(vstup), '', `mělo být odmítnuto: ${vstup}`);
  }
});

test('statická kopie se pozná podle odpovědi /api/health', async () => {
  const odpoved = (init) => Promise.resolve({ ok: init.ok, json: () => (init.json ? Promise.resolve(init.json) : Promise.reject(new Error('není JSON'))) });
  assert.equal(await jeStatickaKopie(() => odpoved({ ok: false })), true, '404 z hostingu = statická kopie');
  assert.equal(await jeStatickaKopie(() => odpoved({ ok: true })), true, 'odpověď bez JSON = statická kopie');
  assert.equal(await jeStatickaKopie(() => odpoved({ ok: true, json: { neco: 1 } })), true, 'cizí JSON = statická kopie');
  assert.equal(await jeStatickaKopie(() => odpoved({ ok: true, json: { ok: true, version: '0.8.0' } })), false, 'skutečný Agenteeq');
  assert.equal(await jeStatickaKopie(() => Promise.reject(new Error('offline'))), false, 'výpadek sítě není statická kopie');
});
