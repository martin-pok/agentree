import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import { pouzivaneNastroje, nastrojeBezDat, zivy, kdeKdy, coVidim, sluzbaUtraty, predplatneHref } from '../public/js/nastroje.js';
import { limitsAll } from '../public/js/limits-ui.js';
import { RUNTIMES } from '../src/connectors/processes.js';
import { SERVICES } from '../src/spend.js';
import { startTestServer, api, tempDir } from './helpers.mjs';

// Jak se zachycené nástroje ukazují v rozhraní: Přehled, přehled limitů, Moje nástroje.
// Pravidlo: ukázat všechno, co uživatel opravdu používá, a nic, co ani nemá.

const T = Date.UTC(2026, 8, 24, 12, 0);
const rt = (id, running, extra = {}) => ({ id, name: id, provider: 'other', running, od: running ? T - 600e3 : 0, konektory: [], ...extra });
const radek = (id, extra = {}) => ({ id, name: id, provider: 'other', druh: 'terminal', poprve: T - 3600e3, naposledy: T - 3600e3, ...extra });

test('Přehled: běžící, přidané a dřív viděné nástroje ano, cizí a odmítnuté ne', () => {
  const state = {
    runtimes: [
      rt('claude-code', true, { konektory: ['claude-code'] }),
      // Kdo má jen Claude Code, nemá vidět „Claude Desktop · neběží“, i když sdílí zdroj dat.
      rt('claude-desktop', false, { konektory: ['claude-code', 'claude-desktop-usage'] }),
      rt('warp', false),
      rt('codex', false, { konektory: ['codex'] }),
      rt('windsurf', false),
      rt('pwa-google-ai-studio', true),
    ],
    connectors: [{ id: 'claude-code', state: 'connected' }, { id: 'codex', state: 'connected' }],
    detekce: { nove: [], moje: [radek('warp')], ignorovane: [radek('pwa-google-ai-studio')], videne: ['claude-code', 'codex', 'warp', 'pwa-google-ai-studio'] },
  };
  assert.deepEqual(pouzivaneNastroje(state).map((r) => r.id).sort(), ['claude-code', 'codex', 'warp']);
  // Starší server bez detekce: jen to, co běží.
  assert.deepEqual(pouzivaneNastroje({ runtimes: state.runtimes }).map((r) => r.id).sort(), ['claude-code', 'pwa-google-ai-studio']);
});

test('stav běhu se bere z živého seznamu procesů, ne ze zapamatovaného záznamu', () => {
  const zaznam = radek('warp', { bezi: true, beziOd: T - 7200e3 });
  const n = zivy(zaznam, [rt('warp', false)], T);
  assert.equal(n.bezi, false, 'nástroj mezitím skončil');
  assert.match(kdeKdy(n, T), /naposledy běžel/);
  const b = zivy(radek('warp'), [rt('warp', true)], T);
  assert.equal(b.beziOd, T - 600e3);
  assert.match(kdeKdy(b, T), /^Agent v terminálu · běží od \d{2}:\d{2}$/);
  assert.equal(zivy(zaznam, [], T), zaznam, 'bez údaje o procesech se nic nepředstírá');
  assert.equal(kdeKdy({ druh: 'neznamy' }, T), 'AI nástroj', 'neznámý druh ani čas nevymýšlí');
});

test('co Agenteeq vidí: přesná věta u sdílených zdrojů, poctivá u nesledovaných', () => {
  assert.match(coVidim({ sledovano: false }), /číst neumím/);
  // Claude Code bez záznamů na disku: Agenteeq ho číst umí, jen zatím nemá co.
  assert.doesNotMatch(coVidim({ sledovano: false, umiCist: true }), /neumím/);
  assert.match(coVidim({ sledovano: true }), /už čtu/);
  const chatgpt = RUNTIMES.find((r) => r.id === 'chatgpt');
  assert.match(coVidim({ sledovano: true, vidim: chatgpt.vidim }), /Běžné chaty z aplikace ne/);
  const desktop = RUNTIMES.find((r) => r.id === 'claude-desktop');
  assert.match(desktop.vidim, /Běžné chaty z aplikace ne/);
});

