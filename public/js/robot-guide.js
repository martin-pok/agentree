// Pomocník: kulaté tlačítko s robotem vpravo dole, které otevře chat. Rozumí třem druhům otázek:
//   - „co na mě čeká?“ → odpoví ze živého stavu agentů (public/js/co-ceka.js) s odkazy na ně;
//   - „jak zapnu / kde najdu …“ → odpoví z rejstříku stránek a nastavení (public/js/hledani.js)
//     a nabídne tlačítko, které tam rovnou vede;
//   - „najdi chat, kde jsme před cca 3 měsíci řešili …“ → zeptá se serveru (src/pomocnik.js),
//     který prohledá konverzace na tomto počítači; výsledky jdou otevřít nebo zkopírovat příkaz
//     k pokračování.
// Všechno běží lokálně. Skrýt jde v Nastavení → Účet a vzhled. Historie chatu žije jen v této
// relaci okna (sessionStorage), nikam se neukládá.
import { tr, LOCALE } from './i18n.js';
import { state, agentsList } from './state.js';
import { request } from './api.js';
import { esc, dateLong } from './format.js';
import { odpovedPruvodce, poradSNastavenim, znalostiPruvodce, jeHledaniChatu } from './assistant-guide.js';
import { jeOtazkaNaCekani } from './co-ceka.js';
import { renderChatAtPosition } from './assistant-scroll.js';
import { goToSettings, goToSection } from './jump.js';
import { copy, agentHref } from './ui.js';

// Hlava ze značky Agenteeq – stejná na plovoucím tlačítku i v hlavičce otevřeného okna.
const GLYPH = `<svg class="pm-glyph" viewBox="11 15 86 76" aria-hidden="true"><path class="pm-glyph-stem" d="M54 25V34"/><circle cx="54" cy="22" r="4"/><path fill-rule="evenodd" d="M35 34h38a20 20 0 0 1 20 20v13a20 20 0 0 1-20 20H35a20 20 0 0 1-20-20V54a20 20 0 0 1 20-20Zm5 18a4 4 0 0 0-4 4v8a4 4 0 0 0 8 0v-8a4 4 0 0 0-4-4Zm28 0a4 4 0 0 0-4 4v8a4 4 0 0 0 8 0v-8a4 4 0 0 0-4-4Z"/></svg>`;
import { zkratka } from './system.js';

const TIPY = () => ({
  prehled: tr('Nový úkol zadáš v poli dole. Přehled nahoře ti ukáže, jestli některý agent čeká na tvoje rozhodnutí.'),
  agenti: tr('Filtr „Potřebuje tebe“ ukáže agenty čekající na rozhodnutí. Otevři agenta a pokračuj v jeho nástroji.'),
  agent: tr('Přepis ukazuje kontext. Tlačítko „Pokračovat“ tě přenese do nástroje, kde agent čeká na odpověď.'),
  projekty: tr('Projekt propojí konverzace z různých nástrojů. V Nezařazených najdeš práci, která zatím projekt nemá.'),
  projekt: tr('V detailu projektu najdeš jeho konverzace a aktivitu napříč nástroji.'),
  statistiky: tr('Tokeny z přepisů popisují zaznamenanou aktivitu. Skutečné účtované náklady hledej v Útratě po propojení API.'),
  utrata: tr('Bez propojeného API nejsou skutečné náklady dostupné. Ruční záznamy a předplatné uvidíš odděleně.'),
  upozorneni: tr('Otevři souvisejícího agenta a zjisti, co potřebuje. Přečtení upozornění samo požadavek agenta nevyřeší.'),
  dovednosti: tr('Tady najdeš dostupné dovednosti. Které se zobrazí, záleží na nástrojích, které máš připojené.'),
  nastaveni: tr('V části Účet a vzhled změníš téma aplikace. Tam jde i schovat tohle tlačítko pomocníka.'),
});

const NAVRHY = () => [
  tr('Co na mě čeká?'),
  tr('Najdi chat, kde jsme před cca 3 měsíci řešili fakturaci'),
  tr('Jak zapnu upozornění na telefon?'),
  tr('Kde nastavím rozpočet?'),
];

