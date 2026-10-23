import { tr } from './i18n.js';
import { stavRobota } from './robot-bubliny.js';

// Pohyb robotů: oči sledují kurzor a občas mrknou; stavové pohyby (pracuje, čeká na tebe, hotovo,
// selhalo) kreslí CSS podle data-state (public/workbench.css). Systémové omezení pohybu má přednost,
// ruční vypnutí se pamatuje jen v tomto prohlížeči. Poloha kurzoru se nikam neukládá.
export function initMascotMotion() {
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
   z.target.classList.toggle('is-zivy', z.isIntersecting);
   if (z.isIntersecting && z.intersectionRatio >= 0.99) vOkne.add(z.target); else vOkne.delete(z.target);
  }
 }, { threshold: [0, 1] }) : null;
 const roboti = (uzel) => (uzel.nodeType !== 1 ? [] : [...(uzel.matches('.robot') ? [uzel] : []), ...uzel.querySelectorAll('.robot')]);
 if (io) {
  for (const r of roboti(document.body)) io.observe(r);
  new MutationObserver((zmeny) => {
   for (const z of zmeny) {
    for (const n of z.addedNodes) for (const r of roboti(n)) io.observe(r);
    for (const n of z.removedNodes) for (const r of roboti(n)) { io.unobserve(r); vOkne.delete(r); }
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
 function zmenyStavu() {
  ceka = 0;
  for (const obal of document.querySelectorAll(ROBOT)) {
   const svg = obal.querySelector('.robot'); if (!svg) continue;
   const id = klic(obal), stav = stavRobota(obal), byl = predtim.get(id);
   predtim.set(id, stav);
   if (Date.now() < klid || !byl || byl === stav || !REAKCE[stav] || !svg.classList.contains('is-zivy')) continue;
   // Poskok jen za skutečně dokončenou práci, ne za přechod z klidu do čekání.
   if (stav === 'waiting' && byl !== 'working') continue;
   gesto(svg, REAKCE[stav]);
  }
 }
 new MutationObserver(() => { if (!ceka) ceka = requestAnimationFrame(zmenyStavu); })
  .observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-state', 'data-status', 'data-done'] });
 window.addEventListener('hashchange', () => { predtim.clear(); klid = Date.now() + 2500; });
 reset(); syncButtons();
}
