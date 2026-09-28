// Překlad textů, které posílá server (chybové hlášky, stavy zdrojů, popisky, upozornění).
//
// Server píše česky a texty rozhraní označuje ui('…') (src/texty.js). Slovník jejich překladů je
// public/js/i18n/en-server.js a úplnost hlídá test/i18n.test.mjs. Tady se překládají na jednom místě,
// kudy data ze serveru do klientu vstupují – snímek stavu a stream (public/js/state.js) a odpovědi
// API (public/js/api.js) –, takže obrazovky dostávají texty už v jazyce rozhraní a nic dalšího
// neřeší. Tvar dat zůstává stejný; překládají se jen hodnoty, nikdy klíče.
//
// Text se hledá nejdřív celý. Když ho server složil z proměnných („3 konverzace s aktivitou za 30
// dní.“), pozná se podle vzoru ze slovníku („{0} konverzace s aktivitou za {1} dní.“): hodnoty se
// vyjmou, samy se zkusí přeložit (název limitu, druh složky) a dosadí se do anglické věty, klidně
// v jiném pořadí. Co ve slovníku není, zůstane, jak přišlo – nikdy se nevymýšlí.
//
// Modul je bez DOM, aby šel testovat v Node (test/i18n.test.mjs).

// Delší texty jsou obsah (přepis, odpověď modelu, stderr), ne věty rozhraní: vzory se na ně nezkouší.
const VZOR_MAX = 600;
const HLOUBKA_MAX = 3;
const CACHE_MAX = 4000;

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function sestavVzor(klic, preklad) {
  const casti = klic.split(/(\{\d+\})/);
  const skupiny = new Map(); // index proměnné → číslo skupiny v regulárním výrazu
  let re = '^';
  let n = 0;
  let pevne = 0;
  let nejdelsi = '';
  for (const c of casti) {
    const m = /^\{(\d+)\}$/.exec(c);
    if (m) {
      const i = Number(m[1]);
      if (skupiny.has(i)) re += `\\${skupiny.get(i)}`;
      else { skupiny.set(i, ++n); re += '([\\s\\S]+?)'; }
    } else if (c) {
      re += escRe(c);
      pevne += c.length;
      if (c.length > nejdelsi.length) nejdelsi = c;
    }
  }
  return { re: new RegExp(`${re}$`), skupiny, preklad, pevne, nejdelsi };
}

