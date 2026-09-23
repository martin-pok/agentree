// Prohlídka. Hlavní je živé rozhraní v rámu (/app?ukazka): skutečná aplikace nad smyšlenými daty,
// takže se v ní hýbe to, co se hýbe v aplikaci – měřidla se plní, čísla vyjedou. Snímky pod ní
// zůstávají: bez JavaScriptu, než se aplikace načte, a když se načíst nepodaří, ukážou se ony.
// Všechny leží ve stránce nad sebou a mění se jen průhlednost – výměna `src` by znamenala prázdný
// rám, dokud prohlížeč nový soubor nedotáhne.
const NAZVY = { prehled: 'Přehled', projekty: 'Projekty', utrata: 'Útrata' };

const ramec = document.getElementById('tour-figure');
const snimky = [...document.querySelectorAll('#tour-figure .shot')];
const hlaseni = document.getElementById('tour-announcement');
let aktivni = 'prehled';

for (const tlacitko of document.querySelectorAll('[data-tour]')) {
  tlacitko.addEventListener('click', () => {
    const klic = tlacitko.dataset.tour;
    if (!NAZVY[klic] || tlacitko.getAttribute('aria-pressed') === 'true') return;
    aktivni = klic;
    for (const jine of document.querySelectorAll('[data-tour]')) jine.setAttribute('aria-pressed', String(jine === tlacitko));
    for (const snimek of snimky) {
      const je = snimek.dataset.obrazovka === klic;
      snimek.classList.toggle('is-active', je);
      // Neaktivní snímky zůstávají vykreslené kvůli prolnutí, ale odečítačka je číst nemá.
      snimek.toggleAttribute('aria-hidden', !je);
    }
    // Živé rozhraní přejde na obrazovku samo a přehraje její nástup. Dokud se načítá, jen se
    // zapamatuje, kam má jít – změna adresy by prázdnému rámu zrušila načítání.
    prepniZivou(klic);
    const popis = snimky.find((s) => s.dataset.obrazovka === klic)?.querySelector('img')?.alt || '';
    if (hlaseni) hlaseni.textContent = `Obrazovka ${NAZVY[klic]}. ${popis}`;
  });
}

/* ---------- Živé rozhraní v rámu ---------- */

// Aplikace se vykresluje ve velikosti, pro kterou vznikly snímky (okno Macu, nebo telefon), a rám
// ji zmenší. Na širokém rámu je vidět jen okno aplikace bez tmavého okraje kolem – stejný výřez
// jako snímek, takže přechod ze snímku na živé rozhraní není vidět.
const uzky = matchMedia('(max-width: 620px)');
const bezPohybu = matchMedia('(prefers-reduced-motion: reduce)');
const OKNO = { siroke: [1280, 800], uzke: [390, 760] };
const VIDET = 0.35;
const ziva = { iframe: null, okno: null, pripravena: false, ukazana: false, pustena: false, videt: false };

function rozmer() {
  const { iframe } = ziva;
  const plocha = ramec?.querySelector('.shot-stack');
  if (!iframe || !plocha) return;
  const [w, h] = uzky.matches ? OKNO.uzke : OKNO.siroke;
  iframe.style.width = `${w}px`;
  iframe.style.height = `${h}px`;
  let x = 0;
  let y = 0;
  let sirka = w;
  const shell = uzky.matches ? null : iframe.contentDocument?.querySelector('.shell')?.getBoundingClientRect();
  if (shell?.width) {
    x = Math.round(shell.x);
    y = Math.round(shell.y);
    sirka = Math.round(shell.width);
  }
  iframe.style.transform = `scale(${plocha.clientWidth / sirka}) translate(${-x}px, ${-y}px)`;
}

function ukaz() {
  if (ziva.ukazana) return;
  ziva.ukazana = true;
  ramec.classList.add('je-ziva');
}

