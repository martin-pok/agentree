import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { rozeberDotaz, najdiKonverzace, vetaOdpovedi } from '../src/pomocnik.js';
import { remoteScope } from '../src/remote-scope.js';
import { startTestServer, api, tempDir, writeJsonl } from './helpers.mjs';

const NOW = Date.parse('2026-10-08T12:00:00Z');
const DEN = 864e5;
const den = (ts) => new Date(ts).toISOString().slice(0, 10);

test('pomocník: rozumí času, nástroji a hledaným slovům v češtině i angličtině', () => {
  const a = rozeberDotaz('najdi mi chat ve kterém jsme před cca 3 měsíci řešili fakturaci, už nevím jaký LLM', NOW);
  assert.equal(a.zamer, 'hledat');
  assert.deepEqual(a.slova, ['fakturaci']);
  assert.equal(a.aplikace, null, '„nevím jaký LLM“ = bez filtru nástroje');
  assert.ok(a.okno.od < NOW - 70 * DEN && a.okno.do > NOW - 110 * DEN, `okno kolem 3 měsíců: ${den(a.okno.od)}..${den(a.okno.do)}`);

  const b = rozeberDotaz('v Codexu minulý týden jsme ladili ledger', NOW);
  assert.equal(b.aplikace, 'Codex');
  assert.deepEqual(b.slova, ['ledger'], '„ledger“ není leden');
  assert.ok(b.okno.do < NOW && b.okno.od > NOW - 15 * DEN);

  const c = rozeberDotaz('find the chat about stripe webhooks 2 weeks ago in claude code', NOW);
  assert.equal(c.aplikace, 'Claude Code');
  assert.deepEqual(c.slova, ['stripe', 'webhooks']);

  const d = rozeberDotaz('konverzace ze září o přihlášení přes Google', NOW);
  assert.equal(den(d.okno.od), '2026-09-01');
  assert.deepEqual(d.slova, ['prihlaseni', 'google']);

  assert.equal(rozeberDotaz('jak zapnu upozornění na telefon?', NOW).zamer, 'jak');
  assert.equal(rozeberDotaz('Kde nastavím rozpočet', NOW).zamer, 'jak');
  assert.equal(rozeberDotaz('in march we discussed onboarding', NOW).okno && den(rozeberDotaz('in march we discussed onboarding', NOW).okno.od), '2026-03-01');
});

async function prepisy() {
  const home = await tempDir('agenteeq-src-');
  const claude = path.join(home, '.claude', 'projects', '-Users-x-fakturace');
  const stary = path.join(claude, 'aaaaaaaa-1111-2222-3333-444444444444.jsonl');
  const t = (ms) => new Date(NOW - 92 * DEN + ms).toISOString();
  await writeJsonl(stary, [
    { type: 'user', timestamp: t(0), cwd: '/Users/x/fakturace', message: { content: 'Uprav export faktur do PDF a oprav zaokrouhlení DPH' } },
    { type: 'assistant', timestamp: t(60000), message: { content: [{ type: 'text', text: 'Fakturace teď počítá DPH po položkách.' }] } },
  ]);
  const codexDir = path.join(home, '.codex', 'sessions', '2026', '07', '01');
  const codex = path.join(codexDir, 'rollout-stripe.jsonl');
  const c = (ms) => new Date(NOW - 99 * DEN + ms).toISOString();
  await writeJsonl(codex, [
    { type: 'session_meta', timestamp: c(0), payload: { id: 'cdx-123', cwd: '/Users/x/shop', timestamp: c(0) } },
    { type: 'event_msg', timestamp: c(1000), payload: { type: 'user_message', message: 'Napoj Stripe webhooky na objednávky' } },
    { type: 'event_msg', timestamp: c(5000), payload: { type: 'agent_message', message: 'Webhooky Stripe ověřují podpis.' } },
  ]);
  await fs.utimes(stary, (NOW - 92 * DEN) / 1000, (NOW - 92 * DEN) / 1000);
  await fs.utimes(codex, (NOW - 99 * DEN) / 1000, (NOW - 99 * DEN) / 1000);
  return { home, koreny: [{ cesta: path.join(home, '.claude', 'projects'), app: 'Claude Code' }, { cesta: path.join(home, '.codex', 'sessions'), app: 'Codex' }] };
}

