import test from 'node:test';
import assert from 'node:assert/strict';
import { prectiOknaChatGPT, oknaChatGPT } from '../src/platform.js';
import { createChatGptAppConnector, odpovidajiciChaty, klicChatu } from '../src/connectors/chatgpt-app.js';
import { createNapojeni } from '../src/napojeni.js';
import { Store } from '../src/store.js';
import { loadConfig } from '../src/config.js';
import { tempDir } from './helpers.mjs';

// Vlastník 24. 10. 2026: chaty z aplikace ChatGPT pro Mac musí být vidět stejně spolehlivě jako
// Codex. Aplikace je ukládá zašifrované, proto se čte okno přes Zpřístupnění. Žádný test nesahá
// na skutečné okno ani na osascript: čtení je podstrčené.
const fakeDatastore = () => ({ data: { sessions: {}, personas: {} }, save() {}, saveSoon() {} });
const ok = (okna) => ({ ok: true, stdout: JSON.stringify({ stav: 'ok', okna }) });

test('čtení okna: výsledek skriptu, chybějící povolení a chyba se nikdy nevydávají za „nic neběží“', async () => {
  assert.deepEqual(prectiOknaChatGPT(ok([{ nazev: 'Aktualizace Brno app', bezi: ['Aktualizace Brno app'], stop: true }])), { stav: 'ok', okna: [{ nazev: 'Aktualizace Brno app', bezi: ['Aktualizace Brno app'], stop: true }] });
  assert.deepEqual(prectiOknaChatGPT({ ok: true, stdout: '{"stav":"nebezi"}' }), { stav: 'nebezi' });
  assert.deepEqual(prectiOknaChatGPT({ ok: false, stderr: 'execution error: System Events got an error: osascript is not allowed assistive access. (-25211)' }), { stav: 'povoleni' });
  assert.deepEqual(prectiOknaChatGPT({ ok: false, stderr: 'Not authorized to send Apple events to System Events. (-1743)' }), { stav: 'povoleni' });
  assert.deepEqual(prectiOknaChatGPT({ ok: false, stderr: 'timeout' }), { stav: 'chyba' });
  assert.deepEqual(prectiOknaChatGPT({ ok: true, stdout: 'nesmysl' }), { stav: 'chyba' });
  // Řídicí znaky a nadměrná délka z okna se do aplikace nedostanou.
  const r = prectiOknaChatGPT(ok([{ nazev: 'a\u0000b'.padEnd(500, 'x'), bezi: [1, 'c\nd'], stop: 'ano' }]));
  assert.equal(r.okna[0].nazev.length, 200);
  assert.doesNotMatch(r.okna[0].nazev, /\u0000/);
  assert.deepEqual(r.okna[0].bezi, ['', 'c d']);
  assert.equal(r.okna[0].stop, false);
  // Mimo macOS se nic nespouští.
  let spusteno = false;
  assert.deepEqual(await oknaChatGPT({ jeMac: false, runImpl: async () => { spusteno = true; } }), { stav: 'nepodporovano' });
  assert.equal(spusteno, false);
});

test('čtení okna: pevný skript přes osascript, bez vstupu zvenku', async () => {
  let volani;
  await oknaChatGPT({ jeMac: true, runImpl: async (cmd, args) => { volani = [cmd, args]; return { ok: true, stdout: '{"stav":"nebezi"}' }; } });
  assert.equal(volani[0], '/usr/bin/osascript');
  assert.deepEqual(volani[1].slice(0, 3), ['-l', 'JavaScript', '-e']);
  assert.equal(volani[1].length, 4, 'skript je jediný argument, nic dalšího se nepředává');
  assert.match(volani[1][3], /com\.openai\.chat/, 'jen aplikace ChatGPT, ne Codex (com.openai.codex)');
});

test('odpovídající chaty: řádek se spinnerem nese název, jinak název okna; obecné „ChatGPT“ se nepoužije', () => {
  assert.deepEqual([...odpovidajiciChaty([{ nazev: 'ChatGPT', bezi: ['Aktualizace Brno app'], stop: true }]).values()], ['Aktualizace Brno app']);
  assert.deepEqual([...odpovidajiciChaty([{ nazev: 'Plán Q4', bezi: [''], stop: false }]).values()], ['Plán Q4']);
  assert.deepEqual([...odpovidajiciChaty([{ nazev: 'ChatGPT', bezi: [], stop: true }]).entries()], [['aktivni', '']]);
  assert.equal(odpovidajiciChaty([{ nazev: 'Plán Q4', bezi: [], stop: false }]).size, 0, 'otevřené okno samo není práce');
  assert.equal(klicChatu('Aktualizace Brno app'), klicChatu('Aktualizace Brno app'));
});

