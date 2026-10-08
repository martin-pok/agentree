// Pomocník (plovoucí chat v rozhraní). Odpovídá na dva druhy dotazů:
//   - „najdi chat, kde jsme před cca 3 měsíci řešili XY“ – prohledá konverzace přímo na disku
//     tohoto počítače (Claude Code, Codex) i ty, které právě drží přehled (i webové chaty),
//     bez ohledu na 30denní okno přehledu;
//   - „jak zapnu XY“ – to vyřeší klient z rejstříku stránek a nastavení (public/js/hledani.js),
//     server jen pozná záměr.
// Všechno běží lokálně. Když je k dispozici Ollama, může odpověď navíc zformulovat lokální model
// – data pořád neopustí počítač. Selhání nebo vyčerpaný časový limit prohledávání se hlásí jako
// takové, nikdy jako „nic jsem nenašel“.
import fs from 'node:fs/promises';
import path from 'node:path';
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
    .filter((w) => w.length >= 2 && !STOP.has(w) && !casova.test(w) && !CISLA[w])
    .filter((w) => w !== mesicVeSlovech([w])?.slovo))];
  return { zamer, slova, okno, aplikace };
}

// Kořen slova pro češtinu bez slovníku: odřízne běžné koncovky („faktury“ ~ „fakturu“).
const koren = (w) => (w.length > 5 ? w.slice(0, w.length - 2) : w.length > 3 ? w.slice(0, w.length - 1) : w);

