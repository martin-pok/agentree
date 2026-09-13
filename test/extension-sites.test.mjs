import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { WEB_SITES } from '../src/connectors/web.js';

// Adaptéry běží v prohlížeči, ale jsou to obyčejné funkce — spustíme je tady nad falešným
// `location` a `document`. Chyba v rozpoznávání služby znamená, že se konverzace zařadí pod
// špatný nástroj nebo se nezaregistruje vůbec; to je přesně to, co uživatel hlásí jako
// „aplikace mi agenta nevidí".
const okno = { sessionStorage: { getItem: () => null, setItem: () => {} } };
const kontext = vm.createContext({ window: okno, sessionStorage: okno.sessionStorage });
const kod = await fs.readFile(new URL('../extension/sites.js', import.meta.url), 'utf8');
vm.runInContext(kod, kontext);
const { SITES, detect } = kontext.window.AgenteeqSites;

const loc = (url) => new URL(url);

test('každá služba z adaptérů je známá i serveru', () => {
  for (const s of SITES) {
    assert.ok(WEB_SITES[s.id], `server nezná službu „${s.id}" — konverzace by se zahodila jako „Neznámá služba"`);
  }
});

test('Codex na webu se pozná zvlášť od ChatGPT', () => {
  assert.equal(detect(loc('https://chatgpt.com/codex')).id, 'codex-web');
  assert.equal(detect(loc('https://chatgpt.com/codex/tasks/abc-123')).id, 'codex-web');
  assert.equal(detect(loc('https://chatgpt.com/')).id, 'chatgpt');
  assert.equal(detect(loc('https://chatgpt.com/c/xyz-789')).id, 'chatgpt');
  // Adresa, která jen začíná stejně, Codexem není.
  assert.equal(detect(loc('https://chatgpt.com/codexfoo')).id, 'chatgpt');
});

test('ID konverzace se bere z adresy, ne z náhody', () => {
  const codex = SITES.find((s) => s.id === 'codex-web');
  assert.equal(codex.conversationId(loc('https://chatgpt.com/codex/tasks/task-42')), 'task-42');
  const chatgpt = SITES.find((s) => s.id === 'chatgpt');
  assert.equal(chatgpt.conversationId(loc('https://chatgpt.com/c/conv-9')), 'conv-9');
  const claude = SITES.find((s) => s.id === 'claude');
  assert.equal(claude.conversationId(loc('https://claude.ai/chat/abc-def')), 'abc-def');
});

test('každá služba v seznamu má vlastní rozpoznání adresy', () => {
  for (const s of SITES) {
    assert.ok(s.hosts?.length, `${s.id}: chybí domény`);
    assert.equal(typeof s.conversationId, 'function', `${s.id}: chybí určení konverzace`);
    assert.equal(typeof s.messages, 'function', `${s.id}: chybí čtení zpráv`);
    assert.equal(typeof s.generating, 'function', `${s.id}: chybí poznání, že agent pracuje`);
  }
});

test('cizí stránka se nerozpozná jako AI nástroj', () => {
  for (const url of ['https://seznam.cz/', 'https://github.com/martin-pok/agentree', 'https://google.com/search?q=x']) {
    assert.equal(detect(loc(url)), null, `${url} nemá být rozpoznáno`);
  }
  // GitHub Copilot ano, ale jen na své cestě.
  assert.equal(detect(loc('https://github.com/copilot')).id, 'github-copilot');
});

test('adaptéry běží i nad prázdnou stránkou a nespadnou', () => {
  const doc = { title: '', querySelector: () => null, querySelectorAll: () => [] };
  for (const s of SITES) {
    assert.doesNotThrow(() => s.messages(doc), `${s.id}: čtení zpráv spadlo`);
    assert.doesNotThrow(() => s.generating(doc), `${s.id}: zjištění práce spadlo`);
    assert.doesNotThrow(() => s.title(doc), `${s.id}: název spadl`);
    assert.doesNotThrow(() => s.limit(doc), `${s.id}: zjištění limitu spadlo`);
  }
});
