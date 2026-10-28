// Install shared lighting once before rendering robots, including with reduced motion.
export function vlozPrechody() {
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
