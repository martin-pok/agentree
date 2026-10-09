// Landing page. Produkt ukazují výřezy skutečného rozhraní (site/detail, scripts/shots-site.mjs)
// a jejich nástup obstará observer a CSS – ve stránce není žádný vložený rám, který by si mohl nechat dotyk
// nebo kolečko myši a zastavit posouvání stránky. Tady zbývá plynulé posouvání, okénka počítadla
// u kroků a drobnosti kolem návodu.
//
// Plynulé posouvání sdílí web s aplikací: hosting nese celé rozhraní (public/ leží v kořeni webu),
// takže se modul z public/js jen načte – žádná druhá kopie.
import { plynulePosouvani } from '/js/plynule-posouvani.js';
import { robot } from '/js/robot-svg.js';

const anglicky = document.documentElement.lang === 'en';

// Lišta nahoře splývá s úvodem; jakmile stránka odjede, dostane průhled a oddělí se linkou (site/lp.css).
const lista = document.querySelector('.nav');
if (lista) {
  let cekaSnimek = false;
  const zmerListu = () => {
    cekaSnimek = false;
    lista.classList.toggle('is-odjeto', window.scrollY > 8);
  };
  window.addEventListener('scroll', () => {
    if (cekaSnimek) return;
    cekaSnimek = true;
    requestAnimationFrame(zmerListu);
  }, { passive: true });
  zmerListu();
}

// Adresu rozšíření v Chromu nejde otevřít odkazem, ale zkopírovat se dá. Stejně se kopíruje
// instalační příkaz – tam je to skutečné tlačítko, takže klávesnici a roli už má.
for (const pole of document.querySelectorAll('[data-kopirovat]')) {
  const tlacitko = pole.tagName === 'BUTTON';
  if (!tlacitko) {
    pole.setAttribute('role', 'button');
    pole.setAttribute('tabindex', '0');
    pole.setAttribute('title', anglicky ? 'Click to copy' : 'Kliknutím zkopíruješ');
  }
  pole.setAttribute('aria-live', 'polite');
  const puvodni = pole.textContent;
  // Popisek tlačítka začíná velkým písmenem („Zkopírovat“ → „Zkopírováno“), kód ve větě malým.
  const hotovo = anglicky ? (tlacitko ? 'Copied' : 'copied') : (tlacitko ? 'Zkopírováno' : 'zkopírováno');
  let casovac = 0;
  const kopiruj = async () => {
    try {
      await navigator.clipboard.writeText(pole.dataset.kopirovat);
      pole.textContent = hotovo;
      clearTimeout(casovac);
      casovac = setTimeout(() => { pole.textContent = puvodni; }, 1600);
    } catch { /* prohlížeč bez schránky – text zůstane k ručnímu označení */ }
  };
  pole.addEventListener('click', kopiruj);
  if (!tlacitko) pole.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); kopiruj(); } });
}

const odkryjRozsireni = () => { if (location.hash === '#rozsireni') document.getElementById('rozsireni').open = true; };
addEventListener('hashchange', odkryjRozsireni);
odkryjRozsireni();

// Čísla kroků vyjedou v okénku jako počítadlo v aplikaci (site/lp.css, „pohyb“).
// Bez pohybu zůstane obyčejná číslice.
if (matchMedia('(prefers-reduced-motion: no-preference)').matches && 'IntersectionObserver' in window) {
  for (const el of document.querySelectorAll('.step-n')) {
    const n = Number(el.textContent.trim());
    if (!Number.isInteger(n) || n < 1 || n > 9) continue;
    const valec = Array.from({ length: n + 1 }, (_, i) => `<span>${i}</span>`).join('');
    el.innerHTML = `<span class="odo"><span class="odo-f">${n}</span><span class="odo-s" style="--n:${n + 1}">${valec}</span></span>`;
  }
}

