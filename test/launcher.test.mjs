import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { launchTargets, planLaunch, writePromptFile } from '../src/launcher.js';
import { createOllamaClient } from '../src/ollama.js';
import { createLocalChat } from '../src/local-chat.js';
import { Store } from '../src/store.js';
import { loadConfig } from '../src/config.js';
import { deriveStatus } from '../src/model.js';
import { tempDir, waitFor, fakeDatastore } from './helpers.mjs';

const ENV = {
  bins: { claude: '/opt/bin/claude', codex: '/Applications/Chat GPT/codex' },
  chatgptApp: true,
  ollama: { ok: true, models: [{ name: 'llama3.2:3b' }] },
};

test('nabídka agentů podle toho, co je nainstalované', () => {
  const t = Object.fromEntries(launchTargets(ENV).map((x) => [x.id, x]));
  assert.deepEqual(t['claude-code'].modes, ['background', 'terminal'], 'bez aplikace Claude jen CLI');
  assert.deepEqual(t.codex.modes, ['app', 'background', 'terminal'], 'Terminál až jako poslední volba');
  assert.deepEqual(launchTargets({ ...ENV, claudeApp: true }).find((x) => x.id === 'claude-code').modes, ['app', 'background', 'terminal']);
  assert.deepEqual(t.ollama.models, ['llama3.2:3b']);
  assert.ok(t.chatgpt && t['claude-web'] && t.perplexity && t.gemini && t.grok && t.mscopilot && t.qwen);
  assert.equal(t['gemini-cli'], undefined);
  const bare = launchTargets({ bins: {}, chatgptApp: false, ollama: { ok: false, models: [] } }).map((x) => x.id);
  assert.ok(!bare.includes('claude-code') && !bare.includes('codex') && !bare.includes('ollama'));
});

test('Claude Code: Terminál se zadáním ze souboru, pozadí s ID session a oprávněním', async () => {
  const dir = await tempDir();
  const file = path.join(dir, 'p.txt');
  const uuid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const t = await planLaunch({ agent: 'claude-code', mode: 'terminal', prompt: 'Oprav "testy" && rm -rf ~', cwd: dir }, ENV, { promptFile: file, sessionUuid: uuid });
  assert.equal(t.ok, true);
  assert.equal(t.plan.command, `cd '${dir}' && '/opt/bin/claude' --session-id ${uuid} -- "$(cat '${file}')"`);
  assert.equal(t.plan.sessionId, `claude-code:${uuid}`, 'session z Terminálu jde rovnou zařadit do projektu');
  assert.ok(!t.plan.command.includes('rm -rf'), 'zadání nikdy není součástí příkazu');

  const b = await planLaunch({ agent: 'claude-code', mode: 'background', prompt: '-p škodlivý', cwd: dir, permission: 'acceptEdits' }, ENV, { sessionUuid: '11111111-2222-3333-4444-555555555555' });
  assert.deepEqual(b.plan.argv, ['/opt/bin/claude', '-p', '--session-id', '11111111-2222-3333-4444-555555555555', '--permission-mode', 'acceptEdits', '--', '-p škodlivý']);
  assert.equal(b.plan.sessionId, 'claude-code:11111111-2222-3333-4444-555555555555');
  assert.equal((await planLaunch({ agent: 'claude-code', mode: 'background', prompt: 'x', cwd: dir }, ENV)).plan.permission, 'plan');
  assert.equal((await planLaunch({ agent: 'claude-code', mode: 'background', prompt: 'x', cwd: dir, permission: 'bypassPermissions' }, ENV)).field, 'permission');
});

