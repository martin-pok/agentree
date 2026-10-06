// Landing page. Produkt ukazují výřezy skutečného rozhraní (site/detail, scripts/shots-site.mjs)
// a jejich nástup obstará observer a CSS – ve stránce není žádný vložený rám, který by si mohl nechat dotyk
// nebo kolečko myši a zastavit posouvání stránky. Tady zbývá plynulé posouvání, okénka počítadla
// u kroků a drobnosti kolem návodu.
//
// Plynulé posouvání sdílí web s aplikací: hosting nese celé rozhraní (public/ leží v kořeni webu),
// takže se modul z public/js jen načte – žádná druhá kopie.
import { plynulePosouvani } from '/js/plynule-posouvani.js';
import { pripravStazeni } from '/stazeni.js';

const anglicky = document.documentElement.lang === 'en';

// Tlačítko ke stažení podle systému (site/stazeni.js). Hned na začátku, než se cokoli dalšího
// rozhýbe; bez skriptu zůstává tlačítko pro Mac.
pripravStazeni();

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
  const prvky = [...document.querySelectorAll('.unit:not(.hero) .unit-head, .tile, .source-group, .facts article, .steps li, .prikaz')];
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

plynulePosouvani();
