import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { startTestServer, api, tempDir, writeJsonl } from './helpers.mjs';
import { appSupportDir } from '../src/platform.js';

// Simulace uživatele, který používá všechny podporované AI nástroje najednou, a ověření, že
// Agenteeq každý správně zobrazí. Nic v src/ ani public/ se tu nemění; když se najde chyba
// aplikace, test ji zachytí jako pravdivou asserci označenou { todo: '…' }, aby zbytek sady
// zůstal zelený (viz AGENTS.md a zadání úkolu).
//
// Gemini CLI a Qwen Code mají vlastní test se skutečnými formáty záznamů: test/gemini-qwen.test.mjs.
// Zachycení běžících nástrojů a Moje nástroje: test/detekce.test.mjs a test/nastroje-ui.test.mjs.

const MIN = 60e3;
const H = 3600e3;
const iso = (t) => new Date(t).toISOString();

// Vzor převzatý z test/pravdivost-dat.test.mjs: konektory načítají asynchronně,
// na výsledek se čeká smyčkou s timeoutem, ne pevným čekáním.
async function pockej(fn, { ms = 8000 } = {}) {
  const konec = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > konec) return v;
    await new Promise((r) => setTimeout(r, 100));
  }
}

// Malý lokální server, který se tváří jako Ollama (GET /api/tags) – pro test „vlastního agenta“
// (src/custom-agents.js umí jen GET, nikdy nic nezapisuje, viz jeho hlavičkový komentář).
function startFakeOllama() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      if (req.method === 'GET' && req.url === '/api/tags') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ models: [{ name: 'llama3.1:8b' }, { name: 'qwen2.5-coder:7b' }] }));
        return;
      }
      res.writeHead(404).end();
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