test('katalog: rozšíření pro Chrome se nevydává za zdroj dat desktopové aplikace', () => {
  for (const r of RUNTIMES) {
    if (r.druh === 'webova-aplikace') continue;
    assert.ok(!(r.konektory || []).includes('web'), `${r.id}: rozšíření čte webovou záložku, ne aplikaci`);
  }
  // Sdílený zdroj (záložka Code v Claude Desktop čte Claude Code, Codex v ChatGPT čte Codex):
  // obecnou větu „konverzace a tokeny už čtu“ smí mít nanejvýš jeden z nástrojů, ostatní říkají přesně co.
  const podleZdroje = new Map();
  for (const r of RUNTIMES) for (const k of r.konektory || []) podleZdroje.set(k, [...(podleZdroje.get(k) || []), r]);
  for (const [k, nastroje] of podleZdroje) {
    const obecne = nastroje.filter((r) => !r.vidim).map((r) => r.id);
    assert.ok(obecne.length <= 1, `zdroj ${k}: ${obecne.join(', ')} by tvrdily totéž`);
  }
});

test('předplatné z Mých nástrojů míří na existující službu Útraty', () => {
  for (const r of RUNTIMES) assert.ok(SERVICES[sluzbaUtraty(r.id)], `${r.id} → ${sluzbaUtraty(r.id)}`);
  assert.equal(sluzbaUtraty('warp'), 'other');
  const q = new URLSearchParams(predplatneHref({ id: 'warp', name: 'Warp & spol.' }).split('?')[1]);
  assert.equal(q.get('sluzba'), 'other');
  assert.equal(q.get('poznamka'), 'Warp & spol.', 'název se v adrese nerozbije');
});

test('přehled limitů ukáže i přidaný nástroj bez dat, poctivě a bez zdvojení', () => {
  const state = {
    runtimes: [rt('warp', true), rt('claude-code', true, { konektory: ['claude-code'] })],
    connectors: [{ id: 'claude-code', state: 'connected' }],
    sessions: new Map(),
    limits: [],
    detekce: { nove: [radek('claude-code', { sledovano: true })], moje: [radek('warp', { name: 'Warp' })], ignorovane: [], videne: [] },
  };
  const bez = nastrojeBezDat(state, new Set(['claude-code']), T);
  assert.deepEqual(bez.map((n) => n.id), ['warp'], 'Claude Code má vlastní řádek');
  const html = limitsAll(state, T);
  assert.match(html, /<b>Warp<\/b>/);
  assert.match(html, /Limity ani tokeny z něj Agenteeq zatím nečte/);
  assert.match(html, /0 z 8 s měřeným limitem/, '7 sledovaných nástrojů + Warp');
  assert.equal(html.match(/<b>Claude<\/b>/g).length, 1);
});

test('přepínač „Nově zachycený agent“ se uloží a přežije restart', async () => {
  const home = await tempDir('nastroje-src-');
  const data = await tempDir('nastroje-data-');
  const demo = await startTestServer({ AGENTEEQ_SOURCE_HOME: home, AGENTEEQ_HOME: data });
  try {
    const r = await api(demo.url).send('PUT', '/api/settings', { notifications: { detekce: false } });
    assert.equal(r.status, 200);
    assert.equal(r.body.settings.notifications.detekce, false);
  } finally { await demo.close(); }
  const ulozeno = JSON.parse(await fs.readFile(path.join(data, 'data.json'), 'utf8'));
  assert.equal(ulozeno.settings.notifications.detekce, false);
});

test('detekce posílá seznam viděných nástrojů jen z katalogu', async () => {
  const home = await tempDir('nastroje-src-');
  const data = await tempDir('nastroje-data-');
  await fs.writeFile(path.join(data, 'data.json'), JSON.stringify({
    settings: { welcomeCompleted: true },
    nastroje: { warp: { poprve: T, naposledy: T, stav: 'znamy' }, 'zmizely-nastroj': { poprve: T, naposledy: T, stav: 'znamy' } },
  }));
  const demo = await startTestServer({ AGENTEEQ_SOURCE_HOME: home, AGENTEEQ_HOME: data });
  try {
    const stav = (await api(demo.url).send('GET', '/api/state')).body;
    assert.deepEqual(stav.detekce.videne, ['warp'], 'nástroj, který z katalogu zmizel, se neukazuje');
  } finally { await demo.close(); }
});
