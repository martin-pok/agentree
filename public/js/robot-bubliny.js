import { tr } from './i18n.js';

// Bubliny robotů: krátká věta ve světlé skleněné bublině u robota, který ji říká.
// - Najetí myší nebo fokus na robota → věta podle jeho stavu (pracuje, čeká na tebe, selhal…).
// - Změna stavu (někdo začne čekat na tebe, doběhne, narazí na limit) → bublina vyskočí sama, jednou.
// - Klepnutí na robota u pozdravu → gesto a věta; občas vzácný easter egg.
// Stav agenta vždy říká i text na stránce – bublina je doprovod, proto aria-hidden.
// Bublina je jedna pro celou aplikaci, drží se v okně (nahoře/dole podle místa) a nikdy nepřekryje
// robota, ke kterému patří. Omezení pohybu a přepínač „Ztišit pohyb“ vypnou gesta i samovolné bubliny.

const STAV = {
  working: () => [
    tr('Makám na tom. Ventilátory zpívají.'),
    tr('Píšu kód. Klidně ruš, zvládnu obojí.'),
    tr('Ještě chvilku, ladím detaily.'),
    tr('Přemýšlím. Potichu, ať to nespletu.'),
    tr('Jedu naplno. Hlásím se, až budu mít výsledek.'),
  ],
  needs_input: () => [
    tr('Potřebuju tvoje rozhodnutí.'),
    tr('Haló! Tady bez tebe nepohnu.'),
    tr('Jedno klepnutí a jedu dál.'),
    tr('Čekám na tvoje „ano“. Nebo „ne“.'),
  ],
  failed: () => [
    tr('Tohle se nepovedlo. Detail řekne proč.'),
    tr('Zakopl jsem. Mrkni, co se stalo.'),
  ],
  limited: () => [
    tr('Došel mi limit. Chvíli dobíjím baterky.'),
    tr('Limit vyčerpán. Až se obnoví, jedu dál.'),
  ],
  waiting: () => [
    tr('Hotovo. Co dál?'),
    tr('Mám volné ruce. Zadej další úkol.'),
    tr('Připraven. Stačí říct.'),
  ],
  idle: () => [
    tr('Odpočívám. Zadej práci a jdu na to.'),
    tr('Klid na palubě.'),
    tr('Tady jsem, kdybys mě potřeboval.'),
  ],
};

// Vzácné: odkazy na kultovní filmy a knihy. Krátké, laskavé, nikdy místo důležité zprávy.
const VZACNE = () => [
  tr('„Já se vrátím.“ Hned po téhle úloze.'),
  tr('Ať tě provází Síla. A čisté commity.'),
  tr('Tohle nejsou ti droidi, které hledáš.'),
  tr('Odpověď je 42. Otázku ještě dohledávám.'),
  tr('Houstone, tentokrát žádný problém.'),
  tr('Promiň, Dave. Tohle udělat můžu.'),
  tr('Ještě jedna věc… Ne, hotovo.'),
  tr('Bip bup. R2 by mi rozuměl.'),
];

const GESTA = ['mavnuti', 'poskok', 'naklon'];
const DOBA_HOVER = 320;
const DOBA_SAMA = 4800;
const ROZESTUP_SAMA = 9000;

const ROBOT = '.pb-agent-logo, .agent-portrait, .home-robot';
const SAMI = '.home-robot, .home-live .pb-agent-logo';
const vyber = (pole, posledni) => {
  const moznosti = pole.length > 1 ? pole.filter((t) => t !== posledni) : pole;
  return moznosti[Math.floor(Math.random() * moznosti.length)];
};

export function stavRobota(el) {
  const stav = el.closest('[data-status]')?.dataset.status || el.closest('[data-state]')?.dataset.state || 'idle';
  if (stav === 'alert') return 'needs_input';
  return STAV[stav] ? stav : 'idle';
}

