// Prohlídka aplikace: pár kroků přímo nad skutečným rozhraním (vlastník 14. 11. 2026: místo AI
// pomocníka, který zatěžoval počítač, krátký úvod, který jde kdykoli spustit znovu – Nastavení →
// Nápověda, Pomocník). Každý krok zvýrazní skutečné místo v aplikaci a jednou větou řekne, k čemu
// je. Krok, jehož místo zrovna na obrazovce není (prázdná sekce, telefon), se přeskočí – nikdy se
// neukazuje na nic. Bez sítě, bez modelu, čisté DOM a CSS.
import { subscribe } from './state.js';
import { tr } from './i18n.js';
import { ze } from './predlozky.js';
import { zkratka } from './system.js';

const UKAZANO = 'agenteeq:prohlidka:ukazana';

// Cíl kroku: první viditelný prvek ze seznamu selektorů (desktop i telefon mají jiné ovládání).
const KROKY = () => [
  { cil: ['.launch'], nadpis: tr('Zadej úkol'), text: tr('Napiš, co má agent udělat, vyber nástroj a stiskni Spustit. Poběží v aplikaci, na pozadí nebo v Terminálu.') },
  { cil: ['[aria-labelledby="dec-h"]'], nadpis: tr('Kdo tě potřebuje'), text: tr('Agenti, kteří čekají na tvé rozhodnutí, selhali nebo narazili na limit. Klepni na kartu – v detailu je Otevřít konverzaci, které tě vezme přímo do chatu.') },
  { cil: ['.home-live'], nadpis: tr('Právě teď'), text: tr('Každý robot je jeden agent. Při práci píše, když tě potřebuje, zvedne ruku. Vzhled mu změníš v detailu.') },
  { cil: ['.nav a[data-nav="agenti"]'], nadpis: tr('Všichni agenti'), text: tr('Seznam všech konverzací napříč nástroji s filtry – třeba jen ty, které tě potřebují.') },
  { cil: ['.nav a[data-nav="utrata"]', '.nav-more'], nadpis: tr('Útrata a účty'), text: tr('Plány, limity a útrata. Plán a limity účtu Claude uvidíš po klepnutí na Povolit účet Claude v Účtech nástrojů.') },
  { cil: ['#refresh-app'], nadpis: tr('Obnova a hledání'), text: tr('Změny chodí samy živě. Obnova vedle znovu projde všechny zdroje a řekne, co se změnilo; hledání ({0}) najde stránku, nastavení i agenta.', zkratka('K')) },
  { cil: ['.pm-fab'], nadpis: tr('Pomocník'), text: tr('Zeptej se na cokoli k aplikaci nebo najdi starší chat. Tuhle prohlídku spustíš znovu volbou Provést aplikací v Pomocníkovi nebo v Nastavení → Nápověda.') },
];

const viditelny = (el) => {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 4 || r.height < 4) return false;
  const st = getComputedStyle(el);
  return st.visibility !== 'hidden' && st.display !== 'none' && Number(st.opacity) > 0.05;
};
const najdi = (krok) => krok.cil.map((s) => document.querySelector(s)).find(viditelny) || null;
// Pro sledování polohy stačí rozměr: prvek nově vykreslený živou aktualizací najíždí z průhlednosti
// a průhledný by se jinak „ztratil“.
const najdiMisto = (krok) => krok.cil.map((s) => document.querySelector(s)).find((el) => {
  const r = el?.getBoundingClientRect();
  return r && r.width >= 4 && r.height >= 4;
}) || null;

let bezi = null;

