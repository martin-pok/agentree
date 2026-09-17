import test from 'node:test';
import assert from 'node:assert/strict';
import { AGENT_TYPES, MAX_AGENTS, validateEndpoint, normalizeAgent, probeAgent } from '../src/custom-agents.js';

test('Vlastní agenti: exportuje typy a limit', () => {
  assert.deepEqual(Object.keys(AGENT_TYPES).sort(), ['comfyui', 'ollama', 'openai']);
  assert.equal(AGENT_TYPES.comfyui.path, '/queue');
  assert.equal(AGENT_TYPES.ollama.path, '/api/tags');
  assert.equal(AGENT_TYPES.openai.path, '/v1/models');
  assert.equal(MAX_AGENTS, 8);
});

test('validateEndpoint: přijme lokální a privátní adresy', () => {
  assert.deepEqual(validateEndpoint('http://127.0.0.1:8188'), { ok: true, origin: 'http://127.0.0.1:8188' });
  assert.deepEqual(validateEndpoint('http://localhost:11434'), { ok: true, origin: 'http://localhost:11434' });
  assert.deepEqual(validateEndpoint('https://192.168.1.10:1234'), { ok: true, origin: 'https://192.168.1.10:1234' });
  assert.equal(validateEndpoint('http://neco.local:80').ok, true);
});

test('validateEndpoint: odmítne veřejné domény, přihlašovací údaje, jiný protokol a nesmyslný nebo příliš dlouhý vstup', () => {
  assert.equal(validateEndpoint('https://example.com').ok, false);
  assert.equal(validateEndpoint('http://user:heslo@127.0.0.1').ok, false);
  assert.equal(validateEndpoint('ftp://127.0.0.1').ok, false);
  assert.equal(validateEndpoint('').ok, false);
  assert.equal(validateEndpoint('http://' + 'a'.repeat(300)).ok, false);
  assert.equal(validateEndpoint('nedava-to-smysl').ok, false);
});

test('validateEndpoint: odmítne link-local/cloudovou metadata adresu a 0.0.0.0 vždy, i kdyby byly v jinak povoleném rozsahu', () => {
  assert.equal(validateEndpoint('http://169.254.169.254/latest/meta-data/').ok, false);
  assert.equal(validateEndpoint('http://169.254.0.1').ok, false);
  assert.equal(validateEndpoint('http://0.0.0.0:8188').ok, false);
});

test('validateEndpoint: zahodí cestu, dotaz i fragment – origin je jen schéma+host+port', () => {
  const result = validateEndpoint('http://127.0.0.1:8188/queue?x=1#y');
  assert.deepEqual(result, { ok: true, origin: 'http://127.0.0.1:8188' });
});

test('normalizeAgent: ořízne dlouhý název a odstraní řídicí znaky', () => {
  const dlouhyNazev = 'x'.repeat(50);
  const result = normalizeAgent({ name: dlouhyNazev, type: 'ollama', origin: 'http://127.0.0.1:11434' });
  assert.equal(result.ok, true);
  assert.equal(result.agent.name.length, 40);

  const sRidicimiZnaky = normalizeAgent({ name: '\u0007Moje\u0000 ComfyUI\u001f', type: 'comfyui', origin: 'http://127.0.0.1:8188' });
  assert.equal(sRidicimiZnaky.ok, true);
  assert.equal(sRidicimiZnaky.agent.name, 'Moje ComfyUI');
});

test('normalizeAgent: odmítne neznámý typ a chybějící název', () => {
  const spatnyTyp = normalizeAgent({ name: 'Test', type: 'neco-jineho', origin: 'http://127.0.0.1:8188' });
  assert.equal(spatnyTyp.ok, false);

  const bezNazvu = normalizeAgent({ name: '   ', type: 'ollama', origin: 'http://127.0.0.1:11434' });
  assert.equal(bezNazvu.ok, false);
});

test('normalizeAgent: propaguje chybu z validateEndpoint beze změny', () => {
  const result = normalizeAgent({ name: 'Test', type: 'ollama', origin: 'https://example.com' });
  assert.equal(result.ok, false);
  assert.deepEqual(result, validateEndpoint('https://example.com'));
});

test('normalizeAgent: platné id ponechá, neplatné nahradí vygenerovaným', () => {
  const platne = normalizeAgent({ id: 'muj-agent-1', name: 'Test', type: 'ollama', origin: 'http://127.0.0.1:11434' });
  assert.equal(platne.agent.id, 'muj-agent-1');

  const neplatne = normalizeAgent({ id: 'ŠPATNĚ!', name: 'Test', type: 'ollama', origin: 'http://127.0.0.1:11434' });
  assert.match(neplatne.agent.id, /^[0-9a-f]{8}$/);
});

test('normalizeAgent: neplatný čas se nahradí hodnotou now', () => {
  const result = normalizeAgent({ name: 'Test', type: 'ollama', origin: 'http://127.0.0.1:11434', addedAt: 'neplatne' }, { now: 12345 });
  assert.equal(result.agent.addedAt, 12345);
});

test('probeAgent: ComfyUI fronta – detail obsahuje počty běžících a čekajících úloh', async () => {
  const agent = { origin: 'http://127.0.0.1:8188', type: 'comfyui' };
  const fetchImpl = async () => ({
    status: 200,
    body: null,
    text: async () => JSON.stringify({ queue_running: [['a']], queue_pending: [['b'], ['c']] }),
  });
  const result = await probeAgent(agent, { fetchImpl });
  assert.equal(result.ok, true);
  assert.equal(result.running, true);
  assert.match(result.detail, /1 běží/);
  assert.match(result.detail, /2 čekají/);
  assert.ok(typeof result.at === 'number');
});

