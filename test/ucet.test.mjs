import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import { startTestServer, api, openStream, waitFor } from './helpers.mjs';
import { createUcet, pkcePar, uzivatelZOdpovedi, fotoZMetadat } from '../src/ucet.js';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { strankaNavratu, SKRIPT_NAVRATU } from '../src/ucet-stranka.js';

// Účet Agenteeq (src/ucet.js): přihlášení přes Google proti atrapě Supabase Auth. Skutečný server
// účtů se v testech nikdy nevolá (test/helpers.mjs nastavuje AGENTEEQ_UCET_URL=0).

const KLIC = 'sb_publishable_test';
const UZIVATEL = { id: '6f1c0a52-7d3e-4d4b-9a57-5b0c7c3f1e11', email: 'eva@example.com', user_metadata: { full_name: 'Eva Nováková', avatar_url: 'https://example.com/a.png' } };

// Atrapa GoTrue: jen to, co Agenteeq volá, a s kontrolami, které dělá skutečný server (PKCE,
// jednorázové obnovovací tokeny, apikey). Každé volání se zapisuje, aby šlo ověřit, co odešlo.
async function atrapaAuth({ google = true } = {}) {
  const volani = [];
  const vyzvy = new Map(); // kód → výzva PKCE
  const platneObnovy = new Set();
  const platnePristupy = new Set();
  let citac = 0;
  const vydej = () => {
    citac += 1;
    const access = `pristup-${citac}`;
    const refresh = `obnova-${citac}-${crypto.randomBytes(6).toString('hex')}`;
    platnePristupy.add(access);
    platneObnovy.add(refresh);
    return { access_token: access, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: refresh, user: UZIVATEL };
  };
  const server = http.createServer(async (req, res) => {
    let raw = '';
    for await (const c of req) raw += c;
    const url = new URL(req.url, 'http://x');
    const body = raw ? JSON.parse(raw) : null;
    volani.push({ method: req.method, cesta: url.pathname, query: Object.fromEntries(url.searchParams), body, apikey: req.headers.apikey, auth: req.headers.authorization || '' });
    const posli = (status, json) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(json === undefined ? '' : JSON.stringify(json)); };
    if (req.headers.apikey !== KLIC) return posli(401, { message: 'Invalid API key' });
    if (req.method === 'GET' && url.pathname === '/auth/v1/settings') return posli(200, { external: { google, email: true } });
    if (req.method === 'POST' && url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'pkce') {
      const vyzva = vyzvy.get(body?.auth_code);
      vyzvy.delete(body?.auth_code);
      const spocitana = crypto.createHash('sha256').update(String(body?.code_verifier || '')).digest('base64url');
      if (!vyzva || vyzva !== spocitana) return posli(400, { error: 'invalid_grant', error_description: 'invalid flow state' });
      return posli(200, vydej());
    }
    if (req.method === 'POST' && url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'refresh_token') {
      if (!platneObnovy.delete(body?.refresh_token)) return posli(400, { error: 'invalid_grant', error_description: 'Invalid Refresh Token' });
      return posli(200, vydej());
    }
    const token = (req.headers.authorization || '').replace(/^Bearer /, '');
    if (req.method === 'POST' && url.pathname === '/auth/v1/logout') {
      platnePristupy.delete(token);
      res.writeHead(204).end();
      return undefined;
    }
    if (req.method === 'POST' && url.pathname === '/rest/v1/rpc/smazat_muj_ucet') {
      if (!platnePristupy.has(token)) return posli(401, { message: 'JWT expired' });
      res.writeHead(204).end();
      return undefined;
    }
    return posli(404, { message: 'nenalezeno' });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    volani,
    // Google by po přihlášení vrátil kód svázaný s výzvou z adresy přihlášení.
    vydejKod(authorizeUrl) {
      const kod = `kod-${crypto.randomBytes(8).toString('hex')}`;
      vyzvy.set(kod, new URL(authorizeUrl).searchParams.get('code_challenge'));
      return kod;
    },
    close: () => new Promise((r) => server.close(r)),
  };
}

async function sAtrapou(fn, { google = true } = {}) {
  const auth = await atrapaAuth({ google });
  const srv = await startTestServer({ AGENTEEQ_UCET_URL: auth.url, AGENTEEQ_UCET_KEY: KLIC });
  try {
    await fn({ auth, srv, klient: api(srv.url) });
  } finally {
    await srv.close();
    await auth.close();
  }
}

