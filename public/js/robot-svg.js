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
  // Oči přesně uprostřed obličeje (vyrovnáno ve Figmě 18. 10. 2026).
  const eyeY = face.top + face.h / 2;
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
    // Nova: jedna jemná anténa se svítící hvězdičkou v kulaté záři (dřív dvě rozbíhavé – působily jako rohy).
    case 'stars': return `<path d="M54 ${a}V${a - 7}"/><circle class="robot-aerial-zare" cx="54" cy="${a - 12}" r="6.2"/>${hvezda(54, a - 12, 4.6)}`;
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
  // Noha jako zaoblená kapsle (vyplněná, ne čára) a pod ní tmavší bota vytočená mírně ven – robot
  // stojí jako hračka, ne na drátcích. Bota leží středem na zemi (ZEME), takže robot nelevituje
  // a šatník (robot-wardrobe.js#chodidla) mu na stejné místo nasadí vlastní obuv.
  const noha = (x, sirka, ven) => {
    const top = bottom - 3;
    const spodek = ZEME - 1.5;
    return `<rect class="robot-leg" x="${n(x - sirka / 2)}" y="${n(top)}" width="${n(sirka)}" height="${n(spodek - top)}" rx="${n(sirka / 2)}"/>`
      + `<ellipse class="robot-shoe" cx="${n(x + ven)}" cy="${n(ZEME - 1)}" rx="${n(sirka / 2 + 3.2)}" ry="2.9"/>`;
  };
  switch (kind) {
    // Pás leží na zemi (spodní hrana na středu stínu), s trupem ho spojují dvě krátké vzpěry.
    case 'treads': {
      const ty = ZEME + 1.5 - 11;
      return `<path class="robot-limbs" d="M${n(lx)} ${n(bottom - 3)}V${n(ty + 2)}M${n(rx)} ${n(bottom - 3)}V${n(ty + 2)}"/><rect class="robot-tread" x="${n(54 - t.w / 2 - 6)}" y="${n(ty)}" width="${n(t.w + 12)}" height="11" rx="5.5"/><circle class="robot-wheel" cx="${n(54 - t.w / 2)}" cy="${n(ty + 5.5)}" r="2.6"/><circle class="robot-wheel" cx="54" cy="${n(ty + 5.5)}" r="2.6"/><circle class="robot-wheel" cx="${n(54 + t.w / 2)}" cy="${n(ty + 5.5)}" r="2.6"/>`;
    }
    // Pixel: hranaté kvádříky s tmavší podrážkou.
    case 'blocks': return [lx, rx].map((x) => `<rect class="robot-foot" x="${n(x - 5)}" y="${n(bottom - 1)}" width="10" height="${n(ZEME + 1 - bottom)}" rx="2.4"/><rect class="robot-sole" x="${n(x - 5.6)}" y="${n(ZEME - 2.6)}" width="11.2" height="3.6" rx="1.4"/>`).join('');
    case 'stout': return noha(lx, 7.5, -0.8) + noha(rx, 7.5, 0.8);
    // Mochi: krátké baculaté nožky – širší kapsle a kulatá bota, žádné beztvaré ovály.
    case 'nubs': return noha(lx + 2, 7.5, -0.6) + noha(rx - 2, 7.5, 0.6);
    case 'long': return noha(lx, 4.6, -1) + noha(rx, 4.6, 1);
    default: return noha(lx, 5, -1) + noha(rx, 5, 1);
  }
}

// Paže vyrůstají z trupu (začátek schovaný pod jeho hranou, žádná mezera) a míří šikmo do stran.
// Tvar podle Figmy (vlastník, 18. 10. 2026): rameno 2 jednotky uvnitř trupu, 5 pod jeho horní
// hranou, vektor paže 14 × 10. Šatník z toho bere konce paží (rukavice, tlapky).
export function paze(g) {
  const t = g.torso;
  const k = g.legs === 'nubs' ? 5 / 9 : 1;
  const dx = 14 * k;
  const dy = 10 * k;
  const y = t.top + 5;
  return { levo: [t.x + 2, y, t.x + 2 - dx, y + dy], pravo: [t.x + t.w - 2, y, t.x + t.w - 2 + dx, y + dy] };
}