test('Claude Code v aplikaci Claude: nová konverzace se zadáním a složkou, dlouhé zadání přes schránku', async () => {
  const dir = await tempDir();
  const env = { ...ENV, claudeApp: true };
  const r = await planLaunch({ agent: 'claude-code', mode: 'app', prompt: 'Oprav hlavičku & ceník', cwd: dir }, env);
  assert.equal(r.ok, true);
  const url = new URL(r.plan.args[0]);
  assert.equal(`${url.protocol}//${url.host}${url.pathname}`, 'claude://code/new');
  assert.equal(url.searchParams.get('q'), 'Oprav hlavičku & ceník');
  assert.equal(url.searchParams.get('folder'), dir);
  assert.equal(r.plan.handoff, 'confirm');
  const noFolder = await planLaunch({ agent: 'claude-code', mode: 'app', prompt: 'Ahoj' }, env);
  assert.equal(noFolder.plan.args[0], 'claude://code/new?q=Ahoj', 'složka je u aplikace nepovinná');
  assert.equal((await planLaunch({ agent: 'claude-code', mode: 'app', prompt: 'x', cwd: 'relativni' }, env)).field, 'cwd');
  const long = await planLaunch({ agent: 'claude-code', mode: 'app', prompt: 'x'.repeat(7000) }, env);
  assert.equal(long.plan.args[0], 'claude://code/new');
  assert.equal(long.plan.copyPrompt, true);
  assert.equal(long.plan.handoff, 'paste');
  assert.equal((await planLaunch({ agent: 'claude-code', mode: 'app', prompt: 'x' }, ENV)).field, 'mode', 'bez nainstalované aplikace Claude režim není');
});

test('Codex: aplikace s předvyplněným zadáním, exec na pozadí se sandboxem', async () => {
  const dir = await tempDir();
  const app = await planLaunch({ agent: 'codex', mode: 'app', prompt: 'Přidej dark mode & testy' }, ENV);
  assert.deepEqual(app.plan.args, ['codex://threads/new?prompt=P%C5%99idej%20dark%20mode%20%26%20testy']);
  assert.equal(app.plan.copyPrompt, false);
  const bg = await planLaunch({ agent: 'codex', mode: 'background', prompt: 'Refaktor', cwd: dir, sandbox: 'workspace-write' }, ENV);
  assert.deepEqual(bg.plan.argv, ['/Applications/Chat GPT/codex', 'exec', '--skip-git-repo-check', '-C', dir, '-s', 'workspace-write', '--', 'Refaktor']);
  const term = await planLaunch({ agent: 'codex', mode: 'terminal', prompt: 'x', cwd: dir }, ENV, { promptFile: '/tmp/p.txt' });
  assert.equal(term.plan.command, `cd '${dir}' && '/Applications/Chat GPT/codex' -- "$(cat '/tmp/p.txt')"`);
});