const navrat = (url) => fetch(url).then(async (r) => ({ status: r.status, html: await r.text(), csp: r.headers.get('content-security-policy'), cache: r.headers.get('cache-control') }));

test('stránka návratu z Google přihlášení respektuje jazyk aplikace', () => {
  const wait = strankaNavratu({ ceka: true, language: 'en' });
  assert.match(wait, /<html lang="en">/);
  assert.match(wait, /Finishing sign-in/);
  assert.match(wait, /data-error-title="Sign-in failed"/);
  assert.match(wait, /rel="icon"[^>]+\/brand\/agenteeq-mark-dark\.svg/);
  const done = strankaNavratu({ ok: true, jmeno: '<Eva>', language: 'en' });
  assert.match(done, /Welcome, &lt;Eva&gt;/);
  assert.match(done, /You can close this window/);
  assert.doesNotMatch(done, /Přihlášení/);
  assert.match(SKRIPT_NAVRATU, /main\.dataset\.errorTitle/);
});

test('HTTP návrat z Google přihlášení používá uloženou angličtinu', async () => {
  const srv = await startTestServer();
  try {
    const klient = api(srv.url);
    assert.equal((await klient.send('PUT', '/api/settings', { language: 'en' })).status, 200);
    const r = await navrat(`${srv.url}/ucet/navrat/${'A'.repeat(43)}?code=unknown`);
    assert.match(r.html, /<html lang="en">/);
    assert.match(r.html, /Sign-in failed/);
    assert.doesNotMatch(r.html, /Přihlášení se nepovedlo/);
  } finally {
    await srv.close();
  }
});

test('PKCE: výzva je SHA-256 ověřovače v base64url a ověřovač má 64 znaků', () => {
  const { verifier, challenge } = pkcePar();
  assert.match(verifier, /^[A-Za-z0-9_-]{64}$/);
  assert.equal(challenge, crypto.createHash('sha256').update(verifier).digest('base64url'));
  assert.notEqual(pkcePar().verifier, verifier, 'každé přihlášení má jiný ověřovač');
});

test('z účtu Google se bere jen jméno, e-mail, id a adresa fotky – nic dalšího', () => {
  const u = uzivatelZOdpovedi({ ...UZIVATEL, phone: '+420123', app_metadata: { provider: 'google' }, user_metadata: { ...UZIVATEL.user_metadata, full_name: `  ${'x'.repeat(300)}  ` } });
  assert.deepEqual(Object.keys(u).sort(), ['email', 'fotoUrl', 'id', 'jmeno']);
  assert.equal(u.fotoUrl, '', 'fotka odjinud než z obrázkového serveru Googlu se nestahuje');
  assert.equal(u.jmeno.length, 120);
  assert.equal(uzivatelZOdpovedi({ email: 'bez.jmena@example.com' }).jmeno, 'bez.jmena', 'bez jména z Googlu poslouží začátek e-mailu');
  assert.equal(uzivatelZOdpovedi(null), null);
});

