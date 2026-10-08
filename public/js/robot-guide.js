// Pomocník: kulaté tlačítko s robotem vpravo dole, které otevře chat. Rozumí dvěma druhům otázek:
//   - „jak zapnu / kde najdu …“ → odpoví z rejstříku stránek a nastavení (public/js/hledani.js)
//     a nabídne tlačítko, které tam rovnou vede;
//   - „najdi chat, kde jsme před cca 3 měsíci řešili …“ → zeptá se serveru (src/pomocnik.js),
//     který prohledá konverzace na tomto počítači; výsledky jdou otevřít nebo zkopírovat příkaz
//     k pokračování.
// Všechno běží lokálně. Skrýt jde v Nastavení → Účet a vzhled. Historie chatu žije jen v této
// relaci okna (sessionStorage), nikam se neukládá.
import { robot } from './home-studio.js';
import { tr, LOCALE } from './i18n.js';
import { state } from './state.js';
import { request } from './api.js';
import { esc, dateLong } from './format.js';
import { hledejCile } from './hledani.js';
import { goToSettings, goToSection } from './jump.js';
import { copy, agentHref } from './ui.js';
import { zkratka } from './system.js';

const TIPY = () => ({
  prehled: tr('Agenta vybereš tlačítkem v poli pro zadání. Robot nahoře ukazuje, jestli na tebe někdo čeká.'),
  agenti: tr('Filtr „Potřebuje tebe“ ukáže agenty čekající na rozhodnutí. Otevři agenta a pokračuj v jeho nástroji.'),
  agent: tr('Přepis ukazuje kontext. Tlačítko „Pokračovat“ tě přenese do nástroje, kde agent čeká na odpověď.'),
  projekty: tr('Projekt propojí konverzace z různých nástrojů. V Nezařazených najdeš práci, která zatím projekt nemá.'),
  projekt: tr('V detailu projektu najdeš jeho konverzace a aktivitu napříč nástroji.'),
  statistiky: tr('Tokeny z přepisů popisují zaznamenanou aktivitu. Skutečné účtované náklady hledej v Útratě po propojení API.'),
  utrata: tr('Bez propojeného API nejsou skutečné náklady dostupné. Ruční záznamy a předplatné uvidíš odděleně.'),
  upozorneni: tr('Otevři souvisejícího agenta a zjisti, co potřebuje. Přečtení upozornění samo požadavek agenta nevyřeší.'),
  dovednosti: tr('Tady můžeš procházet nalezené dovednosti. Jejich dostupnost závisí na připojených nástrojích a zdrojích.'),
  nastaveni: tr('V části Účet a vzhled změníš téma aplikace. Tam jde i schovat tohle tlačítko pomocníka.'),
});

const NAVRHY = () => [
  tr('Najdi chat, kde jsme před cca 3 měsíci řešili fakturaci'),
  tr('Jak zapnu upozornění na telefon?'),
  tr('Kde nastavím rozpočet?'),
];

