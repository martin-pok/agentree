// Audit pravdivosti dat: `npm run audit:data`
//
// Spustí Agenteeq nad skutečnými zdroji na tomto Macu (s dočasnou datovou složkou – do zdrojů ani
// do tvých dat Agenteeq nic nezapisuje) a porovná, co aplikace tvrdí, s tím, co je ve zdrojových
// souborech. Pravdu přitom počítá vlastním, co nejjednodušším kódem přímo ze surových souborů,
// ne parserem aplikace – jinak by se jen porovnávala chyba sama se sebou.
//
// Nic se nikam neposílá. Výstup obsahuje jen součty, procenta a časy, žádný text konverzací.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startTestServer, api } from '../test/helpers.mjs';

const HOME = os.homedir();
const DEN = 86400e3;
const jsonl = (koren) => {
  const out = [];
  if (!fs.existsSync(koren)) return out;
  (function projdi(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) projdi(p); else if (e.name.endsWith('.jsonl')) out.push(p);
    }
  })(koren);
  return out;
};
const radky = (f) => fs.readFileSync(f, 'utf8').split('\n').map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
const cislo = (n) => Number(n).toLocaleString('cs-CZ', { maximumFractionDigits: 2 });
const cas = (t) => (t ? new Date(t).toLocaleString('cs-CZ') : '–');

const vysledky = [];
const porovnej = (nazev, zdroj, aplikace, { tolerance = 0 } = {}) => {
  const sedi = typeof zdroj === 'number' && typeof aplikace === 'number' ? Math.abs(zdroj - aplikace) <= tolerance : String(zdroj) === String(aplikace);
  vysledky.push({ nazev, zdroj, aplikace, sedi });
};

console.log('Spouštím Agenteeq nad zdroji tohoto Macu (dočasná datová složka)…');
const demo = await startTestServer({ AGENTEEQ_SOURCE_HOME: HOME, AGENTEEQ_PROCESSES: '0' });
const klient = api(demo.url);
let stav;
let predtim = '';
for (let i = 0; i < 80; i++) { // historie kreditů se dočítá na pozadí – počkat, až se stav ustálí
  stav = (await klient.send('GET', '/api/state')).body;
  const otisk = JSON.stringify([stav.sessions.length, stav.credits.map((c) => [c.at, c.topUps?.length])]);
  if (stav.ready && otisk === predtim && i > 8) break;
  predtim = otisk;
  await new Promise((r) => setTimeout(r, 500));
}
await demo.close();
const okno = stav.windowDays * DEN;
const od = Date.now() - okno;
const pulnoc = new Date(); pulnoc.setHours(0, 0, 0, 0);
const hodinoveTokeny = (connector, odKdy) => stav.sessions.filter((s) => s.connector === connector)
  .reduce((a, s) => a + Object.entries(s.hourly || {}).reduce((x, [k, v]) => (Date.parse(`${k}:00:00Z`) >= odKdy ? x + v : x), 0), 0);

/* ---------- Claude Code: tokeny (vstup + výstup), každá zpráva jednou ---------- */
{
  const zpravy = new Map();
  for (const f of jsonl(path.join(HOME, '.claude', 'projects'))) {
    if (fs.statSync(f).mtimeMs < od) continue;
    for (const o of radky(f)) {
      const m = o.message;
      if (o.type !== 'assistant' || !m?.usage) continue;
      zpravy.set(m.id || o.uuid, { t: Date.parse(o.timestamp), n: (m.usage.input_tokens || 0) + (m.usage.output_tokens || 0) });
    }
  }
  // Jen do okamžiku, kdy aplikace dala svůj stav – práce, která běží právě teď, by jinak vyrobila rozdíl.
  // Hranice okna se bere po celých hodinách, stejně jako aplikace sčítá (hodinové koše v UTC).
  const hodina = (t) => Math.floor(t / 3600e3) * 3600e3;
  const soucet = (odKdy) => [...zpravy.values()].reduce((a, z) => (hodina(z.t) >= odKdy && z.t <= stav.now ? a + z.n : a), 0);
  porovnej('Claude Code · tokeny dnes', soucet(pulnoc.getTime()), hodinoveTokeny('claude-code', pulnoc.getTime()));
  porovnej(`Claude Code · tokeny za ${stav.windowDays} dní`, soucet(od), hodinoveTokeny('claude-code', od));
}