test('přihlášení přes Google: odkaz s PKCE, návrat na tento Mac, výměna kódu a potvrzení v aplikaci', async () => {
  await sAtrapou(async ({ auth, srv, klient }) => {
    assert.equal((await klient.get('/api/state')).body.ucet.stav, 'odhlaseno');
    const proud = await openStream(srv.url);
    try {
      const r = await klient.send('POST', '/api/ucet/prihlaseni', {});
      assert.equal(r.status, 200);
      const odkaz = new URL(r.body.url);
      assert.equal(odkaz.origin + odkaz.pathname, `${auth.url}/auth/v1/authorize`);
      assert.equal(odkaz.searchParams.get('provider'), 'google');
      assert.equal(odkaz.searchParams.get('code_challenge_method'), 's256');
      assert.match(odkaz.searchParams.get('code_challenge'), /^[A-Za-z0-9_-]{43}$/);
      const zpet = new URL(odkaz.searchParams.get('redirect_to'));
      assert.equal(zpet.origin, srv.url, 'návrat míří na server na tomhle Macu, na port, na kterém opravdu běží');
      assert.match(zpet.pathname, /^\/ucet\/navrat\/[A-Za-z0-9_-]{43}$/);
      assert.equal(r.body.otevreno, true, 'prohlížeč otevírá server (v testech nanečisto)');
      assert.equal((await klient.get('/api/state')).body.ucet.ceka, true);

      // Prohlížeč se vrátí nejdřív bez kódu (stránka pak čte chybu z části za #) – nic se nevymění.
      const bezKodu = await navrat(zpet.href);
      assert.match(bezKodu.html, /Dokončuji přihlášení/);
      assert.match(bezKodu.html, /<script src="\/ucet\/navrat.js" defer><\/script>/);
      assert.equal(auth.volani.filter((v) => v.cesta === '/auth/v1/token').length, 0);

      const kod = auth.vydejKod(r.body.url);
      const hotovo = await navrat(`${zpet.href}?code=${kod}`);
      assert.equal(hotovo.status, 200);
      assert.match(hotovo.html, /Vítej, Eva Nováková/);
      assert.equal(hotovo.cache, 'no-store');
      assert.match(hotovo.csp, /script-src 'self'/);
      const vymena = auth.volani.find((v) => v.query.grant_type === 'pkce');
      assert.equal(vymena.body.auth_code, kod);
      assert.match(vymena.body.code_verifier, /^[A-Za-z0-9_-]{64}$/);
      assert.equal(vymena.apikey, KLIC);

      const stav = (await klient.get('/api/state')).body.ucet;
      assert.deepEqual({ stav: stav.stav, email: stav.email, jmeno: stav.jmeno, ceka: stav.ceka }, { stav: 'prihlaseno', email: 'eva@example.com', jmeno: 'Eva Nováková', ceka: false });
      assert.equal(stav.trvale, false, 'bez Klíčenky (testy, Linux) přihlášení vydrží jen do konce běhu – a aplikace to přizná');
      const udalost = await waitFor(() => proud.events.find((e) => e.event === 'ucet' && e.data.udalost === 'prihlaseno'));
      assert.equal(udalost.data.jmeno, 'Eva Nováková');
      assert.equal(JSON.stringify(udalost.data).includes('pristup-'), false, 'tokeny do rozhraní nechodí');
      assert.equal(JSON.stringify(stav).includes('obnova-'), false);

      // Přihlášení zapnulo synchronizaci souhrnů (rozhodnutí vlastníka 4. 10. 2026).
      assert.equal((await waitFor(async () => ((await klient.get('/api/state')).body.ucet.sync.zapnuto ? true : null))), true);
      // Účet v atrapě má fotku mimo Google – nestáhla se a cesta fotky vrací 404.
      assert.equal(stav.foto, '');
      assert.equal((await klient.get('/api/ucet/foto')).status, 404);
      // Přes proxy (telefon přes Tailscale) se fotka nevydá – z účtu vidí jen stav.
      assert.equal((await fetch(`${srv.url}/api/ucet/foto`, { headers: { 'X-Forwarded-For': '100.64.0.2' } })).status, 403);

      // Tentýž návrat podruhé (třeba obnovení stránky) už nic nepřihlásí.
      const znovu = await navrat(`${zpet.href}?code=${kod}`);
      assert.match(znovu.html, /už neplatí/);
    } finally {
      proud.close();
    }
  });
});

test('návrat s cizím kódem, neznámým pokusem nebo chybou z Googlu nikoho nepřihlásí', async () => {
  await sAtrapou(async ({ auth, srv, klient }) => {
    const r = await klient.send('POST', '/api/ucet/prihlaseni', {});
    const zpet = new URL(r.body.url).searchParams.get('redirect_to');

    // Kód vydaný pro jiné přihlášení: ověřovač nesedí, server ho odmítne.
    const cizi = await navrat(`${zpet}?code=${auth.vydejKod(`${auth.url}/x?code_challenge=${pkcePar().challenge}`)}`);
    assert.match(cizi.html, /Přihlášení se nepovedlo/);
    assert.equal((await klient.get('/api/state')).body.ucet.stav, 'odhlaseno');

    // Neznámý pokus: na server účtů se vůbec nesahá.
    const pred = auth.volani.length;
    const nahodny = await navrat(`${srv.url}/ucet/navrat/${'A'.repeat(43)}?code=cokoli`);
    assert.match(nahodny.html, /už neplatí/);
    assert.equal(auth.volani.length, pred);

    // Chyba z Googlu (člověk přihlášení zrušil).
    const r2 = await klient.send('POST', '/api/ucet/prihlaseni', {});
    const zpet2 = new URL(r2.body.url).searchParams.get('redirect_to');
    const zruseno = await navrat(`${zpet2}?chyba=${encodeURIComponent('<b>access_denied</b>')}`);
    assert.match(zruseno.html, /Přihlášení se nepovedlo/);
    assert.equal(zruseno.html.includes('<b>access_denied'), false, 'text chyby se escapuje');
    const stav = (await klient.get('/api/state')).body.ucet;
    assert.equal(stav.stav, 'odhlaseno');
    assert.match(stav.chyba, /access_denied/);
  });
});

