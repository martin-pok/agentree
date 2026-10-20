// Horní lišta (nadpis a akce vpravo nahoře) při posouvání stránky.
//
// Na začátku stránky stojí lišta na svém místě v toku. Jakmile ji stránka minula:
// - posun dolů ji schová (vyjede nahoru mimo okno) – obsah má celou výšku,
// - posun nahoru ji vysune shora; pod ní je gradient v barvě papíru aktuálního vzhledu,
//   takže obsah pod lištou plynule mizí a akce jsou čitelné na čemkoli.
// Stav nese `html[data-lista]`: „nahore“ (lišta v toku), „skryta“, „vysunuta“. Vzhled a pohyb
// řeší CSS (styles.css, „Horní lišta při posouvání“); tady se jen rozhoduje, který stav platí.
//
// Lišta se neschová, dokud v ní je fokus (klávesnice), je otevřené okno upozornění nebo hledání –
// akce by uživateli zmizely pod rukama. Schovaná je inert: Tab ji přeskočí, posun nahoru ji vrátí. Malé posuny (setrvačnost, kolísání trackpadu) stav nemění.

const PRAH = 8; // px souvislého posunu jedním směrem, než se lišta schová nebo vysune

export function listaPriPosunu({ lista = document.querySelector('.topbar'), koren = document.documentElement } = {}) {
  if (!lista) return () => {};
  // Kotva: kde lišta v toku začíná (transform ani lepení ji neposune, na rozdíl od lišty samotné).
  const kotva = document.createElement('div');
  kotva.className = 'lista-kotva';
  kotva.setAttribute('aria-hidden', 'true');
  lista.before(kotva);

  let posledni = Math.max(0, window.scrollY);
  let smer = 0; // nasčítaný posun jedním směrem
  let ceka = false;

  // Schovaná lišta je mimo okno: inert ji vyřadí z Tabu i ze čtečky. Jinak by Tab na její tlačítko
  // nechal prohlížeč odrolovat stránku až nahoru, aby ho ukázal.
  const nastav = (stav) => {
    if (koren.dataset.lista !== stav) koren.dataset.lista = stav;
    lista.inert = stav === 'skryta';
  };
  // Fokus na ovládacím prvku lišty (Tab), ne na nadpisu: ten dostává fokus po každém přechodu
  // obrazovky kvůli čtečce a lišta by se pak už nikdy neschovala.
  const fokusVListe = () => { const a = document.activeElement; return lista.contains(a) && !a.matches('.page-title'); };
  const drzetViditelnou = () => fokusVListe()
    || !document.getElementById('notif-pop')?.hidden
    || Boolean(document.querySelector('.palette:not([hidden])'));
  // Lišta je přilepená, jakmile by ji stránka v toku odvezla nad její horní okraj.
  const prilepena = (y) => {
    const horni = parseFloat(getComputedStyle(lista).top) || 0;
    return kotva.getBoundingClientRect().top + window.scrollY - horni < y;
  };
  // Boční okraje gradientu: přes celou šířku hlavního sloupce včetně jeho odsazení, ne přes postranní panel.
  const okraje = () => {
    const main = lista.parentElement;
    const cs = getComputedStyle(main);
    lista.style.setProperty('--lista-l', cs.paddingLeft);
    lista.style.setProperty('--lista-r', cs.paddingRight);
    // Výška lišty pro to, co se lepí pod ni (záložky Nastavení na užších oknech).
    koren.style.setProperty('--lista-h', `${Math.round(lista.getBoundingClientRect().height)}px`);
  };

  function vyhodnot() {
    ceka = false;
    const y = Math.max(0, window.scrollY); // přetažení nad začátek (iOS) je pořád začátek
    const dy = y - posledni;
    posledni = y;
    if (!prilepena(y)) { smer = 0; nastav('nahore'); return; }
    if (drzetViditelnou()) { smer = 0; nastav('vysunuta'); return; }
    smer = Math.sign(dy) === Math.sign(smer) ? smer + dy : dy;
    if (smer > PRAH) nastav('skryta');
    else if (smer < -PRAH) nastav('vysunuta');
    else if (!koren.dataset.lista || koren.dataset.lista === 'nahore') nastav(dy > 0 ? 'skryta' : 'vysunuta');
  }
  const naPosun = () => { if (!ceka) { ceka = true; requestAnimationFrame(vyhodnot); } };
  // Klávesnice: fokus v liště ji vždy ukáže.
  const naFokus = () => { if (fokusVListe() && prilepena(window.scrollY)) nastav('vysunuta'); };
  const naZmenu = () => { okraje(); posledni = Math.max(0, window.scrollY); smer = 0; vyhodnot(); };

  okraje();
  nastav('nahore');
  vyhodnot();
  window.addEventListener('scroll', naPosun, { passive: true });
  window.addEventListener('resize', naZmenu, { passive: true });
  window.addEventListener('hashchange', naZmenu);
  lista.addEventListener('focusin', naFokus);
  // Výška lišty se mění s obrazovkou (tlačítko zpět, zalomený nadpis) i po vykreslení dat.
  const pozorovatel = typeof ResizeObserver === 'function' ? new ResizeObserver(okraje) : null;
  pozorovatel?.observe(lista);
  return () => {
    pozorovatel?.disconnect();
    window.removeEventListener('scroll', naPosun);
    window.removeEventListener('resize', naZmenu);
    window.removeEventListener('hashchange', naZmenu);
    lista.removeEventListener('focusin', naFokus);
    kotva.remove();
    lista.inert = false;
    koren.style.removeProperty('--lista-h');
    delete koren.dataset.lista;
  };
}