// Země: chodidla končí na 102,5, kde leží střed stínu – robot stojí, nevznáší se.
const ZEME = 102.5;

// Dílna (robot při práci, otočený zády – refinement.css): pracovní stůl v pase před robotem,
// obrobek, který se od kovadliny prodlužuje doleva, jak práce běží, a nástroj v pravé ruce –
// kladivo, nebo pilka. Stůl a obrobek se kreslí za tělem (robot stojí mezi námi a stolem);
// paže s nástrojem, jiskry a piliny nad ním, aby byl nápřah přes rameno vidět i u širokých hlav.
// Všechno se počítá z geometrie postavy (rameno, trup), takže sedí u všech devíti robotů.
function dilnaMira(g) {
  const t = g.torso;
  const sx = t.x + t.w - 2;
  const sy = t.top + 5;
  const vrch = t.top + t.h * 0.5 - 2;
  const hx = sx + 6;
  const hy = vrch - 6;
  const kx = hx + 10;
  return { t, sx, sy, lx: t.x + 2, vrch, stul: vrch + 4.5, hx, hy, kx };
}
function dilna(g) {
  const { vrch, stul, kx } = dilnaMira(g);
  const konec = kx + 4;
  return `<g class="robot-dilna">`
    + `<path class="dilna-nohy" d="M10 ${n(stul + 3)}V${ZEME}M98 ${n(stul + 3)}V${ZEME}"/>`
    + `<rect class="dilna-stul" x="4" y="${n(stul)}" width="100" height="3.5" rx="1.75"/>`
    + `<g class="obrobek" style="transform-origin:${n(konec)}px ${n(vrch + 2.25)}px"><rect class="obrobek-telo" x="${n(konec - 84)}" y="${n(vrch)}" width="84" height="4.5" rx="2.25"/><rect class="obrobek-lesk" x="${n(konec - 81)}" y="${n(vrch + 0.7)}" width="78" height="1.1" rx=".55"/></g>`
    + `<ellipse class="zar" cx="${n(kx)}" cy="${n(vrch + 1.6)}" rx="4.4" ry="1.8"/>`
    + `</g>`;
}
function praceNad(g) {
  const { sx, sy, lx, vrch, hx, hy, kx } = dilnaMira(g);
  const jiskry = [[-160, 3, 8.5], [-125, 3.5, 10], [-90, 4, 11.5], [-55, 3.5, 10], [-20, 3, 8.5]]
    .map(([u, r1, r2]) => {
      const c = Math.cos(u * Math.PI / 180);
      const z = Math.sin(u * Math.PI / 180);
      return `M${n(kx + c * r1)} ${n(vrch + z * r1)}L${n(kx + c * r2)} ${n(vrch + z * r2)}`;
    }).join('');
  const px = sx + 4;
  const py = vrch - 9.5;
  return `<g class="robot-prace">`
    + `<path class="robot-limbs prace-leva" style="transform-origin:${n(lx)}px ${n(sy)}px" d="M${n(lx)} ${n(sy)}L${n(lx - 7)} ${n(vrch - 1)}"/>`
    + `<g class="prace-kladivo" style="transform-origin:${n(sx)}px ${n(sy)}px"><path class="robot-limbs" d="M${n(sx)} ${n(sy)}L${n(hx)} ${n(hy)}"/>`
    + `<path class="nastroj-rukojet" d="M${n(hx)} ${n(hy)}L${n(kx)} ${n(hy)}"/><rect class="nastroj-kov" x="${n(kx - 3.4)}" y="${n(vrch - 12)}" width="6.8" height="12" rx="1.8"/></g>`
    + `<g class="prace-pila"><path class="robot-limbs" d="M${n(sx)} ${n(sy)}L${n(px)} ${n(py)}"/>`
    + `<path class="nastroj-kov" d="M${n(px)} ${n(py - 2.5)}L${n(px + 20)} ${n(py + 6.5)}L${n(px + 20)} ${n(py + 10)}L${n(px)} ${n(py + 2.5)}Z"/>`
    + `<path class="pila-zuby" d="M${n(px + 3)} ${n(py + 3.8)}l2.2 1.8 1-1.3 2.2 1.8 1-1.3 2.2 1.8 1-1.3 2.2 1.8 1-1.3 2.2 1.8"/>`
    + `<rect class="nastroj-rukojet-pila" x="${n(px - 3.5)}" y="${n(py - 3)}" width="6.5" height="7" rx="2.2"/></g>`
    + `<g class="jiskry" style="transform-origin:${n(kx)}px ${n(vrch)}px"><path d="${jiskry}"/>${[[-8, -9], [9, -7], [3, -13]].map(([dx, dy], i) => `<circle style="--dx:${dx}px;--dy:${dy}px;--i:${i}" cx="${n(kx)}" cy="${n(vrch - 1)}" r="${i === 2 ? 1.1 : 0.9}"/>`).join('')}</g>`
    + `<g class="piliny">${[0, 1, 2].map((i) => `<circle style="--i:${i}" cx="${n(px + 16 + i * 1.6)}" cy="${n(vrch + 5)}" r="${i === 1 ? 1.3 : 1}"/>`).join('')}</g>`
    + `</g>`;
}