test('návrat z přihlášení přijme jen tento Mac – ne proxy ani cizí zařízení', async () => {
  await sAtrapou(async ({ srv, klient }) => {
    const r = await klient.send('POST', '/api/ucet/prihlaseni', {});
    const zpet = new URL(r.body.url).searchParams.get('redirect_to');
    const pres = await fetch(`${zpet}?code=x`, { headers: { 'X-Forwarded-For': '100.64.0.7' } });
    assert.equal(pres.status, 403);
    const js = await fetch(`${srv.url}/ucet/navrat.js`, { headers: { 'X-Forwarded-For': '100.64.0.7' } });
    assert.equal(js.status, 403);
    const prihlaseni = await klient.send('POST', '/api/ucet/prihlaseni', {}, { 'X-Agenteeq': '1', 'X-Forwarded-For': '100.64.0.7' });
    assert.equal(prihlaseni.status, 403);
    const skript = await fetch(`${srv.url}/ucet/navrat.js`);
    assert.equal(skript.status, 200);
    assert.match(skript.headers.get('content-type'), /javascript/);
  });
});

test('když přihlášení přes Google na serveru účtů ještě neběží, aplikace to řekne rovnou', async () => {
  await sAtrapou(async ({ klient }) => {
    const r = await klient.send('POST', '/api/ucet/prihlaseni', {});
    assert.equal(r.status, 503);
    assert.match(r.body.error, /ještě nastavuje/);
    assert.equal((await klient.get('/api/state')).body.ucet.ceka, false, 'nikam se neposílá, nic nečeká');
  }, { google: false });
});

test('odhlášení a smazání účtu: server účtů dostane platný token, v aplikaci nic nezůstane', async () => {
  await sAtrapou(async ({ auth, klient }) => {
    const prihlas = async () => {
      const r = await klient.send('POST', '/api/ucet/prihlaseni', {});
      const zpet = new URL(r.body.url).searchParams.get('redirect_to');
      await navrat(`${zpet}?code=${auth.vydejKod(r.body.url)}`);
    };
    await prihlas();
    const odhlaseni = await klient.send('POST', '/api/ucet/odhlaseni', {});
    assert.equal(odhlaseni.body.ucet.stav, 'odhlaseno');
    assert.equal(odhlaseni.body.ucet.email, '');
    assert.match(auth.volani.find((v) => v.cesta === '/auth/v1/logout').auth, /^Bearer pristup-/);

    await prihlas();
    const smazani = await klient.send('POST', '/api/ucet/smazani', {});
    assert.equal(smazani.status, 200);
    assert.equal(smazani.body.ucet.stav, 'odhlaseno');
    assert.match(auth.volani.find((v) => v.cesta === '/rest/v1/rpc/smazat_muj_ucet').auth, /^Bearer pristup-/);

    const bez = await klient.send('POST', '/api/ucet/smazani', {});
    assert.equal(bez.status, 401, 'nepřihlášený nemá co mazat');
  });
});

test('obnovovací token účtu se nedá zapsat ani smazat ručně přes API klíčů', async () => {
  await sAtrapou(async ({ klient }) => {
    assert.equal((await klient.send('PUT', '/api/secrets/ucet', { value: 'podstrceny-token' })).status, 404);
    assert.equal((await klient.send('DELETE', '/api/secrets/ucet')).status, 404);
  });
});

test('bez nastaveného serveru účtů karta účtu zmizí a přihlášení nic nezkouší', async () => {
  const srv = await startTestServer();
  try {
    const klient = api(srv.url);
    assert.equal((await klient.get('/api/state')).body.ucet.stav, 'nenastaveno');
    assert.equal((await klient.send('POST', '/api/ucet/prihlaseni', {})).status, 404);
  } finally {
    await srv.close();
  }
});

