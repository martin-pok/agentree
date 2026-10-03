// Landing page. Produkt ukazují výřezy skutečného rozhraní (site/detail, scripts/shots-site.mjs)
// a jejich nástup obstará CSS – ve stránce není žádný vložený rám, který by si mohl nechat dotyk
// nebo kolečko myši a zastavit posouvání stránky. Tady zbývá plynulé posouvání, okénka počítadla
// u kroků a drobnosti kolem návodu.
//
// Plynulé posouvání sdílí web s aplikací: hosting nese celé rozhraní (public/ leží v kořeni webu),
// takže se modul z public/js jen načte – žádná druhá kopie.
import { plynulePosouvani } from '/js/plynule-posouvani.js';

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

// Čísla kroků vyjedou v okénku jako počítadlo v aplikaci (site/lp.css, „pohyb“). Okénko se staví
// jen tam, kde se opravdu rozjede – jinak zůstane obyčejná číslice. Čísla jsou aria-hidden.
if (matchMedia('(prefers-reduced-motion: no-preference)').matches && CSS.supports('animation-timeline: view()')) {
  for (const el of document.querySelectorAll('.step-n')) {
    const n = Number(el.textContent.trim());
    if (!Number.isInteger(n) || n < 1 || n > 9) continue;
    const valec = Array.from({ length: n + 1 }, (_, i) => `<span>${i}</span>`).join('');
    el.innerHTML = `<span class="odo"><span class="odo-f">${n}</span><span class="odo-s" style="--n:${n + 1}">${valec}</span></span>`;
  }
}

plynulePosouvani();
