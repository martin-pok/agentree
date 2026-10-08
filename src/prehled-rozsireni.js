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
  const veta = {
    problem: ui('Problém u agentů: {0}', problemy),
    pozor: ui('Na tvé rozhodnutí čeká agentů: {0}', cekaji.length),
    nevim: ui('Nepodařilo se zjistit, co na počítači běží'),
    ok: pracuji.length ? ui('Vše běží v pořádku') : ui('V pořádku, nikdo nepracuje'),
  }[stav];
  return {
    zdravi: { stav, veta, pracuje: pracuji.length, cekaNaTebe: cekaji.length, selhalo: selhalo.length, limit: limit.length },
    rozhodnuti: [...cekaji, ...selhalo, ...limit].slice(0, MAX).map((s) => ({ ...polozka(s), status: s.status })),
    pracuji: pracuji.slice(0, MAX).map(polozka),
  };
}