// Obnova přihlášení po startu: výpadek sítě není odhlášení, odmítnutý token ano.
function falesneTajemstvi(pocatecni = null) {
  const t = { hodnota: pocatecni, zapisy: [] };
  return Object.assign(t, {
    get: async () => t.hodnota,
    set: async (_id, v) => { t.hodnota = v; t.zapisy.push(v); },
    remove: async () => { t.hodnota = null; },
  });
}
const odpoved = (status, json) => ({ ok: status < 400, status, json: async () => json });
const config = { ucet: { url: 'https://ucty.example', klic: KLIC } };

test('po startu se uložené přihlášení obnoví a nový obnovovací token se uloží', async () => {
  const tajemstvi = falesneTajemstvi('obnova-stara');
  const hlaseni = [];
  const ucet = createUcet({
    config, secrets: tajemstvi, emit: (s) => hlaseni.push(s),
    fetchImpl: async (url, init) => {
      assert.equal(url, 'https://ucty.example/auth/v1/token?grant_type=refresh_token');
      assert.deepEqual(JSON.parse(init.body), { refresh_token: 'obnova-stara' });
      return odpoved(200, { access_token: 'a1', refresh_token: 'obnova-nova', expires_in: 3600, user: UZIVATEL });
    },
  });
  await ucet.start();
  ucet.stop();
  assert.equal(ucet.status().stav, 'prihlaseno');
  assert.equal(ucet.status().trvale, true);
  assert.deepEqual(tajemstvi.zapisy, ['obnova-nova'], 'token se po každé obnově mění – uloží se ten nový');
  assert.equal(hlaseni.at(-1).stav, 'prihlaseno');
  assert.equal(await ucet.pristup(), 'a1');
});

test('výpadek sítě při obnově není odhlášení: token zůstává a stav říká „nedostupné“', async () => {
  const tajemstvi = falesneTajemstvi('obnova-1');
  const ucet = createUcet({ config, secrets: tajemstvi, fetchImpl: async () => { throw new TypeError('fetch failed'); } });
  await ucet.start();
  ucet.stop();
  assert.equal(ucet.status().stav, 'nedostupne');
  assert.match(ucet.status().chyba, /neodpovídá/);
  assert.equal(tajemstvi.hodnota, 'obnova-1', 'uložené přihlášení se kvůli výpadku nemaže');
  assert.equal(await ucet.pristup(), null, 'bez ověření se synchronizace neptá s neplatným tokenem');
});

test('odmítnutý obnovovací token znamená odhlášení a smazání z Klíčenky', async () => {
  const tajemstvi = falesneTajemstvi('obnova-zrusena');
  const ucet = createUcet({ config, secrets: tajemstvi, fetchImpl: async () => odpoved(400, { error: 'invalid_grant', error_description: 'Invalid Refresh Token: Already Used' }) });
  await ucet.start();
  ucet.stop();
  assert.equal(ucet.status().stav, 'odhlaseno');
  assert.match(ucet.status().chyba, /Přihlas se znovu/);
  assert.equal(tajemstvi.hodnota, null);
});

test('souběžné žádosti o token obnovují přihlášení jen jednou (token je jednorázový)', async () => {
  let obnov = 0;
  const ucet = createUcet({
    config, secrets: falesneTajemstvi('obnova-1'), now: () => Date.now(),
    fetchImpl: async () => { obnov += 1; await new Promise((r) => setTimeout(r, 20)); return odpoved(200, { access_token: `a${obnov}`, refresh_token: `obnova-${obnov + 1}`, expires_in: 60, user: UZIVATEL }); },
  });
  await ucet.start();
  ucet.stop();
  assert.equal(obnov, 1);
  // Token platí 60 s, tedy méně než rezerva 5 minut: každé volání by chtělo obnovu, ale souběžná jde jedna.
  const [a, b, c] = await Promise.all([ucet.pristup(), ucet.pristup(), ucet.pristup()]);
  assert.equal(obnov, 2);
  assert.equal(a, 'a2');
  assert.equal(b, 'a2');
  assert.equal(c, 'a2');
});


/* ---------- Spolehlivost přihlášení a fotka z Googlu (4. 10. 2026) ---------- */

