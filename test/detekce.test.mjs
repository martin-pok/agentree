import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import { EventEmitter } from 'node:events';
import { createDetekce, titulekSouhrnu } from '../src/detekce.js';
import { normalizeNastroje } from '../src/datastore.js';
import { startTestServer, api, tempDir, writeJsonl } from './helpers.mjs';

// Detekce agentů v činnosti: oznámí nástroj, o kterém Agenteeq zatím nic neví, jen jednou, a pamatuje
// si jen identifikátor, časy a rozhodnutí uživatele.

function prostredi({ bezi = [], pripojene = [], welcomeCompleted = true, detekce = true, cas = 1_000_000, ticho = {}, language } = {}) {
  const store = new EventEmitter();
  // `od` = start procesu, jak ho posílá src/connectors/processes.js (čas, ne doba běhu).
  store.runtimes = bezi.map((id) => ({ id, running: true, od: cas - 120_000 }));
  const datastore = { data: { nastroje: {}, settings: { welcomeCompleted, language, notifications: { native: true, detekce, ...ticho } } }, ulozeno: 0, save() { this.ulozeno++; } };
  const upozorneni = [];
  const alerts = { raise: (a) => { upozorneni.push(a); return a; } };
  const nativni = [];
  const notifier = { native: async (n) => { nativni.push(n); } };
  const hodiny = { t: cas };
  const d = createDetekce({ store, datastore, alerts, notifier, pripojene: () => new Set(pripojene), now: () => hodiny.t });
  return { d, store, datastore, upozorneni, nativni, hodiny, spust: (ids) => { store.runtimes = ids.map((id) => ({ id, running: true, od: hodiny.t - 60_000 })); store.emit('runtimes', store.runtimes); } };
}

test('nový nástroj, o kterém Agenteeq nic neví, dostane oznámení v aplikaci i v macOS', () => {
  const p = prostredi({ bezi: ['warp'] });
  p.d.start();
  assert.equal(p.datastore.data.nastroje.warp.stav, 'novy');
  assert.equal(p.upozorneni.length, 1);
  assert.equal(p.upozorneni[0].kind, 'novy-nastroj');
  assert.equal(p.upozorneni[0].bezNativniho, true, 'systémové oznámení posílá detekce sama, souhrnně');
  assert.match(p.upozorneni[0].title, /Warp/);
  assert.equal(p.nativni.length, 1);
  const nove = p.d.payload().nove;
  assert.deepEqual(nove.map((n) => n.id), ['warp']);
  assert.equal(nove[0].druh, 'terminal-aplikace');
  assert.equal(nove[0].bezi, true);
});

test('nástroj, jehož konverzace Agenteeq už čte, oznámení nedostane', () => {
  const p = prostredi({ bezi: ['claude-code', 'cursor'], pripojene: ['claude-code', 'cursor'] });
  p.d.start();
  assert.equal(p.datastore.data.nastroje['claude-code'].stav, 'znamy');
  assert.equal(p.upozorneni.length, 0);
  assert.equal(p.nativni.length, 0);
});

test('úplně nová instalace: oznámí se všechno, co běží – uživatel zatím nic nevidí', () => {
  const p = prostredi({ bezi: ['claude-code', 'warp'], pripojene: ['claude-code'], welcomeCompleted: false });
  p.d.start();
  assert.deepEqual(p.d.payload().nove.map((n) => n.id).sort(), ['claude-code', 'warp']);
  const cc = p.d.payload().nove.find((n) => n.id === 'claude-code');
  assert.equal(cc.sledovano, true, 'u Claude Code karta řekne, že konverzace už čteme');
});

test('oznámení jen poprvé; odmítnutý nástroj se už nikdy neozve', () => {
  const p = prostredi({ bezi: ['warp'] });
  p.d.start();
  p.d.rozhodni('warp', 'ignorovat');
  p.spust([]);
  p.hodiny.t += 3_600_000;
  p.spust(['warp']);
  assert.equal(p.upozorneni.length, 1, 'druhé spuštění už nic nehlásí');
  assert.equal(p.datastore.data.nastroje.warp.stav, 'ignorovany');
  assert.deepEqual(p.d.payload().nove, []);
});

