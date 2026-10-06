import test from 'node:test';
import assert from 'node:assert/strict';
import { KNOWN_LOCAL, detectLocalAgents, parseListeningPorts, createLocalAgentsConnector } from '../src/connectors/local-agents.js';
import { createProcessesConnector } from '../src/connectors/processes.js';
import { loadConfig } from '../src/config.js';
import { Store } from '../src/store.js';
import { fakeDatastore } from './helpers.mjs';

test('Lokální agenti: pozná známé nástroje, heuristikou i neznámý python proces, systémové a vlastní procesy nikdy', () => {
  const lines = [
    // Ollama.
    '100 1 00:10 5.0 102400 /usr/local/bin/ollama serve',
    // LM Studio (cesta k .app obsahuje mezery).
    '101 1 00:05 2.0 51200 /Users/x/Applications/LM Studio.app/Contents/MacOS/LM Studio --headless',
    // llama.cpp s .gguf modelem.
    '102 1 00:20 10.0 204800 /usr/local/bin/llama-server -m /Users/x/models/llama-2-7b.Q4_K_M.gguf --port 8090',
    // ComfyUI (main.py v cestě s ComfyUI).
    '103 1 00:30 15.0 307200 /usr/bin/python3 /Users/x/ComfyUI/main.py --listen',
    // vLLM.
    '104 1 00:15 20.0 409600 python3 -m vllm.entrypoints.openai.api_server --model mistral-7b',
    // Neznámý python proces s modelem – musí spadnout do heuristiky, ne do katalogu.
    '105 1 00:02 1.0 20480 python3 /Users/x/run_model.py --model mistral-7b --port 5001',
    // Pět nesouvisejících procesů – nikdy se nesmí objevit ve výsledku.
    '200 1 01:00 0.0 10240 /System/Library/CoreServices/Finder.app/Contents/MacOS/Finder',
    '201 1 00:40 0.5 51200 /Applications/Safari.app/Contents/MacOS/Safari',
    '202 1 00:05 0.1 5120 /System/Library/Frameworks/CoreServices.framework/Versions/A/Support/mdworker_shared',
    '203 1 00:01 0.0 20480 node --test test/local-agents.test.mjs',
    '204 1 00:03 0.2 40960 /Users/m/agenteeq/bin/agenteeq.mjs',
  ].join('\n');

  const found = detectLocalAgents(lines);
  const byId = Object.fromEntries(found.map((f) => [f.id, f]));

  assert.equal(found.length, 6, 'jen šest skutečných agentů, nic ze systémových/vlastních procesů');
  assert.equal(byId['ollama'].source, 'known');
  assert.equal(byId['ollama'].confidence, 'vysoká');
  assert.equal(byId['lmstudio'].confidence, 'vysoká');
  assert.equal(byId['llama-cpp'].model, 'llama-2-7b.Q4_K_M');
  assert.equal(byId['comfyui'].source, 'known');
  assert.equal(byId['vllm'].model, 'mistral-7b');

  const heuristicIds = found.filter((f) => f.source === 'heuristika').map((f) => f.id);
  assert.equal(heuristicIds.length, 1, 'neznámý python proces se pozná jen jednou, heuristikou');
  const unknown = found.find((f) => f.source === 'heuristika');
  assert.equal(unknown.confidence, 'nízká');
  assert.equal(unknown.model, 'mistral-7b');
  assert.ok(unknown.note.length > 0, 'heuristika musí vysvětlit, proč proces označila');

  for (const id of ['finder', 'safari', 'mdworker']) assert.equal(id in byId, false);
  assert.equal(found.some((f) => f.pid === 203 || f.pid === 204), false, 'node --test i Agenteeq sám se nikdy neoznačí');
});

test('Heuristika: neznámý proces se souborem modelu se pozná i bez katalogu', () => {
  const line = '300 1 00:05 2.0 40960 python3 server.py --model /Users/x/models/qwen2.5-7b-instruct-q4.gguf --port 8000';
  const found = detectLocalAgents(line);
  assert.equal(found.length, 1);
  assert.equal(found[0].source, 'heuristika');
  assert.equal(found[0].confidence, 'nízká');
  assert.equal(found[0].model, 'qwen2.5-7b-instruct-q4');
  assert.ok(found[0].note.length > 0);
});

test('Heuristika: neznámý proces se pozná i jen podle typického portu (python/node)', () => {
  const line = '400 1 00:01 0.0 20480 node dist/server.js';
  const found = detectLocalAgents(line, { ports: [{ port: 11434, pid: 400, command: 'node' }] });
  assert.equal(found.length, 1);
  assert.equal(found[0].source, 'heuristika');
  assert.equal(found[0].confidence, 'nízká');
  assert.equal(found[0].port, 11434);
});