/* ---------- Codex: tokeny, limity a kredity ---------- */
{
  let dnes = 0;
  let limit = null;
  const kredity = [];
  for (const f of jsonl(path.join(HOME, '.codex', 'sessions'))) {
    const cerstvy = fs.statSync(f).mtimeMs >= od;
    let pred = 0;
    for (const o of radky(f)) {
      const p = o.payload || {};
      const t = Date.parse(o.timestamp);
      const u = p.info?.total_token_usage;
      if (cerstvy && u) {
        const n = (u.input_tokens || 0) - (u.cached_input_tokens || 0) + (u.output_tokens || 0);
        if (n < pred) pred = 0;
        if (n > pred) { if (t >= pulnoc.getTime() && t <= stav.now) dnes += n - pred; pred = n; }
      }
      const rl = p.rate_limits || p.info?.rate_limits;
      if (rl?.primary && (!limit || t > limit.t)) limit = { t, rl };
      const c = rl?.credits;
      if (c) {
        const b = c.balance === null || c.balance === undefined ? (c.has_credits === false ? 0 : null) : Number(c.balance);
        if (b !== null) kredity.push({ t, b, has: c.has_credits });
      }
    }
  }
  porovnej('Codex · tokeny dnes', dnes, hodinoveTokeny('codex', pulnoc.getTime()));
  if (limit) {
    for (const [k, id] of [['primary', 'codex:codex:primary'], ['secondary', 'codex:codex:secondary']]) {
      const a = stav.limits.find((l) => l.id === id);
      porovnej(`Codex · ${k === 'primary' ? 'limit 5 h' : 'týdenní limit'} (%)`, limit.rl[k]?.used_percent, a?.usedPercent);
      porovnej(`Codex · ${k === 'primary' ? 'limit 5 h' : 'týdenní limit'} (odečet)`, cas(limit.t), cas(a?.at));
    }
  }
  kredity.sort((a, b) => a.t - b.t);
  const nekdyMel = kredity.some((k) => k.has || k.b > 0);
  const aplikace = stav.credits.find((c) => c.id === 'codex');
  if (nekdyMel) {
    const posledni = kredity.at(-1);
    porovnej('Codex · zůstatek kreditů', posledni.b, aplikace?.balance);
    porovnej('Codex · zůstatek zjištěn', cas(posledni.t), cas(aplikace?.at));
  } else {
    porovnej('Codex · kredity (nikdy nebyly)', 'žádná karta', aplikace ? 'karta je' : 'žádná karta');
  }
}

/* ---------- Claude Desktop: historie vytížení plánu ---------- */
{
  const soubor = path.join(HOME, 'Library', 'Application Support', 'Claude', 'plan-usage-history.json');
  if (fs.existsSync(soubor)) {
    const vzorky = (JSON.parse(fs.readFileSync(soubor, 'utf8')).samples || []).filter((x) => Number.isFinite(Number(x?.t)));
    const posledni = vzorky.reduce((a, b) => (Number(b.t) > Number(a.t) ? b : a), vzorky[0]);
    if (posledni) {
      const five = stav.limits.find((l) => l.id === 'claude:five_hour:history');
      const seven = stav.limits.find((l) => l.id === 'claude:seven_day:history');
      porovnej('Claude · limit 5 h (%)', posledni.u?.fh, five?.usedPercent);
      porovnej('Claude · týdenní limit (%)', posledni.u?.sd, seven?.usedPercent);
      porovnej('Claude · odečet plánu', cas(Number(posledni.t)), cas(five?.at));
    }
  }
}

const sirka = Math.max(...vysledky.map((v) => v.nazev.length));
console.log(`\n${'údaj'.padEnd(sirka)}  ${'zdroj'.padStart(22)}  ${'aplikace'.padStart(22)}`);
for (const v of vysledky) {
  const f = (x) => (typeof x === 'number' ? cislo(x) : String(x ?? '–'));
  console.log(`${v.nazev.padEnd(sirka)}  ${f(v.zdroj).padStart(22)}  ${f(v.aplikace).padStart(22)}  ${v.sedi ? '✓' : '✗ NESEDÍ'}`);
}
const spatne = vysledky.filter((v) => !v.sedi);
console.log(spatne.length ? `\n✗ ${spatne.length} z ${vysledky.length} údajů nesedí se zdrojem.` : `\n✓ Všech ${vysledky.length} údajů sedí se zdrojem.`);
process.exitCode = spatne.length ? 1 : 0;