test('víc nových nástrojů naráz: upozornění pro každý, v macOS jedno souhrnné', () => {
  const p = prostredi({ bezi: ['warp', 'pwa-google-ai-studio', 'pwa-replit'] });
  p.d.start();
  assert.equal(p.upozorneni.length, 3);
  assert.equal(p.nativni.length, 1);
  assert.equal(p.nativni[0].title, '3 nové AI nástroje');
  assert.match(p.nativni[0].body, /Warp.*Google AI Studio.*Replit/);
  assert.equal(titulekSouhrnu(5), '5 nových AI nástrojů');
});

test('noční ticho: zachycený agent je v aplikaci, oznámení macOS počká', () => {
  // Ticho přes celý den (00:00–23:59), ať test nezávisí na tom, kdy běží.
  const p = prostredi({ bezi: ['warp'], ticho: { quietHours: true, quietFrom: '00:00', quietTo: '23:59' }, cas: new Date(2026, 9, 3, 12).getTime() });
  p.d.start();
  assert.equal(p.upozorneni.length, 1, 'v seznamu upozornění je');
  assert.equal(p.nativni.length, 0, 'do macOS v tichu nic');
});

test('oznámení macOS jde v jazyce z Nastavení', () => {
  const jeden = prostredi({ bezi: ['warp'], language: 'en' });
  jeden.d.start();
  assert.equal(jeden.nativni[0].title, 'New AI tool: Warp');
  assert.doesNotMatch(jeden.nativni[0].body, /[áčďéěíňóřšťúůýž]/, 'popis nástroje taky anglicky');
  const vic = prostredi({ bezi: ['warp', 'kiro'], language: 'en' });
  vic.d.start();
  assert.equal(vic.nativni[0].title, '2 new AI tools');
});

test('když je okno Agenteeq vidět, do macOS se nic neposílá', () => {
  const p = prostredi();
  p.d.start();
  p.d.pritomnost(true);
  p.spust(['warp']);
  assert.equal(p.upozorneni.length, 1, 'v aplikaci ano');
  assert.equal(p.nativni.length, 0, 'okno je vidět – oznámení macOS by bylo navíc');
  p.hodiny.t += 46_000; // okno se 45 s neozvalo
  p.spust(['warp', 'kiro']);
  assert.equal(p.nativni.length, 1, 'okno už vidět není – oznámení macOS přijde');
});

test('vypnutá oznámení o detekci: nástroj se zaznamená, ale nic se neoznamuje', () => {
  const p = prostredi({ bezi: ['warp'], detekce: false });
  p.d.start();
  assert.equal(p.datastore.data.nastroje.warp.stav, 'novy');
  assert.equal(p.upozorneni.length, 0);
  assert.equal(p.nativni.length, 0);
});

test('Moje nástroje: přidání, stav běhu a odebrání', () => {
  const p = prostredi({ bezi: ['warp'] });
  p.d.start();
  const po = p.d.rozhodni('warp', 'pridat');
  assert.deepEqual(po.moje.map((m) => m.id), ['warp']);
  assert.equal(po.moje[0].bezi, true);
  assert.equal(po.moje[0].beziOd, p.hodiny.t - 120_000, 'od kdy běží, podle doby běhu procesu');
  assert.deepEqual(po.nove, [], 'rozhodnutý nástroj už není „nový“');
  p.spust([]);
  const stopnuto = p.d.payload().moje[0];
  assert.equal(stopnuto.bezi, false, 'neběžící nástroj zůstává v Mých nástrojích');
  assert.ok(stopnuto.naposledy > 0, 'a ví se, kdy běžel naposledy');
  assert.deepEqual(p.d.rozhodni('warp', 'odebrat').moje, []);
  assert.deepEqual(p.d.rozhodni('neexistuje', 'pridat'), { error: 'Neznámý nástroj nebo akce.', status: 404 });
});

