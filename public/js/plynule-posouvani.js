// Plynulé posouvání kolečkem a trackpadem na počítači. Stejný dojezd má aplikace (app.js)
// i web (site/lp.js) – obojí bere tenhle jeden soubor.
//
// Stránka se dál posouvá skutečným posunem okna, nic se nepřesouvá transformací. Lepivé prvky,
// nástupy řízené posouváním, hledání na stránce i čtečky proto fungují stejně jako bez něj.
// Skript jen rozloží každý krok kolečka do plynulého dojezdu.
//
// Dotyk zůstává celý nativní: telefon a tablet mají vlastní setrvačnost a web už jednou kvůli
// převzatému dotyku na iPhonu nešel posunout. Proto se nezapne na zařízení s dotykem ani
// s „omezit pohyb“. Klávesnice, posuvník, odkazy na sekce i přepnutí obrazovky zůstávají
// prohlížeči – jakmile se ozvou, dojezd se zastaví a skript převezme polohu, kde stránka je.

// Časová konstanta dojezdu. Kratší působí tvrdě jako bez efektu, delší už jako zpoždění.
const DOJEZD_MS = 110;

export function plynulePosouvani() {
  const html = document.documentElement;
  const presnyUkazatel = matchMedia('(hover: hover) and (pointer: fine)');
  const omezitPohyb = matchMedia('(prefers-reduced-motion: reduce)');
  const zapnuto = () => presnyUkazatel.matches && !omezitPohyb.matches && navigator.maxTouchPoints === 0;
  const oznac = () => { if (zapnuto()) html.dataset.plynule = ''; else delete html.dataset.plynule; };
  oznac();
  presnyUkazatel.addEventListener?.('change', oznac);
  omezitPohyb.addEventListener?.('change', oznac);

  let poloha = 0;      // kde dojezd právě je (desetinně – okno si posun zaokrouhlí samo)
  let cil = 0;         // kam dojíždí
  let nastaveno = -1;  // co skript naposledy okně nastavil; jiný posun přišel odjinud
  let bezi = false;
  let cas = 0;

  const maximum = () => Math.max(0, html.scrollHeight - innerHeight);
  // Během dojezdu se plynulost z CSS (scroll-behavior: smooth, pro odkazy na sekce) vypne, jinak
  // by každý snímek spustil ještě vlastní animaci prohlížeče. Nespoléhá se na behavior: 'instant',
  // který starší Safari nezná.
  const posun = (y) => { nastaveno = y; scrollTo(0, y); };
  const zastav = () => { bezi = false; cas = 0; html.style.scrollBehavior = ''; };
  const spust = () => { bezi = true; html.style.scrollBehavior = 'auto'; requestAnimationFrame(snimek); };
  const posunutoJinak = () => Math.abs(scrollY - nastaveno) > 2;

  function snimek(t) {
    if (!bezi) return;
    // Stránku mezitím posunulo něco jiného (přepnutí obrazovky, klávesnice) a událost scroll
    // ještě nedorazila – dojezd by to přepsal zpátky.
    if (posunutoJinak()) { zastav(); return; }
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

  // Posuvný prvek uvnitř stránky (kód, seznam, přepis konverzace) dostane kolečko sám, dokud má
  // kam jet.
  const vnitrniPosuv = (prvek, dolu) => {
    for (let el = prvek; el && el !== document.body && el !== html; el = el.parentElement) {
      if (!(el instanceof Element)) continue;
      const styl = getComputedStyle(el).overflowY;
      if ((styl === 'auto' || styl === 'scroll') && el.scrollHeight > el.clientHeight + 1) {
        if (dolu ? el.scrollTop + el.clientHeight < el.scrollHeight - 1 : el.scrollTop > 0) return true;
      }
    }
    return false;
  };

  // Stránka je zamčená (otevřené okno nebo vyhledávání dá tělu overflow: hidden) nebo nad ní leží
  // modální dialog. Skriptem se okno posunout dá i tak, takže by se hýbalo, co má stát.
  const zamceno = (cilUdalosti) =>
    getComputedStyle(document.body).overflowY === 'hidden'
    || getComputedStyle(html).overflowY === 'hidden'
    || Boolean(cilUdalosti?.closest?.('dialog[open]'));

  addEventListener('wheel', (e) => {
    if (!zapnuto() || e.defaultPrevented || e.ctrlKey || e.metaKey) return; // ctrl = přiblížení na trackpadu
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY) || !e.deltaY) return;       // vodorovný posun nechat být
    if (zamceno(e.target) || vnitrniPosuv(e.target, e.deltaY > 0)) return;
    const krok = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaMode === 2 ? e.deltaY * innerHeight : e.deltaY;
    const novy = Math.min(maximum(), Math.max(0, (bezi ? cil : scrollY) + krok));
    // Na kraji stránky není kam dojíždět: odraz na Macu (a posun stránky kolem, kdyby byla
    // vložená v rámu) zůstane prohlížeči.
    if (!bezi && Math.abs(novy - scrollY) < 1) return;
    e.preventDefault();
    if (!bezi) poloha = scrollY;
    cil = novy;
    if (!bezi) spust();
  }, { passive: false });

  // Posun, který neudělal skript (klávesnice, posuvník, odkaz na sekci, hledání), má přednost.
  addEventListener('scroll', () => {
    if (bezi && posunutoJinak()) zastav();
  }, { passive: true });
  for (const udalost of ['keydown', 'mousedown', 'touchstart']) addEventListener(udalost, zastav, { passive: true });
  addEventListener('click', (e) => { if (e.target.closest?.('a[href^="#"]')) zastav(); });
  addEventListener('resize', () => { cil = Math.min(cil, maximum()); });
}
