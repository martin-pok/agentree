// Pomocník: „co na mě čeká?“. Nejpřirozenější první otázka nemá jít do hledání ve starých
// konverzacích (to odpovědělo „Nic se nenašlo“, i když na rozhodnutí čekali tři agenti), ale
// rovnou ze živého stavu – stejného seznamu agentů, ze kterého kreslí Přehled a Agenti. Stav
// odvozuje jen server (src/model.js#deriveStatus); tady se jen čte. Lokálně, bez modelu, bez
// odhadů: když stav ještě není načtený, řekne se to, ne „nic nečeká“.
import { tr } from './i18n.js';
import { plural, STATUS } from './format.js';

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();

// „co na mě čeká“, „čeká na mě něco?“, „potřebuje mě někdo?“, „kdo čeká na moje rozhodnutí“,
// „co mám schválit“; „what is waiting for me“, „anything waiting on me?“, „who needs me“.
// Jen tvary, které míří na uživatele: „co potřebuju k propojení“ je otázka na nastavení.
const OTAZKA_CS = /\b(?:cek\w*|potrebuj[ei]) (?:na )?(?:me|mne|mou|moje|muj)\b|\bna (?:me|mne) cek|\b(?:me|mne) (?:cek\w*|potrebuj[ei])\b|\bcek\w* (?:na )?(?:moje |tve |me )?(?:rozhodnuti|schvaleni|povoleni|odpoved)|\bco mam (?:rozhodnout|schvalit|potvrdit|povolit)\b|^(?:co|kdo|nekdo|neco) (?:ted |prave )?cek\w*(?: ted)?$/;
const OTAZKA_EN = /\bwait\w* (?:for|on) (?:me|my)\b|\bneeds? (?:me|my (?:attention|decision|input|approval|answer))\b|\bpending (?:decisions?|approvals?|questions?)\b|\b(?:what|who|anything|anyone) (?:s |is )?(?:waiting|pending)\b/;
const HLEDANI = /\b(?:najd|najit|hledej|vyhledej|find|search)/;

export function jeOtazkaNaCekani(dotaz) {
  const q = norm(dotaz);
  return Boolean(q) && !HLEDANI.test(q) && (OTAZKA_CS.test(q) || OTAZKA_EN.test(q));
}

const MAX = 6;
const kdy = (s) => s.pending?.at || s.failure?.at || s.limit?.at || s.lastAt || 0;

/**
 * Odpověď z živého stavu. `agenti` = agentsList() (state.js) – tytéž konverzace, které počítá
 * Přehled. `nacteno`/`spojeni` ze state: bez načteného stavu se nic netvrdí. Vrací zprávu ve tvaru,
 * který kreslí robot-guide.js (text, vysledky s odkazem na agenta, cile, pozn).
 */
export function coNaMeCeka({ agenti = [], nacteno = false, spojeni = 'live' } = {}) {
  if (!nacteno) return { text: tr('Stav agentů se ještě načítá, takže se nepodařilo zjistit, jestli na tebe někdo čeká. Zkus to za chvíli znovu.'), vysledky: [] };
  const rozhodnuti = agenti.filter((s) => s.status === 'needs_input').sort((a, b) => kdy(b) - kdy(a));
  const problemy = agenti.filter((s) => s.status === 'failed' || s.status === 'limited').sort((a, b) => kdy(b) - kdy(a));
  const vety = [];
  if (rozhodnuti.length) vety.push(plural(rozhodnuti.length, 'Na tvé rozhodnutí čeká {0} agent.', 'Na tvé rozhodnutí čekají {0} agenti.', 'Na tvé rozhodnutí čeká {0} agentů.').replace('{0}', rozhodnuti.length));
  if (problemy.length) vety.push(plural(problemy.length, 'Selhal nebo narazil na limit {0} agent.', 'Selhali nebo narazili na limit {0} agenti.', 'Selhalo nebo narazilo na limit {0} agentů.').replace('{0}', problemy.length));
  const nezive = spojeni !== 'live' ? tr('Živé spojení teď není potvrzené, údaje nemusí být aktuální.') : '';
  if (!vety.length) return { text: tr('Na tvé rozhodnutí teď nečeká žádný agent a žádný neselhal ani nenarazil na limit.'), vysledky: [], ...(nezive ? { pozn: nezive } : {}) };
  const vse = [...rozhodnuti, ...problemy];
  const vysledky = vse.slice(0, MAX).map((s) => ({
    sessionId: s.id,
    nazev: s.title || '',
    app: [STATUS[s.status]?.label, s.app].filter(Boolean).join(' · '),
    konec: kdy(s),
    slozka: s.project || '',
    ukazka: s.reason || '',
  }));
  const cile = rozhodnuti.length ? [{ label: tr('Potřebuje tebe'), kde: tr('Agenti'), route: '#/agenti?stav=needs_input' }] : [];
  const pozn = [vse.length > MAX ? tr('Další najdeš v sekci Agenti.') : '', nezive].filter(Boolean).join(' ');
  return { text: vety.join(' '), vysledky, cile, ...(pozn ? { pozn } : {}) };
}