test('uložený záznam neobsahuje nic osobního ani nic navíc', () => {
  const vycisteno = normalizeNastroje({
    warp: { poprve: 5, naposledy: 9, stav: 'pridany', pridano: 7, args: '/Users/jana/tajny-projekt', cwd: '/Users/jana' },
    '../zlo': { poprve: 1, stav: 'novy' },
    divny: { poprve: 1, stav: 'hacknuty' },
  });
  assert.deepEqual(vycisteno, { warp: { poprve: 5, naposledy: 9, stav: 'pridany', pridano: 7 } });
});

test('detekce v aplikaci: podstrčené procesy, existující instalace, rozhodnutí přes API', async () => {
  const home = await tempDir('detekce-src-');
  const data = await tempDir('detekce-data-');
  // Existující instalace s dokončeným průvodcem a konverzací Claude Code na disku.
  await fs.writeFile(path.join(data, 'data.json'), JSON.stringify({ settings: { welcomeCompleted: true } }));
  const t = Date.now() - 60_000;
  await writeJsonl(path.join(home, '.claude', 'projects', '-Users-x-web', 'r1.jsonl'), [
    { type: 'user', timestamp: new Date(t).toISOString(), sessionId: 'r1', cwd: '/Users/x/web', message: { role: 'user', content: 'Ahoj' } },
    { type: 'assistant', timestamp: new Date(t + 1000).toISOString(), sessionId: 'r1', message: { id: 'm1', model: 'claude-opus-5', stop_reason: 'end_turn', content: [{ type: 'text', text: 'Ahoj' }], usage: { input_tokens: 5, output_tokens: 5 } } },
  ]);
  // Podstrčený výpis procesů (místo skutečného `ps`). PID nad maximem macOS i Linuxu: detaily
  // procesu (složka, CLAUDE_CONFIG_DIR) se tak nikdy nepřečtou ze skutečného procesu na stroji.
  const PS = [
    '  9000101 00:05:00  3.0 200000 /Users/x/.local/bin/claude',
    '  9000102 00:10:00  2.0 300000 /Applications/Warp.app/Contents/MacOS/stable',
    '  9000103 00:02:00  1.0 150000 /Users/x/Applications/Chrome Apps.localized/Google AI Studio.app/Contents/MacOS/app_mode_loader',
    '  9000104 00:02:00  1.0 150000 /Users/x/Applications/Chrome Apps.localized/Adobe Express.app/Contents/MacOS/app_mode_loader',
  ].join('\n');
  const demo = await startTestServer(
    { AGENTEEQ_SOURCE_HOME: home, AGENTEEQ_HOME: data, AGENTEEQ_PROCESSES: '1', AGENTEEQ_PROCESS_MS: '200' },
    { vypisProcesu: async () => ({ ok: true, stdout: PS }) },
  );
  try {
    const klient = api(demo.url);
    let stav;
    for (let i = 0; i < 80; i++) {
      stav = (await klient.send('GET', '/api/state')).body;
      if (stav.detekce?.nove?.length >= 2) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.deepEqual(stav.detekce.nove.map((n) => n.id).sort(), ['pwa-google-ai-studio', 'warp'], 'Claude Code se čte, Adobe Express není AI');
    const warp = stav.detekce.nove.find((n) => n.id === 'warp');
    assert.equal(warp.bezi, true);
    assert.ok(Math.abs(warp.beziOd - (Date.now() - 600_000)) < 5000, 'běží deset minut');
    const alerts = stav.alerts.items.filter((a) => a.kind === 'novy-nastroj').map((a) => a.nastroj).sort();
    assert.deepEqual(alerts, ['pwa-google-ai-studio', 'warp']);

    const pridano = (await klient.send('POST', '/api/nastroje/warp/pridat', {})).body;
    assert.deepEqual(pridano.moje.map((m) => m.id), ['warp']);
    await klient.send('POST', '/api/nastroje/pwa-google-ai-studio/ignorovat', {});
    stav = (await klient.send('GET', '/api/state')).body;
    assert.deepEqual(stav.detekce.nove, []);
    assert.deepEqual(stav.detekce.moje.map((m) => m.id), ['warp']);
    const nic = await klient.send('POST', '/api/nastroje/../pridat', {});
    assert.ok(nic.status >= 400, 'nesmyslný identifikátor neprojde');
    assert.equal((await klient.send('POST', '/api/ui/pritomnost', { videt: true })).status, 200);
  } finally { await demo.close(); }
  // Rozhodnutí přežije restart.
  const ulozeno = JSON.parse(await fs.readFile(path.join(data, 'data.json'), 'utf8'));
  assert.equal(ulozeno.nastroje.warp.stav, 'pridany');
  assert.equal(ulozeno.nastroje['pwa-google-ai-studio'].stav, 'ignorovany');
  assert.equal(ulozeno.nastroje['claude-code'].stav, 'znamy');
});

test('rozpoznávání nástrojů: zrádné případy', async () => {
  const { rozpoznejNastroj } = await import('../src/connectors/processes.js');
  const { detectLocalAgents } = await import('../src/connectors/local-agents.js');
  const id = (a) => rozpoznejNastroj(a)?.id ?? null;
  // Webová aplikace „ChatGPT“ má v cestě ChatGPT.app/Contents/MacOS/ stejně jako desktopová.
  assert.equal(id('/Users/x/Applications/Chrome Apps.localized/ChatGPT.app/Contents/MacOS/app_mode_loader'), 'pwa-chatgpt');
  assert.equal(id('/Applications/ChatGPT.app/Contents/MacOS/ChatGPT'), 'chatgpt');
  assert.equal(id('/Applications/ChatGPT Atlas.app/Contents/MacOS/ChatGPT Atlas'), 'chatgpt-atlas');
  assert.equal(id('/Applications/ChatGPT.app/Contents/Resources/codex app-server'), null, 'Codex uvnitř aplikace ChatGPT se nepočítá zvlášť');
  assert.equal(id('/Applications/Warp.app/Contents/MacOS/stable'), 'warp');
  assert.equal(id('/Users/x/Applications/Chrome Apps.localized/Adobe Express.app/Contents/MacOS/app_mode_loader'), null, 'webová aplikace, ale ne AI');
  assert.equal(id('python3 -m aider --model gpt-5'), 'aider');
  // Aider s --model není „neznámý lokální model“ – je to známý nástroj.
  assert.deepEqual(detectLocalAgents('  10 00:10  5.0 100000 python3 -m aider --model gpt-5'), []);
});

test('rozhodnutí o nástroji a hlášení přítomnosti smí jen tento počítač, telefon jen čte', async () => {
  const { remoteScope } = await import('../src/remote-scope.js');
  for (const akce of ['pridat', 'ignorovat', 'rozumim', 'odebrat']) assert.equal(remoteScope('POST', `/api/nastroje/warp/${akce}`).ok, false, akce);
  assert.equal(remoteScope('POST', '/api/ui/pritomnost').ok, false);
  assert.equal(remoteScope('GET', '/api/state').ok, true, 'stav detekce telefon vidí');
});

test('přerušené hlášení přítomnosti (obnovení okna) server nezapíše jako vlastní chybu 500', async () => {
  const net = await import('node:net');
  const demo = await startTestServer();
  const chyby = [];
  const puvodni = console.error;
  console.error = (...a) => { chyby.push(a.join(' ')); };
  try {
    const { port } = new URL(demo.url);
    await new Promise((resolve) => {
      const s = net.connect(Number(port), '127.0.0.1', () => {
        // Hlavička slibuje 100 bajtů těla, dorazí 5 a spojení se zavře – jako zrušený fetch.
        s.write('POST /api/ui/pritomnost HTTP/1.1\r\nHost: 127.0.0.1\r\nX-Agenteeq: 1\r\nContent-Type: application/json\r\nContent-Length: 100\r\n\r\n{"vid');
        setTimeout(() => { s.destroy(); setTimeout(resolve, 150); }, 50);
      });
    });
  } finally {
    console.error = puvodni;
    await demo.close();
  }
  assert.deepEqual(chyby.filter((c) => c.includes('chyba požadavku')), []);
});
