// `npm test`: testy běží s vlastní dočasnou složkou (TMPDIR, TEMP, TMP), kterou po doběhnutí
// smaže. Testy si v ní zakládají stovky složek (tempDir, mkdtemp) a bez úklidu zaplnily disk.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const koren = fs.mkdtempSync(path.join(os.tmpdir(), 'agenteeq-testy-'));
const env = { ...process.env, TMPDIR: koren, TEMP: koren, TMP: koren };
const vysledek = spawnSync(process.execPath,
  ['--test', '--test-concurrency=1', '--test-reporter=spec', 'test/**/*.test.mjs', ...process.argv.slice(2)],
  { stdio: 'inherit', env });
try { fs.rmSync(koren, { recursive: true, force: true, maxRetries: 3 }); } catch (e) { console.error(`Dočasnou složku ${koren} se nepodařilo smazat: ${e.message}`); }
process.exit(vysledek.status ?? 1);