test('simulace: všechny podporované AI nástroje najednou', async (t) => {
  const home = await tempDir('agenteeq-vsechny-');
  const now = Date.now();

  /* ---------- 1. Claude Code: běžná konverzace + konverzace s vyčerpaným limitem relace ---------- */
  const ccProj = path.join(home, '.claude', 'projects', '-Users-x-web');
  const t0 = now - 2 * H;
  await writeJsonl(path.join(ccProj, 'web-landing.jsonl'), [
    { type: 'user', timestamp: iso(t0), cwd: '/Users/x/web', gitBranch: 'main', message: { role: 'user', content: 'Priprav navrh landing page' } },
    {
      type: 'assistant',
      timestamp: iso(t0 + 2000),
      message: {
        id: 'm1', model: 'claude-opus-5', stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Hotovo, navrh je pripraven.' }],
        usage: { input_tokens: 120, output_tokens: 45, cache_creation_input_tokens: 300, cache_read_input_tokens: 900 },
      },
    },
  ]);
  const t1 = now - 20 * MIN;
  await writeJsonl(path.join(ccProj, 'limit-session.jsonl'), [
    { type: 'user', timestamp: iso(t1), cwd: '/Users/x/web', message: { role: 'user', content: 'Pokracuj v testech' } },
    {
      type: 'assistant', timestamp: iso(t1 + 1000), isApiErrorMessage: true,
      message: { id: 'e1', model: '<synthetic>', content: [{ type: 'text', text: "You've hit your session limit · resets 11pm (Europe/Prague)" }] },
    },
  ]);

  /* ---------- 2. Codex: konverzace s tokeny, limity 5 h / týden a kredity ---------- */
  const codexId = '0199aaaa-bbbb-7ccc-8ddd-eeeeeeeeeeee';
  const codexTs = (s) => iso(now - 60000 + s * 1000);
  await writeJsonl(path.join(home, '.codex', 'sessions', '2026', '09', '20', `rollout-2026-09-20T10-00-00-${codexId}.jsonl`), [
    { timestamp: codexTs(0), type: 'session_meta', payload: { id: codexId, cwd: '/Users/x/api', originator: 'Codex Desktop', timestamp: codexTs(0) } },
    { timestamp: codexTs(1), type: 'event_msg', payload: { type: 'item_completed', item: { type: 'UserMessage', content: [{ type: 'text', text: 'Zkontroluj limity uctu' }] } } },
    {
      timestamp: codexTs(2),
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: { total_token_usage: { input_tokens: 4000, cached_input_tokens: 1500, output_tokens: 600 } },
        rate_limits: {
          limit_id: 'codex',
          primary: { used_percent: 33, window_minutes: 300, resets_at: Math.floor(now / 1000) + 3600 },
          secondary: { used_percent: 70, window_minutes: 10080, resets_at: Math.floor(now / 1000) + 3 * 86400 },
          credits: { has_credits: true, balance: '88.42' },
          plan_type: 'plus',
        },
      },
    },
  ]);

  /* ---------- 3. Cursor: skutečná SQLite databáze state.vscdb ---------- */
  let cursorDostupny = true;
  let DatabaseSync;
  try { ({ DatabaseSync } = await import('node:sqlite')); } catch { cursorDostupny = false; }
  const cursorUser = path.join(appSupportDir(home), 'Cursor', 'User');
  if (cursorDostupny) {
    const dbPath = path.join(cursorUser, 'globalStorage', 'state.vscdb');
    await fs.mkdir(path.dirname(dbPath), { recursive: true });
    await fs.mkdir(path.join(cursorUser, 'workspaceStorage', 'wsA'), { recursive: true });
    await fs.writeFile(path.join(cursorUser, 'workspaceStorage', 'wsA', 'workspace.json'), JSON.stringify({ folder: 'file:///Users/x/cursor-app' }));
    const db = new DatabaseSync(dbPath);
    db.exec('CREATE TABLE composerHeaders (composerId TEXT, workspaceId TEXT, createdAt INTEGER, lastUpdatedAt INTEGER, isArchived INTEGER, isSubagent INTEGER, value TEXT)');
    db.exec('CREATE TABLE cursorDiskKV (key TEXT PRIMARY KEY, value TEXT)');
    const cCreated = now - 2 * H;
    const cUpdated = now - 5 * MIN;
    db.prepare('INSERT INTO composerHeaders VALUES (?, ?, ?, ?, 0, 0, ?)').run('cur-1', 'wsA', cCreated, cUpdated, JSON.stringify({ hasBlockingPendingActions: false }));
    db.prepare('INSERT INTO cursorDiskKV VALUES (?, ?)').run('composerData:cur-1', JSON.stringify({
      name: 'Uprav prihlasovaci tok',
      modelConfig: { modelName: 'gpt-5.5-codex' },
      todos: [{ status: 'completed', content: 'Najit soubor' }, { status: 'in_progress', content: 'Upravit validaci', activeForm: 'Upravuje validaci' }],
      fullConversationHeadersOnly: [{ bubbleId: 'b1' }, { bubbleId: 'b2' }],
      generatingBubbleIds: [],
      status: 'idle',
      createdAt: cCreated,
      lastUpdatedAt: cUpdated,
    }));
    db.prepare('INSERT INTO cursorDiskKV VALUES (?, ?)').run('bubbleId:cur-1:b1', JSON.stringify({ type: 1, text: 'Uprav prihlasovaci tok, prosim', createdAt: cCreated }));
    db.prepare('INSERT INTO cursorDiskKV VALUES (?, ?)').run('bubbleId:cur-1:b2', JSON.stringify({ type: 2, text: 'Hotovo, upravil jsem validaci.', createdAt: cUpdated, tokenCount: { inputTokens: 80, outputTokens: 34 } }));
    db.close();
  }

  /* ---------- 4a. GitHub Copilot CLI ---------- */
  const cliT0 = now - H;
  await writeJsonl(path.join(home, '.copilot', 'session-state', 'cli-session-1.jsonl'), [
    { type: 'session.start', timestamp: iso(cliT0), data: { context: { cwd: '/Users/x/copilot-cli' }, selectedModel: 'gpt-5-copilot' } },
    { type: 'user.message', timestamp: iso(cliT0 + 1000), data: { content: 'Over stav vetve' } },
    { type: 'tool.execution_start', timestamp: iso(cliT0 + 2000), data: { toolName: 'bash', arguments: { command: 'git status' } } },
    { type: 'assistant.message', timestamp: iso(cliT0 + 3000), data: { content: 'Vetev je cista.' } },
    { type: 'usage', timestamp: iso(cliT0 + 3500), data: { inputTokens: 150, outputTokens: 60, cacheReadTokens: 20 } },
    { type: 'assistant.turn_end', timestamp: iso(cliT0 + 4000), data: {} },
  ]);

  /* ---------- 4b. GitHub Copilot ve VS Code ---------- */
  const vscodeUser = path.join(appSupportDir(home), 'Code', 'User');
  const wsDir = path.join(vscodeUser, 'workspaceStorage', 'wsB');
  await fs.mkdir(path.join(wsDir, 'chatSessions'), { recursive: true });
  await fs.writeFile(path.join(wsDir, 'workspace.json'), JSON.stringify({ folder: 'file:///Users/x/vscode-proj' }));
  const vsT0 = now - 30 * MIN;
  await fs.writeFile(path.join(wsDir, 'chatSessions', 'session-vs1.json'), JSON.stringify({
    sessionId: 'vs1',
    creationDate: iso(vsT0),
    lastMessageDate: iso(vsT0 + 5000),
    customTitle: 'Pridej prepinac tmaveho rezimu',
    requests: [{
      timestamp: iso(vsT0 + 1000),
      modelId: 'copilot/gpt-5',
      message: { text: 'Pridej prepinac tmaveho rezimu' },
      response: [
        { value: 'Pridavam ' },
        { kind: 'toolInvocationSerialized', toolId: 'editFile', pastTenseMessage: { value: 'Upraven theme.ts' } },
      ],
      result: {},
    }],
  }));

  /* ---------- 5. Vlastní agent: falešná Ollama na náhodném portu ---------- */
  const fakeOllama = await startFakeOllama();
  const ollamaPort = fakeOllama.address().port;

  /* ---------- 6. Běžící aplikace: podstrčený výpis procesů ---------- */
  // Formát řádku (viz src/connectors/processes.js): pid etime %cpu rss args. PID nad maximem macOS
  // i Linuxu – detaily procesu (složka, proměnné domova) se nikdy nečtou ze skutečného procesu.
  const ps = (pid, etime, cpu, rssKb, args) => `${pid} ${etime} ${cpu} ${rssKb} ${args}`;
  const PS = [
    // Známé nástroje – processes.js#RUNTIMES.
    ps(9000100, '02:00:00', 1.0, 204800, '/Applications/Claude.app/Contents/MacOS/Claude'),
    ps(9000101, '00:45:00', 0.5, 102400, '/usr/local/bin/claude'),
    ps(9000102, '01:30:00', 2.0, 307200, '/Applications/ChatGPT.app/Contents/MacOS/ChatGPT'),
    ps(9000103, '00:20:00', 1.5, 153600, '/opt/homebrew/bin/codex exec --skip-git-repo-check'),
    ps(9000104, '03:00:00', 3.0, 409600, '/Applications/Cursor.app/Contents/MacOS/Cursor'),
    ps(9000105, '00:10:00', 4.0, 512000, '/usr/local/bin/ollama serve'),
    // Nástroje, které Agenteeq možná nezná (ani processes.js#RUNTIMES, ani local-agents.js#KNOWN_LOCAL).
    ps(9000200, '00:05:00', 0.2, 51200, '/Applications/Warp.app/Contents/MacOS/stable'),
    ps(9000201, '00:15:00', 0.3, 61440, '/Applications/Windsurf.app/Contents/MacOS/Windsurf'),
    ps(9000202, '00:08:00', 0.4, 71680, '/Applications/Zed.app/Contents/MacOS/zed'),
    ps(9000203, '00:02:00', 0.1, 40960, '/Applications/Antigravity.app/Contents/MacOS/Antigravity'),
    ps(9000204, '00:03:00', 0.1, 40960, '/Applications/Kiro.app/Contents/MacOS/Kiro'),
    ps(9000205, '00:01:00', 0.6, 81920, '/usr/bin/python3 /opt/homebrew/bin/aider --yes-always /Users/x/repo'),
    ps(9000206, '00:04:00', 0.2, 30720, '/Users/x/.local/bin/goose session start'),
    ps(9000207, '00:01:30', 0.1, 20480, '/opt/homebrew/bin/opencode'),
    // Webová aplikace nainstalovaná jako Chrome App (viz nález u testu „Běžící aplikace“ níže).
    ps(9000208, '00:06:00', 0.3, 92160, '/Users/x/Applications/Chrome Apps.localized/Google AI Studio.app/Contents/MacOS/app_mode_loader'),
  ].join('\n');

  const demo = await startTestServer(
    { AGENTEEQ_SOURCE_HOME: home, AGENTEEQ_PROCESSES: '1', AGENTEEQ_PROCESS_MS: '200' },
    { vypisProcesu: async () => ({ ok: true, stdout: PS }) },
  );
  t.after(async () => {
    await demo.close();
    await new Promise((resolve) => fakeOllama.close(resolve));
  });
  const a = api(demo.url);

  /* ================================================================ */

  await t.test('Claude Code: konverzace i limit relace se objeví se správnými tokeny', async () => {
    const stav = await pockej(async () => {
      const r = await a.get('/api/state');
      const cc = r.body.sessions.filter((s) => s.connector === 'claude-code');
      return cc.length === 2 ? r.body : null;
    });
    assert.ok(stav, 'obě Claude Code konverzace se načetly');
    const hlavni = stav.sessions.find((s) => s.id === 'claude-code:web-landing');
    assert.ok(hlavni, 'hlavní konverzace je v přehledu');
    assert.equal(hlavni.app, 'Claude Code');
    assert.equal(hlavni.provider, 'anthropic');
    assert.deepEqual(hlavni.tokens, { input: 120, output: 45, cacheWrite: 300, cacheRead: 900 }, 'tokeny přesně podle fixtury (bez mezipaměti v hlavní metrice)');
    assert.equal(hlavni.status, 'waiting');

    const limitni = stav.sessions.find((s) => s.id === 'claude-code:limit-session');
    assert.ok(limitni, 'konverzace s vyčerpaným limitem je v přehledu');
    assert.equal(limitni.status, 'limited');

    const limit = stav.limits.find((l) => l.id === 'claude:session');
    assert.ok(limit, 'limit relace je v přehledu limitů');
    assert.equal(limit.provider, 'anthropic');
    assert.equal(limit.reached, true);

    const konektor = stav.connectors.find((c) => c.id === 'claude-code');
    assert.equal(konektor.state, 'connected');
    assert.equal(konektor.count, 2);
  });

  await t.test('Codex: tokeny, limity 5 h / týden a kredity sedí na fixturu', async () => {
    const stav = await pockej(async () => {
      const r = await a.get('/api/state');
      return r.body.sessions.some((x) => x.id === `codex:${codexId}`) ? r.body : null;
    });
    assert.ok(stav, 'Codex konverzace se načetla');
    const s = stav.sessions.find((x) => x.id === `codex:${codexId}`);
    assert.equal(s.app, 'Codex · ChatGPT app');
    assert.equal(s.provider, 'openai');
    assert.equal(s.tokens.input, 2500, '4000 vstupních tokenů mínus 1500 z mezipaměti');
    assert.equal(s.tokens.output, 600);
    assert.equal(s.tokens.cacheRead, 1500);

    const primarni = stav.limits.find((l) => l.id === 'codex:codex:primary');
    const tydenni = stav.limits.find((l) => l.id === 'codex:codex:secondary');
    assert.ok(primarni && tydenni, 'oba limity Codexu (5 h i týden) jsou v přehledu');
    assert.equal(primarni.usedPercent, 33);
    assert.equal(primarni.label, 'Limit 5 h');
    assert.equal(tydenni.usedPercent, 70);
    assert.equal(tydenni.label, 'Týdenní limit');

    const kredit = stav.credits.find((c) => c.id === 'codex');
    assert.ok(kredit, 'kredity Codexu jsou v přehledu');
    assert.equal(kredit.balance, 88.42);
  });

  if (cursorDostupny) {
    await t.test('Cursor: SQLite databáze, tokeny z bublin a plán úkolů', async () => {
      const stav = await pockej(async () => {
        const r = await a.get('/api/state');
        return r.body.sessions.some((x) => x.id === 'cursor:cur-1') ? r.body : null;
      });
      assert.ok(stav, 'Cursor konverzace se načetla');
      const s = stav.sessions.find((x) => x.id === 'cursor:cur-1');
      assert.equal(s.app, 'Cursor');
      assert.equal(s.provider, 'cursor');
      assert.equal(s.title, 'Uprav prihlasovaci tok');
      assert.equal(s.cwd, '/Users/x/cursor-app');
      assert.equal(s.model, 'gpt-5.5-codex');
      // Cursor v docs/CONNECTORS.md nese 🧪 (formát ověřen, ale bez aktivních agentů na vývojovém Macu).
      // Kód nicméně tokeny z bubbliny (tokenCount) skutečně čte a sčítá – ověřujeme tady přesně to.
      assert.equal(s.tokens.input, 80);
      assert.equal(s.tokens.output, 34);
      assert.deepEqual(s.progress, { done: 1, total: 2, current: 'Upravuje validaci' });

      const konektor = stav.connectors.find((c) => c.id === 'cursor');
      assert.equal(konektor.count, 1);
    });
  } else {
    await t.test('Cursor: SQLite databáze', { todo: 'node:sqlite není v tomto Node k dispozici (potřeba Node 22.13+)' }, () => {
      assert.fail('node:sqlite chybí');
    });
  }

  await t.test('GitHub Copilot CLI: přepis, nástroj a tokeny z eventu usage', async () => {
    const stav = await pockej(async () => {
      const r = await a.get('/api/state');
      return r.body.sessions.some((x) => x.id === 'copilot-cli:cli-session-1') ? r.body : null;
    });
    assert.ok(stav, 'Copilot CLI konverzace se načetla');
    const s = stav.sessions.find((x) => x.id === 'copilot-cli:cli-session-1');
    assert.equal(s.app, 'Copilot CLI');
    assert.equal(s.provider, 'github');
    assert.equal(s.cwd, '/Users/x/copilot-cli');
    assert.equal(s.model, 'gpt-5-copilot');
    assert.equal(s.tokens.input, 150);
    assert.equal(s.tokens.output, 60);
    assert.equal(s.tokens.cacheRead, 20);
    assert.equal(s.status, 'waiting', 'po assistant.turn_end už nepracuje');

    const konektor = stav.connectors.find((c) => c.id === 'copilot-cli');
    assert.equal(konektor.count, 1);
  });

  await t.test('GitHub Copilot ve VS Code: přepis a nástroj se načtou, tokeny se nevymýšlí', async () => {
    const stav = await pockej(async () => {
      const r = await a.get('/api/state');
      return r.body.sessions.some((x) => x.id === 'vscode-copilot:vs1') ? r.body : null;
    });
    assert.ok(stav, 'Copilot ve VS Code konverzace se načetla');
    const s = stav.sessions.find((x) => x.id === 'vscode-copilot:vs1');
    assert.equal(s.app, 'Copilot · VS Code');
    assert.equal(s.provider, 'github');
    assert.equal(s.title, 'Pridej prepinac tmaveho rezimu');
    assert.equal(s.cwd, '/Users/x/vscode-proj');
    assert.equal(s.model, 'gpt-5');
    // applyVsCodeChat (src/connectors/copilot.js) nikde nevolá addTokens – Copilot ve VS Code
    // tokeny nedává, takže musí zůstat přesně na výchozí nule, ne na vymyšleném čísle.
    assert.deepEqual(s.tokens, { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 });

    const konektor = stav.connectors.find((c) => c.id === 'vscode-copilot');
    assert.equal(konektor.count, 1);
  });

  await t.test('Webové služby přes rozšíření: párování, příjem dat, limit i dotaz jsou pravdivé, tokeny se nevymýšlí', async () => {
    const tokenHooku = JSON.parse(await fs.readFile(path.join(demo.dataHome, 'data.json'), 'utf8')).ingestToken;

    // Párování – stejný postup jako test/extension-presence.test.mjs a test/http.test.mjs.
    const kod = await a.send('POST', '/api/extension/pair-code', {});
    assert.equal(kod.status, 200);
    const origin = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';
    const parovani = await fetch(`${demo.url}/api/extension/pair`, { method: 'POST', headers: { Origin: origin, 'X-Agenteeq-Pair-Code': kod.body.code } });
    assert.equal(parovani.status, 200);
    const spareny = await parovani.json();
    // Od 0.25.0 dostane každé rozšíření vlastní klíč – klíč hooků Claude Code se mimo Mac nedostane.
    assert.ok(spareny.token && spareny.token !== tokenHooku, 'rozšíření má vlastní klíč, ne klíč hooků');
    const hlavicky = { 'X-Agenteeq-Token': spareny.token, Origin: origin };

    const stranky = [
      { site: 'chatgpt', conversationId: 'c-chatgpt-1', url: 'https://chatgpt.com/c/c-chatgpt-1', provider: 'openai', extra: { limit: 'Dosáhli jste limitu zpráv, zkuste to později.' } },
      { site: 'claude', conversationId: 'c-claude-1', url: 'https://claude.ai/chat/c-claude-1', provider: 'anthropic' },
      { site: 'gemini', conversationId: 'c-gemini-1', url: 'https://gemini.google.com/app/c-gemini-1', provider: 'google', extra: { needsInput: 'Vyber verzi návrhu' } },
      { site: 'perplexity', conversationId: 'c-perplexity-1', url: 'https://www.perplexity.ai/search/c-perplexity-1', provider: 'perplexity' },
      { site: 'grok', conversationId: 'c-grok-1', url: 'https://grok.com/chat/c-grok-1', provider: 'xai' },
      { site: 'mscopilot', conversationId: 'c-mscopilot-1', url: 'https://copilot.microsoft.com/chats/c-mscopilot-1', provider: 'microsoft' },
      { site: 'qwen', conversationId: 'c-qwen-1', url: 'https://chat.qwen.ai/c/c-qwen-1', provider: 'alibaba' },
    ];
    for (const p of stranky) {
      const r = await a.send('POST', '/api/ingest/web', {
        site: p.site,
        conversationId: p.conversationId,
        url: p.url,
        title: `Test ${p.site}`,
        generating: false,
        messages: [{ role: 'user', text: `Ahoj, potřebuji pomoct s ${p.site}` }, { role: 'assistant', text: 'Jasně, zeptej se.' }],
        ...p.extra,
      }, hlavicky);
      assert.equal(r.status, 200, `ingest ${p.site} prošel: ${JSON.stringify(r.body)}`);
    }

    const stav = await pockej(async () => {
      const r = await a.get('/api/state');
      const w = r.body.sessions.filter((s) => s.connector === 'web');
      return w.length === stranky.length ? r.body : null;
    });
    assert.ok(stav, 'všech 7 webových konverzací se objevilo');

    for (const p of stranky) {
      const s = stav.sessions.find((x) => x.id === `web:${p.site}:${p.conversationId}`);
      assert.ok(s, `${p.site} je v přehledu`);
      assert.equal(s.provider, p.provider);
      // Webové chaty tokeny nedávají (src/connectors/web.js nikde nevolá addTokens) – nesmí se objevit vymyšlené číslo.
      assert.deepEqual(s.tokens, { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 }, `${p.site}: tokeny musí zůstat na nule, ne vymyšlené`);
      // Text zpráv ani název konverzace se od 0.25.0 neukládá, i když ho starší rozšíření pošle.
      assert.ok(!(s.title || '').includes('Test'), `${p.site}: název z webu se neuložil`);
      assert.ok(!JSON.stringify(s.transcript || []).includes('Ahoj'), `${p.site}: text zprávy se neuložil`);
    }

    const chatgptSession = stav.sessions.find((x) => x.id === 'web:chatgpt:c-chatgpt-1');
    assert.equal(chatgptSession.status, 'limited', 'hláška limitu od zdroje se pravdivě promítne do stavu');
    assert.equal(chatgptSession.limit.text, 'Dosáhli jste limitu zpráv, zkuste to později.');

    const geminiSession = stav.sessions.find((x) => x.id === 'web:gemini:c-gemini-1');
    assert.equal(geminiSession.status, 'needs_input');
    assert.equal(geminiSession.pending.text, 'Vyber verzi návrhu');

    const konektor = stav.connectors.find((c) => c.id === 'web');
    assert.equal(konektor.state, 'connected');
    assert.equal(konektor.count, stranky.length);
  });

  await t.test('Vlastní agent (Ollama-kompatibilní server): registrace a stav přes GET /api/tags', async () => {
    const r = await a.send('POST', '/api/custom-agents', { name: 'Moje Ollama', type: 'ollama', url: `http://127.0.0.1:${ollamaPort}` });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const agent = r.body.agents.find((x) => x.name === 'Moje Ollama');
    assert.ok(agent, 'vlastní agent je v seznamu');
    assert.equal(agent.type, 'ollama');
    assert.equal(agent.running, true);
    assert.equal(agent.ok, true);
    assert.equal(agent.detail, 'Modelů: 2');

    const seznam = await a.get('/api/custom-agents');
    assert.equal(seznam.status, 200);
    assert.equal(seznam.body.agents.length, 1);
    assert.ok(seznam.body.types.some((x) => x.id === 'ollama'));
  });

  await t.test('Běžící aplikace: známé nástroje se poznají, ostatní ne', async () => {
    const stav = await pockej(async () => {
      const r = await a.get('/api/state');
      return r.body.runtimes.some((x) => x.running) ? r.body : null;
    });
    assert.ok(stav, 'seznam běžících aplikací se naplnil');

    const runtime = (id) => stav.runtimes.find((x) => x.id === id);
    for (const id of ['claude-desktop', 'claude-code', 'chatgpt', 'codex', 'cursor', 'ollama']) {
      assert.equal(runtime(id)?.running, true, `${id} v podstrčeném výpisu procesů běží, RUNTIMES ho musí poznat`);
    }
    for (const id of ['copilot-cli', 'vscode', 'ms-copilot', 'gemini-cli', 'qwen-code', 'perplexity', 'grok', 'lmstudio']) {
      assert.equal(runtime(id)?.running, false, `${id} ve výpisu nebyl, nesmí svítit jako běžící`);
    }

    // local-agents.js má vlastní katalog (KNOWN_LOCAL) – z podstrčeného výpisu smí poznat jen Ollamu.
    // Warp, Windsurf, Zed, Google Antigravity, Kiro, aider, goose a opencode nejsou ani v RUNTIMES,
    // ani v KNOWN_LOCAL, ani nesplňují heuristiku „neznámý model“ – Agenteeq o nich neví nic.
    assert.equal(stav.localAgents.length, 1, 'jen Ollama by měla být rozpoznaná; nic z neznámého seznamu se nesmí falešně objevit');
    assert.equal(stav.localAgents[0].id, 'ollama');
    assert.equal(stav.localAgents[0].source, 'known');
  });

  await t.test('scénář „všechno najednou“: přesné počty, nic se neztratilo ani nezdvojilo', async () => {
    const r = await a.get('/api/state');
    const pocet = (id) => r.body.sessions.filter((s) => s.connector === id).length;
    assert.equal(pocet('claude-code'), 2);
    assert.equal(pocet('codex'), 1);
    assert.equal(pocet('cursor'), cursorDostupny ? 1 : 0);
    assert.equal(pocet('copilot-cli'), 1);
    assert.equal(pocet('vscode-copilot'), 1);
    assert.equal(pocet('web'), 7);
    assert.equal(r.body.customAgents.length, 1);
    assert.equal(r.body.localAgents.length, 1);
  });
});
