// Pomocník (plovoucí chat v rozhraní). Odpovídá na dva druhy dotazů:
//   - „najdi chat, kde jsme před cca 3 měsíci řešili XY“ – prohledá konverzace přímo na disku
//     tohoto počítače (Claude Code, Codex) i ty, které právě drží přehled (i webové chaty),
//     bez ohledu na 30denní okno přehledu;
//   - „jak zapnu XY“ – to vyřeší klient z rejstříku stránek a nastavení (public/js/hledani.js),
//     server jen pozná záměr.
// Všechno běží lokálně. Když je k dispozici Ollama na tomto počítači, může odpověď navíc
// zformulovat lokální model – data pořád neopustí počítač (adresa mimo loopback a cloudové modely
// Ollamy se odmítají, viz vyberLokalniModel). Selhání nebo vyčerpaný rozpočet prohledávání se hlásí
// jako takové, nikdy jako „nic není“.
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { isLoopback } from './lan.js';
import { ui } from './texty.js';

const DEN = 864e5;
export const LIMITY = { soubory: 4000, bajty: 3 * 1024 * 1024, casMs: 5000, vysledky: 6 };

const bezDiakritiky = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Slova, která nic nehledají: otázka, čas, nástroj a výplň.
const STOP = new Set(('pres ladili ladil ladit zkouseli zkousel delali resili resil resit nastavovali psali a aby ale ani asi az bude byl byla bylo byli bych by co cca chat chatu chatem chat. chci ci do dotaz jak jake jaky jaka jsem jsme jsi jste jsou kde kdy kdo ktery ktera ktere ve v vo na nad nebo nevim ne nejaky nejake o od po pod pred pri pro rad resili resil resila resilo resit reseno s se si sme snad taky tam ten tento tez to tom tu uz uz. vubec za ze zhruba asi priblizne najdi najdes najit vyhledej hledej hledam konverzaci konverzace konverzaci, konverzace? rozhovor rozhovoru vlakno vlakna llm model modelem modelu agent agenta agentem kterem ktere kterym s se mi me mne mu nam nas jsme. diskusi diskuse probirali probiral delali delal o tom about find chat conversation where which the a an we were was in on of to with what thread ago did discussed talked my me llm model').split(/\s+/));

const MESICE = [
  ['led', 'jan'], ['unor', 'feb'], ['brez', 'mar'], ['dub', 'apr'], ['kvet', 'may'], ['cerven', 'jun'],
  ['cervenec', 'jul'], ['srp', 'aug'], ['zari', 'sep'], ['rij', 'oct'], ['listop', 'nov'], ['prosin', 'dec'],
];

const EN_MESICE = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const CZ_MESICE = [/^(leden|ledna|lednu|lednov)/, /^unor/, /^brez(en|na|nu|nov)/, /^dub(en|na|nu|nov)/, /^kvet(en|na|nu|nov)/, /^(cerven|cervna|cervnu|cervnov)$/, /^cervenc|^cervenec/, /^srp(en|na|nu|nov)/, /^zari/, /^rij(en|na|nu|nov)/, /^listopad/, /^prosin/];
// Měsíc ve slovech dotazu („v září“, „zářijový“, „in September“).
function mesicVeSlovech(slova) {
  for (const w of slova) {
    const i = CZ_MESICE.findIndex((re) => re.test(w));
    if (i >= 0) return { index: i, slovo: w };
    const e = EN_MESICE.findIndex((m) => w === m || (m !== 'may' && w.length >= 3 && w === m.slice(0, 3)));
    if (e >= 0) return { index: e, slovo: w };
  }
  return null;
}