// Čísla a data složená serverem po česku („20 000“, „28. 9. 2026 14:05:00“) přepíše do zápisu
// jazyka rozhraní. Jiné hodnoty (názvy, cesty, kódy) nechá beze změny.
const MENY = { 'Kč': 'CZK', 'US$': 'USD', '€': 'EUR' };
const cislo = (s) => Number(s.replace(/[\s  ]/g, '').replace(',', '.'));
function preformatuj(hodnota, locale) {
  const s = hodnota.trim();
  // Částka tak, jak ji píše src/spend.js (stejná pravidla jako fmtMoney v public/js/format.js).
  const castka = /^(-?\d{1,3}(?:[\s  ]\d{3})*(?:,\d+)?)[\s  ](Kč|US\$|€)$/.exec(s);
  if (castka) {
    const mena = MENY[castka[2]];
    return new Intl.NumberFormat(locale, { style: 'currency', currency: mena, maximumFractionDigits: mena === 'CZK' ? 0 : 2, minimumFractionDigits: 0 }).format(cislo(castka[1]));
  }
  if (/^-?\d{1,3}(?:[\s  ]\d{3})+$/.test(s)) return cislo(s).toLocaleString(locale);
  if (/^-?\d+,\d+$/.test(s)) return Number(s.replace(',', '.')).toLocaleString(locale);
  const d = /^(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
  if (d) {
    const datum = new Date(Number(d[3]), Number(d[2]) - 1, Number(d[1]), Number(d[4] || 0), Number(d[5] || 0), Number(d[6] || 0));
    if (!Number.isNaN(datum.getTime())) {
      return d[4] ? datum.toLocaleString(locale, { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : datum.toLocaleDateString(locale);
    }
  }
  return hodnota;
}

/**
 * Vrátí funkci, která přeloží jeden text ze serveru. `server` je slovník textů označených ui(),
 * `zaloha` slovník textů klientu (stejné věty se nepřekládají dvakrát).
 */
export function vytvorPrekladac(server = {}, zaloha = {}, locale = 'en-GB') {
  const vzory = Object.entries(server)
    .filter(([k]) => /\{\d+\}/.test(k))
    .map(([k, v]) => sestavVzor(k, v))
    // Konkrétnější vzor (víc pevného textu) má přednost před obecnějším.
    .sort((a, b) => b.pevne - a.pevne);
  const cache = new Map();

  const presne = (text) => (Object.hasOwn(server, text) ? server[text] : Object.hasOwn(zaloha, text) ? zaloha[text] : undefined);

  function preloz(text, hloubka = 0) {
    if (typeof text !== 'string' || !text) return text;
    const hotovo = presne(text);
    if (hotovo !== undefined) return hotovo;
    if (hloubka >= HLOUBKA_MAX || text.length > VZOR_MAX) return text;
    for (const v of vzory) {
      if (!text.includes(v.nejdelsi)) continue;
      const m = v.re.exec(text);
      if (!m) continue;
      return v.preklad.replace(/\{(\d+)\}/g, (cely, i) => {
        const skupina = v.skupiny.get(Number(i));
        return skupina === undefined ? cely : hodnota(m[skupina], hloubka + 1);
      });
    }
    // „Popisek: podrobnost“ – činnost agenta („Spouští příkaz: npm test“) skládá konektor z popisku
    // a z obsahu, který se nepřekládá. Přeloží se jen popisek, a jen když je celý ve slovníku.
    const dvojtecka = text.indexOf(': ');
    if (dvojtecka > 0) {
      const popisek = presne(text.slice(0, dvojtecka));
      if (popisek !== undefined) return popisek + text.slice(dvojtecka);
    }
    return text;
  }

  // Hodnota dosazená do věty: sama může být text rozhraní (název limitu, „prohlížeč“), číslo nebo
  // datum. Název vložený doprostřed věty mívá malé písmeno („týdenní limit“), proto se zkusí i tvar
  // s velkým a výsledek se zase zmenší.
  function hodnota(h, hloubka) {
    const p = preloz(h, hloubka);
    if (p !== h) return p;
    const velke = h.charAt(0).toUpperCase() + h.slice(1);
    if (velke !== h) {
      const pv = preloz(velke, hloubka);
      if (pv !== velke) return pv.charAt(0).toLowerCase() + pv.slice(1);
    }
    return preformatuj(h, locale);
  }

  return function trServer(text) {
    if (typeof text !== 'string' || !text) return text;
    if (cache.has(text)) return cache.get(text);
    const vysledek = preloz(text);
    if (cache.size >= CACHE_MAX) cache.clear();
    cache.set(text, vysledek);
    return vysledek;
  };
}

// Pole, která nesou obsah uživatele nebo identifikátory – ty se nepřekládají nikdy (cesty, zadání,
// poznámky, nastavení, kódy stavů, adresy, příkazy).
const NEPREKLADAT = new Set([
  'id', 'key', 'kind', 'state', 'status', 'level', 'scope', 'provider', 'connector', 'logo', 'group',
  'cwd', 'path', 'home', 'root', 'dataDir', 'bin', 'node', 'folders', 'repo', 'worktree', 'branch', 'base', 'url', 'remoteUrl',
  'resume', 'command', 'argv', 'args', 'log', 'origin', 'model', 'models', 'effort', 'version',
  'prompt', 'lastPrompt', 'firstPrompt', 'notes', 'instructions', 'email', 'jmeno', 'user', 'fullName',
  'settings', 'host', 'confidence', 'code', 'pin', 'token', 'maskedKey', 'taskName', 'project', 'dnsName', 'ips', 'addresses',
]);
// Přepis: překládají se jen texty, které píše sám Agenteeq nebo konektor (název nástroje, systémové
// a chybové řádky, zástupný text odpovědi); zadání uživatele nikdy.
const ROLE_S_TEXTEM_APLIKACE = new Set(['system', 'error', 'tool', 'assistant']);

/** Vrátí funkci, která projde data ze serveru a přeloží v nich texty rozhraní (na místě). */
export function vytvorPrelozData(trServer) {
  function zaznam(e) {
    if (!e || typeof e !== 'object') return e;
    if (typeof e.tool === 'string') e.tool = trServer(e.tool);
    if (typeof e.text === 'string' && ROLE_S_TEXTEM_APLIKACE.has(e.role) && e.text.length <= VZOR_MAX) e.text = trServer(e.text);
    return e;
  }
  function projdi(v) {
    if (typeof v === 'string') return trServer(v);
    if (Array.isArray(v)) {
      for (let i = 0; i < v.length; i++) v[i] = projdi(v[i]);
      return v;
    }
    if (v && typeof v === 'object') {
      for (const k of Object.keys(v)) {
        if (NEPREKLADAT.has(k)) continue;
        if ((k === 'entries' || k === 'transcript') && Array.isArray(v[k])) v[k].forEach(zaznam);
        else v[k] = projdi(v[k]);
      }
    }
    return v;
  }
  return projdi;
}
