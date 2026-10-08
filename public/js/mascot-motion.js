// One animated companion at a time. No tracking outside this document or stored pointer data.
export function initMascotMotion() {
 const media = matchMedia('(prefers-reduced-motion: reduce)');
 let paused = false;
 try { paused = localStorage.getItem('agenteeq:mascot-motion') === 'off'; } catch { /* optional */ }
 let frame = 0, gaze = null, active = null, timer = 0, nextBlink = Date.now() + 9000;
 const allowed = () => !paused && !media.matches && !document.hidden;
 const visible = () => [...document.querySelectorAll('.robot')].filter(r => { const b = r.getBoundingClientRect(); return b.width && b.top >= 0 && b.bottom <= innerHeight && b.right > 0 && b.left < innerWidth; });
 function reset() {
  cancelAnimationFrame(frame); frame = 0;
  gaze?.style.removeProperty('--gaze-x'); gaze?.style.removeProperty('--gaze-y'); gaze = null;
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
  const { clientX: x, clientY: y } = e;
  frame = requestAnimationFrame(() => {
   frame = 0;
   const candidates = visible().map(r => { const b = r.getBoundingClientRect(); return { r, dx: x - (b.left + b.width / 2), dy: y - (b.top + b.height / 2) }; }).sort((a,b) => Math.hypot(a.dx,a.dy)-Math.hypot(b.dx,b.dy));
   const nearest = candidates[0];
   if (gaze && gaze !== nearest?.r) { gaze.style.removeProperty('--gaze-x'); gaze.style.removeProperty('--gaze-y'); }
   gaze = nearest?.r || null;
   if (gaze) { gaze.style.setProperty('--gaze-x', `${Math.max(-3,Math.min(3,nearest.dx / 65))}px`); gaze.style.setProperty('--gaze-y', `${Math.max(-2,Math.min(2,nearest.dy / 80))}px`); }
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
  document.querySelectorAll('[data-mascot-motion]').forEach(b => { b.setAttribute('aria-pressed', String(!paused && !media.matches)); b.textContent = media.matches ? 'Pohyb omezen systémem' : paused ? 'Zapnout pohyb' : 'Ztišit pohyb'; });
 }
 document.addEventListener('robot:guide-ready', syncButtons);
 window.addEventListener('hashchange', () => { reset(); requestAnimationFrame(syncButtons); });
 setInterval(() => {
  if (!allowed() || active || document.querySelector('dialog[open]') || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return;
  const robots = visible(); if (!robots.length) return;
  const now = Date.now();
  if (now > nextBlink) { emote('blink', robots[Math.floor(Math.random()*robots.length)]); nextBlink = now + 8000 + Math.random()*6000; }
 }, 2000);
 reset(); syncButtons();
}