// Flákání (čeká na zadání): míček, jojo, hvízdání, hrnek kafe, kniha, bublina ze žvýkačky,
// mobil, nebo protahování. Kreslí se nad tělem; které hraní robot má, říká data-hra u agenta
// (část čekajících si nehraje vůbec – home-studio.js).
function zabava(g, druh = true) {
  const { levo: [lsx, lsy], pravo: [sx, sy, rx, ry] } = paze(g);
  const h = g.head;
  const t = g.torso;
  const nx = 54 + h.w / 2 - 2;
  const ny = h.top + h.h * 0.45;
  const nota = (x, y, i) => `<g class="hra-nota" style="--i:${i};transform-origin:${n(x)}px ${n(y)}px"><path d="M${n(x + 1.6)} ${n(y)}V${n(y - 6.5)}l3.4 1.4"/><ellipse cx="${n(x)}" cy="${n(y)}" rx="2" ry="1.5"/></g>`;
  const ma = (d) => druh === true || druh === d;
  // Ruka otočená před hruď (mobil, o 115°): kde pak je její konec – tam je telefon.
  const u = 115 * Math.PI / 180;
  const [vx, vy] = [rx - sx, ry - sy];
  const mx = sx + vx * Math.cos(u) - vy * Math.sin(u);
  const my = sy + vx * Math.sin(u) + vy * Math.cos(u);
  const ky = t.top + 4;
  const pusa = g.eyeY + 8 * g.es;
  return `<g class="robot-hra">`
    + (ma('micek') ? `<circle class="hra-micek" cx="${n(rx + 1)}" cy="${n(ry - 3.2)}" r="3.2"/>` : '')
    + (ma('jojo') ? `<g class="hra-jojo"><path class="hra-provazek" style="transform-origin:${n(rx)}px ${n(ry)}px" d="M${n(rx)} ${n(ry)}V${n(ry + 23)}"/><g class="hra-kotouc"><circle cx="${n(rx)}" cy="${n(ry + 23)}" r="4.4"/><circle class="hra-kotouc-stred" cx="${n(rx)}" cy="${n(ry + 23)}" r="1.4"/></g></g>` : '')
    + (ma('pisen') ? `<g class="hra-noty">${nota(nx, ny, 0)}${nota(nx + 4, ny - 3, 1)}</g>` : '')
    + (ma('kava') ? `<g class="hra-kava" style="transform-origin:${n(sx)}px ${n(sy)}px"><path class="hra-ucho-hrnku" d="M${n(rx + 4.6)} ${n(ry - 4.6)}h1.4a3 3 0 0 1 0 6h-1.4"/><rect class="hra-hrnek" x="${n(rx - 4.6)}" y="${n(ry - 7.4)}" width="9.2" height="10.8" rx="2.2"/>`
      + [0, 1].map((i) => `<path class="hra-para" style="--i:${i}" d="M${n(rx - 1.8 + i * 3.6)} ${n(ry - 9.4)}q-1.6 -2.2 0 -4.4t0 -4.4"/>`).join('') + `</g>` : '')
    + (ma('kniha') ? `<g class="hra-kniha"><path class="hra-desky" d="M${n(54 - 14)} ${n(ky)}L54 ${n(ky + 2)}L${n(54 + 14)} ${n(ky)}V${n(ky + 13)}L54 ${n(ky + 15)}L${n(54 - 14)} ${n(ky + 13)}Z"/>`
      + `<path class="hra-strana" d="M${n(54 - 12.5)} ${n(ky + 0.6)}L54 ${n(ky + 2.4)}V${n(ky + 13.6)}L${n(54 - 12.5)} ${n(ky + 11.8)}Z"/><path class="hra-strana" d="M${n(54 + 12.5)} ${n(ky + 0.6)}L54 ${n(ky + 2.4)}V${n(ky + 13.6)}L${n(54 + 12.5)} ${n(ky + 11.8)}Z"/>`
      + `<path class="hra-strana hra-list" style="transform-origin:54px ${n(ky + 8)}px" d="M${n(54 + 12.5)} ${n(ky + 0.6)}L54 ${n(ky + 2.4)}V${n(ky + 13.6)}L${n(54 + 12.5)} ${n(ky + 11.8)}Z"/>`
      + `<path class="hra-radky" d="M${n(54 - 10)} ${n(ky + 4.5)}l7 1.2M${n(54 - 10)} ${n(ky + 7.5)}l7 1.2M${n(54 + 3)} ${n(ky + 5.7)}l7 -1.2M${n(54 + 3)} ${n(ky + 8.7)}l7 -1.2"/>`
      // Ruce, které knihu drží: od ramen k dolním rohům desek, kreslené přes knihu – robot
      // nevypadá, že ruce nemá (vlastník 24. 10. 2026). Běžné paže se při čtení schovají.
      + `<path class="robot-limbs hra-ruce" d="M${n(lsx)} ${n(lsy)}Q${n(lsx - 3)} ${n(ky + 15)} ${n(54 - 13)} ${n(ky + 11)}M${n(sx)} ${n(sy)}Q${n(sx + 3)} ${n(ky + 15)} ${n(54 + 13)} ${n(ky + 11)}"/></g>` : '')
    + (ma('bublina') ? `<circle class="hra-bublina" style="transform-origin:${n(56)}px ${n(pusa + 1)}px" cx="${n(59.5)}" cy="${n(pusa + 1)}" r="6"/>` : '')
    + (ma('mobil') ? `<g class="hra-mobil"><rect class="hra-mobil-telo" x="${n(mx - 4.5)}" y="${n(my - 10)}" width="9" height="14" rx="2.2"/><rect class="hra-mobil-displej" x="${n(mx - 3.2)}" y="${n(my - 8.6)}" width="6.4" height="10.8" rx="1"/></g>` : '')
    + `</g>`;
}

