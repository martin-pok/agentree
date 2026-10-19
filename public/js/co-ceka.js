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
  const r = zeStavu(agenti, spojeni);
  if (!r) return { text: tr('Na tvé rozhodnutí teď nečeká žádný agent a žádný neselhal ani nenarazil na limit.'), vysledky: [], ...poznamka(spojeni) };
  return r;
}

// Rozhodnutí a problémy v seznamu agentů jako zpráva Pomocníka; null, když nic není.
function zeStavu(agenti, spojeni) {
  const rozhodnuti = agenti.filter((s) => s.status === 'needs_input').sort((a, b) => kdy(b) - kdy(a));
  const problemy = agenti.filter((s) => s.status === 'failed' || s.status === 'limited').sort((a, b) => kdy(b) - kdy(a));
  const vety = [];
  if (rozhodnuti.length) vety.push(plural(rozhodnuti.length, 'Na tvé rozhodnutí čeká {0} agent.', 'Na tvé rozhodnutí čekají {0} agenti.', 'Na tvé rozhodnutí čeká {0} agentů.').replace('{0}', rozhodnuti.length));
  if (problemy.length) vety.push(plural(problemy.length, 'Selhal nebo narazil na limit {0} agent.', 'Selhali nebo narazili na limit {0} agenti.', 'Selhalo nebo narazilo na limit {0} agentů.').replace('{0}', problemy.length));
  if (!vety.length) return null;
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
  const pozn = [vse.length > MAX ? tr('Další najdeš v sekci Agenti.') : '', poznamka(spojeni).pozn].filter(Boolean).join(' ');
  return { text: vety.join(' '), vysledky, cile, ...(pozn ? { pozn } : {}) };
}

const poznamka = (spojeni) => (spojeni !== 'live' ? { pozn: tr('Živé spojení teď není potvrzené, údaje nemusí být aktuální.') } : {});

// „Proč Codex nepracuje?“, „co je s Cursorem“, „why is Claude Code stuck“: otázka na stav jednoho
// nástroje, jehož agenty Agenteeq zná. Odpověď patří živému stavu (selhání, limit, čekání na
// rozhodnutí), ne obecnému návodu – ten neví, že Codex právě stojí na vyčerpaném limitu.
// Návod „jak propojit Codex“ sem nepatří: začíná „jak/kde“ a na stav se neptá.
const NA_STAV = /\b(?:proc|why|nepracuj\w*|nefunguj\w*|nejde|nejede|stoj[ií]\w*|zasek\w*|stuck|limit\w*|selhal\w*|fail\w*|chyb\w*|error|nebezi|neodpovid\w*|co se deje|co je s|whats? wrong|not working|doesnt work|isnt working|status|stav)\b/;
const NAVOD = /^(?:jak|kde|kam|how|where)\b/;
const prvniSlovo = (app) => norm(app).split(' ')[0];

export function nastrojVOtazce(dotaz, agenti = []) {
  const q = norm(dotaz);
  if (!q || HLEDANI.test(q) || NAVOD.test(q) || !NA_STAV.test(q)) return null;
  const obsahuje = (fraze) => fraze && new RegExp(`(?:^| )${fraze}(?:\\w*)(?: |$)`).test(q);
  const appy = [...new Set(agenti.map((s) => s.app).filter(Boolean))];
  // Celý název („claude code“) má přednost před prvním slovem („claude“ = všechny Claude nástroje).
  let shoda = appy.filter((a) => obsahuje(norm(a)));
  let nazev = shoda.length === 1 ? shoda[0] : '';
  if (!shoda.length) {
    const slovo = appy.map(prvniSlovo).find((w) => w.length > 2 && obsahuje(w));
    if (!slovo) return null;
    shoda = appy.filter((a) => prvniSlovo(a) === slovo);
    nazev = shoda.length === 1 ? shoda[0] : slovo[0].toUpperCase() + slovo.slice(1);
  }
  return { nazev: nazev || shoda[0], agenti: agenti.filter((s) => shoda.includes(s.app)) };
}

/** Stav jednoho nástroje ze živého seznamu agentů – stejná pravidla jako coNaMeCeka. */
export function stavNastroje({ nazev, agenti = [], nacteno = false, spojeni = 'live' } = {}) {
  if (!nacteno) return { text: tr('Stav agentů se ještě načítá, takže se nepodařilo zjistit, jestli na tebe někdo čeká. Zkus to za chvíli znovu.'), vysledky: [] };
  const r = zeStavu(agenti, spojeni);
  if (r) return { ...r, text: `${nazev}: ${r.text}` };
  return { text: tr('{0}: žádný agent teď neselhal, nenarazil na limit ani nečeká na tebe.', nazev), vysledky: [], ...poznamka(spojeni) };
}
