// Sdílená podoba robota Agenteeq pro aplikaci a web. Jeden zdroj SVG tvarosloví.
//
// Každá postava má vlastní stavbu těla (hlava, trup, nohy, uši, anténa, oči), ale všechny se kreslí
// ve stejném viewBoxu 108×112 a mají stejné třídy, takže animace, sledování kurzoru i šatník fungují
// u všech. Šatník se kreslí pro výchozí stavbu (Scout) a na jinou postavu se přenese přes `fit()`
// třemi kotvami: čepice k temeni (stejné měřítko v obou osách), doplňky na obličej k linii očí
// (oči jsou vždy uprostřed obličeje, výška podle obličeje) a oblečení k trupu. Co musí sedět přesně
// na tvar hlavy nebo trupu (kukla, přilba, dres), kreslí šatník rovnou z geometry().

const REF = { head: { w: 66, top: 23, eyeY: 47.5 }, torso: { x: 33, top: 69, w: 42, h: 24 } };

// w/h/r hlavy, horní okraj, trup (šířka, výška, zaoblení), nohy, uši, anténa, oči, tváře.
const POSTAVY = {
  Scout: { head: [66, 51, 18, 23], torso: [42, 24, 11], legs: 'sticks', ears: 'rect', aerial: 'ball', eyes: 'pill' },
  // Kulatá hlava, na anténě planetka s prstencem.
  Orbit: { head: [64, 60, 30, 19], torso: [36, 22, 11], legs: 'sticks', ears: 'round', aerial: 'planet', eyes: 'dot' },
  // Hranatý retro počítač: ostré rohy, čtverečkové oči a pixelová ústa.
  Pixel: { head: [62, 54, 6, 21], torso: [44, 22, 4], legs: 'blocks', ears: 'square', aerial: 'square', eyes: 'square', mouth: 'pixel', face: 3 },
  // Štíhlá a vysoká: úzké oči, dvě antény s hvězdičkami a hvězda na hrudi.
  Nova: { head: [56, 48, 22, 24], torso: [30, 28, 14], legs: 'sticks', ears: 'none', aerial: 'stars', eyes: 'slit', core: 'star' },
  // Silák: široká hlava i ramena, mohutné nohy.
  Bolt: { head: [74, 52, 14, 26], torso: [56, 22, 9], legs: 'stout', ears: 'rect', aerial: 'bolt', eyes: 'pill' },
  // Buchtička: široká měkká hlava, šťastné oči ^^, tvářičky, ofinka a krátké nožky.
  Mochi: { head: [80, 56, 28, 24], torso: [42, 16, 8], legs: 'nubs', ears: 'none', aerial: 'tuft', eyes: 'happy', cheeks: true },
  Echo: { head: [52, 44, 16, 24], torso: [28, 30, 12], legs: 'long', ears: 'none', aerial: 'ring', eyes: 'visor' },
  Rover: { head: [62, 44, 14, 30], torso: [50, 18, 8], legs: 'treads', ears: 'rect', aerial: 'periscope', eyes: 'pill' },
  Sprout: { head: [64, 50, 22, 26], torso: [38, 20, 10], legs: 'sticks', ears: 'round', aerial: 'leaf', eyes: 'dot', cheeks: true },
};
export const ROBOT_TYPES = Object.keys(POSTAVY);

const n = (x) => Math.round(x * 100) / 100;

// Obličej (tmavá plocha) a oči uprostřed něj. Velikost očí řídí šířka hlavy, ale nikdy nepřesáhne
// výšku obličeje – u nízké široké hlavy by jinak vyjely ven.
export function geometry(type = 'Scout') {
  const p = POSTAVY[type] || POSTAVY.Scout;
  const [w, h, r, top] = p.head;
  const s = w / REF.head.w;
  const x = 54 - w / 2;
  const [tw, th, tr] = p.torso;
  const tTop = top + h - 5;
  const face = { x: x + 7 * s, top: top + 9 * s, w: w - 14 * s, h: h - 19 * s, r: p.face ?? Math.min(r, 14 * s) };
  const eyeY = face.top + face.h / 2 - 0.5 * s;
  const es = Math.min(s, face.h / 32);
  return { ...p, s, es, face, head: { x, top, w, h, r }, torso: { x: 54 - tw / 2, top: tTop, w: tw, h: th, r: tr }, eyeY };
}