// Volá tě (potřebuje tvé rozhodnutí): špička antény svítí a pulzuje a odchází z ní vlnky signálu.
const SPICKA = { ball: [54, -13], square: [54, -12], bolt: [54, -12], planet: [54, -12], stars: [54, -12], tuft: [57, -6], sprig: [58, -10], ring: [54, -12], periscope: [49, -11.5], leaf: [57, -15] };
function signal(g) {
  const [x, dy] = SPICKA[g.aerial] || SPICKA.ball;
  const y = g.head.top + dy;
  return `<g class="robot-signal" style="transform-origin:${n(x)}px ${n(y)}px">`
    + [0, 1, 2].map((i) => `<circle class="signal-vlna" style="--i:${i};transform-origin:${n(x)}px ${n(y)}px" cx="${n(x)}" cy="${n(y)}" r="4.5"/>`).join('')
    + `<circle class="signal-zare" style="transform-origin:${n(x)}px ${n(y)}px" cx="${n(x)}" cy="${n(y)}" r="7"/>`
    + `</g>`;
}

// Objem (rozhodnutí vlastníka 23. 10. 2026: „víc 3D, ne samolepka, ne čtyři ploché stěny“). Hlava
// i trup jsou zaoblená tělesa s eliptickým průřezem (hloubka = podíl šířky). Při otočce se obrys
// plynule mění z šířky na hloubku (refinement.css, rz-otocka-*) a všechno, co na těle leží – obličej,
// oči, jádro, záda – po povrchu přejede, zkrátí se a za okrajem zmizí, přesně podle průmětu bodu na
// elipse. Bližší ucho přejde přes hlavu, vzdálenější za ni zajde. Žádné přilepené boční plochy.
const HLOUBKA_HLAVY = 0.62;
const HLOUBKA_TRUPU = 0.7;
// Posun prvku z čela tělesa při natočení o θ je (hloubka/2)·cos α·sin θ, kde sin α = šířka prvku /
// šířka tělesa (prvek je na elipse, ne na plochém čele). Vrací (hloubka/2)·cos α v jednotkách SVG.
const posunPovrchu = (sirkaTelesa, sirkaPrvku, hloubka) => (sirkaTelesa * hloubka / 2) * Math.sqrt(Math.max(0, 1 - (sirkaPrvku / sirkaTelesa) ** 2));

