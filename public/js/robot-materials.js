import { ROBOT_TYPES, geometry } from './robot-svg.js';

// Install shared lighting once before rendering robots, including with reduced motion.
export function vlozPrechody() {
 if (document.getElementById('rb-objem')) return;
 const ns = 'http://www.w3.org/2000/svg';
 const svg = document.createElementNS(ns, 'svg');
 svg.setAttribute('aria-hidden', 'true');
 svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
 svg.style.position = 'absolute';
 svg.innerHTML = '<defs><linearGradient id="rb-objem" x1="0" y1="0" x2="1" y2=".8"><stop offset="0" stop-color="#fff" stop-opacity=".42"/><stop offset=".25" stop-color="#fff" stop-opacity=".16"/><stop offset=".48" stop-color="#fff" stop-opacity="0"/><stop offset=".74" stop-color="#000" stop-opacity=".09"/><stop offset="1" stop-color="#000" stop-opacity=".3"/></linearGradient>'
  // Stínování v otočce: od kraje odvráceného od světla plynule do ztracena (robot-svg.js#stiny).
  + '<linearGradient id="rb-stin-l" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".3"/><stop offset=".22" stop-color="#000" stop-opacity=".2"/><stop offset=".45" stop-color="#000" stop-opacity=".07"/><stop offset=".7" stop-color="#000" stop-opacity="0"/></linearGradient>'
  + '<linearGradient id="rb-stin-p" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".3"/><stop offset=".22" stop-color="#000" stop-opacity=".2"/><stop offset=".45" stop-color="#000" stop-opacity=".07"/><stop offset=".7" stop-color="#000" stop-opacity="0"/></linearGradient>'
  + '<linearGradient id="rb-sklo" x1="0" y1="0" x2=".18" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".18"/><stop offset=".38" stop-color="#fff" stop-opacity=".035"/><stop offset="1" stop-color="#000" stop-opacity=".23"/></linearGradient>'
  + '<radialGradient id="rb-zare"><stop offset="0" stop-color="#ff7aa8" stop-opacity=".95"/><stop offset=".45" stop-color="#e0457b" stop-opacity=".45"/><stop offset="1" stop-color="#e0457b" stop-opacity="0"/></radialGradient></defs>';
 // Ořez obličeje a zad tvarem hlavy v otočce – jeden pro každý typ (geometrie hlavy je dána typem).
 const defs = svg.querySelector('defs');
 for (const typ of ROBOT_TYPES) {
  const h = geometry(typ).head;
  const klip = document.createElementNS(ns, 'clipPath');
  klip.id = `rb-hlava-${typ}`;
  klip.setAttribute('clipPathUnits', 'userSpaceOnUse');
  const r = document.createElementNS(ns, 'rect');
  for (const [k, v] of Object.entries({ x: h.x, y: h.top, width: h.w, height: h.h, rx: h.r })) r.setAttribute(k, String(v));
  klip.append(r);
  defs.append(klip);
 }
 document.body.prepend(svg);
}