test('pomocník: najde konverzaci starou 3 měsíce v přepisech na disku, s ukázkou a příkazem k pokračování', async () => {
  const { koreny } = await prepisy();
  const v = await najdiKonverzace({ dotaz: 'najdi chat, kde jsme před cca 3 měsíci řešili fakturaci, nevím jaký LLM', koreny, now: NOW });
  assert.equal(v.vysledky.length, 1, JSON.stringify(v.vysledky));
  const [r] = v.vysledky;
  assert.equal(r.app, 'Claude Code');
  assert.equal(r.slozka, 'fakturace');
  assert.match(r.ukazka, /Fakturace/);
  assert.equal(r.pokracovat, 'claude --resume aaaaaaaa-1111-2222-3333-444444444444');
  assert.equal(v.prohledano, 2);
  assert.match(vetaOdpovedi(v), /nejlepší shoda/);

  const s = await najdiKonverzace({ dotaz: 'v codexu jsme řešili stripe webhooky', koreny, now: NOW });
  assert.deepEqual(s.vysledky.map((x) => [x.app, x.pokracovat]), [['Codex', 'codex resume cdx-123']]);

  const nic = await najdiKonverzace({ dotaz: 'najdi chat o kubernetes', koreny, now: NOW });
  assert.equal(nic.vysledky.length, 0);
  assert.match(vetaOdpovedi(nic), /Prohledal jsem konverzace v přehledu a 2 přepisů/, 'nenalezeno ≠ nehledal');

  const mimo = await najdiKonverzace({ dotaz: 'včera jsme řešili fakturaci', koreny, now: NOW });
  assert.equal(mimo.mimoOkno, true, 'shoda mimo zadané období se nabídne a řekne se to');
  assert.match(vetaOdpovedi(mimo), /z jiné doby/);
});

test('pomocník: konverzace z přehledu se dá otevřít; telefon nedostane nic z přepisů', async () => {
  const { koreny } = await prepisy();
  const sessions = [{ id: 'claude-code:aaaaaaaa-1111-2222-3333-444444444444', app: 'Claude Code', title: 'Export faktur', firstPrompt: 'Uprav export faktur', lastAt: NOW - 92 * DEN }];
  const v = await najdiKonverzace({ dotaz: 'export faktur', sessions, koreny, now: NOW });
  assert.equal(v.vysledky[0].sessionId, 'claude-code:aaaaaaaa-1111-2222-3333-444444444444');
  assert.equal(v.vysledky[0].pokracovat, '', 'otevřitelná v aplikaci, příkaz netřeba');
  const telefon = await najdiKonverzace({ dotaz: 'export faktur', sessions, koreny, now: NOW, smiPrepisy: false });
  assert.equal(telefon.prohledano, 0);
  assert.ok(telefon.vysledky.every((x) => !x.ukazka && !x.pokracovat));
});

test('pomocník: hledání se zastaví na limitu a řekne, že neprohledal vše', async () => {
  const { koreny } = await prepisy();
  const v = await najdiKonverzace({ dotaz: 'najdi chat o kubernetes', koreny, now: NOW, limity: { soubory: 1, bajty: 1e6, casMs: 5000, vysledky: 6 } });
  assert.equal(v.nedokonceno, true);
  assert.match(vetaOdpovedi(v), /ale ne všechny/);
});

test('HTTP: /api/pomocnik hledá na Macu v přepisech, telefonu přepisy nevydá; nastavení se ověřuje', async (t) => {
  const { home } = await prepisy();
  const s = await startTestServer({ AGENTEEQ_SOURCE_HOME: home });
  t.after(() => s.close());
  const r = await api(s.url).send('POST', '/api/pomocnik', { dotaz: 'před 3 měsíci jsme řešili fakturaci' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.zamer, 'hledat');
  assert.ok(r.body.vysledky.some((x) => /Fakturace|faktur/.test(x.ukazka)), JSON.stringify(r.body.vysledky));
  assert.equal(r.body.lokalne, null, 'bez Ollamy žádná formulace modelem');
  assert.equal((await api(s.url).send('POST', '/api/pomocnik', { dotaz: '' })).status, 400);

  assert.equal(remoteScope('POST', '/api/pomocnik').ok, true);
  s.app.datastore.data.settings.tailscaleAccess = true;
  const port = Number(new URL(s.url).port);
  const { pin } = (await api(s.url).send('POST', '/api/lan/pin', {})).body;
  const zTelefonu = (cesta, { method = 'GET', headers = {}, body } = {}) => new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: cesta, method, headers: { Host: `127.0.0.1:${port}`, 'X-Forwarded-For': '100.64.0.9', ...headers } }, (res) => {
      let data = '';
      res.on('data', (ch) => { data += ch; });
      res.on('end', () => resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null, cookie: res.headers['set-cookie'] }));
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
  const par = await zTelefonu('/api/lan/pair', { method: 'POST', headers: { 'X-Agenteeq': '1', 'Content-Type': 'application/json' }, body: { pin: pin.code, label: 'iPhone' } });
  const cookie = String(par.cookie?.[0] || '').split(';')[0];
  const tel = await zTelefonu('/api/pomocnik', { method: 'POST', headers: { 'X-Agenteeq': '1', 'Content-Type': 'application/json', Cookie: cookie }, body: { dotaz: 'před 3 měsíci jsme řešili fakturaci' } });
  assert.equal(tel.status, 200);
  assert.equal(tel.body.prohledano, 0, 'telefon přepisy neprohledává');
  assert.ok(tel.body.vysledky.every((x) => !x.ukazka));

  assert.equal((await api(s.url).send('PUT', '/api/settings', { pomocnik: { zobrazit: 'ne' } })).status, 422);
  const ok = await api(s.url).send('PUT', '/api/settings', { pomocnik: { zobrazit: false } });
  assert.deepEqual(ok.body.settings.pomocnik, { zobrazit: false, model: true });
});
