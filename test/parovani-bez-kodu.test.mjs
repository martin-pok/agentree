import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { idRozbalenehoRozsireni } from '../src/platform.js';
import { startTestServer, tempDir } from './helpers.mjs';

// Rozšíření se s aplikací spáruje samo, bez opisování kódu (app.js#pozadatOSparovani). Pozná se
// podle původu chrome-extension://<ID>, který nastavuje prohlížeč: web ani jiné rozšíření ho
// nepodvrhnou. Spáruje se jen naše rozšíření; cizí musí jít přes jednorázový kód z Macu.

const post = (url, headers = {}) => fetch(url, { method: 'POST', headers });

test('ID rozbaleného rozšíření: SHA-256 skutečné cesty převedené na písmena a–p', async () => {
  const slozka = await tempDir('agenteeq-ext-');
  // Stejné rozbalení cesty jako v kódu: ve Windows se fs.realpath a fs.realpathSync liší u krátkých jmen (RUNNER~1).
  const skutecna = realpathSync(slozka);
  const ocekavane = crypto.createHash('sha256').update(skutecna).digest('hex').slice(0, 32).replace(/[0-9a-f]/g, (c) => 'abcdefghijklmnop'[parseInt(c, 16)]);
  assert.equal(idRozbalenehoRozsireni(slozka, { jeWindows: false }), ocekavane);
  assert.match(idRozbalenehoRozsireni(slozka, { jeWindows: true }), /^[a-p]{32}$/);
  assert.notEqual(idRozbalenehoRozsireni(slozka, { jeWindows: true }), ocekavane, 've Windows jsou bajty cesty UTF-16');
  // Odkaz na složku dá totéž ID jako složka sama – Chrome pracuje se skutečnou cestou.
  const odkaz = path.join(await tempDir('agenteeq-odkaz-'), 'ext');
  await fs.symlink(slozka, odkaz).catch(() => {});
  if (await fs.lstat(odkaz).then((s) => s.isSymbolicLink(), () => false)) assert.equal(idRozbalenehoRozsireni(odkaz, { jeWindows: false }), ocekavane);
  assert.equal(idRozbalenehoRozsireni(''), '');
  assert.equal(idRozbalenehoRozsireni(null), '');
});

test('párování bez kódu: naše rozšíření dostane token, cizí jen odkaz na kód, web nic', async () => {
  const srv = await startTestServer();
  try {
    const cesta = srv.app.integrations ? (await srv.app.integrations()).extension.path : '';
    assert.ok(cesta, 'aplikace ví, odkud se rozšíření načítá');
    const nase = `chrome-extension://${idRozbalenehoRozsireni(cesta)}`;
    const url = `${srv.url}/api/extension/pripojit`;

    // Přes proxy nebo ze sítě se Origin dá podvrhnout – bez kódu se páruje jen přímo z tohoto Macu.
    const zeSite = await post(url, { Origin: nase, 'X-Forwarded-For': '100.64.0.9' });
    assert.equal(zeSite.status, 403, 'ze sítě se rozšíření bez kódu nespáruje ani s pravým původem');
    const web = await post(url, { Origin: 'https://evil.example' });
    assert.equal(web.status, 403, 'web se za rozšíření nevydává');
    const bezPuvodu = await post(url);
    assert.equal(bezPuvodu.status, 403);
    const cizi = await post(url, { Origin: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop' });
    assert.equal(cizi.status, 409, 'cizí rozšíření potřebuje jednorázový kód');
    assert.match((await cizi.json()).error, /jednorázovým kódem/);

    const r = await post(url, { Origin: nase, 'X-Agenteeq-Installation-Id': 'profil-1234' });
    assert.equal(r.status, 200);
    const { token } = await r.json();
    assert.ok(typeof token === 'string' && token.length >= 32);
    // Token platí jen z původu, pro který byl vydán.
    const hello = await fetch(`${srv.url}/api/extension/hello`, { method: 'POST', headers: { Origin: nase, 'X-Agenteeq-Token': token, 'Content-Type': 'application/json' }, body: '{"version":"0.0.0"}' });
    assert.equal(hello.status, 200);
    const odjinud = await fetch(`${srv.url}/api/extension/hello`, { method: 'POST', headers: { Origin: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop', 'X-Agenteeq-Token': token }, body: '{}' });
    assert.equal(odjinud.status, 401);
    // Nové spárování téže instalace zneplatní starý token (a druhý profil zůstane spárovaný).
    const druhyProfil = await (await post(url, { Origin: nase, 'X-Agenteeq-Installation-Id': 'profil-5678' })).json();
    const znovu = await (await post(url, { Origin: nase, 'X-Agenteeq-Installation-Id': 'profil-1234' })).json();
    assert.notEqual(znovu.token, token);
    const stary = await fetch(`${srv.url}/api/extension/hello`, { method: 'POST', headers: { Origin: nase, 'X-Agenteeq-Token': token }, body: '{}' });
    assert.equal(stary.status, 401, 'starý token téže instalace už neplatí');
    const druhy = await fetch(`${srv.url}/api/extension/hello`, { method: 'POST', headers: { Origin: nase, 'X-Agenteeq-Token': druhyProfil.token }, body: '{}' });
    assert.equal(druhy.status, 200, 'jiný profil Chromu zůstává spárovaný');
    const st = await (await fetch(`${srv.url}/api/state`, { headers: { 'X-Agenteeq': '1' } })).json();
    assert.equal(JSON.stringify(st).includes(znovu.token), false, 'token se nikde v přehledu neobjeví');
  } finally {
    await srv.close();
  }
});

test('párování bez kódu: rozšíření z Chrome Web Store se spáruje samo i před přepnutím příznaku zveřejnění', async () => {
  const { CHROME_WEB_STORE_URL, CHROME_WEB_STORE_PUBLISHED } = await import('../public/js/obchod.js');
  const id = CHROME_WEB_STORE_URL.match(/([a-p]{32})$/)[1];
  const srv = await startTestServer();
  try {
    const r = await post(`${srv.url}/api/extension/pripojit`, { Origin: `chrome-extension://${id}`, 'X-Agenteeq-Installation-Id': 'profil-obchod' });
    assert.equal(r.status, 200, `ID z obchodu je důvěryhodné bez ohledu na příznak (teď ${CHROME_WEB_STORE_PUBLISHED})`);
    assert.ok((await r.json()).token);
    // Příznak dál řídí jen nabídku obchodu – aplikace neveřejnou stránku nenabízí.
    const st = await (await fetch(`${srv.url}/api/state`, { headers: { 'X-Agenteeq': '1' } })).json();
    assert.equal(Boolean(st.integrations.extension.obchod), CHROME_WEB_STORE_PUBLISHED);
  } finally {
    await srv.close();
  }
});