const ULOZENO = 'agenteeq:pomocnik:zpravy';
const trasa = () => location.hash.replace(/^#\//, '').split(/[/?]/)[0] || 'prehled';
const bezDiakritiky = (s) => String(s || '').toLocaleLowerCase(LOCALE).normalize('NFD').replace(/[̀-ͯ]/g, '');
// Slova otázky, která v názvech nastavení nejsou („jak“, „zapnu“…) – hledá se jen podle zbytku.
const VYPLN = new Set('jak kde kam co mam muzu lze se da na v ve o u k s z do pro za si mi je jsou zapnu zapnout zapnuti vypnu vypnout vypnuti nastavim nastavit nastaveni zmenim zmenit prepnu prepnout skryju skryt zobrazim zobrazit najdu najit funkci funkce moznost moznosti tu tam to ten ta how where do i can enable disable turn on off set change find the a an to is in of'.split(' '));

let el = null;
let zpravy = [];
let pracuje = false;

function nactiZpravy() {
  try { zpravy = JSON.parse(sessionStorage.getItem(ULOZENO) || '[]').slice(-30); } catch { zpravy = []; }
}
function ulozZpravy() {
  try { sessionStorage.setItem(ULOZENO, JSON.stringify(zpravy.slice(-30))); } catch { /* bez úložiště jen bez historie */ }
}

const zvyrazni = (text, slova) => {
  let html = esc(text);
  for (const w of slova || []) {
    if (w.length < 3) continue;
    const k = w.length > 5 ? w.slice(0, -2) : w;
    // Zvýrazňuje se v textu bez diakritiky, ale vkládá do originálu: délky se shodují (NFD bez znamének).
    const norm = bezDiakritiky(html);
    let out = '';
    let i = 0;
    let j;
    while ((j = norm.indexOf(k, i)) >= 0) {
      out += `${html.slice(i, j)}<mark>${html.slice(j, j + k.length)}</mark>`;
      i = j + k.length;
    }
    html = out + html.slice(i);
  }
  return html;
};

function zpravaHtml(z, i) {
  if (z.kdo === 'ja') return `<div class="pm-msg pm-msg--ja">${esc(z.text)}</div>`;
  const cile = (z.cile || []).map((c, j) => `<li><button type="button" class="pm-cil" data-cil="${i}:${j}"><span><b>${esc(c.label)}</b>${c.kde ? `<small>${esc(c.kde)}</small>` : ''}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button></li>`).join('');
  const vysledky = (z.vysledky || []).map((v, j) => `<li class="pm-vysledek">
      <b>${esc(v.nazev)}</b>
      <small>${esc([v.app, v.konec ? dateLong(v.konec) : '', v.slozka].filter(Boolean).join(' · '))}</small>
      ${v.ukazka ? `<p>${zvyrazni(v.ukazka, z.slova)}</p>` : ''}
      <span class="pm-akce">${v.sessionId ? `<a class="btn btn--sm" href="${esc(agentHref(v.sessionId))}">${tr('Otevřít')}</a>` : ''}${v.pokracovat ? `<button type="button" class="btn btn--sm" data-kopirovat="${i}:${j}">${tr('Kopírovat příkaz')}</button>` : ''}</span>
    </li>`).join('');
  return `<div class="pm-msg pm-msg--on">
    ${z.text ? `<p>${esc(z.text)}</p>` : ''}
    ${z.lokalne ? `<p class="pm-lokalne">${esc(z.lokalne.text)}<small>${esc(tr('Zformuloval lokální model {0} na tomto počítači.', z.lokalne.model))}</small></p>` : ''}
    ${cile ? `<ul class="pm-cile">${cile}</ul>` : ''}
    ${vysledky ? `<ul class="pm-vysledky">${vysledky}</ul>` : ''}
    ${z.pozn ? `<p class="pm-pozn">${esc(z.pozn)}</p>` : ''}
  </div>`;
}

function vykresli() {
  if (!el) return;
  const log = el.querySelector('.pm-log');
  const uvod = `<div class="pm-msg pm-msg--on"><p>${esc(tr('Ahoj, jsem pomocník Agenteeq. Najdu dřívější konverzaci se kterýmkoli agentem nebo poradím, kde co v aplikaci zapnout.'))}</p>${TIPY()[trasa()] ? `<p class="pm-tip"><b>${tr('Tip k této stránce:')}</b> ${esc(TIPY()[trasa()])}</p>` : ''}</div>`;
  log.innerHTML = uvod + zpravy.map(zpravaHtml).join('') + (pracuje ? `<div class="pm-msg pm-msg--on pm-pise" aria-label="${tr('Hledám…')}"><i></i><i></i><i></i></div>` : '');
  el.querySelector('.pm-navrhy').hidden = zpravy.length > 0;
  log.scrollTop = log.scrollHeight;
}

// „Jak zapnu …“: hledání v rejstříku stránek a nastavení bez výplňových slov; když celé spojení
// nic nenajde, zkusí se slova jednotlivě a vezmou se nejlepší shody.
function poradSNastavenim(dotaz) {
  const slova = bezDiakritiky(dotaz).replace(/[?!.,„“"]/g, ' ').split(/\s+/).filter((w) => w && !VYPLN.has(w));
  if (!slova.length) return [];
  let cile = hledejCile(slova.join(' '));
  if (!cile.length) {
    const mapa = new Map();
    for (const w of slova) for (const c of hledejCile(w)) mapa.set(c.id, { ...c, skore: (mapa.get(c.id)?.skore || 0) + c.skore });
    cile = [...mapa.values()].sort((a, b) => b.skore - a.skore);
  }
  return cile.slice(0, 4);
}

async function posli(text) {
  const dotaz = text.trim();
  if (!dotaz || pracuje) return;
  zpravy.push({ kdo: 'ja', text: dotaz });
  pracuje = true;
  vykresli();
  let odpoved;
  try {
    const r = await request('POST', '/api/pomocnik', { dotaz });
    if (r.zamer === 'jak') {
      const cile = poradSNastavenim(dotaz);
      odpoved = cile.length
        ? { kdo: 'on', text: tr('Tohle najdeš tady – klepnutím tě tam pošlu:'), cile }
        : { kdo: 'on', text: tr('Takovou volbu v aplikaci nevidím. Zkus to říct jinými slovy, nebo otevři hledání ({0}).', zkratka('K')) };
    } else {
      odpoved = { kdo: 'on', text: r.veta, vysledky: r.vysledky, slova: r.rozbor?.slova || [], lokalne: r.lokalne };
      if (r.vysledky.length && r.rozbor?.okno) odpoved.pozn = tr('Hledal jsem v období {0} – {1}.', dateLong(r.rozbor.okno.od), dateLong(r.rozbor.okno.do));
      // Nic nenašel v konverzacích, ale dotaz vypadá i na nastavení – nabídnout obojí.
      if (!r.vysledky.length) {
        const cile = poradSNastavenim(dotaz);
        if (cile.length) Object.assign(odpoved, { cile, pozn: tr('Možná jsi myslel některou z těchto voleb v aplikaci.') });
      }
    }
  } catch (err) {
    odpoved = { kdo: 'on', text: err.status === 0 ? tr('Agenteeq teď neodpovídá, takže hledat nemůžu. Zkus to za chvíli.') : err.message };
  } finally {
    pracuje = false;
  }
  zpravy.push(odpoved);
  ulozZpravy();
  vykresli();
}

function otevri() {
  el.querySelector('.pm-okno').hidden = false;
  el.querySelector('.pm-fab').setAttribute('aria-expanded', 'true');
  vykresli();
  el.querySelector('.pm-vstup').focus({ preventScroll: true });
}
function zavri({ fokus = true } = {}) {
  el.querySelector('.pm-okno').hidden = true;
  el.querySelector('.pm-fab').setAttribute('aria-expanded', 'false');
  if (fokus) el.querySelector('.pm-fab').focus({ preventScroll: true });
}

function sestav() {
  nactiZpravy();
  el = document.createElement('div');
  el.className = 'pomocnik';
  el.innerHTML = `
    <section class="pm-okno" id="pm-okno" role="dialog" aria-labelledby="pm-nadpis" hidden>
      <header class="pm-hlava">
        <span class="pm-avatar" style="--persona:#6260d8">${robot('Orbit')}</span>
        <div><h2 id="pm-nadpis">${tr('Pomocník')} <span class="badge badge--beta">${tr('Beta')}</span></h2><small>${tr('Hledá jen na tomto počítači')}</small></div>
        <button type="button" class="pm-novy" data-pm="novy" title="${tr('Nový rozhovor')}" aria-label="${tr('Nový rozhovor')}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 3-6.2M4 4v4h4"/></svg></button>
        <button type="button" class="pm-zavrit" data-pm="zavrit" aria-label="${tr('Zavřít pomocníka')}">×</button>
      </header>
      <div class="pm-log" role="log" aria-live="polite"></div>
      <div class="pm-navrhy">${NAVRHY().map((n) => `<button type="button" class="pm-navrh" data-navrh="${esc(n)}">${esc(n)}</button>`).join('')}</div>
      <form class="pm-pole">
        <label class="sr-only" for="pm-vstup">${tr('Zeptej se pomocníka')}</label>
        <textarea id="pm-vstup" class="pm-vstup" rows="1" maxlength="500" placeholder="${tr('Zeptej se – třeba „najdi chat o …“')}"></textarea>
        <button type="submit" class="pm-poslat" aria-label="${tr('Poslat')}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>
      </form>
    </section>
    <button type="button" class="pm-fab" aria-controls="pm-okno" aria-expanded="false" aria-label="${tr('Otevřít pomocníka')}" title="${tr('Pomocník')}">
      <span class="guide-robot" style="--persona:#6260d8">${robot('Orbit')}</span>
    </button>`;
  const vstup = el.querySelector('.pm-vstup');
  el.querySelector('.pm-fab').addEventListener('click', () => (el.querySelector('.pm-okno').hidden ? otevri() : zavri()));
  el.addEventListener('click', (e) => {
    const akce = e.target.closest('[data-pm]')?.dataset.pm;
    if (akce === 'zavrit') return zavri();
    if (akce === 'novy') { zpravy = []; ulozZpravy(); vykresli(); vstup.focus(); return; }
    const navrh = e.target.closest('[data-navrh]');
    if (navrh) { posli(navrh.dataset.navrh); return; }
    const cilBtn = e.target.closest('[data-cil]');
    if (cilBtn) {
      const [i, j] = cilBtn.dataset.cil.split(':').map(Number);
      const c = zpravy[i]?.cile?.[j];
      if (!c) return;
      if (window.matchMedia('(max-width: 880px)').matches) zavri({ fokus: false });
      if (c.karta) goToSettings(c.karta, c.prepinac);
      else if (c.region) goToSection(c.route, c.region, c.klik);
      else location.hash = c.route;
      return;
    }
    const kop = e.target.closest('[data-kopirovat]');
    if (kop) {
      const [i, j] = kop.dataset.kopirovat.split(':').map(Number);
      const v = zpravy[i]?.vysledky?.[j];
      if (v?.pokracovat) copy(v.pokracovat, tr('Příkaz je ve schránce – vlož ho do Terminálu ve složce projektu'));
      return;
    }
    if (e.target.closest('.pm-vysledek a') && window.matchMedia('(max-width: 880px)').matches) zavri({ fokus: false });
  });
  el.querySelector('.pm-pole').addEventListener('submit', (e) => { e.preventDefault(); const t = vstup.value; vstup.value = ''; vstup.style.height = ''; posli(t); });
  vstup.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); el.querySelector('.pm-pole').requestSubmit(); }
  });
  vstup.addEventListener('input', () => { vstup.style.height = ''; vstup.style.height = `${Math.min(vstup.scrollHeight, 120)}px`; });
  el.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !el.querySelector('.pm-okno').hidden) { e.stopPropagation(); zavri(); } });
  document.body.append(el);
  document.dispatchEvent(new CustomEvent('robot:guide-ready'));
}

/** Volá se po každém vykreslení stránky (public/js/app.js) a po změně nastavení pomocníka. */
export function robotGuide() {
  const zobrazit = state.settings?.pomocnik?.zobrazit !== false;
  if (!el && !zobrazit) return;
  if (!el) sestav();
  el.hidden = !zobrazit;
  if (!zobrazit) zavri({ fokus: false });
  else if (!el.querySelector('.pm-okno').hidden) vykresli();
}
document.addEventListener('agenteeq:pomocnik', () => robotGuide());