// Aplikace v rámu stojí na začátku nástupu obrazovky (public/js/ukazka.js); tohle ji pustí.
function pust() {
  if (ziva.pustena) return;
  ziva.pustena = true;
  ziva.okno.dispatchEvent(new ziva.okno.Event('agenteeq:prehraj'));
}

// Živé rozhraní stojí na začátku nástupu, takže snímek za něj smí vystřídat jen tam, kde se na rám
// ještě nikdo nedívá (je pod ohybem, nanejvýš vykukuje), nebo kde se obsah mění tak jako tak
// (klepnutí na jinou obrazovku). Kdo si snímek už prohlíží, neuvidí ho zmizet a naskočit znovu.
// Nástup se pustí, až je rám vidět aspoň z třetiny.
function srovnej() {
  if (!ziva.pripravena) return;
  if (bezPohybu.matches) return void ukaz();
  if (!ziva.videt) ukaz();
  else if (ziva.ukazana) pust();
}

function vytvorZivou() {
  if (ziva.iframe || !ramec) return;
  const obal = document.createElement('div');
  obal.className = 'shot-live';
  obal.setAttribute('aria-hidden', 'true');
  const iframe = document.createElement('iframe');
  iframe.title = 'Ukázka rozhraní Agenteeq';
  iframe.tabIndex = -1;
  iframe.inert = true;
  iframe.src = `/app?ukazka#/${aktivni}`;
  obal.append(iframe);
  ramec.querySelector('.shot-stack').append(obal);
  ziva.iframe = iframe;
  ziva.okno = iframe.contentWindow;
  rozmer();
}

function prepniZivou(klic) {
  if (!ziva.pripravena) return;
  ziva.okno.location.hash = `#/${klic}`;
  ukaz();
  pust();
}

addEventListener('message', (e) => {
  if (e.origin !== location.origin || e.source !== ziva.okno || e.data?.typ !== 'agenteeq:ukazka-pripravena' || ziva.pripravena) return;
  ziva.pripravena = true;
  // Než se aplikace načetla, mohl návštěvník přepnout obrazovku.
  if (ziva.okno.location.hash !== `#/${aktivni}`) ziva.okno.location.hash = `#/${aktivni}`;
  rozmer();
  srovnej();
});

if (ramec && 'IntersectionObserver' in window) {
  // Načíst s předstihem, aby byla aplikace hotová dřív, než k ní návštěvník dojede.
  new IntersectionObserver((zaznamy, io) => {
    if (!zaznamy.some((z) => z.isIntersecting)) return;
    io.disconnect();
    vytvorZivou();
  }, { rootMargin: '600px 0px' }).observe(ramec);
  new IntersectionObserver((zaznamy) => {
    ziva.videt = zaznamy[zaznamy.length - 1].intersectionRatio >= VIDET;
    srovnej();
  }, { threshold: VIDET }).observe(ramec);
  new ResizeObserver(() => requestAnimationFrame(rozmer)).observe(ramec);
  uzky.addEventListener('change', () => requestAnimationFrame(() => requestAnimationFrame(rozmer)));
}

// Adresu rozšíření v Chromu nejde otevřít odkazem, ale zkopírovat se dá.
for (const pole of document.querySelectorAll('[data-kopirovat]')) {
  pole.setAttribute('role', 'button');
  pole.setAttribute('tabindex', '0');
  pole.setAttribute('title', 'Kliknutím zkopíruješ');
  const kopiruj = async () => {
    try {
      await navigator.clipboard.writeText(pole.dataset.kopirovat);
      const puvodni = pole.textContent;
      pole.textContent = 'zkopírováno';
      setTimeout(() => { pole.textContent = puvodni; }, 1200);
    } catch { /* prohlížeč bez schránky – text zůstane k ručnímu označení */ }
  };
  pole.addEventListener('click', kopiruj);
  pole.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); kopiruj(); } });
}

const odkryjRozsireni = () => { if (location.hash === '#rozsireni') document.getElementById('rozsireni').open = true; };
addEventListener('hashchange', odkryjRozsireni);
odkryjRozsireni();