// Zadní strana robota: místo obličeje kryt s větráním a dvěma šrouby, na trupu servisní panel.
function zada(g) {
  const f = g.face;
  const s = g.s;
  const w = 10 * s;
  // Větrání i šrouby jsou jedna cesta (šroub jako dva oblouky) – zezadu stejný vzhled, méně uzlů.
  const sroub = (x, y, r) => `M${n(x - r)} ${n(y)}a${r} ${r} 0 1 0 ${n(2 * r)} 0a${r} ${r} 0 1 0 ${n(-2 * r)} 0`;
  const vent = [-4, 0, 4].map((d) => `M${n(54 - w)} ${n(g.eyeY + d * g.es)}H${n(54 + w)}`).join('');
  return `<g class="robot-zada"><rect class="zada-deska" x="${n(f.x)}" y="${n(f.top)}" width="${n(f.w)}" height="${n(f.h)}" rx="${n(f.r)}"/>`
    + `<path class="zada-vetrani" d="${vent}"/>`
    + `<path class="zada-sroub" d="${sroub(f.x + 4 * s, f.top + 4 * s, 1.5)}${sroub(f.x + f.w - 4 * s, f.top + 4 * s, 1.5)}"/></g>`;
}
function zadaTrup(t) {
  const w = t.w * 0.5;
  const h = t.h * 0.42;
  const y = t.top + t.h * 0.3;
  const sroub = (x) => `M${n(x - 1.1)} ${n(y + h / 2)}a1.1 1.1 0 1 0 2.2 0a1.1 1.1 0 1 0 -2.2 0`;
  return `<g class="robot-zada"><rect class="zada-panel" x="${n(54 - w / 2)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="2.5"/>`
    + `<path class="zada-sroub" d="${sroub(54 - w / 2 + 3)}${sroub(54 + w / 2 - 3)}"/></g>`;
}

