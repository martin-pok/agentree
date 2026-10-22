import test from 'node:test';
import assert from 'node:assert/strict';

// Modul rozcestníku sahá při načtení na `location`, proto ho dáme minimální náhradu okna.
globalThis.location = { protocol: 'https:', hostname: 'priklad.example', host: 'priklad.example' };
const { jeStatickaKopie, pripojovaciObrazovka } = await import('../public/js/connect.js');

test('rozcestník vede ke QR a ukázce, bez ruční adresy či PINu', () => {
  const puvodni = globalThis.document;
  let znacky = '';
  globalThis.document = {
    body: { set innerHTML(html) { znacky = html; }, get innerHTML() { return znacky; } },
  };
  try {
    pripojovaciObrazovka();
    const odkazUkazku = znacky.match(/<a class="([^"]*)" href="\?ukazka">/);
    assert.ok(odkazUkazku, 'v rozcestníku chybí odkaz na ukázku bez instalace');
    assert.match(odkazUkazku[1], /\bbtn--primary\b/, 'ukázka musí být ta hlavní, výrazná akce');
    assert.match(znacky, /QR kód/);
    assert.doesNotMatch(znacky, /<input|192\.168\.|Zadat adresu|id="pin"/);
  } finally {
    globalThis.document = puvodni;
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