const FOTO_URL = 'https://lh3.googleusercontent.com/a/ACg8ocK-test=s96-c';
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7)]);
const SE_FOTKOU = { ...UZIVATEL, user_metadata: { full_name: 'Eva Nováková', avatar_url: FOTO_URL } };
const obrazek = (buf, status = 200) => ({ ok: status < 400, status, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length), json: async () => null });

test('fotka: jen https z obrázkového serveru Googlu, v rozlišení pro Retinu', () => {
  assert.equal(fotoZMetadat({ avatar_url: FOTO_URL }), 'https://lh3.googleusercontent.com/a/ACg8ocK-test=s192-c');
  assert.equal(fotoZMetadat({ picture: 'https://lh5.googleusercontent.com/x/photo.jpg' }), 'https://lh5.googleusercontent.com/x/photo.jpg');
  for (const spatna of ['http://lh3.googleusercontent.com/a/x', 'https://googleusercontent.com.evil.example/a', 'https://evil.example/a.png', 'https://user:pw@lh3.googleusercontent.com/a', 'https://lh3.googleusercontent.com:8443/a', 'javascript:alert(1)', 42, null]) {
    assert.equal(fotoZMetadat({ avatar_url: spatna }), '', String(spatna));
  }
});

test('po přihlášení si Mac fotku stáhne, uloží k sobě a ukáže ji i po startu bez sítě', async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agenteeq-ucet-'));
  try {
    const tajemstvi = falesneTajemstvi('obnova-1');
    const stazeno = [];
    const ucet = createUcet({
      config: { ...config, dataDir }, secrets: tajemstvi,
      fetchImpl: async (url) => {
        if (url.startsWith('https://lh3.')) { stazeno.push(url); return obrazek(JPEG); }
        return odpoved(200, { access_token: 'a1', refresh_token: 'obnova-2', expires_in: 3600, user: SE_FOTKOU });
      },
    });
    await ucet.start();
    ucet.stop();
    await waitFor(() => ucet.status().foto);
    assert.deepEqual(stazeno, ['https://lh3.googleusercontent.com/a/ACg8ocK-test=s192-c']);
    assert.deepEqual(ucet.fotka().body, JPEG);
    assert.equal(ucet.fotka().typ, 'image/jpeg');
    // Nový start bez sítě: jméno i fotka jsou z disku, přihlášení zůstává, stav říká „nedostupné“.
    const offline = createUcet({ config: { ...config, dataDir }, secrets: tajemstvi, fetchImpl: async () => { throw new TypeError('fetch failed'); } });
    await offline.start();
    offline.stop();
    assert.equal(offline.status().stav, 'nedostupne');
    assert.equal(offline.status().jmeno, 'Eva Nováková');
    assert.equal(offline.status().foto, ucet.status().foto);
    assert.equal(tajemstvi.hodnota, 'obnova-2');
    // Odhlášení smaže profil i fotku z disku.
    await offline.odhlasit();
    assert.deepEqual((await fs.readdir(dataDir)).filter((f) => f.startsWith('ucet-')), []);
  } finally {
    await fs.rm(dataDir, { recursive: true, force: true });
  }
});

test('fotka přesměrovaná mimo Google se nepřijme', async () => {
  const ucet = createUcet({
    config, secrets: falesneTajemstvi('obnova-1'),
    fetchImpl: async (url) => (url.startsWith('https://lh3.') ? { ...obrazek(JPEG), url: 'https://evil.example/x.jpg' } : odpoved(200, { access_token: 'a1', refresh_token: 'obnova-2', expires_in: 3600, user: SE_FOTKOU })),
  });
  await ucet.start();
  ucet.stop();
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(ucet.status().foto, '');
});

test('fotka, která není obrázek (nebo je moc velká), se nepřijme – zůstanou iniciály', async () => {
  for (const telo of [Buffer.from('<html>chyba</html>'), Buffer.concat([JPEG, Buffer.alloc(400_000)])]) {
    const ucet = createUcet({
      config, secrets: falesneTajemstvi('obnova-1'),
      fetchImpl: async (url) => (url.startsWith('https://lh3.') ? obrazek(telo) : odpoved(200, { access_token: 'a1', refresh_token: 'obnova-2', expires_in: 3600, user: SE_FOTKOU })),
    });
    await ucet.start();
    ucet.stop();
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(ucet.status().foto, '');
    assert.equal(ucet.fotka(), null);
  }
});