// `kusy` omezí, co se kreslí navíc podle stavu agenta: dílna (práce), hraní (čeká) a signál (volá tě).
// Bez nich je robot o polovinu menší – na seznamu se stovkou agentů to drží přepnutí obrazovky pod 50 ms.
export function robot(type = 'Scout', kusy = { prace: true, hra: true, signal: true }) {
  const kind = POSTAVY[type] ? type : 'Scout';
  const g = geometry(kind);
  const { head: h, torso: t, s } = g;
  const { levo: [lx, shoulderY, lex, ley], pravo: [rxx, , rex, rey] } = paze(g);
  const f = g.face;
  // Uši zvlášť: levé (bližší při otočce zády) přejde přes hlavu, pravé zajde za ni.
  const usi = ears(g.ears, h, s).split('/>').filter(Boolean).map((u) => `${u}/>`);
  const shadow = Math.max(18, Math.min(30, Math.max(t.w, h.w * 0.55) / 1.7));
  const cheeks = g.cheeks ? `<ellipse class="robot-cheek" cx="${n(54 - 20 * s)}" cy="${n(g.eyeY + 8 * g.es)}" rx="${n(4 * s)}" ry="${n(2.4 * s)}"/><ellipse class="robot-cheek" cx="${n(54 + 20 * s)}" cy="${n(g.eyeY + 8 * g.es)}" rx="${n(4 * s)}" ry="${n(2.4 * s)}"/>` : '';
  return `<svg class="robot robot--${kind.toLowerCase()}" data-robot-type="${kind}" viewBox="0 0 108 112" aria-hidden="true">`
    + `<ellipse class="robot-shadow" cx="54" cy="${n(ZEME + 1.5)}" rx="${n(shadow)}" ry="4"/>`
    + (kusy.prace ? dilna(g) : '')
    + `<g class="robot-body">${legs(g.legs, t)}`
    + `<path class="robot-limbs robot-arm-left" style="--tw:${n(t.w)}px;transform-origin:${n(lx)}px ${n(shoulderY)}px" d="M${n(lx)} ${n(shoulderY)}L${n(lex)} ${n(ley)}"/>`
    + `<path class="robot-limbs robot-arm-right" style="--tw:${n(t.w)}px;transform-origin:${n(rxx)}px ${n(shoulderY)}px" d="M${n(rxx)} ${n(shoulderY)}L${n(rex)} ${n(rey)}"/>`
    + `<g class="robot-trup-telo"><rect class="robot-torso" x="${n(t.x)}" y="${n(t.top)}" width="${n(t.w)}" height="${n(t.h)}" rx="${n(t.r)}"/>`
    + `<rect class="robot-objem" x="${n(t.x)}" y="${n(t.top)}" width="${n(t.w)}" height="${n(t.h)}" rx="${n(t.r)}"/></g>`
    + `<g class="robot-predek-trupu" style="--fd:${n(posunPovrchu(t.w, 6, HLOUBKA_TRUPU))}px">`
    + (g.core === 'star' ? `<g class="robot-core">${hvezda(54, t.top + t.h / 2 - 1, 4.4)}</g>` : `<circle class="robot-core" cx="54" cy="${n(t.top + t.h / 2 - 1)}" r="3"/>`)
    + '</g>'
    + `<g class="robot-zada-trupu" style="--fd:${n(posunPovrchu(t.w, t.w * 0.5, HLOUBKA_TRUPU))}px">${zadaTrup(t)}</g>`
    + `<g class="robot-head" style="transform-origin:54px ${n(h.top + h.h - 8)}px"><g class="robot-aerial" style="transform-origin:54px ${n(h.top)}px">${aerial(g.aerial, h.top, s)}</g>`
    + `<g class="robot-ucho-zadni" style="--hw:${n(h.w)}px">${usi[1] || ''}</g><g class="robot-ucho-predni" style="--hw:${n(h.w)}px">${usi[0] || ''}</g>`
    + `<g class="robot-hlava-telo"><rect class="robot-shell" x="${n(h.x)}" y="${n(h.top)}" width="${n(h.w)}" height="${n(h.h)}" rx="${n(h.r)}"/>`
    + `<rect class="robot-objem" x="${n(h.x)}" y="${n(h.top)}" width="${n(h.w)}" height="${n(h.h)}" rx="${n(h.r)}"/></g>`
    + `<g class="robot-ucho-pres" style="--hw:${n(h.w)}px">${usi[0] || ''}</g>`
    + `<g class="robot-celo" style="--fd:${n(posunPovrchu(h.w, f.w, HLOUBKA_HLAVY))}px">`
    + `<rect class="robot-face" x="${n(f.x)}" y="${n(f.top)}" width="${n(f.w)}" height="${n(f.h)}" rx="${n(f.r)}"/>`
    + cheeks
    + `<g class="robot-gaze"><g class="robot-eyes" style="transform-origin:54px ${n(g.eyeY)}px">${eyes(g.eyes, g.eyeY, s, g.es)}</g>${mouth(g.mouth, g)}</g></g>`
    + `<g class="robot-zada-hlavy" style="--fd:${n(posunPovrchu(h.w, f.w, HLOUBKA_HLAVY))}px">${zada(g)}</g></g></g>`
    + (kusy.prace ? praceNad(g) : '') + (kusy.hra ? zabava(g, kusy.hra) : '') + (kusy.signal ? signal(g) : '') + '</svg>';
}