export function spustProhlidku() {
  if (bezi) return;
  try { localStorage.setItem(UKAZANO, '1'); } catch { /* bez úložiště se jen ukáže znovu */ }
  if (/^#\/(prehled)?$/.test(location.hash || '#/')) { otevri(); return; }
  // Z jiné stránky: na Přehled a začít, až je Přehled opravdu vykreslený (pole pro úkol je jeho
  // první krok). Navigace je vidět hned, a dřívější start by kroky Přehledu vynechal.
  location.hash = '#/prehled';
  const od = performance.now();
  const cekej = () => {
    if (!najdi(KROKY()[0]) && performance.now() - od < 3000) { requestAnimationFrame(cekej); return; }
    // Přehled při příchodu plynule najíždí; průhledný cíl by se jako „neviditelný“ přeskočil.
    // Počká se na konečné animace stránky (nekonečné, jako mávání robota, se nečekají), nejdéle 1 s.
    const konecne = (document.getElementById('view')?.getAnimations?.({ subtree: true }) || [])
      .filter((a) => Number.isFinite(a.effect?.getComputedTiming?.().endTime));
    Promise.race([Promise.all(konecne.map((a) => a.finished.catch(() => {}))), new Promise((r) => setTimeout(r, 1000))])
      .then(() => requestAnimationFrame(() => otevri()));
  };
  requestAnimationFrame(cekej);
}

// Rozvržení: okraj obrazovky, mezera mezi světlem a kartou, přesah světla kolem cíle.
const OKRAJ = 16, MEZERA = 16, PRESAH = 8;
const TRVANI = 420; // přesun světla mezi kroky
const plynule = () => !matchMedia('(prefers-reduced-motion: reduce)').matches;
const easeOut = (t) => 1 - (1 - t) ** 3;
const lerp = (a, b, t) => a + (b - a) * t;

// Cíl v pevném panelu (spodní navigace, plovoucí tlačítko) se posunem stránky nehne. Lepivý
// (sticky) prvek pevný není: drží jen uvnitř svého rodiče a se stránkou odjede.
function vPevnem(el) {
  for (let n = el; n && n !== document.body; n = n.parentElement) {
    if (getComputedStyle(n).position === 'fixed') return true;
  }
  return false;
}
function posuvnyRodic(el) {
  for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
    const o = getComputedStyle(n).overflowY;
    if ((o === 'auto' || o === 'scroll') && n.scrollHeight > n.clientHeight + 1) return n;
  }
  return document.scrollingElement || document.documentElement;
}

