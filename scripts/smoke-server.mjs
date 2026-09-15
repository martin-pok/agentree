// Doopravdy spustí Agenteeq a zeptá se ho, jestli žije: `npm run smoke:server`
//
// Testy ověřují chování jednotlivých kusů. Tenhle skript ověřuje to, co z nich nevyplývá —
// že se celá aplikace na tomhle systému spustí jedním příkazem a obslouží rozhraní. Proto
// nesahá do vnitřku: mluví s ní jen přes HTTP, stejně jako prohlížeč.
//
// Běží na macOS, Linuxu i Windows a nikdy nesáhne na skutečná data: domov i datová složka
// jsou dočasné (AGENTEEQ_SOURCE_HOME, AGENTEEQ_HOME), takže se nečte ani ~/.claude.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const kroky = [];
const zapis = (ok, text) => { kroky.push({ ok, text }); console.log(`${ok ? '  ✓' : '  ✗'} ${text}`); };

const domov = await fs.mkdtemp(path.join(os.tmpdir(), 'agenteeq-smoke-'));
const data = path.join(domov, 'data');

console.log(`Agenteeq — smoke na ${process.platform} (${process.arch}), Node ${process.versions.node}`);
console.log(`Dočasný domov: ${domov}`);

const dite = spawn(process.execPath, [path.join(root, 'bin', 'agenteeq.mjs')], {
  cwd: root,
  env: {
    ...process.env,
    PORT: '0',
    AGENTEEQ_SOURCE_HOME: domov,
    AGENTEEQ_HOME: data,
    AGENTEEQ_CLOUD: '0',
    // Ollama na portu 9 (discard) — nikdy nesahat na skutečnou instanci na tomhle počítači.
    AGENTEEQ_OLLAMA_URL: 'http://127.0.0.1:9',
  },
  stdio: ['pipe', 'pipe', 'pipe'],
});

let vystup = '';
dite.stdout.on('data', (b) => { vystup += b; });
dite.stderr.on('data', (b) => { vystup += b; });

async function ukonci(kod) {
  // Windows signály nedoručuje, takže tam kill() proces rovnou zabije. Na pořadí
  // tu nezáleží, server už odpověděl na všechno, na co jsme se ptali.
  dite.kill();
  await new Promise((r) => (dite.exitCode === null ? dite.once('exit', r) : r()));
  await fs.rm(domov, { recursive: true, force: true, maxRetries: 10, retryDelay: 150 });
  process.exit(kod);
}

function pockejNaAdresu(timeout = 30000) {
  return new Promise((resolve, reject) => {
    const konec = Date.now() + timeout;
    const tik = setInterval(() => {
      const m = vystup.match(/běží na (http:\/\/127\.0\.0\.1:\d+)/);
      if (m) { clearInterval(tik); resolve(m[1]); return; }
      if (dite.exitCode !== null) { clearInterval(tik); reject(new Error(`server skončil s kódem ${dite.exitCode}`)); return; }
      if (Date.now() > konec) { clearInterval(tik); reject(new Error('server se do 30 s neohlásil')); }
    }, 100);
  });
}

let url;
try {
  url = await pockejNaAdresu();
  zapis(true, `server nastartoval: ${url}`);
} catch (err) {
  zapis(false, `server nenastartoval — ${err.message}`);
  console.error(`\nVýstup serveru:\n${vystup.trim() || '(prázdný)'}`);
  await ukonci(1);
}

const ziskej = async (cesta, { hlavicky = {} } = {}) => {
  const r = await fetch(url + cesta, { headers: hlavicky, signal: AbortSignal.timeout(10000) });
  const text = await r.text();
  let telo = null;
  try { telo = JSON.parse(text); } catch { /* HTML nebo něco jiného */ }
  return { status: r.status, telo, text, typ: r.headers.get('content-type') || '' };
};

try {
  const zdravi = await ziskej('/api/health');
  zapis(zdravi.status === 200 && zdravi.telo?.ok === true, `/api/health odpovídá (verze ${zdravi.telo?.version ?? '?'})`);

  const rozhrani = await ziskej('/');
  zapis(rozhrani.status === 200 && rozhrani.text.includes('<aside class="sidebar">'), 'rozhraní se vydá na /');

  const skript = await ziskej('/js/app.js');
  zapis(skript.status === 200 && skript.typ.includes('javascript'), '/js/app.js se vydá jako JavaScript');

  const stav = await ziskej('/api/state');
  zapis(stav.status === 200 && Array.isArray(stav.telo?.sessions), `/api/state vrací seznam session (${stav.telo?.sessions?.length ?? '?'})`);

  // Konektory smějí hlásit „nic“, ale nesmějí padat — a hlavně nesmějí tvrdit,
  // že nic neběží, když se to na tomhle systému vůbec nedá zjistit.
  const konektory = stav.telo?.connectors || [];
  zapis(konektory.length > 0, `konektory se nahlásily (${konektory.length})`);
  for (const k of konektory.filter((k) => k.state === 'error')) {
    console.log(`     ↳ ${k.name}: ${k.detail}`);
  }

  // Průchod cestou ven z public/ musí skončit zamítnutím, ne souborem.
  const uteceni = await ziskej('/../package.json');
  zapis(uteceni.status !== 200 || !uteceni.text.includes('"name"'), 'cesta ven z public/ je zamítnutá');

  // Změna bez hlavičky X-Agenteeq neprojde (ochrana proti CSRF).
  const bezHlavicky = await fetch(`${url}/api/alerts/clear`, { method: 'POST', signal: AbortSignal.timeout(5000) });
  zapis(bezHlavicky.status === 403, 'změna bez hlavičky X-Agenteeq je zamítnutá');
} catch (err) {
  zapis(false, `dotaz selhal — ${err.message}`);
}

const spadlo = kroky.filter((k) => !k.ok);
console.log(spadlo.length ? `\nSelhalo ${spadlo.length} z ${kroky.length} kontrol.` : `\nV pořádku: ${kroky.length} z ${kroky.length}.`);
if (spadlo.length) console.error(`\nVýstup serveru:\n${vystup.trim()}`);
await ukonci(spadlo.length ? 1 : 0);