// Transformace, která přenese vrstvu nakreslenou pro Scouta na jinou postavu. Čepice se kotví
// k temeni stejným měřítkem v obou osách, doplňky na obličej k linii očí a do výšky obličeje.
// Oblečení se přizpůsobí obdélníku trupu.
export function fit(type, part) {
  const g = geometry(type);
  if (part === 'hat') {
    if (Math.abs(g.s - 1) < 1e-3 && Math.abs(g.head.top - REF.head.top) < 1e-3) return '';
    return `translate(${n(54 - 54 * g.s)} ${n(g.head.top - REF.head.top * g.s)}) scale(${n(g.s)})`;
  }
  if (part === 'face') {
    // Brýle a knír musí zůstat v obličeji. U nízkého širokého obličeje (Bolt, Mochi, Rover) je
    // výška obličeje menší, než by odpovídalo šířce hlavy: svisle se proto řídí výškou obličeje
    // (es, stejně jako oči) a vodorovně šířkou nejvýš o 10 % víc, aby skla zůstala kulatá a
    // seděla na očích (ty jsou od středu ve vzdálenosti podle šířky hlavy).
    const sy = g.es;
    const sx = Math.min(g.s, g.es * 1.1);
    if (Math.abs(sx - 1) < 1e-3 && Math.abs(sy - 1) < 1e-3 && Math.abs(g.eyeY - REF.head.eyeY) < 1e-3) return '';
    return `translate(${n(54 - 54 * sx)} ${n(g.eyeY - REF.head.eyeY * sy)}) scale(${n(sx)}${Math.abs(sx - sy) < 1e-3 ? '' : ' ' + n(sy)})`;
  }
  const t = REF.torso;
  const sx = g.torso.w / t.w;
  const sy = g.torso.h / t.h;
  if (Math.abs(sx - 1) < 1e-3 && Math.abs(sy - 1) < 1e-3 && g.torso.top === t.top) return '';
  return `translate(${n(g.torso.x - t.x * sx)} ${n(g.torso.top - t.top * sy)}) scale(${n(sx)} ${n(sy)})`;
}

// Čtyřcípá hvězdička (Nova): na anténách i jako jádro na hrudi.
const hvezda = (cx, cy, r) => `<path d="M${n(cx)} ${n(cy - r)}Q${n(cx + r * 0.22)} ${n(cy - r * 0.22)} ${n(cx + r)} ${n(cy)}Q${n(cx + r * 0.22)} ${n(cy + r * 0.22)} ${n(cx)} ${n(cy + r)}Q${n(cx - r * 0.22)} ${n(cy + r * 0.22)} ${n(cx - r)} ${n(cy)}Q${n(cx - r * 0.22)} ${n(cy - r * 0.22)} ${n(cx)} ${n(cy - r)}Z" fill="currentColor" stroke="none"/>`;