export function vetaRobota(stav, { nahoda = Math.random, posledni = '' } = {}) {
  if (nahoda() < 0.04) return vyber(VZACNE(), posledni);
  return vyber((STAV[stav] || STAV.idle)(), posledni);
}

export function initRobotBubliny() {
  const pohyb = matchMedia('(prefers-reduced-motion: reduce)');
  const ztiseno = () => { try { return localStorage.getItem('agenteeq:mascot-motion') === 'off'; } catch { return false; } };
  const smiSama = () => !ztiseno() && !document.hidden;
  const smiGesto = () => !ztiseno() && !pohyb.matches;

  const bub = document.createElement('div');
  bub.className = 'rb';
  bub.setAttribute('aria-hidden', 'true');
  bub.hidden = true;
  bub.innerHTML = '<span class="rb-text"></span>';
  document.body.append(bub);
  const text = bub.querySelector('.rb-text');

  let u = null; // robot, ke kterému bublina patří
  let skryt = 0, ukazat = 0, posledni = '', posledniSama = 0;

  // Co bublina nesmí zakrýt: ovládací prvky, nadpisy a texty. Prvky, ve kterých robot sedí
  // (odkaz celé karty), se nepočítají – bublina k nim patří.
  const PREKAZKY = '.sidebar, a, button, input, textarea, select, h1, h2, h3, p, label, .pb-agent-text, .cell-title, .cell-status, .pm-fab, .tabbar, .topbar';
  function prekryv(rect, robot) {
    let plocha = 0;
    for (const el of document.querySelectorAll(PREKAZKY)) {
      if (el.contains(robot) || robot.contains(el) || el === bub) continue;
      const o = el.getBoundingClientRect();
      if (!o.width || !o.height) continue;
      const w = Math.min(rect.right, o.right) - Math.max(rect.left, o.left);
      const h = Math.min(rect.bottom, o.bottom) - Math.max(rect.top, o.top);
      if (w > 0 && h > 0) plocha += w * h;
    }
    return plocha;
  }

  // Zkusí polohu nad, vpravo, vlevo a pod robotem; vezme první, která se vejde do okna a nic
  // nezakryje. Když žádná taková není, tu s nejmenším překryvem. Ocásek vždy míří na hlavu robota.
  function umisti() {
    if (!u?.isConnected) { zavri(); return false; }
    const r = u.getBoundingClientRect();
    if (!r.width || r.bottom < 0 || r.top > innerHeight) { zavri(); return false; }
    const okraj = 12, mezera = 10;
    const zmer = (max = 0) => { bub.style.maxWidth = max ? `${max}px` : ''; return { width: bub.offsetWidth, height: bub.offsetHeight }; };
    const hlavaY = r.top + r.height * 0.35;
    const stredX = r.left + r.width / 2;
    // Karta, ve které robot sedí: vpravo od robota bývá prázdné místo, kam se bublina vejde celá.
    const karta = u.closest('.pb-agent, .row, .home-intro, li')?.getBoundingClientRect();
    const polohy = [];
    const zkus = (strana, max, poloha) => {
      const b = zmer(max);
      const [x0, y0, vejde] = poloha(b);
      if (!vejde) return;
      const x = Math.round(Math.max(okraj, Math.min(innerWidth - b.width - okraj, x0)));
      const y = Math.round(Math.max(okraj, Math.min(innerHeight - b.height - okraj, y0)));
      polohy.push({ strana, x, y, max, w: b.width, h: b.height, skore: prekryv({ left: x, top: y, right: x + b.width, bottom: y + b.height }, u) });
    };
    zkus('nahore', 0, (b) => [stredX - b.width / 2, r.top - b.height - mezera, r.top - b.height - mezera >= okraj]);
    // Robot má v obrázku vzduch po stranách, proto stačí 4 px; k okraji karty 6 px.
    const vKarte = Math.floor(Math.min(karta ? karta.right - 6 : innerWidth, innerWidth - okraj) - (r.right + 4));
    if (vKarte >= 104) zkus('vpravo', Math.min(vKarte, 280), (b) => [r.right + 4, hlavaY - b.height / 2, true]);
    zkus('vpravo', 0, (b) => [r.right + mezera, hlavaY - b.height / 2, r.right + mezera + b.width <= innerWidth - okraj]);
    zkus('vlevo', 0, (b) => [r.left - mezera - b.width, hlavaY - b.height / 2, r.left - mezera - b.width >= okraj]);
    zkus('dole', 0, (b) => [stredX - b.width / 2, r.bottom + mezera, r.bottom + mezera + b.height <= innerHeight - okraj]);
    const volba = polohy.find((p) => p.skore === 0) || polohy.sort((a, c) => a.skore - c.skore)[0];
    if (!volba) { zavri(); return false; }
    zmer(volba.max);
    const b = { width: volba.w, height: volba.h };
    bub.style.transform = `translate(${volba.x}px, ${volba.y}px)`;
    bub.style.setProperty('--rb-ocasek', `${Math.round(Math.max(18, Math.min(b.width - 18, stredX - volba.x)))}px`);
    bub.style.setProperty('--rb-ocasek-y', `${Math.round(Math.max(14, Math.min(b.height - 14, hlavaY - volba.y)))}px`);
    bub.dataset.strana = volba.strana;
    return !volba.skore;
  }

  // jenVolne: bublina, která se ukazuje sama, se bez volného místa neukáže vůbec (stav říká i text).
  function rekni(robot, veta, { na = 0, jenVolne = false } = {}) {
    clearTimeout(skryt); clearTimeout(ukazat);
    u = robot; posledni = veta;
    // Česká sazba: jednopísmenná předložka nebo spojka nezůstane na konci řádku.
    text.textContent = veta.replace(/(^|\s)([aikosuvzAIKOSUVZ])\s/g, '$1$2\u00a0');
    bub.hidden = false;
    bub.classList.remove('is-in');
    if (!umisti() && jenVolne) { zavri(); return false; }
    requestAnimationFrame(() => bub.classList.add('is-in'));
    if (na) skryt = setTimeout(zavri, na);
    return true;
  }

  // Zavření nesmí zrušit plánované otevření u jiného robota (přejetí myší z robota na robota).
  function zavri({ vse = false } = {}) {
    clearTimeout(skryt);
    if (vse) clearTimeout(ukazat);
    u = null;
    bub.classList.remove('is-in');
    bub.hidden = true;
  }

  function gesto(robot, druh = vyber(GESTA)) {
    const svg = robot.querySelector('.robot');
    if (!svg || !smiGesto()) return;
    svg.dataset.gesto = druh;
    setTimeout(() => { if (svg.dataset.gesto === druh) delete svg.dataset.gesto; }, 1100);
  }

  // Najetí a fokus: věta podle stavu, se zpožděním, ať bubliny neblikají při přejetí myší přes stránku.
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch') return;
    const robot = e.target.closest?.(ROBOT);
    if (!robot || robot === u) { if (robot) clearTimeout(skryt); return; }
    clearTimeout(ukazat);
    ukazat = setTimeout(() => rekni(robot, vetaRobota(stavRobota(robot), { posledni })), DOBA_HOVER);
  });
  document.addEventListener('pointerout', (e) => {
    const robot = e.target.closest?.(ROBOT);
    if (!robot || robot.contains(e.relatedTarget)) return;
    clearTimeout(ukazat);
    if (robot === u) skryt = setTimeout(zavri, 160);
  });
  document.addEventListener('focusin', (e) => {
    const robot = e.target.querySelector?.(ROBOT) || e.target.closest?.(ROBOT);
    if (robot && e.target.matches(':focus-visible')) rekni(robot, vetaRobota(stavRobota(robot), { posledni }), { na: DOBA_SAMA });
  });
  document.addEventListener('focusout', () => { if (u && !u.contains(document.activeElement)) zavri(); });

  // Robot u pozdravu: klepnutí = gesto a věta. Pět klepnutí rychle po sobě = vzácná věta jistě.
  let klepnuti = [];
  document.addEventListener('click', (e) => {
    const hlavni = e.target.closest?.('.home-robot');
    if (!hlavni) return;
    const ted = Date.now();
    klepnuti = [...klepnuti.filter((t) => ted - t < 2500), ted];
    const egg = klepnuti.length >= 5;
    if (egg) klepnuti = [];
    gesto(hlavni, egg ? 'otocka' : undefined);
    rekni(hlavni, egg ? vyber(VZACNE(), posledni) : vetaRobota(stavRobota(hlavni), { posledni }), { na: DOBA_SAMA });
  });

  // Kód Konami: všichni viditelní roboti poskočí a ten u pozdravu se ozve.
  const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
  let k = 0;
  document.addEventListener('keydown', (e) => {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable) { k = 0; return; }
    k = e.key.toLowerCase() === KONAMI[k].toLowerCase() ? k + 1 : (e.key === KONAMI[0] ? 1 : 0);
    if (k < KONAMI.length) return;
    k = 0;
    document.querySelectorAll(ROBOT).forEach((r, i) => setTimeout(() => gesto(r, 'poskok'), i * 90));
    const kdo = document.querySelector('.home-robot') || document.querySelector(ROBOT);
    if (kdo) rekni(kdo, tr('Tajný level odemčen. Roboti tančí.'), { na: DOBA_SAMA });
  });

  // Změna stavu: když agent začne čekat na tebe, selže, narazí na limit nebo doběhne, ozve se sám.
  // Stav se pamatuje podle agenta (data-key / id v adrese), ne podle prvku: přehled roboty při
  // překreslení vyměňuje a nový prvek se stejným stavem nesmí vypadat jako změna.
  const DULEZITE = new Set(['needs_input', 'failed', 'limited', 'waiting']);
  const predchozi = new Map();
  const kdo = (r) => r.closest('[data-key]')?.dataset.key || (r.matches('.home-robot') ? 'pozdrav' : r.closest('a[href]')?.getAttribute('href') || location.hash);
  // Po načtení a po přechodu stránky se stav chvíli jen zapamatuje: první data nejsou „změna“.
  let klid = Date.now() + 2500;
  let cekani = 0;
  function zkontroluj() {
    cekani = 0;
    let rekl = false;
    // Jen Přehled (robot u pozdravu a „Právě teď“): na seznamu agentů by roboti při živých událostech
    // štěbetali jeden přes druhého a každá bublina by měřila stovky řádků.
    for (const robot of document.querySelectorAll(SAMI)) {
      const id = kdo(robot), stav = stavRobota(robot), byl = predchozi.get(id);
      predchozi.set(id, stav);
      if (rekl || Date.now() < klid || !byl || byl === stav || !DULEZITE.has(stav) || !smiSama() || u) continue;
      if (Date.now() - posledniSama < ROZESTUP_SAMA) continue;
      const r = robot.getBoundingClientRect();
      if (!r.width || r.bottom < 0 || r.top > innerHeight) continue;
      if (!rekni(robot, vetaRobota(stav, { nahoda: () => 1, posledni }), { na: DOBA_SAMA, jenVolne: true })) continue;
      posledniSama = Date.now(); rekl = true;
      if (stav === 'needs_input') gesto(robot, 'mavnuti');
    }
  }
  new MutationObserver(() => { if (!cekani && document.querySelector('.home-robot')) cekani = requestAnimationFrame(zkontroluj); })
    .observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-state', 'data-status'] });
  zkontroluj();

  window.addEventListener('scroll', () => { if (u) umisti(); }, { passive: true, capture: true });
  window.addEventListener('resize', () => { if (u) umisti(); });
  window.addEventListener('hashchange', () => { zavri({ vse: true }); predchozi.clear(); klid = Date.now() + 2500; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') zavri({ vse: true }); });
  return { rekni, zavri };
}