function otevri() {
  const kroky = KROKY().filter((k) => najdi(k));
  if (!kroky.length) return;
  const opener = document.activeElement;
  const vrstva = document.createElement('div');
  vrstva.className = 'prohl';
  vrstva.innerHTML = `<div class="prohl-svetlo" aria-hidden="true"></div>
    <div class="prohl-karta" role="dialog" aria-modal="true" aria-labelledby="prohl-nadpis" aria-describedby="prohl-text">
      <p class="prohl-krok" aria-live="polite"></p>
      <h2 id="prohl-nadpis"></h2>
      <p id="prohl-text"></p>
      <div class="prohl-paticka">
        <div class="prohl-tecky" aria-hidden="true">${kroky.map(() => '<i></i>').join('')}</div>
        <div class="prohl-tlacitka">
          <button type="button" class="btn btn--sm" data-prohl="preskocit">${tr('Přeskočit')}</button>
          <button type="button" class="btn btn--sm" data-prohl="zpet">${tr('Zpět')}</button>
          <button type="button" class="btn btn--sm btn--primary" data-prohl="dal"></button>
        </div>
      </div>
    </div>`;
  document.body.append(vrstva);
  const svetlo = vrstva.querySelector('.prohl-svetlo');
  const karta = vrstva.querySelector('.prohl-karta');
  // Bezpečná zóna telefonu (výřez, domovská lišta): změří se jednou.
  const sonda = document.createElement('div');
  sonda.style.cssText = 'position:fixed;visibility:hidden;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)';
  vrstva.append(sonda);
  const bezpeci = { horni: parseFloat(getComputedStyle(sonda).paddingTop) || 0, dolni: parseFloat(getComputedStyle(sonda).paddingBottom) || 0 };
  sonda.remove();

  let i = 0;
  let sv = null;        // aktuální obdélník světla {x, y, w, h}
  let poloha = null;    // poslední rozvržení {svetlo, karta}
  let animace = 0;      // běžící přesun (requestAnimationFrame)
  let generace = 0;     // každé přepnutí kroku ruší předchozí rozběhnutý přesun
  let zavreno = false;

  const nastavSvetlo = (r) => {
    sv = r;
    svetlo.style.transform = `translate3d(${r.x}px, ${r.y}px, 0)`;
    svetlo.style.width = `${r.w}px`;
    svetlo.style.height = `${r.h}px`;
  };
  const telefon = () => innerWidth < 640;
  const meze = () => ({ horni: OKRAJ + bezpeci.horni, dolni: innerHeight - OKRAJ - bezpeci.dolni });

  // Rozvržení pro skutečnou polohu cíle: světlo (případně oříznuté na viditelnou část) a karta tak,
  // aby se nepřekrývaly a obojí bylo celé na obrazovce. Pořadí: pod, nad, vpravo, vlevo; když se
  // vysoký cíl nevejde, světlo se zkrátí na tu část, která se s kartou vejde.
  const rozvrhni = (r, kw, kh, hrany = [[], []]) => {
    const { horni, dolni } = meze();
    let s = { x: r.left - PRESAH, y: r.top - PRESAH, w: r.width + PRESAH * 2, h: r.height + PRESAH * 2 };
    // Na obrazovku: světlo nikdy nepřečnívá okraj.
    const x0 = Math.max(OKRAJ / 2, s.x), y0 = Math.max(horni - OKRAJ / 2, s.y);
    const x1 = Math.min(innerWidth - OKRAJ / 2, s.x + s.w), y1 = Math.min(dolni + OKRAJ / 2, s.y + s.h);
    s = { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
    const kx = (left) => Math.round(Math.min(Math.max(OKRAJ, left), innerWidth - kw - OKRAJ));
    if (s.y + s.h + MEZERA + kh <= dolni) return { s, k: { x: kx(s.x), y: Math.round(s.y + s.h + MEZERA) } };
    if (s.y - MEZERA - kh >= horni) return { s, k: { x: kx(s.x), y: Math.round(s.y - MEZERA - kh) } };
    if (!telefon()) {
      const ky = Math.round(Math.min(Math.max(horni, s.y), dolni - kh));
      if (s.x + s.w + MEZERA + kw <= innerWidth - OKRAJ) return { s, k: { x: Math.round(s.x + s.w + MEZERA), y: ky } };
      if (s.x - MEZERA - kw >= OKRAJ) return { s, k: { x: Math.round(s.x - MEZERA - kw), y: ky } };
    }
    // Vysoký cíl: karta ke kraji, kde je cíle méně, světlo jen na zbytek.
    if (s.y + s.h / 2 <= innerHeight / 2 || s.y < horni + kh + MEZERA) {
      const konec = dolni - kh - MEZERA;
      // Konec světla na přirozené hraně (pod celou řadou karet), ne napříč obsahem.
      const nejnizsi = (sada) => sada.map((h) => r.top + h + PRESAH).filter((b) => b <= konec && b - s.y >= 48).reduce((a, b) => Math.max(a, b), 0);
      const hrana = nejnizsi(hrany[0]) || nejnizsi(hrany[1]);
      const h = Math.max(48, (hrana || konec) - s.y);
      return { s: { ...s, h }, k: { x: kx(s.x), y: Math.round(s.y + h + MEZERA) } };
    }
    const zacatek = horni + kh + MEZERA;
    return { s: { ...s, y: zacatek, h: Math.max(48, s.y + s.h - zacatek) }, k: { x: kx(s.x), y: Math.round(horni) } };
  };

  // O kolik posunout stránku, aby se cíl i karta vešly: dvojice uprostřed, vysoký cíl od horního okraje.
  const posunPro = (el, kh) => {
    if (vPevnem(el)) return null;
    const r = el.getBoundingClientRect();
    const { horni, dolni } = meze();
    const volno = dolni - horni;
    const potreba = r.height + PRESAH * 2 + MEZERA + kh;
    const cilTop = potreba <= volno ? horni + PRESAH + (volno - potreba) / 2 : horni + PRESAH;
    const delta = r.top - cilTop;
    if (Math.abs(delta) < 2) return null;
    const box = posuvnyRodic(el);
    const max = box.scrollHeight - box.clientHeight;
    const nove = Math.min(Math.max(0, box.scrollTop + delta), max);
    return Math.abs(nove - box.scrollTop) < 2 ? null : { box, nove };
  };

  const vyplnKartu = (k = karta) => {
    const krok = kroky[i];
    k.querySelector('.prohl-krok').textContent = ze(kroky.length) ? tr('Krok {0} ze {1}', i + 1, kroky.length) : tr('Krok {0} z {1}', i + 1, kroky.length);
    k.querySelector('h2').textContent = krok.nadpis;
    k.querySelector('.prohl-krok ~ p').textContent = krok.text;
    k.querySelectorAll('.prohl-tecky i').forEach((t, j) => { t.className = j === i ? 'je-ted' : j < i ? 'je-hotovo' : ''; });
    k.querySelector('[data-prohl="zpet"]').hidden = i === 0;
    k.querySelector('[data-prohl="dal"]').textContent = i === kroky.length - 1 ? tr('Hotovo') : tr('Další');
    k.style.width = telefon() ? `${innerWidth - OKRAJ * 2}px` : '';
  };
  // Rozměr karty s obsahem příštího kroku, změřený na neviditelné kopii: světlo se rozjede hned
  // a skutečná karta se přepíše, až zmizí.
  const zmerKartu = () => {
    const kopie = karta.cloneNode(true);
    kopie.removeAttribute('role');
    kopie.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
    kopie.classList.remove('je-ukazana');
    kopie.setAttribute('aria-hidden', 'true');
    vrstva.append(kopie);
    vyplnKartu(kopie);
    const rozmer = { kw: kopie.offsetWidth, kh: kopie.offsetHeight };
    kopie.remove();
    return rozmer;
  };
  const umistiKartu = (k) => { karta.style.transform = `translate3d(${k.x}px, ${k.y}px, 0)`; };

  // Přechod na krok: karta zmizí, stránka (je-li třeba) a světlo dojedou společně na předem
  // spočítané místo, a pak se karta s novým obsahem objeví na svém místě.
  const ukaz = (prvni = false) => {
    const moje = ++generace;
    cancelAnimationFrame(animace);
    const el = najdi(kroky[i]);
    if (!el) { if (i < kroky.length - 1) { i++; ukaz(prvni); } else zavri(); return; }
    const anim = plynule() && !prvni;
    karta.classList.remove('je-ukazana');
    {
      const { kw, kh } = zmerKartu();
      // Kde smí zkrácené světlo skončit: pod položkou mřížky nebo řady (karta, řádek seznamu) a jen
      // tam, kde žádnou jinou položku nepřetne. Hrany jsou vůči horní hraně cíle – posun je nemění.
      const rc = el.getBoundingClientRect();
      const polozky = [...el.querySelectorAll('*')].slice(0, 400).filter((n) => /grid|flex/.test(getComputedStyle(n.parentElement).display))
        .map((n) => n.getBoundingClientRect()).filter((q) => q.height >= 24 && q.height < rc.height * 0.6);
      const cista = (y, kdo) => !kdo.some((q) => q.top < y - 1 && q.bottom > y + 1);
      const cele = polozky.map((q) => q.bottom).filter((y) => cista(y, polozky)).map((y) => y - rc.top);
      // Malá obrazovka, kde se nevejde ani celá řada karet: aspoň hrana uvnitř karty (pod nadpisem),
      // která nepřetne žádný řádek textu – velké položky (karty samotné) se smějí přetnout.
      const male = polozky.filter((q) => q.height <= 120);
      const hrany = [cele, male.map((q) => q.bottom).filter((y) => cista(y, male)).map((y) => y - rc.top)];
      // Obsah karty se přepíše, až je karta neviditelná – nikdy se nemění před očima.
      const prepis = () => { if (moje === generace && !zavreno) vyplnKartu(); };
      if (anim) setTimeout(prepis, 150); else prepis();
      // Posun stránky i světlo jedou v týchž snímcích po téže křivce k předem spočítanému cíli:
      // světlo se pohybuje jedním směrem, nic nedohání a nepřekmitne. (Plynulý posun prohlížeče by
      // měl vlastní tempo a světlo by ho honilo.)
      const posun = posunPro(el, kh);
      const r0 = el.getBoundingClientRect();
      const posunuto = posun ? posun.nove - posun.box.scrollTop : 0;
      const cilKonec = rozvrhni({ left: r0.left, top: r0.top - posunuto, width: r0.width, height: r0.height }, kw, kh, hrany);
      const od = sv;
      const odPosun = posun ? posun.box.scrollTop : 0;
      const delka = plynule() && (posun || (anim && od)) ? TRVANI : 0;
      const start = performance.now();
      const hotovo = () => {
        prepis();
        // Kontrola proti skutečnosti: kdyby se stránka mezitím změnila, platí živá poloha.
        const cil = rozvrhni((el.isConnected ? el : najdiMisto(kroky[i]) || el).getBoundingClientRect(), kw, kh, hrany);
        nastavSvetlo(cil.s);
        poloha = { ...cil, hrany };
        umistiKartu(cil.k);
        karta.classList.add('je-ukazana');
        sleduj(el.isConnected ? el : najdiMisto(kroky[i]) || el);
        // Fokus pro klávesnici a čtečku, bez rámečku po kliknutí myší.
        karta.querySelector('[data-prohl="dal"]').focus({ preventScroll: true, focusVisible: false });
      };
      const snimek = (ted) => {
        if (moje !== generace || zavreno) return;
        const p = delka ? Math.min(1, Math.max(0, (ted - start) / delka)) : 1; // čas snímku může být těsně před startem
        const e = easeOut(p);
        if (posun) posun.box.scrollTo({ top: lerp(odPosun, posun.nove, e), behavior: 'instant' });
        const z = od && anim ? od : cilKonec.s;
        const k = cilKonec.s;
        nastavSvetlo({ x: lerp(z.x, k.x, e), y: lerp(z.y, k.y, e), w: lerp(z.w, k.w, e), h: lerp(z.h, k.h, e) });
        if (p >= 1) { hotovo(); return; }
        animace = requestAnimationFrame(snimek);
      };
      if (delka) animace = requestAnimationFrame(snimek); else { if (posun) posun.box.scrollTo({ top: posun.nove, behavior: 'instant' }); hotovo(); }
    }
  };

  // Uživatel sám posune nebo změní okno: světlo i karta jdou s cílem v tomtéž snímku, bez animace.
  let srovnat = 0;
  const srovnej = () => {
    if (srovnat || zavreno) return;
    srovnat = requestAnimationFrame(() => {
      srovnat = 0;
      if (!poloha || !karta.classList.contains('je-ukazana')) return;
      const el = najdiMisto(kroky[i]);
      if (!el) return;
      sleduj(el);
      if (telefon() !== (karta.style.width !== '')) vyplnKartu();
      const cil = rozvrhni(el.getBoundingClientRect(), karta.offsetWidth, karta.offsetHeight, poloha.hrany);
      poloha = { ...cil, hrany: poloha.hrany };
      nastavSvetlo(cil.s);
      umistiKartu(cil.k);
    });
  };

  const zavri = () => {
    if (zavreno) return;
    zavreno = true;
    generace++;
    cancelAnimationFrame(animace);
    cancelAnimationFrame(srovnat);
    odhlas();
    pozorovatel?.disconnect();
    zmeny?.disconnect();
    pohled.removeEventListener('animationend', srovnej, true);
    pohled.removeEventListener('transitionend', srovnej, true);
    removeEventListener('resize', srovnej);
    removeEventListener('scroll', srovnej, true);
    document.removeEventListener('keydown', klavesy, true);
    bezi = null;
    vrstva.classList.remove('je-videt');
    const pryc = () => vrstva.remove();
    if (plynule()) { vrstva.addEventListener('transitionend', pryc, { once: true }); setTimeout(pryc, 400); } else pryc();
    (opener?.isConnected && opener !== document.body ? opener : document.getElementById('page-title'))?.focus?.({ preventScroll: true });
  };
  const dal = () => { if (i < kroky.length - 1) { i++; ukaz(); } else zavri(); };
  const zpet = () => { if (i > 0) { i--; ukaz(); } };
  function klavesy(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); zavri(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); dal(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); zpet(); }
    else if (e.key === 'Tab') {
      // Fokus zůstane v kartě prohlídky.
      const prvky = [...karta.querySelectorAll('button:not([hidden])')];
      const k = prvky.indexOf(document.activeElement);
      e.preventDefault();
      prvky[(k + (e.shiftKey ? -1 : 1) + prvky.length) % prvky.length]?.focus();
    }
  }
  vrstva.addEventListener('click', (e) => {
    const a = e.target.closest('[data-prohl]')?.dataset.prohl;
    if (a === 'dal') dal();
    else if (a === 'zpet') zpet();
    else if (a === 'preskocit') zavri();
  });
  // Přehled se při práci agentů živě překresluje: po každé změně dat a změně velikosti cíle se
  // světlo i karta srovnají v jednom snímku (cíl se hledá znovu, kdyby byl nahrazen novým prvkem).
  const odhlas = subscribe(srovnej);
  const zmeny = typeof MutationObserver === 'function' ? new MutationObserver(srovnej) : null;
  const pohled = document.getElementById('view') || document.body;
  zmeny?.observe(pohled, { childList: true, subtree: true });
  // Vstupní animace nového prvku posune jeho polohu bez změny DOM: po jejím konci srovnat znovu.
  pohled.addEventListener('animationend', srovnej, true);
  pohled.addEventListener('transitionend', srovnej, true);
  const pozorovatel = typeof ResizeObserver === 'function' ? new ResizeObserver(srovnej) : null;
  let sledovany = null;
  const sleduj = (el) => { if (!pozorovatel || el === sledovany) return; if (sledovany) pozorovatel.unobserve(sledovany); sledovany = el; pozorovatel.observe(el); };
  addEventListener('resize', srovnej, { passive: true });
  addEventListener('scroll', srovnej, { capture: true, passive: true });
  document.addEventListener('keydown', klavesy, true);
  bezi = { zavri };
  // První krok: světlo rovnou na místě, ztmavení i karta se jen rozsvítí.
  ukaz(true);
  requestAnimationFrame(() => vrstva.classList.add('je-videt'));
}

