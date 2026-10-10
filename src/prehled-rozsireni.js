import { ui } from './texty.js';

// Souhrn pro okno rozšíření pro Chrome (POST /api/extension/prehled): stav agentů jednou větou,
// kdo čeká na rozhodnutí a kdo pracuje. Jen to, co rozšíření ukáže – žádný přepis, žádné cesty.
// Selhání výpisu procesů se nehlásí jako „nic neběží“ (CLAUDE.md).
const MAX = 4;
const kratce = (t, n) => (typeof t === 'string' ? t.replace(/\s+/g, ' ').trim().slice(0, n) : '');
const polozka = (s) => ({ id: s.id, title: kratce(s.title, 120), app: kratce(s.app, 40), reason: kratce(s.status === 'working' ? s.activity || s.reason : s.reason || s.activity, 160), at: s.lastAt || 0 });

export function prehledProRozsireni(sessions, { procesyNevim = false } = {}) {
  const viditelne = sessions.filter((s) => !s.archived);
  const podle = (st) => viditelne.filter((s) => s.status === st).sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));
  const cekaji = podle('needs_input');
  const pracuji = podle('working');
  const selhalo = podle('failed');
  const limit = podle('limited');
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
    ok: pracuji.length ? ui('Vše běží v pořádku') : ui('V pořádku, nikdo nepracuje'),
  }[stav];
  return {
    zdravi: { stav, veta, pracuje: pracuji.length, cekaNaTebe: cekaji.length, selhalo: selhalo.length, limit: limit.length },
    rozhodnuti: [...cekaji, ...selhalo, ...limit].slice(0, MAX).map((s) => ({ ...polozka(s), status: s.status })),
    pracuji: pracuji.slice(0, MAX).map(polozka),
  };
}