// Nástup začíná teprve v čitelné části okna. Bez JS, podpory API nebo při
// omezeném pohybu zůstává celý obsah viditelný a přístupný.
if (matchMedia('(prefers-reduced-motion: no-preference)').matches && 'IntersectionObserver' in window) {
  const prvky = [...document.querySelectorAll('.unit:not(.hero) .unit-head, .tile, .source-group, .facts article, .steps li, .prikaz, #propojeni .integration-lane, #propojeni .integration-down, #propojeni .integration-result, #rozsireni')];
  for (const prvek of prvky) prvek.classList.add('motion-pending');
  const pozorovatel = new IntersectionObserver((zaznamy) => {
    for (const zaznam of zaznamy) {
      if (!zaznam.isIntersecting) continue;
      zaznam.target.classList.remove('motion-pending');
      zaznam.target.classList.add('motion-entered');
      pozorovatel.unobserve(zaznam.target);
    }
  }, { rootMargin: '0px 0px -18% 0px', threshold: 0.12 });
  for (const prvek of prvky) pozorovatel.observe(prvek);
  addEventListener('pageshow', () => {
    for (const prvek of prvky) if (prvek.getBoundingClientRect().top < innerHeight * .82)
      prvek.classList.remove('motion-pending');
  });
}

// Aktivní kapitola navigace odpovídá tomu, co návštěvník právě čte.
if ('IntersectionObserver' in window) {
  const odkazy = [...document.querySelectorAll('.nav-links a[href^="#"]')];
  const kapitoly = [document.querySelector('.hero'), ...odkazy.map((a) => document.getElementById(a.hash.slice(1)))].filter(Boolean);
  const navigace = new IntersectionObserver((zaznamy) => {
    for (const zaznam of zaznamy) {
      if (!zaznam.isIntersecting) continue;
      for (const odkaz of odkazy) {
        if (odkaz.hash === `#${zaznam.target.id}`) odkaz.setAttribute('aria-current', 'location');
        else odkaz.removeAttribute('aria-current');
      }
    }
  }, { rootMargin: '-22% 0px -62% 0px' });
  for (const kapitola of kapitoly) navigace.observe(kapitola);
}

// Scéna úvodu (site/lp.css „Scéna úvodu“): roboti kolem okna aplikace ve třech hloubkách
// a okno, které se při posouvání narovná. Roboti jsou ozdoba (aria-hidden), stav nesou i slovy.
// Hlava je stejná jako v logu a v aplikaci: anténa, plastové tělo s odleskem, tmavý displej, oči.
const scena = document.querySelector('[data-hero-stage]');
if (scena) {
  const t = anglicky
    ? { hotovo: 'Done, tests pass', ceka: 'Needs your OK' }
    : { hotovo: 'Hotovo, testy prošly', ceka: 'Potřebuju tvé OK' };
  // [x, y, velikost (vše v % scény), hloubka, barva, světlá, bublina]
  // Všichni stojí mimo obsah okna: nad horní hranou, po stranách nebo u spodního rozplynutí.
  const ROBOTI = [
    ['-6%', '6%', '5%', 'daleko', '#6260d8', 'Scout'],
    ['91%', '-16%', '8.5%', 'stred', '#367b68', 'Orbit', ['hotovo', '#43D1B1', 'vlevo']],
    ['-12%', '46%', '14%', 'blizko', '#a85c44', 'Pixel'],
    ['101%', '34%', '4.5%', 'daleko', '#92609a', 'Nova'],
    ['1%', '-17%', '7.5%', 'stred', '#92609a', 'Nova', ['ceka', '#E4B95F']],
    ['100%', '84%', '12%', 'blizko', '#6260d8', 'Scout'],
  ];
  const PARALAXA = { daleko: 10, stred: 22, blizko: 42 };
  // Ručně komponované asymetrické náklony: jen roboti bez bublin, žádná náhodnost při načítání.
  const NAKLONY = [-38, 0, 24, -58, 0, -42];
  scena.querySelector('[data-hero-roboti]').innerHTML = ROBOTI.map(([x, y, sz, hloubka, barva, typ, bublina], i) =>
    `<span class="hr hr--${hloubka}${hloubka === 'blizko' ? ' hr--skryt-mobil' : ''}" style="--x:${x};--y:${y};--s:${sz};--par:${PARALAXA[hloubka]};--i:${i};--persona:${barva};--naklon:${bublina ? 0 : NAKLONY[i]}deg">`
    + `<span class="hr-telo">${robot(typ)}</span>`
    + (bublina ? `<span class="hr-bublina${bublina[2] ? ' hr-bublina--vlevo' : ''}" style="--ton:${bublina[1]}"><i></i>${t[bublina[0]]}</span>` : '')
    + '</span>').join('');

  // Náklon okna podle posouvání a paralaxa podle ukazatele. Jen transform přes proměnné CSS,
  // jeden zápis za snímek. Při omezeném pohybu zůstane okno rovné a roboti stojí.
  if (matchMedia('(prefers-reduced-motion: no-preference)').matches) {
    let ceka = false;
    const zmer = () => {
      ceka = false;
      const top = scena.getBoundingClientRect().top;
      const p = Math.min(1, Math.max(0, 1 - (top - innerHeight * 0.12) / (innerHeight * 0.6)));
      scena.style.setProperty('--p', p.toFixed(3));
      scena.classList.toggle('is-rovne', p > 0.995);
    };
    const naplanuj = () => { if (!ceka) { ceka = true; requestAnimationFrame(zmer); } };
    addEventListener('scroll', naplanuj, { passive: true });
    addEventListener('resize', naplanuj);
    zmer();
    if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
      let mys = null;
      addEventListener('pointermove', (e) => {
        const posun = () => {
          scena.style.setProperty('--mx', ((e.clientX / innerWidth) * 2 - 1).toFixed(3));
          scena.style.setProperty('--my', ((e.clientY / innerHeight) * 2 - 1).toFixed(3));
          mys = null;
        };
        if (!mys) mys = requestAnimationFrame(posun);
      }, { passive: true });
    }
  }
}