test('přetížený server (429) ani jeho výpadek (503) přihlášení nesmažou', async () => {
  for (const [status, text] of [[429, /přetížený/], [503, /potíže/]]) {
    const tajemstvi = falesneTajemstvi('obnova-1');
    const ucet = createUcet({ config, secrets: tajemstvi, fetchImpl: async () => odpoved(status, { message: 'zkus později' }) });
    await ucet.start();
    ucet.stop();
    assert.equal(ucet.status().stav, 'nedostupne', String(status));
    assert.match(ucet.status().chyba, text);
    assert.equal(tajemstvi.hodnota, 'obnova-1');
  }
});

test('zamčená Klíčenka po startu není odhlášení: ověří se znovu, až bude dostupná', async () => {
  let cas = 1_000_000;
  let zamceno = true;
  const tajemstvi = falesneTajemstvi('obnova-1');
  tajemstvi.get = async (_id, volby) => { if (zamceno && volby?.prisne) throw new Error('Klíčenka zamčená'); return tajemstvi.hodnota; };
  const ucet = createUcet({ config, secrets: tajemstvi, now: () => cas, fetchImpl: async () => odpoved(200, { access_token: 'a1', refresh_token: 'obnova-2', expires_in: 3600, user: UZIVATEL }) });
  await ucet.start();
  ucet.stop();
  assert.equal(ucet.status().stav, 'nedostupne');
  assert.match(ucet.status().chyba, /Klíčenka/);
  assert.equal(tajemstvi.hodnota, 'obnova-1', 'nic se nesmazalo');
  assert.equal(await ucet.pristup(), null, 'před dalším pokusem se server nezahlcuje');
  zamceno = false;
  cas += 31_000;
  assert.equal(await ucet.pristup(), 'a1');
  assert.equal(ucet.status().stav, 'prihlaseno');
});

test('ztracená odpověď při obnově: novější token z Klíčenky přihlášení zachrání', async () => {
  // Jiná instance Agenteeq (nebo obnova, jejíž odpověď se ztratila) už token vyměnila: server
  // starý odmítne jako použitý, v Klíčence ale leží nový.
  const tajemstvi = falesneTajemstvi('obnova-stara');
  const poslane = [];
  const ucet = createUcet({
    config, secrets: tajemstvi,
    fetchImpl: async (_url, init) => {
      const { refresh_token: t } = JSON.parse(init.body);
      poslane.push(t);
      if (t === 'obnova-stara') {
        tajemstvi.hodnota = 'obnova-nova';
        return odpoved(400, { error_code: 'refresh_token_already_used', msg: 'Invalid Refresh Token: Already Used' });
      }
      return odpoved(200, { access_token: 'a2', refresh_token: 'obnova-3', expires_in: 3600, user: UZIVATEL });
    },
  });
  await ucet.start();
  ucet.stop();
  assert.deepEqual(poslane, ['obnova-stara', 'obnova-nova']);
  assert.equal(ucet.status().stav, 'prihlaseno');
  assert.equal(tajemstvi.hodnota, 'obnova-3');
});

test('platnost tokenu se počítá od hodin Macu, ne z času serveru (posunuté hodiny)', async () => {
  const cas = Date.UTC(2026, 9, 4, 12);
  let obnov = 0;
  const ucet = createUcet({
    config, secrets: falesneTajemstvi('obnova-1'), now: () => cas,
    // Server si myslí, že je o dvě hodiny víc: expires_at by token na Macu označil za dávno prošlý.
    fetchImpl: async () => { obnov += 1; return odpoved(200, { access_token: `a${obnov}`, refresh_token: `obnova-${obnov + 1}`, expires_in: 3600, expires_at: Math.floor(cas / 1000) - 3600, user: UZIVATEL }); },
  });
  await ucet.start();
  ucet.stop();
  assert.equal(await ucet.pristup(), 'a1');
  assert.equal(obnov, 1, 'platný token se neobnovuje při každém volání');
});

test('přihlášení nabídne výběr účtu Google (prompt=select_account)', async () => {
  await sAtrapou(async ({ klient }) => {
    const r = await klient.send('POST', '/api/ucet/prihlaseni', {});
    assert.equal(new URL(r.body.url).searchParams.get('prompt'), 'select_account');
  });
});