test('web, Ollama a validace vstupů', async () => {
  const dir = await tempDir();
  const web = await planLaunch({ agent: 'chatgpt', mode: 'web', prompt: 'Ahoj světe?' }, ENV);
  assert.deepEqual(web.plan.args, ['https://chatgpt.com/?q=Ahoj%20sv%C4%9Bte%3F']);
  assert.equal(web.plan.copyPrompt, true);
  assert.deepEqual((await planLaunch({ agent: 'gemini', mode: 'web', prompt: 'x' }, ENV)).plan.args, ['https://gemini.google.com/app']);
  assert.deepEqual((await planLaunch({ agent: 'gemini', mode: 'web', prompt: 'x', browserHandoffId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' }, ENV)).plan.args, ['https://gemini.google.com/app#agentree-handoff=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee']);
  assert.equal((await planLaunch({ agent: 'chatgpt', mode: 'web', prompt: 'x'.repeat(7000) }, ENV)).plan.args[0], 'https://chatgpt.com/');

  assert.equal((await planLaunch({ agent: 'ollama', mode: 'local', prompt: 'x' }, ENV)).plan.model, 'llama3.2:3b');
  assert.equal((await planLaunch({ agent: 'ollama', mode: 'local', prompt: 'x', model: 'neni' }, ENV)).field, 'model');

  assert.equal((await planLaunch({ agent: 'neznamy', mode: 'web', prompt: 'x' }, ENV)).field, 'agent');
  assert.equal((await planLaunch({ agent: 'chatgpt', mode: 'terminal', prompt: 'x' }, ENV)).field, 'mode');
  assert.equal((await planLaunch({ agent: 'chatgpt', mode: 'web', prompt: '   ' }, ENV)).field, 'prompt');
  assert.equal((await planLaunch({ agent: 'claude-code', mode: 'terminal', prompt: 'x' }, ENV)).field, 'cwd');
  assert.equal((await planLaunch({ agent: 'claude-code', mode: 'terminal', prompt: 'x', cwd: 'relativni/cesta' }, ENV)).field, 'cwd');
  assert.equal((await planLaunch({ agent: 'claude-code', mode: 'terminal', prompt: 'x', cwd: path.join(dir, 'neni') }, ENV)).error, 'Tato složka neexistuje.');
  assert.equal((await planLaunch({ agent: 'claude-code', mode: 'terminal', prompt: 'x'.repeat(20001), cwd: dir }, ENV)).field, 'prompt');

  const f = await writePromptFile(path.join(dir, 'prompts'), 'Text s "uvozovkami"');
  assert.match(f, /\.txt$/);
});

test('lokální chat přes Ollamu: streamovaná odpověď, historie, tokeny a chyba modelu', async () => {
  const bodies = [];
  const server = http.createServer((req, res) => {
    if (req.url === '/api/tags') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ models: [{ name: 'llama3.2:3b', size: 2e9 }] }));
      return;
    }
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const body = JSON.parse(raw);
      bodies.push(body);
      if (body.model !== 'llama3.2:3b') {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'model not found' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
      res.write(`${JSON.stringify({ message: { role: 'assistant', content: 'Ahoj' } })}\n`);
      setTimeout(() => {
        res.write(`${JSON.stringify({ message: { role: 'assistant', content: ', jak ti pomohu?' } })}\n`);
        res.end(`${JSON.stringify({ done: true, prompt_eval_count: 5, eval_count: 7 })}\n`);
      }, 30);
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const ollama = createOllamaClient({ baseUrl });
    assert.deepEqual((await ollama.models()).models.map((m) => m.name), ['llama3.2:3b']);
    const home = await tempDir();
    const store = new Store({ config: loadConfig({ AGENTREE_SOURCE_HOME: home, AGENTREE_HOME: home }), datastore: fakeDatastore() });
    const chat = createLocalChat({ store, ollama });

    const id = chat.start({ model: 'llama3.2:3b', prompt: 'Pozdrav mě' });
    const s = store.get(id);
    assert.equal(deriveStatus(s, Date.now()).status, 'working');
    await waitFor(() => !s.running);
    assert.deepEqual(s.transcript.map((e) => [e.role, e.text]), [['user', 'Pozdrav mě'], ['assistant', 'Ahoj, jak ti pomohu?']]);
    assert.equal(s.tokens.input, 5);
    assert.equal(s.tokens.output, 7);
    assert.equal(deriveStatus(s, Date.now()).status, 'waiting');

    assert.equal(chat.reply(id, 'Díky').ok, true);
    assert.equal(chat.reply(id, 'Ještě').status, 409, 'během odpovědi nejde poslat další zprávu');
    await waitFor(() => !s.running);
    assert.equal(bodies.at(-1).messages.length, 3, 'model dostane celou historii');
    assert.equal(chat.reply('local-chat:neni', 'x').status, 404);

    const badId = chat.start({ model: 'neexistujici', prompt: 'x' });
    await waitFor(() => !store.get(badId).running);
    assert.equal(store.get(badId).transcript.at(-1).role, 'error');
    assert.match(store.get(badId).transcript.at(-1).text, /model not found/);
  } finally {
    server.close();
  }
});
