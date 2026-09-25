// Landing page. Produkt ukazují výřezy skutečného rozhraní (site/detail, scripts/shots-site.mjs)
// a jejich nástup obstará CSS – ve stránce není žádný vložený rám, který by si mohl nechat dotyk
// nebo kolečko myši a zastavit posouvání stránky. Tady zbývá plynulé posouvání a drobnosti
// kolem návodu.

const anglicky = document.documentElement.lang === 'en';

// Adresu rozšíření v Chromu nejde otevřít odkazem, ale zkopírovat se dá.
for (const pole of document.querySelectorAll('[data-kopirovat]')) {
  pole.setAttribute('role', 'button');
  pole.setAttribute('tabindex', '0');
  pole.setAttribute('title', anglicky ? 'Click to copy' : 'Kliknutím zkopíruješ');
  const kopiruj = async () => {
    try {
      await navigator.clipboard.writeText(pole.dataset.kopirovat);
      const puvodni = pole.textContent;
      pole.textContent = anglicky ? 'copied' : 'zkopírováno';
      setTimeout(() => { pole.textContent = puvodni; }, 1200);
    } catch { /* prohlížeč bez schránky – text zůstane k ručnímu označení */ }
  };
  pole.addEventListener('click', kopiruj);
  pole.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); kopiruj(); } });
}

const odkryjRozsireni = () => { if (location.hash === '#rozsireni') document.getElementById('rozsireni').open = true; };
addEventListener('hashchange', odkryjRozsireni);
odkryjRozsireni();

// Plynulé posouvání kolečkem a trackpadem na počítači.
//
// Stránka se dál posouvá skutečným posunem okna, nic se nepřesouvá transformací. Nástupy řízené
// posouváním (animation-timeline: view()), lepivá lišta, hledání na stránce i čtečky proto
// fungují stejně jako bez něj. Skript jen rozloží každý krok kolečka do plynulého dojezdu.
//
// Dotyk zůstává celý nativní: telefon a tablet mají vlastní setrvačnost a tahle stránka už jednou
// kvůli převzatému dotyku na iPhonu nešla posunout. Proto se nezapne na zařízení s dotykem ani
// s „omezit pohyb“. Klávesnice, posuvník a odkazy na sekce zůstávají prohlížeči – jakmile se
// ozvou, dojezd se zastaví a skript převezme polohu, kde stránka skutečně je.
function plynulePosouvani() {
  const presnyUkazatel = matchMedia('(hover: hover) and (pointer: fine)');
  const omezitPohyb = matchMedia('(prefers-reduced-motion: reduce)');
  const zapnuto = () => presnyUkazatel.matches && !omezitPohyb.matches && navigator.maxTouchPoints === 0;
  const oznac = () => { if (zapnuto()) document.documentElement.dataset.plynule = ''; else delete document.documentElement.dataset.plynule; };
  oznac();
  presnyUkazatel.addEventListener?.('change', oznac);
  omezitPohyb.addEventListener?.('change', oznac);

  // Časová konstanta dojezdu. Kratší působí tvrdě jako bez efektu, delší už jako zpoždění.
  const DOJEZD_MS = 110;
  let poloha = 0;      // kde dojezd právě je (desetinně – okno si posun zaokrouhlí samo)
  let cil = 0;         // kam dojíždí
  let nastaveno = -1;  // co skript naposledy okně nastavil; jiný posun přišel odjinud
  let bezi = false;
  let cas = 0;

  const html = document.documentElement;
  const maximum = () => Math.max(0, html.scrollHeight - innerHeight);
  // Během dojezdu se plynulost z CSS (scroll-behavior: smooth, pro odkazy na sekce) vypne, jinak
  // by každý snímek spustil ještě vlastní animaci prohlížeče. Nespoléhá se na behavior: 'instant',
  // který starší Safari nezná.
  const posun = (y) => { nastaveno = y; scrollTo(0, y); };
  const zastav = () => { bezi = false; cas = 0; html.style.scrollBehavior = ''; };
  const spust = () => { bezi = true; html.style.scrollBehavior = 'auto'; requestAnimationFrame(snimek); };

  function snimek(t) {
    if (!bezi) return;
    const dt = Math.min(48, cas ? t - cas : 16);
    cas = t;
    poloha += (cil - poloha) * (1 - Math.exp(-dt / DOJEZD_MS));
    if (Math.abs(cil - poloha) < 0.5) {
      posun(cil);
      zastav();
      return;
    }
    posun(poloha);
    requestAnimationFrame(snimek);
  }

  // Posuvný prvek uvnitř stránky (kód, seznam) dostane kolečko sám, dokud má kam jet.
  const vnitrniPosuv = (prvek, dolu) => {
    for (let el = prvek; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
      if (!(el instanceof Element)) continue;
      const styl = getComputedStyle(el).overflowY;
      if ((styl === 'auto' || styl === 'scroll') && el.scrollHeight > el.clientHeight + 1) {
        if (dolu ? el.scrollTop + el.clientHeight < el.scrollHeight - 1 : el.scrollTop > 0) return true;
      }
    }
    return false;
  };

  addEventListener('wheel', (e) => {
    if (!zapnuto() || e.defaultPrevented || e.ctrlKey || e.metaKey) return; // ctrl = přiblížení na trackpadu
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY) || !e.deltaY) return;       // vodorovný posun nechat být
    if (vnitrniPosuv(e.target, e.deltaY > 0)) return;
    const krok = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaMode === 2 ? e.deltaY * innerHeight : e.deltaY;
    e.preventDefault();
    if (!bezi) { poloha = scrollY; cil = scrollY; }
    cil = Math.min(maximum(), Math.max(0, cil + krok));
    if (!bezi) spust();
  }, { passive: false });

  // Posun, který neudělal skript (klávesnice, posuvník, odkaz na sekci, hledání), má přednost.
  addEventListener('scroll', () => {
    if (bezi && Math.abs(scrollY - nastaveno) > 2) zastav();
  }, { passive: true });
  for (const udalost of ['keydown', 'mousedown', 'touchstart']) addEventListener(udalost, zastav, { passive: true });
  addEventListener('click', (e) => { if (e.target.closest?.('a[href^="#"]')) zastav(); });
  addEventListener('resize', () => { cil = Math.min(cil, maximum()); });
}
plynulePosouvani();