const ULOZENO = 'agenteeq:pomocnik:zpravy';
const trasa = () => location.hash.replace(/^#\//, '').split(/[/?]/)[0] || 'prehled';
const bezDiakritiky = (s) => String(s || '').toLocaleLowerCase(LOCALE).normalize('NFD').replace(/[̀-ͯ]/g, '');
let el = null;
let zpravy = [];
let pracuje = false;

function nactiZpravy() {
  try { zpravy = JSON.parse(sessionStorage.getItem(ULOZENO) || '[]').slice(-30); } catch { zpravy = []; }
}
function ulozZpravy() {
  try { sessionStorage.setItem(ULOZENO, JSON.stringify(zpravy.slice(-30))); } catch { /* bez úložiště jen bez historie */ }
}

// Zvýrazní shody podle vzorů ze serveru (src/pomocnik.js#vzorSlova – tytéž tvary slov, podle
// kterých se hledalo; skupina 1 = shoda). Hledá se v textu bez diakritiky, vkládá do originálu:
// délky se shodují (NFD bez znamének); když ne, zůstane text bez zvýraznění. Escapuje se po kouscích.
const zvyrazni = (text, vzory) => {
  const t = String(text || '');
  const norm = bezDiakritiky(t);
  const useky = [];
  if (norm.length === t.length) {
    for (const v of vzory || []) {
      let re;
      try { re = new RegExp(v, 'g'); } catch { continue; }
      for (const m of norm.matchAll(re)) if (m[1]) useky.push([m.index + m[0].length - m[1].length, m.index + m[0].length]);
    }
  }
  useky.sort((a, b) => a[0] - b[0]);
  let html = '';
  let i = 0;
  for (const [od, po] of useky) {
    if (od < i) continue;
    html += `${esc(t.slice(i, od))}<mark>${esc(t.slice(od, po))}</mark>`;
    i = po;
  }
  return html + esc(t.slice(i));
};

function zpravaHtml(z, i) {
  if (z.kdo === 'ja') return `<div class="pm-msg pm-msg--ja">${esc(z.text)}</div>`;
  const cile = (z.cile || []).map((c, j) => `<li><button type="button" class="pm-cil" data-cil="${i}:${j}"><span><b>${esc(c.label)}</b>${c.kde ? `<small>${esc(c.kde)}</small>` : ''}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button></li>`).join('');
  const vysledky = (z.vysledky || []).map((v, j) => `<li class="pm-vysledek">
      <b>${esc(v.nazev)}</b>
      <small>${esc([v.app, v.konec ? dateLong(v.konec) : '', v.slozka].filter(Boolean).join(' · '))}</small>
      ${v.ukazka ? `<p>${zvyrazni(v.ukazka, z.vzory)}</p>` : ''}
      <span class="pm-akce">${v.sessionId ? `<a class="btn btn--sm" href="${esc(agentHref(v.sessionId))}">${tr('Otevřít')}</a>` : ''}${v.pokracovat ? `<button type="button" class="btn btn--sm" data-kopirovat="${i}:${j}">${tr('Kopírovat příkaz')}</button>` : ''}</span>
    </li>`).join('');
  return `<div class="pm-msg pm-msg--on">
    ${z.text ? `<p>${esc(z.text)}</p>` : ''}
    ${z.ai ? `<small class="pm-zdroj">${esc(z.ai === 'Claude Code' ? tr('Odpověděl Claude Code na tvoje předplatné · jen z návodů k Agenteeq') : tr('Odpověděl lokální model {0} · jen z návodů k Agenteeq', z.ai))}</small>` : ''}
    ${z.lokalne ? `<p class="pm-lokalne">${esc(z.lokalne.text)}<small>${esc(tr('Zformuloval lokální model {0} na tomto počítači.', z.lokalne.model))}</small></p>` : ''}
    ${cile ? `<ul class="pm-cile">${cile}</ul>` : ''}
    ${vysledky ? `<ul class="pm-vysledky">${vysledky}</ul>` : ''}
    ${z.pozn ? `<p class="pm-pozn">${esc(z.pozn)}</p>` : ''}
    ${z.modelMimo ? `<p class="pm-pozn">${esc(tr('Lokální model odpověď neformuloval: adresa Ollamy (AGENTEEQ_OLLAMA_URL) nevede na tento počítač, a úryvky konverzací proto nikam neodešly.'))}</p>` : ''}
  </div>`;
}

function vykresli({ ownMessage = false } = {}) {
  if (!el) return;
  const log = el.querySelector('.pm-log');
  const uvod = `<div class="pm-msg pm-msg--on"><p>${esc(tr('Ptej se na cokoli k Agenteeq – kde co najdeš, jak něco nastavit nebo proč něco nefunguje. Pomocník najde i starý chat a řekne, kdo na tebe čeká.'))}</p>${TIPY()[trasa()] ? `<p class="pm-tip"><b>${tr('Tip k této stránce:')}</b> ${esc(TIPY()[trasa()])}</p>` : ''}</div>`;
  renderChatAtPosition(log, () => {
    log.innerHTML = uvod + zpravy.map(zpravaHtml).join('') + (pracuje ? `<div class="pm-msg pm-msg--on pm-pise" aria-label="${tr('Přemýšlí…')}"><i></i><i></i><i></i></div>` : '');
  }, { ownMessage });
  el.querySelector('.pm-navrhy').hidden = zpravy.length > 0;
}

async function posli(text) {
  const dotaz = text.trim();
  if (!dotaz || pracuje) return;
  zpravy.push({ kdo: 'ja', text: dotaz });
  pracuje = true;
  vykresli({ ownMessage: true });
  let odpoved;
  try {
    const previousTopic = [...zpravy].reverse().find((z) => z.kdo === 'on' && z.topic)?.topic || null;
    // Bez serveru: „co na mě čeká?“ ze živého stavu agentů, otázky k aplikaci z průvodce,
    // otázky mimo Agenteeq poctivé „s tím neporadím“ (public/js/assistant-guide.js).
    const rada = odpovedPruvodce(dotaz, { previousTopic, language: LOCALE, route: trasa(), snapshot: state, agenti: agentsList });
    // Otázky k aplikaci zodpoví AI ze znalostní báze (src/pomocnik-ai.js) vlastními slovy; odkazy
    // na místa v aplikaci přidá průvodce. „Co na mě čeká?“ (živý stav) a hledání starého chatu
    // (přepisy na disku) zůstávají deterministické. Bez AI na počítači odpoví průvodce.
    if (!jeHledaniChatu(dotaz) && !(rada?.topic === 'cekani' && jeOtazkaNaCekani(dotaz))) {
      const historie = zpravy.slice(0, -1).slice(-6).map((z) => ({ kdo: z.kdo, text: z.text || '' }));
      const ai = await request('POST', '/api/pomocnik/ai', { dotaz, historie, stranka: trasa(), znalosti: znalostiPruvodce(LOCALE) }).catch(() => null);
      if (ai?.engine) {
        const cile = rada?.cile?.length ? rada.cile : poradSNastavenim(dotaz, { presne: true });
        odpoved = { kdo: 'on', text: ai.text, ai: ai.label, cile: (cile || []).slice(0, 3), topic: rada?.topic || null };
      }
    }
    if (odpoved) {
      // AI odpověděla.
    } else if (rada) {
      odpoved = { kdo: 'on', ...rada };
    } else {
    const r = await request('POST', '/api/pomocnik', { dotaz });
    if (r.zamer === 'jak') {
      const cile = poradSNastavenim(dotaz);
      odpoved = cile.length
        ? { kdo: 'on', text: tr('Tady to najdeš:'), cile }
        : { kdo: 'on', text: tr('Tohle nastavení se nepodařilo najít. Zkus ho popsat jinak nebo otevři hledání ({0}).', zkratka('K')) };
    } else {
      odpoved = { kdo: 'on', text: r.veta, vysledky: r.vysledky, vzory: r.rozbor?.vzory || [], lokalne: r.lokalne, modelMimo: Boolean(r.modelMimoPocitac) };
      if (r.vysledky.length && r.rozbor?.okno) odpoved.pozn = tr('Hledané období: {0} – {1}.', dateLong(r.rozbor.okno.od), dateLong(r.rozbor.okno.do));
      // V konverzacích nic, ale dotaz vypadá i na nastavení – nabídnout obojí.
      if (!r.vysledky.length) {
        const cile = poradSNastavenim(dotaz);
        if (cile.length) Object.assign(odpoved, { cile, pozn: tr('Možná ti pomůže některá z těchto možností.') });
        else odpoved.pozn = tr('Ptáš se na něco jiného? Pomáhám jen s Agenteeq – zkus třeba „Kde nastavím rozpočet?“.');
      }
    }
    }
  } catch (err) {
    odpoved = { kdo: 'on', text: err.status === 0 ? tr('Spojení s Agenteeq se nepovedlo. Zkontroluj, jestli aplikace běží, a zkus to znovu.') : err.message };
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
        <span class="pm-avatar" aria-hidden="true">${GLYPH}</span>
        <div><h2 id="pm-nadpis">${tr('Pomocník')} <span class="pm-beta">${tr('Beta')}</span></h2><small>${tr('AI průvodce aplikací')}</small></div>
        <button type="button" class="pm-novy" data-pm="novy" title="${tr('Nový rozhovor')}" aria-label="${tr('Nový rozhovor')}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 3-6.2M4 4v4h4"/></svg></button>
        <button type="button" class="pm-zavrit" data-pm="zavrit" aria-label="${tr('Zavřít pomocníka')}">×</button>
      </header>
      <div class="pm-log" role="log" aria-live="polite"></div>
      <div class="pm-navrhy">${NAVRHY().map((n) => `<button type="button" class="pm-navrh" data-navrh="${esc(n)}">${esc(n)}</button>`).join('')}</div>
      <form class="pm-pole">
        <label class="sr-only" for="pm-vstup">${tr('Zeptej se pomocníka')}</label>
        <textarea id="pm-vstup" class="pm-vstup" rows="1" maxlength="500" placeholder="${tr('S čím ti můžu pomoct?')}"></textarea>
        <button type="submit" class="pm-poslat" aria-label="${tr('Poslat')}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button>
      </form>
    </section>
    <button type="button" class="pm-fab" aria-controls="pm-okno" aria-expanded="false" aria-label="${tr('Otevřít pomocníka')}" title="${tr('Pomocník')}">
      ${GLYPH}
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