test('Heuristika: samotné slovo z cesty k domovské složce bez zátěže a bez portu nestačí', () => {
  const line = '500 1 00:00 0.0 10240 /Users/m/Projects/moje-llama-poznamky/node_modules/.bin/next dev';
  assert.deepEqual(detectLocalAgents(line), []);
});

test('Seskupení: tři procesy stejného nástroje dají jeden záznam se součtem CPU a nejdelším uptime', () => {
  const lines = [
    '10 1 00:10 5.0 102400 /usr/local/bin/ollama serve',
    '11 1 00:05 3.0 51200 /usr/local/bin/ollama runner --model llama3',
    '12 1 00:01 1.0 20480 /usr/local/bin/ollama runner --model llama3',
  ].join('\n');
  const [ollama] = detectLocalAgents(lines);
  assert.equal(ollama.id, 'ollama');
  assert.equal(ollama.processes, 3);
  assert.equal(ollama.cpu, 9);
  assert.equal(ollama.pid, 10, 'zůstává proces s nejdelším uptime (00:10)');
  assert.equal(ollama.model, 'llama3');
});

test('Robustnost: prázdný, chybějící a nesmyslný vstup nikdy nevyhodí výjimku', () => {
  assert.deepEqual(detectLocalAgents(''), []);
  assert.deepEqual(detectLocalAgents(null), []);
  assert.deepEqual(detectLocalAgents(undefined), []);
  assert.deepEqual(detectLocalAgents('   \n  \n'), []);
  assert.deepEqual(detectLocalAgents(Buffer.from([0, 1, 2, 255, 254])), []);
  assert.deepEqual(detectLocalAgents('totálně nesmyslný řádek bez struktury'), []);
  assert.deepEqual(detectLocalAgents('42 dobrý-formát-etime-není 1 1', { ports: 'nesmysl' }), []);
});

test('parseListeningPorts: rozpozná porty z výpisu lsof včetně IPv6 a přeskočí hlavičku', () => {
  const out = [
    'COMMAND   PID   USER   FD   TYPE DEVICE SIZE/OFF NODE NAME',
    'ollama    100   m      10u  IPv4 0x1        0t0  TCP  *:11434 (LISTEN)',
    'python3   105   m      5u   IPv4 0x2        0t0  TCP  127.0.0.1:1234 (LISTEN)',
    'node      400   m      6u   IPv6 0x3        0t0  TCP  [::1]:8080 (LISTEN)',
  ].join('\n');
  const ports = parseListeningPorts(out);
  assert.deepEqual(ports, [
    { port: 11434, pid: 100, command: 'ollama' },
    { port: 1234, pid: 105, command: 'python3' },
    { port: 8080, pid: 400, command: 'node' },
  ]);
  assert.deepEqual(parseListeningPorts(''), []);
  assert.deepEqual(parseListeningPorts(null), []);
});

test('Katalog KNOWN_LOCAL pokrývá požadované typy lokálních běhových prostředí', () => {
  const ids = KNOWN_LOCAL.map((k) => k.id);
  for (const id of ['ollama', 'lmstudio', 'llama-cpp', 'vllm', 'comfyui', 'text-generation-webui', 'koboldcpp', 'jan', 'gpt4all', 'localai', 'open-webui', 'mlx-lm', 'sglang', 'tabbyapi', 'litellm', 'whisper-cpp', 'stable-diffusion-webui', 'automatic1111', 'invokeai', 'transformers-serve']) {
    assert.ok(ids.includes(id), `katalog musí znát ${id}`);
  }
  assert.equal(new Set(ids).size, ids.length, 'žádné duplicitní id');
});

// Selhání zjišťování není zjištěný stav (CLAUDE.md). Když se výpis procesů jednou nepovede, nesmí
// lokální agenti z přehledu zmizet, jako by skončili, a status nesmí dál tvrdit čerstvé „connected“.
test('Lokální agenti: nepovedený výpis procesů drží poslední známý seznam a hlásí chybu', async () => {
  const vysledky = [
    { ok: true, stdout: '100 1 00:10 5.0 102400 /usr/local/bin/ollama serve' },
    { ok: false, stdout: '' },
  ];
  const hlaseni = [];
  const c = createLocalAgentsConnector({
    procesy: async () => vysledky.shift() || { ok: false, stdout: '' },
    porty: async () => ({ ok: true, stdout: '' }),
    onDetect: (list) => hlaseni.push(list.map((a) => a.id)),
  });
  await c.scan();
  assert.deepEqual(hlaseni, [['ollama']]);
  assert.equal(c.status().state, 'connected');
  await c.scan();
  assert.deepEqual(hlaseni, [['ollama']], 'po selhání se neposílá prázdný seznam');
  const st = c.status();
  assert.equal(st.state, 'error');
  assert.equal(st.count, 1, 'poslední známý seznam zůstává');
  assert.match(st.detail, /nedaří zjistit/);
  assert.ok(st.lastFailAt > 0);

  // Bez jediného úspěchu se neví nic – žádné „nic neběží“.
  const nikdy = createLocalAgentsConnector({ procesy: async () => ({ ok: false }), porty: async () => ({ ok: true, stdout: '' }), onDetect: () => assert.fail('onDetect bez výpisu') });
  await nikdy.scan();
  assert.equal(nikdy.status().state, 'error');
});