test('probeAgent: Ollama a OpenAI – detail obsahuje počet modelů', async () => {
  const ollama = { origin: 'http://127.0.0.1:11434', type: 'ollama' };
  const ollamaFetch = async () => ({ status: 200, body: null, text: async () => JSON.stringify({ models: [{}, {}, {}] }) });
  const ollamaResult = await probeAgent(ollama, { fetchImpl: ollamaFetch });
  assert.equal(ollamaResult.ok, true);
  assert.equal(ollamaResult.detail, 'Modelů: 3');

  const openai = { origin: 'http://127.0.0.1:1234', type: 'openai' };
  const openaiFetch = async () => ({ status: 200, body: null, text: async () => JSON.stringify({ data: [{}, {}, {}] }) });
  const openaiResult = await probeAgent(openai, { fetchImpl: openaiFetch });
  assert.equal(openaiResult.ok, true);
  assert.equal(openaiResult.detail, 'Modelů: 3');
});

test('probeAgent: chybějící očekávané pole se nevymýšlí, jen se ohlásí odpověď', async () => {
  const agent = { origin: 'http://127.0.0.1:11434', type: 'ollama' };
  const fetchImpl = async () => ({ status: 200, body: null, text: async () => JSON.stringify({ neco: 'jineho' }) });
  const result = await probeAgent(agent, { fetchImpl });
  assert.equal(result.ok, true);
  assert.equal(result.running, true);
  assert.equal(result.detail, 'Odpovídá');
});

test('probeAgent: nenásleduje přesměrování a volá GET s redirect: manual', async () => {
  const agent = { origin: 'http://127.0.0.1:8188', type: 'comfyui' };
  let seen;
  const fetchImpl = async (url, opts) => {
    seen = { url, opts };
    return { status: 302, body: null, text: async () => '' };
  };
  const result = await probeAgent(agent, { fetchImpl });
  assert.equal(result.ok, false);
  assert.match(result.detail, /přesměrováním/);
  assert.equal(seen.url, 'http://127.0.0.1:8188/queue');
  assert.equal(seen.opts.method, 'GET');
  assert.equal(seen.opts.redirect, 'manual');
  assert.equal(seen.opts.credentials, 'omit');
});

test('probeAgent: status mimo 2xx se ohlásí jako chyba', async () => {
  const agent = { origin: 'http://127.0.0.1:11434', type: 'ollama' };
  const fetchImpl = async () => ({ status: 500, body: null, text: async () => '' });
  const result = await probeAgent(agent, { fetchImpl });
  assert.equal(result.ok, false);
  assert.equal(result.detail, 'Služba odpověděla 500.');
});

test('probeAgent: odpověď, která není JSON, se ohlásí jako chyba', async () => {
  const agent = { origin: 'http://127.0.0.1:11434', type: 'ollama' };
  const fetchImpl = async () => ({ status: 200, body: null, text: async () => 'toto neni json' });
  const result = await probeAgent(agent, { fetchImpl });
  assert.equal(result.ok, false);
  assert.equal(result.detail, 'Odpověď není JSON.');
});

test('probeAgent: příliš velká odpověď (bez res.body) se přeruší', async () => {
  const agent = { origin: 'http://127.0.0.1:11434', type: 'ollama' };
  const velkyText = JSON.stringify({ models: [] }) + 'x'.repeat(1000);
  const fetchImpl = async () => ({ status: 200, body: null, text: async () => velkyText });
  const result = await probeAgent(agent, { fetchImpl, maxBytes: 100 });
  assert.equal(result.ok, false);
  assert.equal(result.detail, 'Odpověď je příliš velká.');
});

test('probeAgent: příliš velká odpověď čtená po kouscích přes res.body.getReader() se přeruší', async () => {
  const agent = { origin: 'http://127.0.0.1:11434', type: 'ollama' };
  const chunks = [new TextEncoder().encode('x'.repeat(60)), new TextEncoder().encode('y'.repeat(60))];
  let i = 0;
  let cancelled = false;
  const fetchImpl = async () => ({
    status: 200,
    body: {
      getReader: () => ({
        read: async () => (i < chunks.length ? { value: chunks[i++], done: false } : { value: undefined, done: true }),
        cancel: async () => { cancelled = true; },
      }),
    },
  });
  const result = await probeAgent(agent, { fetchImpl, maxBytes: 100 });
  assert.equal(result.ok, false);
  assert.equal(result.detail, 'Odpověď je příliš velká.');
  assert.equal(cancelled, true);
});

test('probeAgent: výjimka z fetche (timeout, odmítnuté spojení) se nikdy nepropaguje ven', async () => {
  const agent = { origin: 'http://127.0.0.1:8188', type: 'comfyui' };
  const fetchImpl = async () => { throw new Error('connect ECONNREFUSED'); };
  const result = await probeAgent(agent, { fetchImpl });
  assert.deepEqual({ ok: result.ok, running: result.running, detail: result.detail }, { ok: false, running: false, detail: 'Služba neodpovídá.' });
  assert.ok(typeof result.at === 'number');
});