test('konektor: chat odpovídá → pracuje; přestane → hotovo; bez povolení nečerstvne s důvodem, ne „hotovo“', async () => {
  const home = await tempDir('agenteeq-chatgpt-');
  const config = loadConfig({ AGENTEEQ_SOURCE_HOME: home, AGENTEEQ_HOME: home });
  config.chatgptApp = true;
  const store = new Store({ config, datastore: fakeDatastore() });
  const fronta = [];
  const c = createChatGptAppConnector({ config, store, cti: async () => fronta.shift() || { stav: 'nebezi' }, intervalMs: 60e3 });
  const id = `chatgpt-app:${klicChatu('Aktualizace Brno app')}`;

  fronta.push({ stav: 'ok', okna: [{ nazev: 'ChatGPT', bezi: ['Aktualizace Brno app'], stop: true }] });
  await c.scan();
  let v = store.summary(id);
  assert.equal(v.status, 'working');
  assert.equal(v.title, 'Aktualizace Brno app');
  assert.equal(v.reason, 'Odpovídá v aplikaci ChatGPT');
  assert.equal(c.stavOkna(), 'ok');

  fronta.push({ stav: 'ok', okna: [{ nazev: 'ChatGPT', bezi: [], stop: false }] });
  await c.scan();
  v = store.summary(id);
  assert.equal(v.status, 'waiting');
  assert.equal(v.reason, 'Hotovo, čeká na další zadání');

  // Nová odpověď, pak ztráta povolení: „pracuje“ jen dokud je to čerstvé, pak poctivý důvod.
  fronta.push({ stav: 'ok', okna: [{ nazev: 'ChatGPT', bezi: ['Aktualizace Brno app'], stop: true }] });
  await c.scan();
  fronta.push({ stav: 'povoleni' });
  await c.scan();
  assert.equal(store.summary(id).status, 'working', 'hned po výpadku čtení ještě platí poslední pozorování');
  const s = store.get(id);
  s.runningAt -= 60e3;
  store.reevaluate();
  v = store.summary(id);
  assert.equal(v.status, 'waiting');
  assert.equal(v.stale, true);
  assert.match(v.reason, /Zpřístupnění/);
  assert.equal(c.status().state, 'error');
  c.stop();
});

test('konektor vypnutý (testy, jiný systém): nic nečte a v Napojení se neukazuje', async () => {
  const home = await tempDir('agenteeq-chatgpt-');
  const config = loadConfig({ AGENTEEQ_SOURCE_HOME: home, AGENTEEQ_HOME: home, AGENTEEQ_CHATGPT_APP: '0' });
  const store = new Store({ config, datastore: fakeDatastore() });
  let cteno = false;
  const c = createChatGptAppConnector({ config, store, cti: async () => { cteno = true; return { stav: 'ok', okna: [] }; } });
  await c.start();
  await c.scan();
  assert.equal(cteno, false);
  assert.equal(c.stavOkna(), 'vypnuto');
  const n = createNapojeni({ bins: () => ({}), run: async () => ({ ok: false }), prihlas: async () => ({ ok: false }), open: async () => ({ ok: true }), aplikace: () => ({ chatgpt: c.stavOkna() }) });
  assert.equal((await n.prehled()).some((x) => x.id === 'app:chatgpt'), false);
});

test('Napojení ChatGPT · aplikace: otevře Zpřístupnění (ne prohlížeč) a potvrdí se, až čtení projde', async () => {
  let stav = 'povoleni';
  const otevreno = [], udalosti = [];
  const n = createNapojeni({
    bins: () => ({}), run: async () => ({ ok: false }), prihlas: async () => ({ ok: false }),
    open: async (url) => { otevreno.push(url); return { ok: true }; },
    emit: (u) => udalosti.push(u), aplikace: () => ({ chatgpt: stav }), intervalMs: 5,
  });
  const radek = (await n.prehled()).find((x) => x.id === 'app:chatgpt');
  assert.equal(radek.druh, 'aplikace');
  assert.equal(radek.napojeno, false);
  const r = await n.napojit('app:chatgpt');
  // Na Linuxu (CI) nastavení Zpřístupnění neexistuje – pak poctivá chyba, nikdy prohlížeč.
  if (process.platform !== 'darwin') assert.equal(r.status, 422);
  else {
    assert.equal(r.ok, true);
    assert.match(otevreno[0], /^x-apple\.systempreferences:.*Privacy_Accessibility$/);
    stav = 'ok';
    await new Promise((res) => setTimeout(res, 30));
    assert.equal(udalosti.at(-1)?.udalost, 'napojeno');
    assert.equal(udalosti.at(-1)?.overeni, 'zpristupneni');
  }
  assert.equal(otevreno.some((u) => /^https?:/.test(u)), false, 'nikdy neotevře chat v prohlížeči');
});

test('bez tlačítka Napojit se okno nečte: macOS se po spuštění na povolení sám neptá', async () => {
  const home = await tempDir('agenteeq-chatgpt-');
  const config = loadConfig({ AGENTEEQ_SOURCE_HOME: home, AGENTEEQ_HOME: home });
  config.chatgptApp = true;
  const store = new Store({ config, datastore: fakeDatastore() });
  let cteni = 0, zapnuto = false;
  const c = createChatGptAppConnector({ config, store, cti: async () => { cteni += 1; return { stav: 'nebezi' }; }, povoleno: () => zapnuto, intervalMs: 60e3 });
  await c.start();
  await c.scan();
  assert.equal(cteni, 0);
  assert.equal(c.stavOkna(), 'nezapnuto');
  const n = createNapojeni({ bins: () => ({}), run: async () => ({ ok: false }), prihlas: async () => ({ ok: false }), open: async () => ({ ok: true }), aplikace: () => ({ chatgpt: c.stavOkna() }), zapniAplikaci: async () => { zapnuto = true; await c.scan(); } });
  assert.equal((await n.prehled()).find((x) => x.id === 'app:chatgpt').napojeno, false);
  await n.napojit('app:chatgpt');
  if (process.platform === 'darwin') assert.equal(cteni, 1, 'Napojit čtení zapne');
  c.stop();
});