// Sama jen novému uživateli: hned po dokončení úvodního okna (welcome.js), na Přehledu, až nic jiného
// není otevřené (objev nástrojů). Stávající uživatel po aktualizaci nic nevyskočí – prohlídku najde
// v Nastavení → Nápověda a v Pomocníkovi. Automatizovaný prohlížeč (testy) ji sám nespouští.
export function initProhlidka() {
  document.addEventListener('click', (e) => { if (e.target.closest('[data-prohlidka]')) { e.preventDefault(); spustProhlidku(); } });
  addEventListener('agenteeq-prohlidka', spustProhlidku);
  let ceka = false;
  const zkus = () => {
    if (!ceka || bezi) return;
    if (!/^#\/(prehled)?$/.test(location.hash || '#/')) return;
    if (document.querySelector('dialog[open], .modal-scrim, .welcome-dialog')) return;
    ceka = false;
    setTimeout(() => {
      if (document.querySelector('dialog[open], .modal-scrim')) { ceka = true; return; }
      spustProhlidku();
    }, 900);
  };
  addEventListener('agenteeq-pruvodce-hotov', () => {
    if (navigator.webdriver) return;
    try { if (localStorage.getItem(UKAZANO)) return; } catch { /* bez úložiště jednou za relaci */ }
    ceka = true;
    setTimeout(zkus, 1200);
  });
  subscribe(zkus);
  addEventListener('hashchange', zkus);
  document.addEventListener('close', () => setTimeout(zkus, 300), true);
}

export const _test = { KROKY };