// Stejná kresba robota jako v desktopové aplikaci, bez duplicitního SVG na webu.
for (const el of document.querySelectorAll('[data-privacy-robot], [data-footer-robot]')) {
  el.innerHTML = robot(el.hasAttribute('data-footer-robot') ? 'Nova' : 'Orbit');
}

plynulePosouvani();


/* Mobile navigation: true modal-like full viewport overlay, focus restoration,
   Escape and backdrop dismissal, no scroll leakage. */
{
 const trigger=document.querySelector('[data-mobile-menu-toggle]');
 const overlay=document.querySelector('[data-mobile-menu]');
 const close=overlay?.querySelector('[data-mobile-menu-close]');
 if(trigger&&overlay&&close){
   let previousFocus=null,previousOverflow='';
   const links=[...overlay.querySelectorAll('a,button')];
   const setOpen=(open)=>{
     trigger.setAttribute('aria-expanded',String(open));
     trigger.setAttribute('aria-label',open?(anglicky?'Close menu':'Zavřít nabídku'):(anglicky?'Open menu':'Otevřít nabídku'));
     overlay.classList.toggle('is-open',open);
     overlay.setAttribute('aria-hidden',String(!open));
     overlay.inert=!open;
     if(open){
       previousFocus=document.activeElement;
       previousOverflow=document.body.style.overflow;
       document.body.style.overflow='hidden';
       close.focus();
     }else{
       document.body.style.overflow=previousOverflow;
       if(previousFocus instanceof HTMLElement)previousFocus.focus({preventScroll:true});
     }
   };
   trigger.addEventListener('click',()=>setOpen(trigger.getAttribute('aria-expanded')!=='true'));
   close.addEventListener('click',()=>setOpen(false));
   overlay.addEventListener('click',e=>{
     if(e.target===overlay||e.target.closest('a'))setOpen(false);
   });
   document.addEventListener('keydown',e=>{
     if(!overlay.classList.contains('is-open'))return;
     if(e.key==='Escape'){e.preventDefault();setOpen(false);return;}
     if(e.key==='Tab'){
       const available=links.filter(el=>el.getClientRects().length);
       const first=available[0],last=available.at(-1);
       if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
       else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}
     }
   });
   matchMedia('(min-width: 901px)').addEventListener?.('change',e=>{
     if(e.matches&&overlay.classList.contains('is-open'))setOpen(false);
   });
 }
}
