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
  { cil: ['.pm-fab'], nadpis: tr('Pomocník'), text: tr('Zeptej se na cokoli k aplikaci nebo najdi starší chat. Tuhle prohlídku spustíš znovu v Pomocníkovi nebo v Nastavení → Nápověda.') },
];

const viditelny = (el) => {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 4 || r.height < 4) return false;
  const st = getComputedStyle(el);
  return st.visibility !== 'hidden' && st.display !== 'none' && Number(st.opacity) > 0.05;
};
const najdi = (krok) => krok.cil.map((s) => document.querySelector(s)).find(viditelny) || null;

let bezi = null;

export function spustProhlidku() {
  if (bezi) return;
  try { localStorage.setItem(UKAZANO, '1'); } catch { /* bez úložiště se jen ukáže znovu */ }
  const start = () => otevri();
  if (!/^#\/(prehled)?$/.test(location.hash || '#/')) {
    location.hash = '#/prehled';
    setTimeout(start, 450);
  } else start();
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
        <div class="prohl-tecky" aria-hidden="true"></div>
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
  let i = 0;

  const umisti = () => {
    const el = najdi(kroky[i]);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const okraj = 8;
    Object.assign(svetlo.style, { left: `${r.left - okraj}px`, top: `${r.top - okraj}px`, width: `${r.width + okraj * 2}px`, height: `${r.height + okraj * 2}px` });
    // Karta pod cílem, když se vejde; jinak nad ním. Na telefonu přes celou šířku – dole, a když je
    // cíl ve spodní polovině (spodní navigace), nahoře, aby ho karta nezakryla.
    if (innerWidth < 640) {
      karta.style.cssText = '';
      const nahore = r.top > innerHeight * 0.5;
      karta.classList.toggle('je-nahore', nahore);
      karta.classList.toggle('je-dole', !nahore);
      return;
    }
    karta.classList.remove('je-dole', 'je-nahore');
    const kw = karta.offsetWidth, kh = karta.offsetHeight, mezera = 16;
    let top = r.bottom + okraj + mezera;
    if (top + kh > innerHeight - 16) top = Math.max(16, r.top - okraj - mezera - kh);
    const left = Math.min(Math.max(16, r.left), innerWidth - kw - 16);
    karta.style.top = `${top}px`;
    karta.style.left = `${left}px`;
  };

  const ukaz = () => {
    const krok = kroky[i];
    const el = najdi(krok);
    el?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    vrstva.querySelector('.prohl-krok').textContent = ze(kroky.length) ? tr('Krok {0} ze {1}', i + 1, kroky.length) : tr('Krok {0} z {1}', i + 1, kroky.length);
    vrstva.querySelector('#prohl-nadpis').textContent = krok.nadpis;
    vrstva.querySelector('#prohl-text').textContent = krok.text;
    vrstva.querySelector('.prohl-tecky').innerHTML = kroky.map((_, j) => `<i class="${j === i ? 'je-ted' : j < i ? 'je-hotovo' : ''}"></i>`).join('');
    vrstva.querySelector('[data-prohl="zpet"]').hidden = i === 0;
    vrstva.querySelector('[data-prohl="dal"]').textContent = i === kroky.length - 1 ? tr('Hotovo') : tr('Další');
    umisti();
    setTimeout(umisti, 380); // po dojetí plynulého posunu
    // Fokus pro klávesnici a čtečku, bez rámečku po kliknutí myší (ten patří jen ovládání z klávesnice).
    vrstva.querySelector('[data-prohl="dal"]').focus({ preventScroll: true, focusVisible: false });
  };

  const zavri = () => {
    removeEventListener('resize', umisti);
    removeEventListener('scroll', umisti, true);
    document.removeEventListener('keydown', klavesy, true);
    vrstva.remove();
    bezi = null;
    (opener?.isConnected ? opener : document.getElementById('page-title'))?.focus?.({ preventScroll: true });
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
  addEventListener('resize', umisti);
  addEventListener('scroll', umisti, true);
  document.addEventListener('keydown', klavesy, true);
  bezi = { zavri };
  requestAnimationFrame(() => { vrstva.classList.add('je-videt'); ukaz(); });
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
