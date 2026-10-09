import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { rozeberDotaz, najdiKonverzace, vetaOdpovedi, vyberLokalniModel, ollamaNaTomtoPocitaci, LIMITY } from '../src/pomocnik.js';
import { createOllamaClient } from '../src/ollama.js';
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
  assert.match(vetaOdpovedi(nic), /^Nic se nenašlo v konverzacích v přehledu ani v přepisech na tomto počítači \(prohledáno: 2\)/, 'nenalezeno ≠ nehledal');

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

test('pomocník: hledání se zastaví na limitu a řekne, že neprohledalo vše', async () => {
  const { koreny } = await prepisy();
  const v = await najdiKonverzace({ dotaz: 'najdi chat o kubernetes', koreny, now: NOW, limity: { soubory: 1, bajty: 1e6, casMs: 5000, vysledky: 6 } });
  assert.equal(v.nedokonceno, true);
  assert.match(vetaOdpovedi(v), /nestihlo projít všechny přepisy \(prohledáno: 1/);
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

test('pomocník: český tvar slova nevadí – „fakturaci“ najde faktury, „platby“ platbu; krátká slova nezaplaví', async () => {
  const sessions = [
    { id: 'codex:platby', app: 'Codex', title: 'platby a faktury', lastAt: NOW - DEN },
    { id: 'codex:platforma', app: 'Codex', title: 'Platforma pro e-shop', lastAt: NOW - DEN },
    { id: 'codex:databaze', app: 'Codex', title: 'Databáze zákazníků', lastAt: NOW - DEN },
    { id: 'codex:fakticky', app: 'Codex', title: 'Fakticky správné texty', lastAt: NOW - DEN },
  ];
  const najdi = async (dotaz) => (await najdiKonverzace({ dotaz, sessions, smiPrepisy: false, now: NOW })).vysledky.map((v) => v.sessionId);
  for (const dotaz of ['najdi chat o fakturaci', 'fakturace', 'faktura', 'faktur', 'fakturou', 'fakturování', 'fakturační', 'platby', 'platba', 'platbami', 'o platbách', 'historie plateb', 'platební brána']) {
    assert.deepEqual(await najdi(dotaz), ['codex:platby'], dotaz);
  }
  // Krátký kmen jen jako celé slovo (s pádovou koncovkou), ne jako začátek jiného slova.
  for (const dotaz of ['plat', 'data', 'fakt', 'xyzzy qwerty']) assert.deepEqual(await najdi(dotaz), [], dotaz);
  assert.deepEqual(await najdi('databáze'), ['codex:databaze']);
  // Ohnutá stop slova se nehledají („v konverzacích“ = „konverzace“).
  assert.deepEqual(rozeberDotaz('v konverzacích o platbách', NOW).slova, ['platbach']);
});

test('pomocník: jeden rozpočet na celý dotaz – po prázdném období se nehledá s novým limitem', async () => {
  const { home, koreny } = await prepisy();
  const novy = path.join(home, '.claude', 'projects', '-Users-x-web', 'bbbbbbbb-1111-2222-3333-444444444444.jsonl');
  await writeJsonl(novy, [{ type: 'user', timestamp: new Date(NOW - 3 * DEN).toISOString(), message: { content: 'Uprav barvy tlačítek' } }]);
  await fs.utimes(novy, (NOW - 3 * DEN) / 1000, (NOW - 3 * DEN) / 1000);
  const limity = { soubory: 1, bajty: 1e6, casMs: 5000, vysledky: 6 };
  const v = await najdiKonverzace({ dotaz: 'před 3 dny jsme řešili fakturaci', koreny, now: NOW, limity });
  assert.equal(v.prohledano, 1, 'druhé kolo nesmí dostat nový limit souborů');
  assert.equal(v.nedokonceno, true);
  assert.equal(v.vysledky.length, 0);
  assert.match(vetaOdpovedi(v), /nestihlo projít všechny přepisy/);

  // Období samo nedoběhlo, shoda je jen z jiné doby: věta nesmí tvrdit „v zadaném období nic“.
  const druhy = path.join(home, '.claude', 'projects', '-Users-x-web', 'cccccccc-1111-2222-3333-444444444444.jsonl');
  await writeJsonl(druhy, [{ type: 'user', timestamp: new Date(NOW - 2 * DEN).toISOString(), message: { content: 'Oprav písmo v patičce' } }]);
  await fs.utimes(druhy, (NOW - 2 * DEN) / 1000, (NOW - 2 * DEN) / 1000);
  const sessions = [{ id: 'codex:faktury', app: 'Codex', title: 'Faktury za hosting', lastAt: NOW - 60 * DEN }];
  const m = await najdiKonverzace({ dotaz: 'před 3 dny jsme řešili fakturaci', sessions, koreny, now: NOW, limity });
  assert.equal(m.mimoOkno, true);
  assert.equal(m.nedokonceno, true);
  assert.doesNotMatch(vetaOdpovedi(m), /^V zadaném období nic/);
  assert.match(vetaOdpovedi(m), /V prohledané části zadaného období nic – hledání nestihlo/);
});

test('pomocník: s omezeným rozpočtem se prohledají nejnovější přepisy, ne náhodné pořadí složky', async () => {
  const home = await tempDir('agenteeq-src-');
  const dir = path.join(home, '.claude', 'projects', '-Users-x-mnoho');
  for (let i = 0; i < 30; i++) {
    const soubor = path.join(dir, `${String(i).padStart(2, '0')}${'a'.repeat(6)}-1111-2222-3333-444444444444.jsonl`);
    const t = NOW - (i === 17 ? 1 : 40 + i) * DEN;
    await writeJsonl(soubor, [{ type: 'user', timestamp: new Date(t).toISOString(), message: { content: i === 17 ? 'Nasaď kubernetes cluster' : `Úkol číslo ${i}` } }]);
    await fs.utimes(soubor, t / 1000, t / 1000);
  }
  const v = await najdiKonverzace({ dotaz: 'najdi chat o kubernetes', koreny: [{ cesta: path.join(home, '.claude', 'projects'), app: 'Claude Code' }], now: NOW, limity: { soubory: 1, bajty: 1e6, casMs: 5000, vysledky: 6 } });
  assert.equal(v.prohledano, 1);
  assert.equal(v.vysledky.length, 1, 'nejnovější přepis se prohledá první');
  assert.match(vetaOdpovedi(v), /Nejlepší shody z prohledané části/, 'i se shodou se řekne, že hledání nedoběhlo');
});

test('pomocník: dlouhý přepis – konec konverzace se čte z konce souboru, ne z prvních megabajtů', async () => {
  const home = await tempDir('agenteeq-src-');
  const soubor = path.join(home, '.claude', 'projects', '-Users-x-dlouhy', 'dddddddd-1111-2222-3333-444444444444.jsonl');
  const stare = new Date(NOW - 100 * DEN).toISOString();
  const vypln = { type: 'assistant', timestamp: stare, message: { content: [{ type: 'text', text: 'x'.repeat(2000) }] } };
  const posledni = NOW - DEN;
  await writeJsonl(soubor, [
    { type: 'user', timestamp: stare, cwd: '/Users/x/dlouhy', message: { content: 'Začneme refaktorem' } },
    ...Array.from({ length: 1800 }, () => vypln),
    { type: 'user', timestamp: new Date(posledni).toISOString(), message: { content: 'Teď migrace databáze na Postgres' } },
  ]);
  const koreny = [{ cesta: path.join(home, '.claude', 'projects'), app: 'Claude Code' }];
  assert.ok((await fs.stat(soubor)).size > 3 * 1024 * 1024, 'soubor je delší než rozpočet na jeden přepis');
  const v = await najdiKonverzace({ dotaz: 'včera jsme řešili migraci', koreny, now: NOW });
  assert.equal(v.vysledky.length, 1, JSON.stringify(v));
  assert.equal(v.mimoOkno, false, 'konverzace pokračovala včera – patří do okna');
  assert.equal(v.vysledky[0].konec, posledni);
  assert.match(v.vysledky[0].ukazka, /migrace/);
  const nic = await najdiKonverzace({ dotaz: 'najdi chat o kubernetes', koreny, now: NOW });
  assert.equal(nic.oriznute, 1);
  assert.match(vetaOdpovedi(nic), /u velmi dlouhých přepisů jen začátek a konec – 1/, '„nic“ po neúplném čtení se řekne poctivě');
});

test('pomocník: prohledávání průběžně uvolňuje smyčku událostí (server mezitím odpovídá)', async () => {
  const home = await tempDir('agenteeq-src-');
  const dir = path.join(home, '.claude', 'projects', '-Users-x-velke');
  const radek = { type: 'assistant', timestamp: new Date(NOW - DEN).toISOString(), message: { content: [{ type: 'text', text: 'Slovo '.repeat(20) }] } };
  await writeJsonl(path.join(dir, 'eeeeeeee-1111-2222-3333-444444444444.jsonl'), Array.from({ length: 15000 }, () => radek));
  // Měří se nejdelší mezera mezi dvěma koly smyčky vůči celé době hledání – nezávisí na rychlosti stroje.
  // Bez uvolňování je jedno kolo skoro celé čtení souboru.
  let nejdelsi = 0;
  let posledni = performance.now();
  let bezi = true;
  const tik = () => { const t = performance.now(); nejdelsi = Math.max(nejdelsi, t - posledni); posledni = t; if (bezi) setImmediate(tik); };
  setImmediate(tik);
  const start = performance.now();
  const v = await najdiKonverzace({ dotaz: 'najdi chat o kubernetes', koreny: [{ cesta: path.join(home, '.claude', 'projects'), app: 'Claude Code' }], now: NOW, limity: { ...LIMITY, bajty: 3 * 1024 * 1024 } });
  bezi = false;
  const celkem = performance.now() - start;
  assert.equal(v.prohledano, 1);
  // Na rychlém stroji trvá celé hledání jen pár desítek ms a jediný 10ms úsek mezi uvolněními je pak
  // víc než třetina. Proto stačí i absolutní mez: smyčka nikdy nestojí déle než 25 ms. Bez uvolňování
  // by stála celou dobu čtení souboru – na rychlém stroji nad 25 ms, na pomalém nad třetinou.
  assert.ok(nejdelsi < 25 || nejdelsi < celkem / 3, `nejdelší blokování smyčky ${nejdelsi.toFixed(0)} ms z ${celkem.toFixed(0)} ms`);
});

// Falešná Ollama přes skutečného klienta (src/ollama.js): zaznamená každý dotaz.
function falesnaOllama(baseUrl, { tags = [], ps = [], show = {} } = {}) {
  const volani = [];
  const json = (body) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
  const fetchImpl = async (url, opts = {}) => {
    const cesta = new URL(url).pathname;
    volani.push(cesta);
    if (cesta === '/api/tags') return json({ models: tags });
    if (cesta === '/api/ps') return json({ models: ps.map((name) => ({ name })) });
    if (cesta === '/api/show') { const { model } = JSON.parse(opts.body); return show[model] ? json(show[model]) : new Response('{}', { status: 404 }); }
    return new Response('{}', { status: 404 });
  };
  return { ollama: createOllamaClient({ baseUrl, fetchImpl }), volani };
}

test('pomocník: lokální model jen z Ollamy na tomto počítači, bez cloudových a embeddingových modelů, předvídatelně', async () => {
  for (const url of ['http://127.0.0.1:11434', 'http://localhost:11434', 'http://[::1]:11434', 'http://127.0.0.2:8080']) assert.equal(ollamaNaTomtoPocitaci(url), true, url);
  for (const url of ['http://192.168.1.5:11434', 'https://ollama.com', 'http://0.0.0.0:11434', 'http://127.0.0.1.nip.io:11434', 'nesmysl', 'file:///tmp/x']) assert.equal(ollamaNaTomtoPocitaci(url), false, url);

  const vzdalena = falesnaOllama('http://192.168.1.5:11434', { tags: [{ name: 'llama3.2:3b' }] });
  assert.deepEqual(await vyberLokalniModel({ ollama: vzdalena.ollama }), { model: null, duvod: 'mimo-pocitac' });
  assert.deepEqual(vzdalena.volani, [], 'na adresu mimo počítač nejde ani dotaz na seznam modelů');

  const tags = [
    { name: 'gpt-oss:120b-cloud', remote_host: 'https://ollama.com:443', remote_model: 'gpt-oss:120b' },
    { name: 'glm-4.6:cloud', size: 1 },
    { name: 'nomic-embed-text:latest', size: 2, details: { family: 'nomic-bert' } },
    { name: 'qwen3-embedding:0.6b', size: 3, capabilities: ['embedding'] },
    { name: 'qwen2.5:14b', size: 9e9, capabilities: ['completion', 'tools'] },
    { name: 'llama3.2:3b', size: 2e9 },
  ];
  const nic = falesnaOllama('http://127.0.0.1:11434', { tags });
  assert.deepEqual(await vyberLokalniModel({ ollama: nic.ollama }), { model: 'llama3.2:3b' }, 'nic načteného → nejmenší vhodný');
  const nacteny = falesnaOllama('http://127.0.0.1:11434', { tags, ps: ['gpt-oss:120b-cloud', 'qwen2.5:14b'] });
  assert.deepEqual(await vyberLokalniModel({ ollama: nacteny.ollama }), { model: 'qwen2.5:14b' }, 'načtený lokální model má přednost, cloudový nikdy');

  const jenCloud = falesnaOllama('http://127.0.0.1:11434', { tags: tags.slice(0, 4) });
  assert.deepEqual(await vyberLokalniModel({ ollama: jenCloud.ollama }), { model: null, duvod: 'zadny-model' });

  // Bez schopností v /api/tags (starší Ollama) se kandidát ověří přes /api/show.
  const show = falesnaOllama('http://127.0.0.1:11434', { tags: [{ name: 'tajemny:1b', size: 1 }, { name: 'mistral:7b', size: 4e9 }], show: { 'tajemny:1b': { capabilities: ['embedding'] }, 'mistral:7b': { capabilities: ['completion'] } } });
  assert.deepEqual(await vyberLokalniModel({ ollama: show.ollama }), { model: 'mistral:7b' });
});

test('HTTP: /api/pomocnik formuluje jen lokálním modelem; Ollama mimo počítač se odmítne a řekne se to', async (t) => {
  const { home } = await prepisy();
  const chaty = [];
  const ollama = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      res.setHeader('Content-Type', 'application/json');
      if (req.url === '/api/tags') return res.end(JSON.stringify({ models: [{ name: 'deepseek-v3.1:671b-cloud', remote_host: 'https://ollama.com:443' }, { name: 'llama3.2:3b', size: 2e9 }] }));
      if (req.url === '/api/ps') return res.end(JSON.stringify({ models: [] }));
      if (req.url === '/api/show') return res.end(JSON.stringify({ capabilities: ['completion'] }));
      if (req.url === '/api/chat') {
        chaty.push(JSON.parse(body).model);
        return res.end(`${JSON.stringify({ message: { content: 'Jednička sedí.' } })}\n${JSON.stringify({ done: true })}\n`);
      }
      res.statusCode = 404;
      return res.end('{}');
    });
  });
  await new Promise((r) => ollama.listen(0, '127.0.0.1', r));
  t.after(() => ollama.close());
  const s = await startTestServer({ AGENTEEQ_SOURCE_HOME: home, AGENTEEQ_OLLAMA_URL: `http://127.0.0.1:${ollama.address().port}` });
  t.after(() => s.close());
  const r = await api(s.url).send('POST', '/api/pomocnik', { dotaz: 'najdi chat o fakturaci' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(chaty, ['llama3.2:3b'], 'cloudový model nikdy nedostane úryvky');
  assert.deepEqual(r.body.lokalne, { text: 'Jednička sedí.', model: 'llama3.2:3b' });
  assert.equal(r.body.modelMimoPocitac, false);
  assert.ok(r.body.rozbor.vzory.length, 'klient zvýrazní podle týchž tvarů slov');

  const vzdalena = await startTestServer({ AGENTEEQ_SOURCE_HOME: home, AGENTEEQ_OLLAMA_URL: 'http://192.0.2.1:11434' });
  t.after(() => vzdalena.close());
  const v = await api(vzdalena.url).send('POST', '/api/pomocnik', { dotaz: 'najdi chat o fakturaci' });
  assert.equal(v.status, 200);
  assert.equal(v.body.lokalne, null);
  assert.equal(v.body.modelMimoPocitac, true, 'rozhraní řekne, proč model neodpověděl');
});

test('pomocník: texty bez první osoby a bez mužského rodu („Možná jsi myslel…“)', async () => {
  const zdroje = await Promise.all(['../public/js/robot-guide.js', '../src/pomocnik.js', '../src/app.js'].map((f) => fs.readFile(new URL(f, import.meta.url), 'utf8')));
  const texty = zdroje.flatMap((z) => [...z.matchAll(/\b(?:tr|ui)\('((?:[^'\\]|\\.)*)'/g)].map((m) => m[1]))
    .filter((t) => /pomocník|hled|najd|nenaš|přepis|období|voleb|volba|Ollam|neodpovídá|Napiš, co/i.test(t));
  assert.ok(texty.length > 10, `texty pomocníka: ${texty.length}`);
  const prvniOsoba = /(?<![\p{L}])(myslel|myslela|jsem|mám|nevidím|pošlu|hledám|nemůžu|najdu|poradím|nenašel|prohledal|hledal)(?![\p{L}])/iu;
  for (const t of texty) assert.doesNotMatch(t, prvniOsoba, t);
});
