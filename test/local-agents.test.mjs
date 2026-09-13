import test from 'node:test';
import assert from 'node:assert/strict';
import { KNOWN_LOCAL, detectLocalAgents, parseListeningPorts } from '../src/connectors/local-agents.js';

test('Lokální agenti: pozná známé nástroje, heuristikou i neznámý python proces, systémové a vlastní procesy nikdy', () => {
  const lines = [
    // Ollama.
    '100 00:10 5.0 102400 /usr/local/bin/ollama serve',
    // LM Studio (cesta k .app obsahuje mezery).
    '101 00:05 2.0 51200 /Users/x/Applications/LM Studio.app/Contents/MacOS/LM Studio --headless',
    // llama.cpp s .gguf modelem.
    '102 00:20 10.0 204800 /usr/local/bin/llama-server -m /Users/x/models/llama-2-7b.Q4_K_M.gguf --port 8090',
    // ComfyUI (main.py v cestě s ComfyUI).
    '103 00:30 15.0 307200 /usr/bin/python3 /Users/x/ComfyUI/main.py --listen',
    // vLLM.
    '104 00:15 20.0 409600 python3 -m vllm.entrypoints.openai.api_server --model mistral-7b',
    // Neznámý python proces s modelem — musí spadnout do heuristiky, ne do katalogu.
    '105 00:02 1.0 20480 python3 /Users/x/run_model.py --model mistral-7b --port 5001',
    // Pět nesouvisejících procesů — nikdy se nesmí objevit ve výsledku.
    '200 01:00 0.0 10240 /System/Library/CoreServices/Finder.app/Contents/MacOS/Finder',
    '201 00:40 0.5 51200 /Applications/Safari.app/Contents/MacOS/Safari',
    '202 00:05 0.1 5120 /System/Library/Frameworks/CoreServices.framework/Versions/A/Support/mdworker_shared',
    '203 00:01 0.0 20480 node --test test/local-agents.test.mjs',
    '204 00:03 0.2 40960 /Users/m/agenteeq/bin/agenteeq.mjs',
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
  const line = '300 00:05 2.0 40960 python3 server.py --model /Users/x/models/qwen2.5-7b-instruct-q4.gguf --port 8000';
  const found = detectLocalAgents(line);
  assert.equal(found.length, 1);
  assert.equal(found[0].source, 'heuristika');
  assert.equal(found[0].confidence, 'nízká');
  assert.equal(found[0].model, 'qwen2.5-7b-instruct-q4');
  assert.ok(found[0].note.length > 0);
});

test('Heuristika: neznámý proces se pozná i jen podle typického portu (python/node)', () => {
  const line = '400 00:01 0.0 20480 node dist/server.js';
  const found = detectLocalAgents(line, { ports: [{ port: 11434, pid: 400, command: 'node' }] });
  assert.equal(found.length, 1);
  assert.equal(found[0].source, 'heuristika');
  assert.equal(found[0].confidence, 'nízká');
  assert.equal(found[0].port, 11434);
});

test('Heuristika: samotné slovo z cesty k domovské složce bez zátěže a bez portu nestačí', () => {
  const line = '500 00:00 0.0 10240 /Users/m/Projects/moje-llama-poznamky/node_modules/.bin/next dev';
  assert.deepEqual(detectLocalAgents(line), []);
});

test('Seskupení: tři procesy stejného nástroje dají jeden záznam se součtem CPU a nejdelším uptime', () => {
  const lines = [
    '10 00:10 5.0 102400 /usr/local/bin/ollama serve',
    '11 00:05 3.0 51200 /usr/local/bin/ollama runner --model llama3',
    '12 00:01 1.0 20480 /usr/local/bin/ollama runner --model llama3',
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