function aerial(kind, top, s) {
  const a = top;
  switch (kind) {
    case 'twin': return `<path d="M${n(54 - 7 * s)} ${n(a + 1)} ${n(54 - 14 * s)} ${n(a - 10)}M${n(54 + 7 * s)} ${n(a + 1)} ${n(54 + 14 * s)} ${n(a - 10)}"/><circle cx="${n(54 - 14 * s)}" cy="${n(a - 11)}" r="3" fill="currentColor" stroke="none"/><circle cx="${n(54 + 14 * s)}" cy="${n(a - 11)}" r="3" fill="currentColor" stroke="none"/>`;
    case 'square': return `<path d="M54 ${a}V${a - 9}"/><rect x="50" y="${a - 16}" width="8" height="8" rx="1.5" fill="currentColor" stroke="none"/>`;
    case 'bolt': return `<path d="M54 ${a}V${a - 5}"/><path d="M56 ${a - 19}l-7 9h5l-2 8 7-10h-5z" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>`;
    case 'planet': return `<path d="M54 ${a}V${a - 7}"/><circle cx="54" cy="${a - 12}" r="4.6" fill="currentColor" stroke="none"/><ellipse cx="54" cy="${a - 12}" rx="9" ry="2.6" fill="none" stroke-width="2" transform="rotate(-18 54 ${a - 12})"/>`;
    case 'stars': return `<path d="M${n(54 - 6 * s)} ${n(a + 1)} ${n(54 - 12 * s)} ${n(a - 8)}M${n(54 + 6 * s)} ${n(a + 1)} ${n(54 + 12 * s)} ${n(a - 8)}"/>${hvezda(54 - 12 * s, a - 11, 4.2)}${hvezda(54 + 12 * s, a - 11, 4.2)}`;
    case 'tuft': return `<path d="M54 ${a + 1}c-1-6 3-9 7-8-3 1-4 4-3 7M54 ${a + 1}c-2-4-6-5-9-3 3 0 5 2 5 4" fill="currentColor" stroke-width="2"/>`;
    case 'sprig': return `<path d="M54 ${a}c0-4 1-6 3-8"/><circle cx="58" cy="${a - 10}" r="3.2" fill="currentColor" stroke="none"/>`;
    case 'ring': return `<path d="M54 ${a}V${a - 7}"/><circle cx="54" cy="${a - 12}" r="4.5" fill="none" stroke-width="3"/>`;
    case 'periscope': return `<path d="M60 ${a}V${a - 11}h-8"/><rect x="45" y="${a - 15}" width="8" height="7" rx="2" fill="currentColor" stroke="none"/>`;
    case 'leaf': return `<path d="M54 ${a}V${a - 8}"/><path d="M54 ${a - 8}c-1-7 4-11 11-11-1 7-5 11-11 11zM54 ${a - 8}c0-5-3-8-8-8 0 5 3 8 8 8z" fill="currentColor" stroke="none"/>`;
    default: return `<path d="M54 ${a}V${a - 10}"/><circle cx="54" cy="${a - 13}" r="4" fill="currentColor" stroke="none"/>`;
  }
}

function ears(kind, h, s) {
  const { x, w, top } = h;
  const y = top + 16 * s;
  const eh = 19 * s;
  switch (kind) {
    case 'round': return `<circle class="robot-ear" cx="${n(x - 2)}" cy="${n(y + eh / 2)}" r="${n(7 * s)}"/><circle class="robot-ear" cx="${n(x + w + 2)}" cy="${n(y + eh / 2)}" r="${n(7 * s)}"/>`;
    case 'square': return `<rect class="robot-ear" x="${n(x - 7)}" y="${n(y + 2)}" width="9" height="${n(eh - 4)}" rx="2"/><rect class="robot-ear" x="${n(x + w - 2)}" y="${n(y + 2)}" width="9" height="${n(eh - 4)}" rx="2"/>`;
    case 'rect': return `<rect class="robot-ear" x="${n(x - 7)}" y="${n(y)}" width="10" height="${n(eh)}" rx="5"/><rect class="robot-ear" x="${n(x + w - 3)}" y="${n(y)}" width="10" height="${n(eh)}" rx="5"/>`;
    default: return '';
  }
}