const APLIKACE = [
  ['claude code', 'Claude Code', /\bclaude[ -]?code\b|\bcc\b/],
  ['codex', 'Codex', /\bcodex\w*/],
  ['cursor', 'Cursor', /\bcursor\w*/],
  ['chatgpt', 'ChatGPT', /\bchat ?gpt\w*|\bgpt\b/],
  ['gemini', 'Gemini', /\bgemini\w*/],
  ['claude.ai', 'Claude', /\bclaude(?:\.ai)?\b(?![ -]?code)/],
  ['copilot', 'Copilot', /\bcopilot\w*/],
  ['perplexity', 'Perplexity', /\bperplexit\w*/],
  ['grok', 'Grok', /\bgrok\w*/],
];

const CISLA = { jeden: 1, jednou: 1, dva: 2, dve: 2, dvema: 2, tri: 3, trema: 3, ctyri: 4, ctyrmi: 4, pet: 5, peti: 5, sest: 6, sesti: 6, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, par: 2, couple: 2 };

/** Rozbor dotazu: záměr, hledaná slova, časové okno a případný nástroj. */
export function rozeberDotaz(text, now = Date.now()) {
  const q = bezDiakritiky(text).replace(/[„“"'’?!.,:;()]/g, ' ').replace(/\s+/g, ' ').trim();
  const jak = /^(jak|kde|kam|co mam|muzu|lze|da se|how|where|can i|is there)\b/.test(q) || /\b(zapn|vypn|nastav|zmen|prepn|skryt|skryj|zobraz|enable|disable|turn (on|off)|setting)/.test(q);
  const hledani = /\b(najd|vyhled|hled|chat|konverzac|rozhovor|vlakn|resil|probiral|find|search|conversation|thread|discuss)/.test(q);
  const zamer = jak && !hledani ? 'jak' : 'hledat';

  // Čas: „před (cca) 3 měsíci“, „3 months ago“, „minulý týden“, „včera“, „v září“.
  let okno = null;
  const n = (s) => (/^\d+$/.test(s) ? Number(s) : CISLA[s] || null);
  let m = q.match(/\bpred (?:cca |asi |zhruba |priblizne |nejakymi |nejakyma )?(\d+|\w+) (dn|den|tydn|tyden|mesic|mesici|rok|roky|lety|let)\w*/)
    || q.match(/\b(\d+|\w+) (day|week|month|year)s? ago\b/);
  if (m && n(m[1])) {
    const kolik = n(m[1]);
    const jednotka = /^(dn|den|day)/.test(m[2]) ? 1 : /^(tyd|week)/.test(m[2]) ? 7 : /^(mes|month)/.test(m[2]) ? 30.44 : 365.25;
    const stred = now - kolik * jednotka * DEN;
    const tolerance = Math.max(jednotka === 1 ? 1 : jednotka * 0.6, kolik * jednotka * 0.35) * DEN;
    okno = { od: stred - tolerance, do: Math.min(now, stred + tolerance), popis: m[0] };
  } else if (/\b(vcera|yesterday)\b/.test(q)) {
    const d = new Date(now); d.setHours(0, 0, 0, 0);
    okno = { od: d.getTime() - DEN, do: d.getTime(), popis: 'vcera' };
  } else if (/\b(minul\w* tyd\w*|last week)\b/.test(q)) {
    okno = { od: now - 14 * DEN, do: now - 5 * DEN, popis: 'minuly tyden' };
  } else if (/\b(minul\w* mesic\w*|last month)\b/.test(q)) {
    const d = new Date(now); const od = new Date(d.getFullYear(), d.getMonth() - 1, 1); const doo = new Date(d.getFullYear(), d.getMonth(), 1);
    okno = { od: od.getTime(), do: doo.getTime(), popis: 'minuly mesic' };
  } else {
    const mesic = mesicVeSlovech(q.split(' '));
    if (mesic) {
      const d = new Date(now);
      const rok = mesic.index > d.getMonth() ? d.getFullYear() - 1 : d.getFullYear();
      okno = { od: new Date(rok, mesic.index, 1).getTime(), do: new Date(rok, mesic.index + 1, 1).getTime(), popis: mesic.slovo };
    }
  }

  const aplikace = /nevim|neznam|jaky llm|jakym llm|ktery llm|which llm|don.t know/.test(q) ? null : (APLIKACE.find(([, , re]) => re.test(q))?.[1] || null);
  const casova = /^(pred|cca|asi|zhruba|dny|dni|dnu|den|tyden|tydny|tydnu|tydnem|mesic|mesici|mesicu|mesice|rok|roky|lety|let|vcera|minuly|minulej|minuleho|minulem|ago|days?|weeks?|months?|years?|last|yesterday|\d+)$/;
  const bezAplikaci = APLIKACE.reduce((t, [, , re]) => t.replace(new RegExp(re.source, 'g'), ' '), q);
  const slova = [...new Set(bezAplikaci.split(' ')
    .filter((w) => w.length >= 2 && !STOP.has(w) && !STOP_KMENY.has(kmen(w)) && !casova.test(w) && !CISLA[w])
    .filter((w) => w !== mesicVeSlovech([w])?.slovo))];
  return { zamer, slova, vzory: slova.map(vzorSlova), okno, aplikace };
}

// Lehký kmenovač pro češtinu bez slovníku: „fakturaci“, „faktury“, „fakturou“ i „fakturovat“
// mají kmen „faktur“, „platba“, „platby“, „platbami“, „plateb“ i „platební“ kmen „platb“.
// Pádové a číselné koncovky (bez diakritiky), od nejdelších. Úmyslně tu nejsou „at“, „am“, „es“,
// „os“, „us“ – u přejatých slov (format, program, status) by kmen uřízly do nesmyslu.
const KONCOVKY = ['atech', 'etem', 'atum', 'ech', 'ich', 'eho', 'emi', 'emu', 'ete', 'eti', 'iho', 'imi', 'imu', 'ach', 'ata', 'aty', 'ych', 'ama', 'ami', 'ove', 'ovi', 'ymi', 'em', 'im', 'um', 'ym', 'mi', 'ou', 'a', 'e', 'i', 'o', 'u', 'y'];
const SOUHL = '[^aeiouy0-9]';
function kmen(slovo) {
  let w = bezDiakritiky(slovo);
  const k = KONCOVKY.find((x) => w.endsWith(x) && w.length - x.length >= 3);
  if (k) w = w.slice(0, -k.length);
  // Odvozené tvary ke stejnému základu: -ace („fakturace“), -ovat/-ovan/-ov („fakturovat“,
  // „systémový“), přídavné -n („platební“, „měsíční“). Jen dokud kmen zůstane aspoň pětipísmenný.
  for (let zmena = true; zmena;) {
    zmena = false;
    for (const re of [/ovat$/, /ovan$/, /ov$/, /ac$/, new RegExp(`(?<=${SOUHL})n$`)]) {
      const m = w.match(re);
      if (m && w.length - m[0].length >= 5) { w = w.slice(0, -m[0].length); zmena = true; break; }
    }
  }
  // Vkladné e („plateb“ ~ „platb“, „objednávek“ ~ „objednávk“); vzor ho pak připustí volitelně.
  const e = w.match(new RegExp(`^(.{2,}${SOUHL})e(${SOUHL})$`));
  return e ? e[1] + e[2] : w;
}

const STOP_KMENY = new Set([...STOP].filter((w) => w.length >= 5).map(kmen));
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Vzor (zdroj RegExp) pro slovo v textu bez diakritiky; skupina 1 = shoda. Kmen od pěti písmen
 * stačí jako začátek slova; kratší kmen musí být celé slovo s nanejvýš pádovou koncovkou – jinak by
 * „plat“ našel „platformu“ a „data“ „databázi“. Mezi dvěma koncovými souhláskami smí být vkladné e.
 */
function vzorSlova(slovo) {
  const k = kmen(slovo);
  const telo = new RegExp(`${SOUHL}${SOUHL}$`).test(k) && k.length >= 4 ? `${reEsc(k.slice(0, -1))}e?${reEsc(k.slice(-1))}` : reEsc(k);
  return k.length >= 5
    ? `(?:^|[^a-z0-9])(${telo})`
    : `(?:^|[^a-z0-9])(${telo}(?:${KONCOVKY.join('|')})?)(?![a-z0-9])`;
}

const prelozVzory = (r) => (r.vzory || r.slova.map(vzorSlova)).map((v) => new RegExp(v, 'g'));

// Počet výskytů každého vzoru v už normalizovaném textu (nad 8 se nepočítá – víc bodů nepřidá).
function pocty(norm, vzory, k = vzory.map(() => 0)) {
  vzory.forEach((re, i) => {
    re.lastIndex = 0;
    while (k[i] < 8 && re.exec(norm)) k[i]++;
  });
  return k;
}
const soucet = (p) => p.reduce((s, n) => s + n, 0);

// Ukázka kolem první shody. Jde po zprávách (řádcích), ne přes celý přepis najednou: normalizace
// megabajtů textu by zbytečně blokovala server, a shoda bývá hned v prvním zadání.
function ukazka(text, vzory, delka = 180) {
  const radky = String(text || '').split('\n');
  for (let j = 0; j < radky.length; j++) {
    const t = radky[j].replace(/\s+/g, ' ').trim();
    if (!t) continue;
    const norm = bezDiakritiky(t);
    for (const re of vzory) {
      re.lastIndex = 0;
      const m = re.exec(norm);
      if (!m) continue;
      const i = m.index + m[0].length - m[1].length;
      const start = Math.max(0, i - 60);
      const cely = [t, ...radky.slice(j + 1, j + 4).map((r) => r.slice(0, delka))].join(' ').replace(/\s+/g, ' ').trim();
      return `${start ? '…' : ''}${cely.slice(start, start + delka)}${start + delka < cely.length ? '…' : ''}`;
    }
  }
  return String(text || '').slice(0, delka * 4).replace(/\s+/g, ' ').trim().slice(0, delka);
}

// Text z řádku přepisu Claude Code nebo Codexu: jen zadání uživatele a odpovědi agenta, ne výstupy nástrojů.
function textRadku(o) {
  const z = (c) => (typeof c === 'string' ? c : Array.isArray(c) ? c.filter((x) => x && (x.type === 'text' || x.type === 'input_text' || x.type === 'output_text')).map((x) => x.text).join(' ') : '');
  if (o.type === 'user' && o.message) return { role: 'user', text: z(o.message.content) };
  if (o.type === 'assistant' && o.message) return { role: 'agent', text: z(o.message.content) };
  if (o.type === 'event_msg' && o.payload?.type === 'user_message') return { role: 'user', text: String(o.payload.message || '') };
  if (o.type === 'event_msg' && o.payload?.type === 'agent_message') return { role: 'agent', text: String(o.payload.message || '') };
  return null;
}

// Seznam přepisů s časem poslední změny, nejnovější první: při mnoha přepisech a omezeném rozpočtu
// se tak prohledají hlavně ty čerstvé (pořadí z readdir je náhodné). Stačí stat, obsah se nečte.
async function seznamPrepisu(koreny, konecCasu, hloubka = 5) {
  const out = [];
  let uplny = true;
  async function projdi(dir, app, h) {
    if (Date.now() > konecCasu) { uplny = false; return; }
    let polozky;
    try { polozky = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
    const soubory = polozky.filter((e) => e.isFile() && e.name.endsWith('.jsonl')).map((e) => path.join(dir, e.name));
    const st = await Promise.all(soubory.map((p) => fs.stat(p).catch(() => null)));
    soubory.forEach((soubor, i) => { if (st[i]) out.push({ soubor, app, mtime: st[i].mtimeMs }); });
    for (const e of polozky) if (e.isDirectory() && h > 0 && e.name !== 'subagents') await projdi(path.join(dir, e.name), app, h - 1);
  }
  for (const { cesta, app } of koreny) await projdi(cesta, app, hloubka);
  out.sort((a, b) => b.mtime - a.mtime);
  return { soubory: out, uplny };
}

// Parsování přepisů je synchronní (JSON.parse po řádcích, až megabajty na soubor). Každých pár
// milisekund se proto vrátí řízení smyčce událostí, aby server mezitím odpovídal ostatním.
function uvolnovac(ms = 10) {
  let od = Date.now();
  return () => {
    if (Date.now() - od < ms) return null;
    return new Promise((r) => setImmediate(r)).then(() => { od = Date.now(); });
  };
}

/**
 * Projde přepis a vrátí souhrn konverzace pro hledání. Dlouhý přepis (nad `bajty`) se čte jen
 * začátek a konec: konec nese čas posledního záznamu (jinak by se konverzace zdála skončit dřív
 * a nesedělo by časové okno) i nejčerstvější text. `oriznuto` = prostředek se nečetl.
 */
async function prectiPrepis(soubor, app, bajty, uvolni, vzory) {
  let fh;
  try {
    fh = await fs.open(soubor, 'r');
    const st = await fh.stat();
    const oriznuto = st.size > bajty;
    const naKonec = oriznuto ? Math.floor(bajty / 6) : 0;
    const zacatekBuf = Buffer.alloc(oriznuto ? bajty - naKonec : st.size);
    await fh.read(zacatekBuf, 0, zacatekBuf.length, 0);
    const konecBuf = Buffer.alloc(naKonec);
    if (naKonec) await fh.read(konecBuf, 0, naKonec, st.size - naKonec);
    let id = path.basename(soubor, '.jsonl');
    let cwd = '';
    let zacatek = 0;
    let konec = 0;
    let prvni = '';
    const uzivatel = [];
    const agent = [];
    const vyskyty = { user: vzory.map(() => 0), agent: vzory.map(() => 0) };
    const projdi = async (text) => {
      for (const radek of text.split('\n')) {
        const p = uvolni();
        if (p) await p;
        if (!radek) continue;
        let o;
        try { o = JSON.parse(radek); } catch { continue; }
        const ts = Date.parse(o.timestamp || o.payload?.timestamp || '') || 0;
        if (ts) { zacatek = zacatek || ts; konec = Math.max(konec, ts); }
        if (o.cwd || o.payload?.cwd) cwd = o.cwd || o.payload.cwd;
        if (o.type === 'session_meta' && o.payload?.id) id = o.payload.id;
        const r = textRadku(o);
        if (!r || !r.text || r.text.startsWith('<')) continue;
        if (r.role === 'user') { prvni = prvni || r.text; uzivatel.push(r.text); } else agent.push(r.text);
        pocty(bezDiakritiky(r.text), vzory, vyskyty[r.role]);
      }
    };
    await projdi(zacatekBuf.toString('utf8'));
    // Konec začíná uprostřed řádku – první (neúplný) řádek se zahodí.
    if (naKonec) { const t = konecBuf.toString('utf8'); await projdi(t.slice(t.indexOf('\n') + 1)); }
    return { soubor, app, id, cwd, zacatek: zacatek || st.mtimeMs, konec: konec || st.mtimeMs, nazev: prvni.replace(/\s+/g, ' ').slice(0, 100), uzivatel: uzivatel.join('\n'), agent: agent.join('\n'), poctyUzivatel: vyskyty.user, poctyAgent: vyskyty.agent, oriznuto };
  } catch {
    return null;
  } finally {
    await fh?.close().catch(() => {});
  }
}

/**
 * Najde konverzace k dotazu. `koreny`: [{ cesta, app }] složky s přepisy. `sessions`: to, co drží
 * přehled (i webové chaty). `smiPrepisy`: false pro telefon – ten přepisy číst nesmí (remote-scope).
 * Celý dotaz má jeden rozpočet (`limity.casMs`, `limity.soubory`), i když se po prázdném období
 * hledá dál ve starších přepisech.
 */
export async function najdiKonverzace({ dotaz, sessions = [], koreny = [], now = Date.now(), smiPrepisy = true, limity = LIMITY }) {
  const r = typeof dotaz === 'string' ? rozeberDotaz(dotaz, now) : dotaz;
  const vzory = prelozVzory(r);
  const kandidati = new Map();
  const vOkne = (zac, kon) => !r.okno || (kon >= r.okno.od && zac <= r.okno.do);
  const pridej = (k) => {
    if (r.aplikace && !String(k.app || '').toLowerCase().includes(r.aplikace.toLowerCase())) return;
    // Přepis nese výskyty už spočítané (prectiPrepis po zprávách, s uvolňováním smyčky).
    const t = pocty(bezDiakritiky(k.nazev), vzory);
    const u = k.poctyUzivatel || pocty(bezDiakritiky(k.uzivatel), vzory);
    const a = k.poctyAgent || pocty(bezDiakritiky(k.agent), vzory);
    const zasahy = vzory.filter((_, i) => t[i] || u[i] || a[i]).length;
    if (r.slova.length && !zasahy) return;
    const body = soucet(t) * 4 + soucet(u) * 2 + soucet(a);
    const stare = kandidati.get(k.klic);
    if (!stare || stare.body < body) kandidati.set(k.klic, { ...k, zasahy, body, okno: vOkne(k.zacatek, k.konec) });
  };
  const nicVOkne = () => ![...kandidati.values()].some((k) => k.okno);

  // 1) Co drží přehled – rychlé a i pro webové chaty.
  for (const s of sessions) {
    if (s.proces) continue;
    pridej({ klic: s.id, sessionId: s.id, app: s.app, cwd: s.cwd || '', zacatek: s.startedAt || s.lastAt, konec: s.lastAt, nazev: s.title || '', uzivatel: `${s.firstPrompt || ''}\n${s.lastPrompt || ''}`, agent: '' });
  }

  // 2) Přepisy na disku – i starší než okno přehledu, nejnovější první. Telefon je číst nesmí.
  let prohledano = 0;
  let oriznute = 0;
  let nedokonceno = false;
  let oknoProhledane = true;
  if (smiPrepisy) {
    const konecCasu = Date.now() + limity.casMs;
    const uvolni = uvolnovac();
    const seznam = await seznamPrepisu(koreny, konecCasu);
    if (!seznam.uplny) nedokonceno = true;
    const projdi = async (soubory) => {
      for (const { soubor, app } of soubory) {
        if (prohledano >= limity.soubory || Date.now() > konecCasu) { nedokonceno = true; return; }
        prohledano++;
        const k = await prectiPrepis(soubor, app, limity.bajty, uvolni, vzory);
        if (!k) continue;
        if (k.oriznuto) oriznute++;
        const sessionId = sessions.find((s) => s.id.endsWith(`:${k.id}`))?.id || null;
        pridej({ ...k, klic: sessionId || `${app}:${k.id}`, sessionId });
        const p = uvolni();
        if (p) await p;
      }
    };
    // Poslední zápis před začátkem okna = konverzace v okně nebyla. Dlouhé konverzace mohou začít
    // v okně a pokračovat po něm, proto se horní mez filtruje až podle obsahu.
    const vOknuPodleCasu = (f) => !r.okno || f.mtime >= r.okno.od - DEN;
    await projdi(seznam.soubory.filter(vOknuPodleCasu));
    oknoProhledane = !nedokonceno;
    // V zadaném období nic: dál starší přepisy (ze stejného rozpočtu), ať člověk vidí shodu z jiné doby.
    if (r.okno && r.slova.length && nicVOkne()) await projdi(seznam.soubory.filter((f) => !vOknuPodleCasu(f)));
  }

  const vse = [...kandidati.values()].sort((a, b) => b.zasahy - a.zasahy || Number(b.okno) - Number(a.okno) || b.body - a.body || b.konec - a.konec);
  const vOknu = r.okno ? vse.filter((k) => k.okno) : vse;
  const vybrane = (vOknu.length ? vOknu : vse).slice(0, limity.vysledky);
  return {
    rozbor: r,
    prohledano,
    nedokonceno,
    // Neúplné prohledání samotného období – „v zadaném období nic“ by pak nebyla pravda.
    oknoProhledane,
    oriznute,
    mimoOkno: Boolean(r.okno && !vOknu.length && vse.length),
    vysledky: vybrane.map((k) => ({
      sessionId: k.sessionId || null,
      nazev: k.nazev || ui('Konverzace bez názvu'),
      app: k.app || '',
      slozka: k.cwd ? path.basename(k.cwd) : '',
      zacatek: k.zacatek || 0,
      konec: k.konec || 0,
      ukazka: smiPrepisy ? ukazka(`${k.uzivatel}\n${k.agent}` || k.nazev, vzory) : '',
      pokracovat: smiPrepisy && k.app === 'Claude Code' && !k.sessionId ? `claude --resume ${k.id}` : smiPrepisy && k.app === 'Codex' && !k.sessionId ? `codex resume ${k.id}` : '',
      shoda: r.slova.length ? k.zasahy / r.slova.length : 1,
    })),
  };
}

/**
 * Krátká věta nad výsledky – v češtině, rozhraní ji přeloží (src/texty.js). Bez první osoby;
 * „nic není“ se tvrdí jen po úplném prohledání, jinak se řekne, že hledání nedoběhlo.
 */
export function vetaOdpovedi(v) {
  if (!v.vysledky.length) {
    if (v.nedokonceno) return ui('Nic se nenašlo, ale hledání nestihlo projít všechny přepisy (prohledáno: {0}, od nejnovějších). Zkus dotaz zúžit – nástroj nebo období.', v.prohledano);
    if (v.oriznute) return ui('Nic se nenašlo v konverzacích v přehledu ani v přepisech na tomto počítači (prohledáno: {0}; u velmi dlouhých přepisů jen začátek a konec – {1}). Zkus jiná slova nebo širší období.', v.prohledano, v.oriznute);
    return ui('Nic se nenašlo v konverzacích v přehledu ani v přepisech na tomto počítači (prohledáno: {0}). Zkus jiná slova nebo širší období.', v.prohledano);
  }
  if (v.mimoOkno) {
    return v.oknoProhledane === false
      ? ui('V prohledané části zadaného období nic – hledání nestihlo projít všechny přepisy. Z jiné doby k tomu sedí tyhle konverzace:')
      : ui('V zadaném období nic, ale tyhle konverzace k tomu sedí z jiné doby:');
  }
  if (v.nedokonceno) return ui('Nejlepší shody z prohledané části – hledání nestihlo projít všechny přepisy (prohledáno: {0}, od nejnovějších):', v.prohledano);
  return v.vysledky.length === 1 ? ui('Tohle je nejlepší shoda:') : ui('Tohle jsou nejlepší shody (nejlepší nahoře):');
}

// Cloudové modely Ollamy („gpt-oss:120b-cloud“, „glm-4.6:cloud“): lokální server je jen přepošle
// na ollama.com. Poznají se podle přípony jména nebo podle `remote_host`/`remote_model` v /api/tags.
const CLOUDOVY = /(?:^|[-:])cloud$/;
// Embeddingové modely neumí odpovídat textem. Starší Ollama neposílá `capabilities`, pak rozhoduje
// jméno a rodina modelu.
const EMBEDDING_JMENO = /embed|minilm|(?:^|\/)bge[-:]|paraphrase/;
const EMBEDDING_RODINA = new Set(['bert', 'nomic-bert', 'xlm-roberta', 'jina-bert']);

/** Adresa Ollamy na tomto počítači (loopback)? Jinam úryvky konverzací Pomocník neposílá. */
export function ollamaNaTomtoPocitaci(url) {
  let u;
  try { u = new URL(url); } catch { return false; }
  if (!/^https?:$/.test(u.protocol)) return false;
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  // Jen IP adresa nebo localhost – jméno jako „127.0.0.1.nip.io“ může vést kamkoli.
  return host === 'localhost' || (net.isIP(host) > 0 && isLoopback(host));
}

/**
 * Model, kterým smí Pomocník formulovat odpověď. Pravidla (předvídatelně, ne „první z výpisu“):
 *   1. Ollama musí běžet na loopback adrese – jinak `{ model: null, duvod: 'mimo-pocitac' }`
 *      a žádný dotaz na ni nejde;
 *   2. vyřadí se cloudové a embeddingové modely;
 *   3. přednost má model už načtený v paměti (/api/ps – odpoví hned a je to ten, se kterým
 *      uživatel pracuje), jinak nejmenší nainstalovaný (nejrychlejší načtení); shoda → podle jména.
 * Když /api/tags schopnosti neuvádí, ověří se u kandidáta přes /api/show (`completion`, `remote_host`).
 */
export async function vyberLokalniModel({ ollama }) {
  if (!ollama || !ollamaNaTomtoPocitaci(ollama.baseUrl)) return { model: null, duvod: 'mimo-pocitac' };
  const { ok, models } = await ollama.models();
  if (!ok) return { model: null, duvod: 'nedostupna' };
  const vhodne = models.filter((m) => {
    const jmeno = m.name.toLowerCase();
    if (m.remote || CLOUDOVY.test(jmeno)) return false;
    if (m.capabilities?.length) return m.capabilities.includes('completion');
    return !EMBEDDING_JMENO.test(jmeno) && !EMBEDDING_RODINA.has(String(m.family || '').toLowerCase());
  });
  if (!vhodne.length) return { model: null, duvod: 'zadny-model' };
  const nactene = new Set((await ollama.loaded()).models);
  vhodne.sort((a, b) => Number(nactene.has(b.name)) - Number(nactene.has(a.name)) || (a.size || Infinity) - (b.size || Infinity) || a.name.localeCompare(b.name));
  for (const m of vhodne.slice(0, 3)) {
    if (m.capabilities?.length) return { model: m.name };
    const info = await ollama.show(m.name);
    if (!info) return { model: m.name };
    if (info.remote) continue;
    if (!info.capabilities?.length || info.capabilities.includes('completion')) return { model: m.name };
  }
  return { model: null, duvod: 'zadny-model' };
}

/**
 * Volitelně: odpověď formuluje lokální model přes Ollamu. Dostane jen dotaz a nalezené názvy
 * s ukázkami – nic víc a nic mimo tento počítač. Vrací text, nebo null (model není, vypršel čas).
 */
export async function formulujLokalne({ ollama, model, dotaz, vysledky, jazyk = 'cs', casMs = 25000 }) {
  if (!ollama || !model || !vysledky.length) return null;
  const kontext = vysledky.map((v, i) => `${i + 1}. ${v.nazev} (${v.app}, ${new Date(v.konec).toISOString().slice(0, 10)}): ${v.ukazka}`).join('\n');
  const pokyn = jazyk === 'en'
    ? 'You help the user find their past AI conversations. Answer in 1–3 short English sentences which result(s) best match the question and why. Refer to results by number. Do not invent anything not in the list.'
    : 'Pomáháš uživateli najít jeho dřívější konverzace s AI. Odpověz česky 1–3 krátkými větami, který výsledek (nebo výsledky) nejlépe odpovídá dotazu a proč. Odkazuj čísly. Nic, co v seznamu není, si nevymýšlej.';
  let text = '';
  try {
    await ollama.chat({ model, signal: AbortSignal.timeout(casMs), messages: [{ role: 'system', content: pokyn }, { role: 'user', content: `${dotaz}\n\n${kontext}` }], onDelta: (d) => { text += d; } });
  } catch {
    return null;
  }
  return text.trim().slice(0, 800) || null;
}
