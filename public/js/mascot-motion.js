import { tr } from './i18n.js';
import { stavRobota } from './robot-bubliny.js';
import { postupPrace } from './home-studio.js';

// Pohyb robotů: oči sledují kurzor a občas mrknou; stavové pohyby (pracuje, čeká na tebe, hotovo,
// selhalo) kreslí CSS podle data-state (public/workbench.css). Systémové omezení pohybu má přednost,
// ruční vypnutí se pamatuje jen v tomto prohlížeči. Poloha kurzoru se nikam neukládá.
// Přechody pro objem robotů (světlo/stín přes hlavu a trup) a záři antény. Jednou do dokumentu;
// robot-svg.js na ně odkazuje přes url(#…) s náhradou „none“, takže bez nich se jen nic nekreslí.
function vlozPrechody() {
 if (document.getElementById('rb-objem')) return;
 const ns = 'http://www.w3.org/2000/svg';
 const svg = document.createElementNS(ns, 'svg');
 svg.setAttribute('aria-hidden', 'true');
 svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
 svg.style.position = 'absolute';
 svg.innerHTML = '<defs><linearGradient id="rb-objem" x1="0" y1="0" x2="1" y2=".8"><stop offset="0" stop-color="#fff" stop-opacity=".42"/><stop offset=".25" stop-color="#fff" stop-opacity=".16"/><stop offset=".48" stop-color="#fff" stop-opacity="0"/><stop offset=".74" stop-color="#000" stop-opacity=".09"/><stop offset="1" stop-color="#000" stop-opacity=".3"/></linearGradient>'
  + '<linearGradient id="rb-sklo" x1="0" y1="0" x2=".18" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".18"/><stop offset=".38" stop-color="#fff" stop-opacity=".035"/><stop offset="1" stop-color="#000" stop-opacity=".23"/></linearGradient>'
  + '<radialGradient id="rb-zare"><stop offset="0" stop-color="#ff7aa8" stop-opacity=".95"/><stop offset=".45" stop-color="#e0457b" stop-opacity=".45"/><stop offset="1" stop-color="#e0457b" stop-opacity="0"/></radialGradient></defs>';
 document.body.prepend(svg);
}