function eyes(kind, eyeY, s, e) {
  const l = 54 - 12.5 * s;
  const r = 54 + 12.5 * s;
  switch (kind) {
    case 'dot': return `<circle cx="${n(l)}" cy="${n(eyeY)}" r="${n(5 * e)}"/><circle cx="${n(r)}" cy="${n(eyeY)}" r="${n(5 * e)}"/>`;
    case 'square': return `<rect x="${n(l - 4.5 * e)}" y="${n(eyeY - 4.5 * e)}" width="${n(9 * e)}" height="${n(9 * e)}" rx="1"/><rect x="${n(r - 4.5 * e)}" y="${n(eyeY - 4.5 * e)}" width="${n(9 * e)}" height="${n(9 * e)}" rx="1"/>`;
    case 'slit': return `<rect x="${n(l - 6 * e)}" y="${n(eyeY - 2.4 * e)}" width="${n(12 * e)}" height="${n(4.8 * e)}" rx="${n(2.4 * e)}"/><rect x="${n(r - 6 * e)}" y="${n(eyeY - 2.4 * e)}" width="${n(12 * e)}" height="${n(4.8 * e)}" rx="${n(2.4 * e)}"/>`;
    case 'visor': return `<rect x="${n(l - 5 * e)}" y="${n(eyeY - 3 * e)}" width="${n(r - l + 10 * e)}" height="${n(6 * e)}" rx="${n(3 * e)}"/>`;
    case 'happy': return `<path class="robot-eye-arc" d="M${n(l - 5 * e)} ${n(eyeY + 2.5 * e)}q${n(5 * e)} ${n(-8 * e)} ${n(10 * e)} 0M${n(r - 5 * e)} ${n(eyeY + 2.5 * e)}q${n(5 * e)} ${n(-8 * e)} ${n(10 * e)} 0" stroke-width="${n(3.4 * e)}"/>`;
    default: return `<rect x="${n(l - 3.5 * e)}" y="${n(eyeY - 5.5 * e)}" width="${n(7 * e)}" height="${n(11 * e)}" rx="${n(3.5 * e)}"/><rect x="${n(r - 3.5 * e)}" y="${n(eyeY - 5.5 * e)}" width="${n(7 * e)}" height="${n(11 * e)}" rx="${n(3.5 * e)}"/>`;
  }
}

// Pixelová ústa (Pixel): úsměv ze čtyř čtverečků – krajní o pixel výš.
function mouth(kind, g) {
  if (kind !== 'pixel') return '';
  const d = 3.4 * g.es;
  const y = g.eyeY + 8 * g.es;
  return `<g class="robot-mouth">${[[-2, 0], [-1, 1], [0, 1], [1, 0]].map(([k, dy]) => `<rect x="${n(54 + k * d)}" y="${n(y + dy * d)}" width="${n(d)}" height="${n(d)}"/>`).join('')}</g>`;
}

function legs(kind, t) {
  const bottom = t.top + t.h;
  const lx = 54 - t.w / 2 + Math.min(8, t.w / 4);
  const rx = 54 + t.w / 2 - Math.min(8, t.w / 4);
  switch (kind) {
    case 'treads': return `<rect class="robot-tread" x="${n(54 - t.w / 2 - 6)}" y="${n(bottom + 1)}" width="${n(t.w + 12)}" height="11" rx="5.5"/><circle class="robot-wheel" cx="${n(54 - t.w / 2)}" cy="${n(bottom + 6.5)}" r="2.6"/><circle class="robot-wheel" cx="54" cy="${n(bottom + 6.5)}" r="2.6"/><circle class="robot-wheel" cx="${n(54 + t.w / 2)}" cy="${n(bottom + 6.5)}" r="2.6"/>`;
    case 'blocks': return `<rect class="robot-foot" x="${n(lx - 5)}" y="${n(bottom - 1)}" width="10" height="${n(99 - bottom)}" rx="2"/><rect class="robot-foot" x="${n(rx - 5)}" y="${n(bottom - 1)}" width="10" height="${n(99 - bottom)}" rx="2"/>`;
    case 'stout': return `<path class="robot-limbs robot-limbs--stout" d="M${n(lx)} ${n(bottom - 2)}v${n(98 - bottom)}m${n(rx - lx)} -${n(98 - bottom)}v${n(98 - bottom)}"/>`;
    case 'nubs': return `<ellipse class="robot-foot" cx="${n(lx + 2)}" cy="${n(bottom + 3)}" rx="6" ry="4"/><ellipse class="robot-foot" cx="${n(rx - 2)}" cy="${n(bottom + 3)}" rx="6" ry="4"/>`;
    default: return `<path class="robot-limbs" d="M${n(lx)} ${n(bottom - 5)}v${n(103 - bottom)}m${n(rx - lx)} -${n(103 - bottom)}v${n(103 - bottom)}"/>`;
  }
}