test('Lokální agenti: porty (lsof) se zjišťují nejvýš jednou za platnost, nepovedené se nemažou', async () => {
  let dotazu = 0;
  let portyOk = true;
  const c = createLocalAgentsConnector({
    procesy: async () => ({ ok: true, stdout: '105 1 00:02 1.0 20480 python3 /Users/x/run.py' }),
    porty: async () => { dotazu++; return portyOk ? { ok: true, stdout: 'python3 105 m 5u IPv4 0x2 0t0 TCP 127.0.0.1:8000 (LISTEN)' } : { ok: false, stdout: '' }; },
    platnostPortuMs: 50,
    onDetect: () => {},
  });
  await c.scan();
  await c.scan();
  await c.scan();
  assert.equal(dotazu, 1, 'tři průchody, jeden lsof');
  await new Promise((r) => setTimeout(r, 60));
  portyOk = false;
  const nalezeni = [];
  const d = createLocalAgentsConnector({
    procesy: async () => ({ ok: true, stdout: '105 1 00:02 1.0 20480 python3 /Users/x/run.py' }),
    porty: async () => (portyOk ? { ok: true, stdout: 'python3 105 m 5u IPv4 0x2 0t0 TCP 127.0.0.1:8000 (LISTEN)' } : { ok: false, stdout: '' }),
    platnostPortuMs: 0,
    onDetect: (l) => nalezeni.push(l.length),
  });
  portyOk = true;
  await d.scan();
  portyOk = false;
  await d.scan();
  assert.deepEqual(nalezeni, [1, 1], 'nepovedený lsof neznamená, že port zmizel');
});

// Lokální agenti se zjišťují z průchodu procesů (1,5 s), ne vlastním 10s časovačem: nový lokální model
// se ukáže stejně rychle jako známý nástroj. Měří se cesta od výpisu procesů po store.localAgents.
test('Lokální agenti: zjišťují se z každého průchodu procesů, do 2 s', async (t) => {
  const config = loadConfig({ AGENTEEQ_SOURCE_HOME: '/tmp/agenteeq-nic', AGENTEEQ_HOME: '/tmp/agenteeq-nic' });
  const store = new Store({ config, datastore: fakeDatastore() });
  let vypis = { ok: true, stdout: '' };
  const lokalni = createLocalAgentsConnector({ procesy: async () => vypis, porty: async () => ({ ok: true, stdout: '' }), napajeny: true, onDetect: (l) => store.setLocalAgents(l) });
  const procesy = createProcessesConnector({ store, config: { processIntervalMs: 100 }, procesy: async () => vypis, detaily: async (pids) => new Map(pids.map((p) => [p, { cwd: '', env: {} }])), onVypis: (res) => lokalni.zVypisu(res) });
  await procesy.start();
  await lokalni.start();
  try {
    assert.deepEqual(store.localAgents || [], []);
    const zacatek = Date.now();
    vypis = { ok: true, stdout: '100 1 00:01 5.0 102400 /usr/local/bin/ollama serve' };
    while (!(store.localAgents || []).some((a) => a.id === 'ollama')) {
      assert.ok(Date.now() - zacatek < 2000, 'lokální agent se neukázal do 2 s');
      await new Promise((r) => setTimeout(r, 10));
    }
    const ms = Date.now() - zacatek;
    assert.ok(ms < 2000, `${ms} ms`);
    t.diagnostic(`lokální agent od výpisu procesů v přehledu za ${ms} ms (průchod po 100 ms)`);
    // Selhání výpisu v průchodu procesů: seznam zůstane, status to řekne.
    vypis = { ok: false, stdout: '' };
    await procesy.scan();
    await new Promise((r) => setTimeout(r, 20));
    assert.ok(store.localAgents.some((a) => a.id === 'ollama'));
    assert.equal(lokalni.status().state, 'error');
    assert.equal(procesy.status().state, 'error', 'aplikace ze starého výpisu nejsou čerstvé „connected“');
    assert.ok(procesy.status().lastFailAt > 0);
  } finally {
    procesy.stop();
    lokalni.stop();
  }
});