export function initMascotMotion() {
  // Flákání začne až po oddechu (home-studio.js#dilnaAtributy: data-hra-od). Kontrola stačí jednou
  // za sekundu a sahá jen na prvky, které na svou zábavu ještě čekají.
  setInterval(() => {
    const ted = Date.now();
    for (const el of document.querySelectorAll('[data-hra-od]')) {
      if (Number(el.dataset.hraOd) > ted) continue;
      el.dataset.hra = el.dataset.hraPak || 'klid';
      delete el.dataset.hraOd; delete el.dataset.hraPak;
    }
  }, 1000);
 vlozPrechody();
 const media = matchMedia('(prefers-reduced-motion: reduce)');
 let paused = false;
 try { paused = localStorage.getItem('agenteeq:mascot-motion') === 'off'; } catch { /* optional */ }
 let frame = 0, gaze = new Set(), active = null, timer = 0, nextBlink = Date.now() + 9000, posledniPohyb = 0;
 const allowed = () => !paused && !media.matches && !document.hidden;
 // Roboty celé v okně hlídá IntersectionObserver. Dřív se při každém pohybu myši a každé dvě sekundy
 // měřil každý robot na stránce (getBoundingClientRect): u 140 agentů to donutilo prohlížeč vykreslit
 // i karty mimo okno (content-visibility) a jeden snímek trval přes 150 ms. Měří se jen roboti v okně.
 const vOkne = new Set();
 // .is-zivy: klidový „život“ (dech, rozhlížení, anténa – refinement.css) jen u robota, který je
 // aspoň zčásti vidět. Mimo okno se nic nepřekresluje.
 const io = typeof IntersectionObserver === 'function' ? new IntersectionObserver((zaznamy) => {
  for (const z of zaznamy) {
   // IO může doručit starý záznam až po výměně obrazovky. Odpojené SVG nesmí zůstat v Setu.
   if (!z.target.isConnected) { uvolniRobota(z.target); continue; }
   z.target.classList.toggle('is-zivy', z.isIntersecting);
   if (z.isIntersecting && z.intersectionRatio >= 0.99) vOkne.add(z.target); else vOkne.delete(z.target);
  }
 }, { threshold: [0, 1] }) : null;
 const roboti = (uzel) => (uzel.nodeType !== 1 ? [] : [...(uzel.matches('.robot') ? [uzel] : []), ...uzel.querySelectorAll('.robot')]);
 // Uvolni animace a silné reference ještě při odpojení SVG. Nekonečné CSS animace
 // by jinak mohly v paměti držet již odstraněné potomky mezi přepnutími obrazovek.
 const uvolniRobota = (r) => {
  io?.unobserve(r);
  vOkne.delete(r);
  gaze.delete(r);
  if (active === r) { clearTimeout(timer); active = null; }
  r.classList.remove('is-zivy');
  r.style.removeProperty('--gaze-x');
  r.style.removeProperty('--gaze-y');
  doUklidu.add(r);
  uklid ||= naklid(uklidAnimace);
 };
 // Rušení animací odpojených robotů (getAnimations přes celé SVG) stálo u 140 agentů ~40 ms v jedné
 // úloze a zasekávalo přepnutí obrazovky. Běží proto až ve volné chvíli prohlížeče, po dávkách.
 const doUklidu = new Set();
 const naklid = (f) => (window.requestIdleCallback ? requestIdleCallback(f, { timeout: 2000 }) : setTimeout(() => f({ timeRemaining: () => 8 }), 50));
 let uklid = 0;
 function uklidAnimace(lhuta) {
  uklid = 0;
  for (const r of doUklidu) {
   if (lhuta.timeRemaining() < 2 && !lhuta.didTimeout) break;
   doUklidu.delete(r);
   if (!r.isConnected) for (const a of r.getAnimations({ subtree: true })) a.cancel();
  }
  if (doUklidu.size) uklid = naklid(uklidAnimace);
 }
 if (io) {
  for (const r of roboti(document.body)) io.observe(r);
  new MutationObserver((zmeny) => {
   for (const z of zmeny) {
    for (const n of z.addedNodes) for (const r of roboti(n)) io.observe(r);
    for (const n of z.removedNodes) for (const r of roboti(n)) uvolniRobota(r);
   }
  }).observe(document.body, { childList: true, subtree: true });
 }
 if (!io) for (const r of document.querySelectorAll('.robot')) r.classList.add('is-zivy');
 const visible = () => io ? [...vOkne].filter(r => r.isConnected)
  : [...document.querySelectorAll('.robot')].filter(r => { const b = r.getBoundingClientRect(); return b.width && b.top >= 0 && b.bottom <= innerHeight && b.right > 0 && b.left < innerWidth; });
 function reset() {
  cancelAnimationFrame(frame); frame = 0;
  for (const robot of gaze) { robot.style.removeProperty('--gaze-x'); robot.style.removeProperty('--gaze-y'); }
  gaze.clear();
  if (active) delete active.dataset.emote;
  active = null; clearTimeout(timer);
  document.documentElement.classList.toggle('mascot-motion-off', !allowed());
 }
 function emote(kind, robot) {
  if (!allowed() || active) return;
  const target = robot || visible()[0]; if (!target) return;
  active = target; target.dataset.emote = kind;
  timer = setTimeout(() => { delete target.dataset.emote; active = null; }, kind === 'blink' ? 220 : 1600);
 }
 document.addEventListener('pointermove', e => {
  if (!allowed() || e.pointerType === 'touch' || frame) return;
  posledniPohyb = Date.now();
  const { clientX: x, clientY: y } = e;
  frame = requestAnimationFrame(() => {
   frame = 0;
   const candidates = visible();
   for (const robot of gaze) if (!candidates.includes(robot)) { robot.style.removeProperty('--gaze-x'); robot.style.removeProperty('--gaze-y'); }
   gaze = new Set(candidates);
   for (const robot of candidates) {
    const box = robot.getBoundingClientRect();
    robot.style.setProperty('--gaze-x', `${Math.max(-3,Math.min(3,(x - box.left - box.width / 2) / 65))}px`);
    robot.style.setProperty('--gaze-y', `${Math.max(-2,Math.min(2,(y - box.top - box.height / 2) / 80))}px`);
   }
  });
 }, { passive: true });
 document.addEventListener('pointerout', e => { if (!e.relatedTarget) reset(); });
 document.addEventListener('click', e => {
  if (e.target.closest('[data-mascot-motion]')) {
   paused = !paused;
   try { localStorage.setItem('agenteeq:mascot-motion', paused ? 'off' : 'on'); } catch { /* optional */ }
   syncButtons(); reset(); return;
  }

 });

 document.addEventListener('visibilitychange', reset);
 window.addEventListener('blur', reset);
 media.addEventListener('change', () => { reset(); syncButtons(); });
 function syncButtons() {
  document.querySelectorAll('[data-mascot-motion]').forEach(b => { b.setAttribute('aria-pressed', String(!paused && !media.matches)); b.textContent = media.matches ? tr('Pohyb omezen systémem') : paused ? tr('Zapnout pohyb') : tr('Omezit pohyb'); });
 }
 document.addEventListener('robot:guide-ready', syncButtons);
 window.addEventListener('hashchange', () => { reset(); requestAnimationFrame(syncButtons); });
 setInterval(() => {
  if (!allowed() || active || document.querySelector('dialog[open]') || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return;
  const robots = visible(); if (!robots.length) return;
  const now = Date.now();
  if (now > nextBlink) { emote('blink', robots[Math.floor(Math.random()*robots.length)]); nextBlink = now + 8000 + Math.random()*6000; }
  // Když myš stojí, roboti se sami rozhlédnou: jeden se na chvíli podívá jinam a zase zpět.
  if (now - posledniPohyb > 4000 && Math.random() < .6) {
   const r = robots[Math.floor(Math.random() * robots.length)];
   r.style.setProperty('--gaze-x', `${(Math.random() * 5 - 2.5).toFixed(1)}px`);
   r.style.setProperty('--gaze-y', `${(Math.random() * 3 - 1.5).toFixed(1)}px`);
   setTimeout(() => { if (Date.now() - posledniPohyb > 4000) { r.style.removeProperty('--gaze-x'); r.style.removeProperty('--gaze-y'); } }, 900 + Math.random() * 900);
  }
 }, 2000);

 // Gesto na jednom robotu (tvary v workbench.css). Nejdelší trvá 1,45 s, pak se atribut smaže.
 const gesto = (svg, druh) => {
  if (!allowed() || !svg || svg.dataset.gesto) return;
  svg.dataset.gesto = druh;
  setTimeout(() => { if (svg.dataset.gesto === druh) delete svg.dataset.gesto; }, 1600);
 };
 // Pozdrav: když na robota najedeš, zvědavě nakloní hlavu, občas zamává. Jeden robot nejvýš
 // jednou za 10 s, ať při přejíždění přes seznam neřádí všichni.
 const ROBOT = '.pb-agent-logo, .agent-portrait, .home-robot';
 const pozdravil = new WeakMap();
 document.addEventListener('pointerover', e => {
  if (e.pointerType === 'touch') return;
  const obal = e.target.closest?.(ROBOT); const svg = obal?.querySelector('.robot');
  if (!svg || obal.contains(e.relatedTarget) || Date.now() - (pozdravil.get(svg) || 0) < 10000) return;
  pozdravil.set(svg, Date.now());
  gesto(svg, Math.random() < .3 ? 'mavnuti' : 'naklon');
 });
 // Změna stavu: doběhl → radostný poskok, potřebuje tebe → zamává, selhal → zarazí se (náklon).
 // Stav se pamatuje podle agenta (data-key, odkaz), ne podle prvku: překreslený prvek se stejným
 // stavem není změna. Po načtení a přechodu stránky se první stav jen zapamatuje.
 const REAKCE = { waiting: 'poskok', needs_input: 'mavnuti', failed: 'naklon' };
 const predtim = new Map();
 const klic = (r) => r.closest('[data-key]')?.dataset.key || (r.matches('.home-robot') ? 'pozdrav' : r.closest('a[href]')?.getAttribute('href') || location.hash);
 let klid = Date.now() + 2500, ceka = 0;
 // Otočka: do práce se robot otočí zády (refinement.css „Robot při práci“), z práce zpátky čelem.
 // Gesto (zamávání, poskok) přijde až po otočce, ať robot nemává zády k tobě.
 const OTOCKA = 600;
 const otoc = (svg, kam) => {
  if (!allowed()) return 0;
  svg.dataset.otocka = kam;
  setTimeout(() => { if (svg.dataset.otocka === kam) delete svg.dataset.otocka; }, OTOCKA);
  return OTOCKA;
 };
 function zmenyStavu() {
  ceka = 0;
  postupy();
  for (const obal of document.querySelectorAll(ROBOT)) {
   const svg = obal.querySelector('.robot'); if (!svg) continue;
   const id = klic(obal), stav = stavRobota(obal), byl = predtim.get(id);
   predtim.set(id, stav);
   if (Date.now() < klid || !byl || byl === stav || !svg.classList.contains('is-zivy')) continue;
   const pauza = obal.matches('.home-robot') || (stav !== 'working' && byl !== 'working') ? 0 : otoc(svg, stav === 'working' ? 'zada' : 'predek');
   // Poskok jen za skutečně dokončenou práci, ne za přechod z klidu do čekání.
   if (!REAKCE[stav] || (stav === 'waiting' && byl !== 'working')) continue;
   setTimeout(() => gesto(svg, REAKCE[stav]), pauza);
  }
 }
 // Obrobek v dílně roste s délkou práce (home-studio.js#postupPrace). Nová fáze krátce zajiskří.
 function postupy() {
  for (const el of document.querySelectorAll('[data-od]')) {
   const faze = String(postupPrace(Number(el.dataset.od)));
   if (el.dataset.postup === faze) continue;
   el.dataset.postup = faze;
   const svg = el.querySelector('.robot');
   if (svg && allowed()) { svg.dataset.novyKus = ''; setTimeout(() => delete svg.dataset.novyKus, 600); }
  }
 }
 setInterval(() => { if (!document.hidden) postupy(); }, 10000);
 new MutationObserver(() => { if (!ceka) ceka = requestAnimationFrame(zmenyStavu); })
  .observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-state', 'data-status', 'data-done'] });
 window.addEventListener('hashchange', () => { predtim.clear(); klid = Date.now() + 2500; });
 reset(); syncButtons();
}
