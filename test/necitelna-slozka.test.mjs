// Selhání zjišťování se nesmí hlásit jako zjištěný stav (CLAUDE.md). Složka s přepisy, kterou
// nejde přečíst (chybí oprávnění – na macOS třeba CLAUDE_CONFIG_DIR v Dokumentech bez plného
// přístupu k disku), se dřív hlásila jako „Složka existuje, zatím bez konverzací“.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createKorenyPrepisu } from '../src/koreny-prepisu.js';
import { startTestServer, api, tempDir } from './helpers.mjs';

test('kořeny přepisů: existující složku bez oprávnění ke čtení hlásí jako nečitelnou', async () => {
  const dir = await tempDir('agenteeq-necitelne-');
  const zakazana = path.join(dir, 'zakazana');
  const citelna = path.join(dir, 'citelna');
  await fs.mkdir(zakazana);
  await fs.mkdir(citelna);
  const readdir = async (p) => {
    if (p === zakazana) throw Object.assign(new Error('operation not permitted'), { code: 'EPERM' });
    return fs.readdir(p);
  };
  const k = createKorenyPrepisu([zakazana, citelna, path.join(dir, 'neexistuje')], { zmena() {}, readdir });
  assert.deepEqual(await k.necitelne(), [zakazana], 'chybějící složka není nečitelná, jen chybí');
  assert.deepEqual((await k.existujici()).sort(), [citelna, zakazana].sort());
});

// Skutečné oprávnění: root čte všechno a na Windows chmod nemění ACL, proto se tenhle krok
// pod rootem (kontejnery CI) a na Windows přeskočí.
test('Claude Code a Codex: nečitelná složka = stav chyby s důvodem, ne „zatím bez konverzací“', { skip: (process.getuid?.() === 0 && 'root čte i složku bez oprávnění') || (process.platform === 'win32' && 'chmod 000 složku na Windows nezamkne (ACL); logiku hlídá test výše') }, async (t) => {
  const home = await tempDir('agenteeq-necitelne-src-');
  const claude = path.join(home, '.claude', 'projects');
  const codex = path.join(home, '.codex', 'sessions');
  await fs.mkdir(claude, { recursive: true });
  await fs.mkdir(codex, { recursive: true });
  await fs.chmod(claude, 0o000);
  await fs.chmod(codex, 0o000);
  t.after(async () => {
    await fs.chmod(claude, 0o755).catch(() => {});
    await fs.chmod(codex, 0o755).catch(() => {});
  });
  const srv = await startTestServer({ AGENTEEQ_SOURCE_HOME: home });
  t.after(() => srv.close());
  const konektory = (await api(srv.url).get('/api/state')).body.connectors;
  for (const id of ['claude-code', 'codex']) {
    const c = konektory.find((x) => x.id === id);
    assert.equal(c.state, 'error', `${id}: ${c.detail}`);
    assert.match(c.detail, /nejde přečíst/);
    assert.doesNotMatch(c.detail, /zatím bez/);
  }
});
