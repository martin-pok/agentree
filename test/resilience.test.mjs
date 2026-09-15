import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { startTestServer, api, tempDir, writeJsonl } from './helpers.mjs';
import { listFiles } from '../src/watch.js';
import { touch } from '../src/model.js';

// Nálezy z testu odolnosti (14. 9. 2026). Každý test drží jednu opravu.

// Test si nedostupnost zápisu vyrábí přes chmod. Na Windows chmod na složku nic neudělá,
// takže by se netestovalo selhání zápisu, ale to, že se zápis povedl.
const BEZ_CHMOD = process.platform === 'win32' && 'chmod na složku na Windows nic nemění';

test('uložení nastavení, které na disku selže, se nehlásí jako úspěch', { skip: BEZ_CHMOD || process.getuid?.() === 0 }, async (t) => {
  const dataHome = await tempDir('agenteeq-data-');
  const s = await startTestServer({ AGENTEEQ_HOME: dataHome });
  t.after(async () => { await fs.chmod(dataHome, 0o700).catch(() => {}); await s.close(); });
  await fs.chmod(dataHome, 0o500);
  const r = await api(s.url).send('PUT', '/api/settings', { appearance: 'dark' });
  assert.equal(r.status, 500, 'dřív 200, přestože zápis selhal');
  assert.match(r.body.error, /nepodařilo uložit/);
  await fs.chmod(dataHome, 0o700);
  const ok = await api(s.url).send('PUT', '/api/settings', { appearance: 'dark' });
  assert.equal(ok.status, 200, 'po nápravě práv se uložení povede');
  const disk = JSON.parse(await fs.readFile(path.join(dataHome, 'data.json'), 'utf8'));
  assert.equal(disk.settings.appearance, 'dark');
});

test('projekt připojený symbolickým odkazem je vidět a smyčka odkazů nezasekne procházení', async () => {
  const root = await tempDir('agenteeq-links-');
  const projects = path.join(root, 'projects');
  await fs.mkdir(path.join(root, 'jinde', 'klient'), { recursive: true });
  await fs.mkdir(projects, { recursive: true });
  await fs.writeFile(path.join(root, 'jinde', 'klient', 'a.jsonl'), '{}\n');
  await fs.symlink(path.join(root, 'jinde', 'klient'), path.join(projects, 'klient'));
  await fs.symlink(projects, path.join(projects, 'smycka'));
  const najdeno = await listFiles(projects, 1, (f) => f.endsWith('.jsonl'));
  assert.deepEqual(najdeno.map((f) => path.relative(projects, f)), [path.join('klient', 'a.jsonl')]);
});

test('smazaný přepis Claude Code z přehledu zmizí bez restartu', async (t) => {
  const srcHome = await tempDir('agenteeq-src-');
  const id = crypto.randomUUID();
  const file = path.join(srcHome, '.claude', 'projects', '-Users-x-web', `${id}.jsonl`);
  const now = Date.now();
  await writeJsonl(file, [
    { type: 'user', timestamp: new Date(now - 60000).toISOString(), cwd: '/Users/x/web', message: { content: 'Uprav ceník' } },
    { type: 'assistant', timestamp: new Date(now - 50000).toISOString(), message: { id: 'm1', model: 'claude-opus-5', stop_reason: 'end_turn', content: [{ type: 'text', text: 'Hotovo' }], usage: { input_tokens: 5, output_tokens: 7 } } },
  ]);
  const s = await startTestServer({ AGENTEEQ_SOURCE_HOME: srcHome });
  t.after(() => s.close());
  const idSession = `claude-code:${id}`;
  const vidi = async () => (await api(s.url).get('/api/state')).body.sessions.some((x) => x.id === idSession);
  assert.equal(await vidi(), true, 'konverzace se načetla');
  await fs.rm(file);
  await s.app.connectors['claude-code'].scan();
  assert.equal(await vidi(), false, 'po smazání souboru v přehledu nezůstal duch');
});

test('časové razítko z budoucnosti nedrží konverzaci věčně čerstvou', () => {
  const s = { startedAt: 0, lastAt: 0, minutes: new Set() };
  const pred = Date.now();
  touch(s, pred + 2 * 24 * 3600e3);
  assert.ok(s.lastAt <= Date.now(), 'lastAt se ořízl na současný čas');
  assert.ok(s.lastAt >= pred);
});