export function robot(type = 'Scout') {
  const kind = POSTAVY[type] ? type : 'Scout';
  const g = geometry(kind);
  const { head: h, torso: t, s } = g;
  const shoulderY = t.top + 6;
  const lx = t.x - 5;
  const rxx = t.x + t.w + 5;
  const arm = g.legs === 'nubs' ? 5 : 9;
  const f = g.face;
  const ground = g.legs === 'treads' ? t.top + t.h + 12 : g.legs === 'nubs' ? t.top + t.h + 7 : 99;
  const shadow = Math.max(18, Math.min(30, Math.max(t.w, h.w * 0.55) / 1.7));
  const cheeks = g.cheeks ? `<ellipse class="robot-cheek" cx="${n(54 - 20 * s)}" cy="${n(g.eyeY + 8 * g.es)}" rx="${n(4 * s)}" ry="${n(2.4 * s)}"/><ellipse class="robot-cheek" cx="${n(54 + 20 * s)}" cy="${n(g.eyeY + 8 * g.es)}" rx="${n(4 * s)}" ry="${n(2.4 * s)}"/>` : '';
  return `<svg class="robot robot--${kind.toLowerCase()}" data-robot-type="${kind}" viewBox="0 0 108 112" aria-hidden="true">`
    + `<ellipse class="robot-shadow" cx="54" cy="${n(Math.max(104, ground + 4))}" rx="${n(shadow)}" ry="4"/>`
    + `<g class="robot-body">${legs(g.legs, t)}`
    + `<path class="robot-limbs robot-arm-left" style="transform-origin:${n(lx)}px ${n(shoulderY)}px" d="M${n(lx)} ${n(shoulderY)}l-${n(arm * 0.78)} ${arm}"/>`
    + `<path class="robot-limbs robot-arm-right" style="transform-origin:${n(rxx)}px ${n(shoulderY)}px" d="M${n(rxx)} ${n(shoulderY)}l${n(arm * 0.78)} ${arm}"/>`
    + `<rect class="robot-torso" x="${n(t.x)}" y="${n(t.top)}" width="${n(t.w)}" height="${n(t.h)}" rx="${n(t.r)}"/>`
    + (g.core === 'star' ? `<g class="robot-core">${hvezda(54, t.top + t.h / 2 - 1, 4.4)}</g>` : `<circle class="robot-core" cx="54" cy="${n(t.top + t.h / 2 - 1)}" r="3"/>`)
    + `<g class="robot-head" style="transform-origin:54px ${n(h.top + h.h - 8)}px"><g class="robot-aerial" style="transform-origin:54px ${n(h.top)}px">${aerial(g.aerial, h.top, s)}</g>`
    + ears(g.ears, h, s)
    + `<rect class="robot-shell" x="${n(h.x)}" y="${n(h.top)}" width="${n(h.w)}" height="${n(h.h)}" rx="${n(h.r)}"/>`
    + `<rect class="robot-face" x="${n(f.x)}" y="${n(f.top)}" width="${n(f.w)}" height="${n(f.h)}" rx="${n(f.r)}"/>`
    + cheeks
    + `<g class="robot-gaze"><g class="robot-eyes" style="transform-origin:54px ${n(g.eyeY)}px">${eyes(g.eyes, g.eyeY, s, g.es)}</g>${mouth(g.mouth, g)}</g></g></g></svg>`;
}
