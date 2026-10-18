import { selectAgents } from '../public/js/agent-selection.js';
import { ui } from './texty.js';

// Souhrn pro okno rozšíření pro Chrome (POST /api/extension/prehled): stav agentů jednou větou,
// kdo čeká na rozhodnutí, kdo pracuje a poslední konverzace napříč nástroji. Jen to, co rozšíření
// ukáže – žádný přepis, žádné cesty. Selhání výpisu procesů se nehlásí jako „nic neběží“ (CLAUDE.md).
const MAX = 4;
// Poslední konverzace pro časovou osu okna: jen titulek, nástroj, stav a čas – nic dalšího.
const MAX_NEDAVNE = 8;
const kratce = (t, n) => (typeof t === 'string' ? t.replace(/\s+/g, ' ').trim().slice(0, n) : '');
const polozka = (s) => ({ id: s.id, title: kratce(s.title, 120), app: kratce(s.app, 40), reason: kratce(s.status === 'working' ? s.activity || s.reason : s.reason || s.activity, 160), at: s.lastAt || 0 });

export function prehledProRozsireni(sessions, { procesyNevim = false } = {}) {
  // Align counts with the desktop's agent list: do not count hidden child
  // threads or multiple runs of the same recurring task as separate agents.
  // Archived sessions stay excluded from the extension's live summary.
  const viditelne = selectAgents(sessions.filter((s) => !s.archived));
  const podle = (st) => viditelne.filter((s) => s.status === st).sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));
  const cekaji = podle('needs_input');
  const pracuji = podle('working');
  const selhalo = podle('failed');
  const limit = podle('limited');
  // Jako lišta macOS (pocetProListu): agenti, kteří podle posledních známých dat pracovali, ale
  // čerstvý stav chybí. Kvůli nim nejde říct „nikdo nepracuje“.
  const nejiste = viditelne.filter((s) => s.status === 'waiting' && s.stale).length;
  const problemy = selhalo.length + limit.length;
  const stav = problemy ? 'problem' : cekaji.length ? 'pozor' : procesyNevim ? 'nevim' : 'ok';
  // Tvary podle počtu jako v boxu Stav agentů v aplikaci (public/js/stav-vety.js): jeden tvar = jeden
  // text (src/texty.js). Okno rozšíření si větu skládá samo z počtů, ať mluví svým jazykem; tahle
  // česká zůstává pro starší verze rozšíření.
  const tvar = (n, jeden, par, mnoho) => (n === 1 ? jeden : n >= 2 && n <= 4 ? par : mnoho);
  const veta = {
    problem: !limit.length ? tvar(problemy, ui('Selhal {0} agent', problemy), ui('Selhali {0} agenti', problemy), ui('Selhalo {0} agentů', problemy))
      : !selhalo.length ? tvar(problemy, ui('Na limit narazil {0} agent', problemy), ui('Na limit narazili {0} agenti', problemy), ui('Na limit narazilo {0} agentů', problemy))
        : tvar(problemy, ui('Problém má {0} agent', problemy), ui('Problém mají {0} agenti', problemy), ui('Problém má {0} agentů', problemy)),
    pozor: tvar(cekaji.length, ui('Potřebuje tě {0} agent', cekaji.length), ui('Potřebují tě {0} agenti', cekaji.length), ui('Potřebuje tě {0} agentů', cekaji.length)),
    nevim: ui('Nepodařilo se zjistit, co na počítači běží'),
    ok: pracuji.length ? ui('Vše běží v pořádku') : nejiste ? tvar(nejiste, ui('U {0} agenta chybí čerstvý stav', nejiste), ui('U {0} agentů chybí čerstvý stav', nejiste), ui('U {0} agentů chybí čerstvý stav', nejiste)) : ui('V pořádku, nikdo nepracuje'),
  }[stav];
  const rozhodnuti = [...cekaji, ...selhalo, ...limit].slice(0, MAX);
  const prace = pracuji.slice(0, MAX);
  // Nedávné = viditelné konverzace, které okno ještě neukazuje v rozhodnutích ani mezi pracujícími
  // (i ty nad limit čtyř položek, aby se žádná nestratila). Archiv se neukazuje.
  const ukazane = new Set([...rozhodnuti, ...prace].map((s) => s.id));
  const nedavne = viditelne
    .filter((s) => !ukazane.has(s.id) && s.status !== 'archived')
    .sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0))
    .slice(0, MAX_NEDAVNE)
    .map((s) => ({ id: s.id, title: kratce(s.title, 120), app: kratce(s.app, 40), status: s.status, at: s.lastAt || 0 }));
  return {
    zdravi: { stav, veta, pracuje: pracuji.length, cekaNaTebe: cekaji.length, selhalo: selhalo.length, limit: limit.length, procesyNevim: Boolean(procesyNevim), nejiste },
    rozhodnuti: rozhodnuti.map((s) => ({ ...polozka(s), status: s.status })),
    pracuji: prace.map(polozka),
    nedavne,
  };
}
