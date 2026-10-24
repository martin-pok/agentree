import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

// Klíč okna (tajemství lokálního API) nesmí zdědit žádný potomek: agent spuštěný z Agenteeq by si
// ho jinak přečetl z prostředí a ovládal Agenteeq. Server si ho vezme do configu a z prostředí ho
// smaže dřív, než cokoli spustí.
test('klíč okna: po načtení konfigurace zmizí z prostředí procesu, dřív než vznikne aplikace', async () => {
  const bin = await fs.readFile(new URL('../bin/agenteeq.mjs', import.meta.url), 'utf8');
  const nacteni = bin.indexOf('const config = loadConfig();');
  const smazani = bin.indexOf('delete process.env.AGENTEEQ_LOCAL_KEY;');
  const aplikace = bin.indexOf('await createApp(config)');
  assert.ok(nacteni > 0 && smazani > nacteni && aplikace > smazani, 'pořadí: loadConfig → delete → createApp');
  assert.match(bin, /delete process\.env\.AGENTREE_LOCAL_KEY;/);
  // Před smazáním se nic nespouští (execFile/spawn až po něm).
  assert.doesNotMatch(bin.slice(nacteni, smazani), /execFile\(|spawn\(/);
});