function skore(text, slova) {
  const t = bezDiakritiky(text);
  let zasahy = 0;
  let body = 0;
  for (const w of slova) {
    const k = koren(w);
    const re = new RegExp(`(^|[^a-z0-9])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
    const pocet = (t.match(re) || []).length;
    if (pocet) { zasahy++; body += Math.min(pocet, 8); }
  }
  return { zasahy, body };
}

function ukazka(text, slova, delka = 180) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  const norm = bezDiakritiky(t);
  let i = -1;
  for (const w of slova) { i = norm.indexOf(koren(w)); if (i >= 0) break; }
  if (i < 0) return t.slice(0, delka);
  const start = Math.max(0, i - 60);
  return `${start ? '…' : ''}${t.slice(start, start + delka)}${start + delka < t.length ? '…' : ''}`;
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

async function* jsonlSoubory(koren, hloubka = 5) {
  let polozky;
  try { polozky = await fs.readdir(koren, { withFileTypes: true }); } catch { return; }
  for (const e of polozky) {
    const p = path.join(koren, e.name);
    if (e.isDirectory() && hloubka > 0 && e.name !== 'subagents') yield* jsonlSoubory(p, hloubka - 1);
    else if (e.isFile() && e.name.endsWith('.jsonl')) yield p;
  }
}

/** Projde přepis a vrátí souhrn konverzace pro hledání. */
async function prectiPrepis(soubor, app) {
  let fh;
  try {
    fh = await fs.open(soubor, 'r');
    const st = await fh.stat();
    const buf = Buffer.alloc(Math.min(st.size, LIMITY.bajty));
    await fh.read(buf, 0, buf.length, 0);
    let id = path.basename(soubor, '.jsonl');
    let cwd = '';
    let zacatek = 0;
    let konec = 0;
    let prvni = '';
    const uzivatel = [];
    const agent = [];
    for (const radek of buf.toString('utf8').split('\n')) {
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
    }
    return { soubor, app, id, cwd, zacatek: zacatek || st.mtimeMs, konec: konec || st.mtimeMs, nazev: prvni.replace(/\s+/g, ' ').slice(0, 100), uzivatel: uzivatel.join('\n'), agent: agent.join('\n'), oriznuto: st.size > LIMITY.bajty };
  } catch {
    return null;
  } finally {
    await fh?.close().catch(() => {});
  }
}

/**
 * Najde konverzace k dotazu. `koreny`: [{ cesta, app }] složky s přepisy. `sessions`: to, co drží
 * přehled (i webové chaty). `smiPrepisy`: false pro telefon – ten přepisy číst nesmí (remote-scope).
 */
export async function najdiKonverzace({ dotaz, sessions = [], koreny = [], now = Date.now(), smiPrepisy = true, limity = LIMITY }) {
  const r = typeof dotaz === 'string' ? rozeberDotaz(dotaz, now) : dotaz;
  const kandidati = new Map();
  const vOkne = (zac, kon) => !r.okno || (kon >= r.okno.od && zac <= r.okno.do);
  const pridej = (k) => {
    if (r.aplikace && !String(k.app || '').toLowerCase().includes(r.aplikace.toLowerCase())) return;
    const t = skore(k.nazev, r.slova);
    const u = skore(k.uzivatel, r.slova);
    const a = skore(k.agent, r.slova);
    const zasahy = Math.max(t.zasahy, u.zasahy, a.zasahy, skore(`${k.nazev}\n${k.uzivatel}\n${k.agent}`, r.slova).zasahy);
    if (r.slova.length && !zasahy) return;
    const body = t.body * 4 + u.body * 2 + a.body;
    const stare = kandidati.get(k.klic);
    if (!stare || stare.body < body) kandidati.set(k.klic, { ...k, zasahy, body, okno: vOkne(k.zacatek, k.konec) });
  };

  // 1) Co drží přehled – rychlé a i pro webové chaty.
  for (const s of sessions) {
    if (s.proces) continue;
    pridej({ klic: s.id, sessionId: s.id, app: s.app, cwd: s.cwd || '', zacatek: s.startedAt || s.lastAt, konec: s.lastAt, nazev: s.title || '', uzivatel: `${s.firstPrompt || ''}\n${s.lastPrompt || ''}`, agent: '' });
  }

  // 2) Přepisy na disku – i starší než okno přehledu. Telefon je číst nesmí.
  let prohledano = 0;
  let nedokonceno = false;
  if (smiPrepisy) {
    const konecCasu = Date.now() + limity.casMs;
    venku: for (const { cesta, app } of koreny) {
      for await (const soubor of jsonlSoubory(cesta)) {
        if (prohledano >= limity.soubory || Date.now() > konecCasu) { nedokonceno = true; break venku; }
        if (r.okno) {
          const st = await fs.stat(soubor).catch(() => null);
          // Poslední zápis před začátkem okna = konverzace v okně nebyla. Dlouhé konverzace
          // mohou začít v okně a pokračovat po něm, proto se horní mez filtruje až podle obsahu.
          if (!st || st.mtimeMs < r.okno.od - DEN) continue;
        }
        prohledano++;
        const k = await prectiPrepis(soubor, app);
        if (!k) continue;
        const sessionId = sessions.find((s) => s.id.endsWith(`:${k.id}`))?.id || null;
        pridej({ ...k, klic: sessionId || `${app}:${k.id}`, sessionId });
      }
    }
  }

  // V zadaném období nic: druhé kolo bez časového filtru, ať člověk vidí shodu z jiné doby
  // (s pamětí, kterým souborem začít, by to bylo rychlejší; přepisů je řádově stovky, stačí to).
  if (r.okno && ![...kandidati.values()].some((k) => k.okno) && r.slova.length) {
    const druhe = await najdiKonverzace({ dotaz: { ...r, okno: null }, sessions, koreny, now, smiPrepisy, limity });
    return { ...druhe, rozbor: r, prohledano: prohledano + druhe.prohledano, mimoOkno: druhe.vysledky.length > 0 };
  }

  const vse = [...kandidati.values()].sort((a, b) => b.zasahy - a.zasahy || Number(b.okno) - Number(a.okno) || b.body - a.body || b.konec - a.konec);
  const vOknu = r.okno ? vse.filter((k) => k.okno) : vse;
  const vybrane = (vOknu.length ? vOknu : vse).slice(0, limity.vysledky);
  return {
    rozbor: r,
    prohledano,
    nedokonceno,
    mimoOkno: Boolean(r.okno && !vOknu.length && vse.length),
    vysledky: vybrane.map((k) => ({
      sessionId: k.sessionId || null,
      nazev: k.nazev || ui('Konverzace bez názvu'),
      app: k.app || '',
      slozka: k.cwd ? path.basename(k.cwd) : '',
      zacatek: k.zacatek || 0,
      konec: k.konec || 0,
      ukazka: smiPrepisy ? ukazka(`${k.uzivatel}\n${k.agent}` || k.nazev, r.slova) : '',
      pokracovat: smiPrepisy && k.app === 'Claude Code' && !k.sessionId ? `claude --resume ${k.id}` : smiPrepisy && k.app === 'Codex' && !k.sessionId ? `codex resume ${k.id}` : '',
      shoda: r.slova.length ? k.zasahy / r.slova.length : 1,
    })),
  };
}

/** Krátká věta nad výsledky – v češtině, rozhraní ji přeloží (src/texty.js). */
export function vetaOdpovedi(v) {
  if (!v.vysledky.length) {
    if (v.nedokonceno) return ui('V čase, který mám na hledání, jsem nic nenašel – prohledal jsem {0} přepisů, ale ne všechny. Zkus dotaz zúžit (nástroj, období).', v.prohledano);
    return ui('Nic jsem nenašel. Prohledal jsem konverzace v přehledu a {0} přepisů na tomto počítači. Zkus jiná slova nebo širší období.', v.prohledano);
  }
  if (v.mimoOkno) return ui('V zadaném období nic, ale tyhle konverzace k tomu sedí z jiné doby:');
  return v.vysledky.length === 1 ? ui('Tohle je nejlepší shoda:') : ui('Tohle jsou nejlepší shody (nejlepší nahoře):');
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
