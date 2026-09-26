import test from 'node:test';
import assert from 'node:assert/strict';

// Modul rozcestníku sahá při načtení na `location`, proto ho dáme minimální náhradu okna.
globalThis.location = { protocol: 'https:', hostname: 'priklad.example', host: 'priklad.example' };
const { normalizovatAdresu, jeStatickaKopie, pripojovaciObrazovka } = await import('../public/js/connect.js');

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

// Kdo na rozcestník zabloudí bez skutečného Macu po ruce (viz screenshot v issue), neměl by
// vidět jen prázdné pole na adresu – tam není co napsat. Ukázka bez instalace musí být hned
// nahoře a musí to být ta hlavní, výrazná akce; pole na adresu je až druhá cesta pod ní.
test('rozcestník má hned nahoře ukázku, ne jen pole na adresu, do kterého není co napsat', () => {
  const puvodni = { document: globalThis.document, localStorage: globalThis.localStorage };
  let znacky = '';
  globalThis.document = {
    body: { set innerHTML(html) { znacky = html; }, get innerHTML() { return znacky; } },
    querySelector: (sel) => (sel === '.pair-box' ? { elements: { adresa: { focus() {} } }, addEventListener() {} } : null),
  };
  globalThis.localStorage = { getItem: () => null };
  try {
    pripojovaciObrazovka();
    const odkazUkazku = znacky.match(/<a class="([^"]*)" href="\?ukazka">/);
    assert.ok(odkazUkazku, 'v rozcestníku chybí odkaz na ukázku bez instalace');
    assert.match(odkazUkazku[1], /\bbtn--primary\b/, 'ukázka musí být ta hlavní, výrazná akce');
    const tlacitkoOtevrit = znacky.match(/<button class="([^"]*)" type="submit">/);
    assert.ok(tlacitkoOtevrit, 'v rozcestníku chybí tlačítko Otevřít pro adresu Macu');
    assert.doesNotMatch(tlacitkoOtevrit[1], /btn--primary/, 'pole na adresu už nesmí soutěžit s ukázkou o pozornost');
    assert.ok(znacky.indexOf(odkazUkazku[0]) < znacky.indexOf('id="adresa"'), 'ukázka musí být nad polem na adresu, ne pod ním');
  } finally {
    Object.assign(globalThis, puvodni);
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
