// Šatník robota Agenteeq: čepice, doplňky na obličej, oblečení a převleky na celé tělo. Všechno
// jsou vektory ve stejném viewBoxu 108×112 jako robot (robot-svg.js), nic robota nepřeškálovává ani
// nemění. Jen vzhled – žádná položka nic neříká o oprávněních agenta.
//
// Kombinace: čepice, obličej a (oblečení NEBO převlek) jsou nezávislé. Převlek je oblečení na celé
// tělo, takže se vylučuje jen s oblečením; čepici i doplněk na obličej na sobě mít může. Vlastní
// pokrývku hlavy převleku (čarodějův klobouk, kuchařská čepice, kukla…) vyměnila čepice, kterou si
// uživatel vybere.
//
// Vrstvy: `back` za tělem (plášť, ocas), `mid` mezi trupem a hlavou (oblečení), `hood` pokrývka
// hlavy převleku, `face` obličejová část převleku (vousy, maska), `head` uvnitř skupiny hlavy
// (klobouky, brýle – hýbou se s ní), `body` přes tělo i hlavu (šála, motýlek) a `top` úplně nahoře
// (přilba kosmonauta).
//
// Barvy jdou přes třídy (workbench.css): rf-* výplň, rk-* čára, ro* obrys, rh světlo, rs stín. Díky
// tomu se věrně přebarví podle --persona a fungují ve světlém i tmavém režimu.
import { robot, fit, geometry } from './robot-svg.js';
import { tr } from './i18n.js';

const c = (v) => Math.round(v * 100) / 100;

/* ---------- Tvary podle postavy ----------
   Co má sedět přesně na hlavě nebo na trupu (kukla, přilba, dres, opasek), se nekreslí pro Scouta
   a nepřeškálovává: kreslí se z geometrie dané postavy (robot-svg.js#geometry), takže kulatá hlava
   Orbita, hranatý Pixel, nízký Rover i široká Mochi dostanou vlastní obrys. Vrstva šatníku může být
   proto i funkce (g, nasad) → SVG v souřadnicích robota; `nasad(cast, svg)` do ní vloží ozdobu
   nakreslenou pro Scouta a přenesenou kotvou z fit(). */
const rozsir = (o, d = 0) => ({ x: o.x - d, top: o.top - d, w: o.w + 2 * d, h: o.h + 2 * d, r: Math.min(o.r + d, (o.w + 2 * d) / 2, (o.h + 2 * d) / 2) });
// Poloviční šířka zaobleného obdélníku (hlavy, trupu) ve výšce y.
function pulSirka(o, y) {
  const dy = y < o.top + o.r ? o.top + o.r - y : y > o.top + o.h - o.r ? y - (o.top + o.h - o.r) : 0;
  return o.w / 2 - o.r + Math.sqrt(Math.max(0, o.r * o.r - dy * dy));
}
// Horní okraj hlavy ve vzdálenosti dx od středu: kam dosednou žabí oči.
const temeno = (o, dx) => {
  const k = Math.abs(dx) - (o.w / 2 - o.r);
  return o.top + (k > 0 ? o.r - Math.sqrt(Math.max(0, o.r * o.r - k * k)) : 0);
};
const obrys = (o) => `M${c(o.x + o.r)} ${c(o.top)}H${c(o.x + o.w - o.r)}A${c(o.r)} ${c(o.r)} 0 0 1 ${c(o.x + o.w)} ${c(o.top + o.r)}`
  + `V${c(o.top + o.h - o.r)}A${c(o.r)} ${c(o.r)} 0 0 1 ${c(o.x + o.w - o.r)} ${c(o.top + o.h)}H${c(o.x + o.r)}`
  + `A${c(o.r)} ${c(o.r)} 0 0 1 ${c(o.x)} ${c(o.top + o.h - o.r)}V${c(o.top + o.r)}A${c(o.r)} ${c(o.r)} 0 0 1 ${c(o.x + o.r)} ${c(o.top)}Z`;
// Vodorovný pruh tvaru mezi y1 a y2 (čelenka, šátek, opasek, pruhy): okraje kopírují zaoblení.
function pas(o, y1, y2, cls) {
  const a = Math.max(y1, o.top);
  const b = Math.min(y2, o.top + o.h);
  const levy = [];
  const pravy = [];
  for (let i = 0; i <= 16; i++) {
    const y = a + (b - a) * i / 16;
    const hw = pulSirka(o, y);
    levy.push(`${c(54 - hw)} ${c(y)}`);
    pravy.unshift(`${c(54 + hw)} ${c(y)}`);
  }
  return `<path class="${cls}" d="M${[...levy, ...pravy].join('L')}Z"/>`;
}
// Pruh trupu zadaný podílem výšky (0 = horní hrana, 1 = spodní).
const pasTrupu = (g, f1, f2, cls) => pas(rozsir(g.torso), g.torso.top + f1 * g.torso.h, g.torso.top + f2 * g.torso.h, cls);
const trup = (g, cls) => { const t = g.torso; return `<rect class="${cls}" x="${c(t.x)}" y="${c(t.top)}" width="${c(t.w)}" height="${c(t.h)}" rx="${c(t.r)}"/>`; };
// Ruce a chodidla stejně jako v robot-svg.js#robot (konec paže, místo pro botu).
const ruce = (g) => {
  const t = g.torso;
  const arm = g.legs === 'nubs' ? 5 : 9;
  return [[t.x - 5 - arm * 0.78, t.top + 6 + arm], [t.x + t.w + 5 + arm * 0.78, t.top + 6 + arm]];
};
const chodidla = (g) => {
  const t = g.torso;
  return [54 - t.w / 2 + Math.min(8, t.w / 4), 54 + t.w / 2 - Math.min(8, t.w / 4)];
};
const hvezda5 = (cx, cy, R, r) => Array.from({ length: 10 }, (_, i) => {
  const a = -Math.PI / 2 + i * Math.PI / 5;
  const q = i % 2 ? r : R;
  return `${i ? 'L' : 'M'}${c(cx + q * Math.cos(a))} ${c(cy + q * Math.sin(a))}`;
}).join('') + 'Z';
const kvet = (cx, cy, r, cls) => Array.from({ length: 5 }, (_, i) => {
  const a = -Math.PI / 2 + i * 2 * Math.PI / 5;
  return `<circle class="${cls}" cx="${c(cx + r * 0.52 * Math.cos(a))}" cy="${c(cy + r * 0.52 * Math.sin(a))}" r="${c(r * 0.48)}"/>`;
}).join('') + `<circle class="rf-gold" cx="${c(cx)}" cy="${c(cy)}" r="${c(r * 0.34)}"/>`;
const listek = (cx, cy, rx, ry, uhel, cls = 'rf-leaf') => `<ellipse class="${cls}" cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" transform="rotate(${uhel} ${cx} ${cy})"/>`;

/* ---------- Čepice ---------- */
const KSILTOVKA = {
  head: '<path class="rf-main ro" d="M28 24.5C28 7.5 40 1.5 54 1.5s26 6 26 23Z"/>'
    + '<path class="rs" d="M28 24.5c0-4 1-7 2.500-9.500C42 20.5 66 20.5 77.5 15 79 17.5 80 20.5 80 24.5Z"/>'
    + '<path class="rk-deep" fill="none" stroke-width="1.200" opacity=".55" d="M54 2.5v22M43 5c-3.500 6-5 12-5 19.500m27-19.500c3.500 6 5 12 5 19.500"/>'
    + '<path class="rh" d="M33 16.5c1.500-6.500 7-11 14-12.500-5 3-8.500 7.500-10.500 14Z"/>'
    + '<path class="rf-deep ro" d="M22.5 23.5h63a4.200 4.200 0 0 1 0 7.500H28a5 5 0 0 1-5.500-7.500Z"/>'
    + '<rect class="rh" x="27" y="25.3" width="24" height="1.500" rx=".75"/>'
    + '<circle class="rf-deep ro" cx="54" cy="2" r="2.600"/>',
};
const KULICH = {
  head: '<path class="rf-main ro" d="M28 25.5C28 6.5 39-0.5 54-0.5s26 7 26 26Z"/>'
    + '<path class="rk-deep" fill="none" stroke-width="1.200" opacity=".45" d="M38 4.5c-2 6-3 12-3 21m11-24c-1 8-1 16-1 24m9-25v25m9-24c1 8 1 16 1 24m9-21c2 6 3 12 3 21"/>'
    + '<path class="rh" d="M34 15.5c2-6 6-10 12-12-4 3-7 7-8 12Z"/>'
    + '<rect class="rf-soft ro" x="24" y="20.5" width="60" height="11" rx="5.500"/>'
    + '<path class="rk-main" fill="none" stroke-width="1.200" opacity=".5" d="M32 23v6m8-6v6m8-6v6m8-6v6m8-6v6m8-6v6"/>'
    + '<circle class="rf-soft ro" cx="54" cy="-1" r="5.500"/><circle class="rh" cx="52" cy="-2.7" r="1.600"/><circle class="rs" cx="56" cy="1" r="1.400"/>',
};
const CYLINDR = {
  head: '<path class="rf-ink rol" d="M34 24V4a4 4 0 0 1 4-4h32a4 4 0 0 1 4 4v20Z"/>'
    + '<rect class="rf-main" x="34" y="15.5" width="40" height="7"/>'
    + '<rect class="rh" x="37" y="3" width="3" height="11" rx="1.500"/>'
    + '<rect class="rf-gold rog" x="50" y="14.5" width="8" height="9" rx="1.500"/><rect class="rf-ink" x="52.500" y="17" width="3" height="4"/>'
    + '<ellipse class="rf-ink rol" cx="54" cy="25" rx="33" ry="5.500"/>'
    + '<path class="rh" d="M26 24.5c5-2.500 12-3.500 18-3.500"/>',
};
const KORUNA = {
  head: '<path class="rf-gold rog" d="M30 29 32 9l11 10 11-14 11 14 11-10 2 20Z"/>'
    + '<path class="rh" d="M33 12.500l7 6.500-1.500 7L33.500 26Z"/>'
    + '<rect class="rf-goldd rog" x="30" y="25" width="48" height="5.500" rx="1.800"/>'
    + '<circle class="rf-gold rog" cx="32" cy="8.500" r="2.600"/><circle class="rf-gold rog" cx="54" cy="4.500" r="2.600"/><circle class="rf-gold rog" cx="76" cy="8.500" r="2.600"/>'
    + '<path class="rf-red ro" d="M54 14.500l3.200 3.600L54 24l-3.200-5.900Z"/>'
    + '<circle class="rf-cyan" cx="40.500" cy="27.800" r="1.700"/><circle class="rf-cyan" cx="67.500" cy="27.800" r="1.700"/>',
};
const PARTY = {
  head: '<path class="rf-main ro" d="M39 29 54 3l15 26Z"/>'
    + '<path class="rf-soft" d="M48.200 13.500h11.600l1.800 3H46.400ZM43.600 21h20.800l1.700 3H41.900Z"/>'
    + '<path class="rh" d="M46 22 53 7l-.8 0L43 25Z"/>'
    + '<circle class="rf-gold ro" cx="54" cy="3.800" r="3.600"/>'
    + '<circle class="rf-cyan" cx="34" cy="14" r="1.600"/><circle class="rf-pink" cx="75" cy="11" r="1.600"/><circle class="rf-gold" cx="30" cy="24" r="1.300"/><circle class="rf-cyan" cx="79" cy="22" r="1.300"/>',
};
const CARODEJ_KLOBOUK = '<ellipse class="rf-deep ro" cx="54" cy="25" rx="36" ry="6"/>'
  + '<path class="rf-main ro" d="M37 25C40 15 45 6 55-1c-1 8 2 17 16 26Z"/>'
  + '<path class="rh" d="M42 21c2-6 5-11 9-15-3 6-5 11-6 16Z"/>'
  + '<path class="rf-gold" d="M38.5 22q15.500 4.500 32.500 0l1.200 3.200q-17 5-35.500 0Z"/>'
  + '<path class="rf-gold" d="M53 9.5l1.400 3 3.200.4-2.400 2.200.6 3.200-2.800-1.600-2.800 1.600.6-3.200-2.400-2.200 3.200-.4Z"/>';
const SLUCHATKA = {
  head: '<path class="rk-silverd" fill="none" stroke-width="7.500" stroke-linecap="round" d="M23 44C20 5 88 5 85 44"/>'
    + '<path class="rk-silver" fill="none" stroke-width="5" stroke-linecap="round" d="M23 44C20 5 88 5 85 44"/>'
    + '<path class="rk-white" fill="none" stroke-width="1.400" stroke-linecap="round" opacity=".6" d="M30 24C36 12 52 9 62 11"/>'
    + '<rect class="rf-main ro" x="10" y="36" width="16" height="26" rx="8"/><rect class="rf-main ro" x="82" y="36" width="16" height="26" rx="8"/>'
    + '<rect class="rf-deep" x="19.500" y="41" width="7.500" height="16" rx="3.700"/><rect class="rf-deep" x="81" y="41" width="7.500" height="16" rx="3.700"/>'
    + '<rect class="rh" x="12.500" y="40" width="3" height="10" rx="1.500"/><rect class="rh" x="84.500" y="40" width="3" height="10" rx="1.500"/>',
};
const KUCHAR_KLOBOUK = '<circle class="rf-light" cx="40" cy="14.5" r="9"/><circle class="rf-light" cx="68" cy="14.5" r="9"/><circle class="rf-light" cx="54" cy="9.5" r="10"/>'
  + '<rect class="rf-light" x="32" y="14.5" width="44" height="14" rx="3"/>'
  + '<path class="rk-shade" fill="none" stroke-width="1.300" opacity=".7" stroke-linecap="round" d="M41 19.5v6m13-8v8m13-6v6M36 10.5q4-3 7 0m16-2q4-3 7 0"/>'
  + '<rect class="rf-soft ro" x="32" y="25.5" width="44" height="5.500" rx="2"/>'
  + '<path class="rh" d="M45 4.5q4-2.500 8-1.500"/>';
const KOVBOJ = {
  head: '<path class="rf-brown ro" d="M14 25c3 7 14 7 22 4 6 2.200 30 2.200 36 0 8 3 19 3 22-4-4-1-9-3.500-13-7-1-7-5-15-12-15-3 3-18 3-21 0-8 0-12 8-13 15-4 3.500-9 6-13 7Z"/>'
    + '<path class="rs" d="M14 25c3 7 14 7 22 4 6 2.200 30 2.200 36 0 8 3 19 3 22-4-5 3-14 4-22 2-8 2.500-28 2.500-36 0-8 2-17 1-22-2Z"/>'
    + '<path class="rf-brown2 ro" d="M30 20.5c8 3 40 3 48 0l-.8 5c-9 2.500-38 2.500-46.400 0Z"/>'
    + '<path class="rh" d="M41 7c4-2.500 8-3 11-1.500-4 .5-8 2.500-11 5.500Z"/>'
    + '<path class="rf-gold" d="M54 21l1.300 2.600 2.800.4-2 2 .5 2.800-2.600-1.400-2.600 1.400.5-2.800-2-2 2.800-.4Z"/>',
};
const VRTULKA = {
  head: '<path class="rf-main ro" d="M29 27.5C29 13.5 40 6.5 54 6.5s25 7 25 21Z"/>'
    + '<path class="rf-soft" d="M54 6.5c-5 0-9 1-12 3.500 2 5 3 11 3 17.500h18c0-6.500 1-12.500 3-17.500C63 7.5 59 6.5 54 6.5Z"/>'
    + '<path class="rh" d="M34 20.5c1.500-5 5-9 11-10.500-3 3-5 6.500-6 10.500Z"/>'
    + '<rect class="rf-deep ro" x="52.500" y="0" width="3" height="7" rx="1.200"/>'
    + '<path class="rf-red ro" d="M54 1C47-3 39-2.5 36.5 1c3.500 3.500 11.500 3.500 17.500 0Z"/>'
    + '<path class="rf-cyan ro" d="M54 1C61-3 69-2.5 71.5 1c-3.500 3.500-11.500 3.500-17.500 0Z"/>'
    + '<circle class="rf-gold ro" cx="54" cy="1" r="1.800"/>'
    + '<rect class="rf-deep ro" x="24.500" y="24.5" width="59" height="6.500" rx="3.200"/>',
};
const SANTA = {
  head: '<path class="rf-red ro" d="M29 25.5C29 9.5 41 2.5 55 3c11 .5 19 7 24 17l2 5Z"/>'
    + '<path class="rs" d="M64 5.5c7 3 12 8 15 15l2 5H64Z"/>'
    + '<path class="rh" d="M34 16.5c2-6 6-10 13-12-4 3-8 7-9 12Z"/>'
    + '<rect class="rf-light ro" x="24" y="21.5" width="60" height="9.500" rx="4.700"/>'
    + '<circle class="rf-light ro" cx="82" cy="20.5" r="5.500"/>'
    + '<path class="rk-shade" fill="none" stroke-width="1.200" opacity=".6" stroke-linecap="round" d="M32 25.5h4m6 1h4m8-1h4m8 1h4m8-1h4"/>',
};

// Čepice leží na temeni: lem končí nad obličejem (y ≤ 31 u Scouta, obličej začíná na 32), aby
// nezakrýval oči ani horní hranu obličeje. Hlídá test/satnik-kotvy.test.mjs pro všech devět postav.
const BARET = {
  head: '<path class="rf-main ro" d="M23.500 24C19 18.500 24 11.500 37 9c12-2.200 28-1.800 38.500 1.500C86 14 90.500 20 87.500 25.500c-2.500 4-12 5.500-27 5.500-17 0-34-2-37-7Z"/>'
    + '<path class="rs" d="M87.500 25.500c-2.500 4-12 5.500-27 5.500-17 0-34-2-37-7 6 3.500 21 5 37 5 14.500 0 23.500-1.500 27-3.500Z"/>'
    + '<path class="rh" d="M28.500 16.500c4-4.500 11.500-6.500 20-7-7.500 2-13.500 4.800-17 9Z"/>'
    + '<path class="rf-deep ro" d="M33 25.800c7 2.200 35 2.200 42 0v2.800c-7 2.400-35 2.400-42 0Z"/>'
    + '<path class="rk-deep" fill="none" stroke-width="2.200" stroke-linecap="round" d="M56 9.500q.8-3.500 3.600-4.800"/>',
};
const KLOBOUCEK = {
  head: '<path class="rf-main ro" d="M37 25 39.500 12.500Q40.200 8.500 44.500 8.500h19q4.300 0 5 4L71 25Z"/>'
    + '<path class="rs" d="M63.500 8.500q4.300 0 5 4L71 25h-6.500Z"/>'
    + '<path class="rh" d="M41.500 19.500 43 12.500q.6-2 2.800-2h2.200l-3 9Z"/>'
    + '<path class="rf-deep ro" d="M38.200 19h31.600l.9 4.500H37.300Z"/>'
    + '<path class="rf-main ro" d="M36.500 22.500h35l12.800 5a1.500 1.500 0 0 1-.6 2.900H24.300a1.500 1.500 0 0 1-.6-2.900Z"/>'
    + '<path class="rs" d="M24 28.700h60l.3.3a1.500 1.500 0 0 1-.6 1.400H24.300a1.500 1.500 0 0 1-.6-1.400Z"/>'
    + '<path class="rh" d="M36.500 22.500h9l-14 5.200h-5Z"/>'
    + '<path class="rk-deep" fill="none" stroke-width="1" opacity=".5" stroke-dasharray="1.800 1.800" d="M30 27.400h48M41 14h26"/>',
};
const VENECEK = {
  head: '<path class="rk-leaf" fill="none" stroke-width="2.200" stroke-linecap="round" d="M25 29Q54 15 83 29"/>'
    + listek(35, 25.200, 3.800, 1.700, -30) + listek(47.500, 22.600, 3.600, 1.600, -12) + listek(60.500, 22.600, 3.600, 1.600, 12) + listek(73, 25.200, 3.800, 1.700, 30)
    + listek(36, 28.600, 3, 1.400, 20, 'rf-leafd') + listek(72, 28.600, 3, 1.400, -20, 'rf-leafd')
    + kvet(29.500, 26.400, 4.600, 'rf-pink') + kvet(41.500, 23, 5, 'rf-light') + kvet(54, 21, 5.800, 'rf-main')
    + kvet(66.500, 23, 5, 'rf-light') + kvet(78.500, 26.400, 4.600, 'rf-pink'),
};
const VIKING = {
  head: '<path class="rf-horn ro" d="M30.500 21.500C21.500 22 15 15.500 13.500 4.500c3.500 6 8.500 8.500 16 8.700Z"/>'
    + '<path class="rf-horn ro" d="M77.500 21.500C86.500 22 93 15.500 94.500 4.500c-3.500 6-8.500 8.500-16 8.700Z"/>'
    + '<path class="rk-shade" fill="none" stroke-width="1.100" opacity=".8" stroke-linecap="round" d="M19 14.500l2.500-2.500M23 17.500l2-3M89 14.500 86.500 12M85 17.500l-2-3"/>'
    + '<path class="rf-steel ro" d="M27 29.500C27 13 39 5.500 54 5.500S81 13 81 29.500Z"/>'
    + '<path class="rs" d="M66 7.800C75.500 11.500 81 19 81 29.500H70.500c0-9-1.500-15.500-4.500-21.700Z"/>'
    + '<path class="rh" d="M32 22c1.500-7 6.500-12 14-14-5 3.500-8.500 8-10 14.500Z"/>'
    + '<path class="rf-goldd rog" d="M52.200 5.700h3.600V26h-3.600Z"/>'
    + '<rect class="rf-brown2 rob" x="24.500" y="24.800" width="59" height="6.200" rx="3.100"/>'
    + '<circle class="rf-gold" cx="31" cy="27.900" r="1.200"/><circle class="rf-gold" cx="42" cy="27.900" r="1.200"/><circle class="rf-gold" cx="54" cy="27.900" r="1.200"/><circle class="rf-gold" cx="66" cy="27.900" r="1.200"/><circle class="rf-gold" cx="77" cy="27.900" r="1.200"/>',
};

/* ---------- Doplňky na obličej ---------- */
const BRYLE = {
  head: '<path class="rk-cream" fill="none" stroke-width="1.800" stroke-linecap="round" d="M32 46 25 43.500M76 46l7-2.500"/>'
    + '<circle class="rf-lens" cx="41.500" cy="47.500" r="10"/><circle class="rf-lens" cx="66.500" cy="47.500" r="10"/>'
    + '<circle class="rk-cream" fill="none" stroke-width="2.200" cx="41.500" cy="47.500" r="10"/><circle class="rk-cream" fill="none" stroke-width="2.200" cx="66.500" cy="47.500" r="10"/>'
    + '<path class="rk-cream" fill="none" stroke-width="2" stroke-linecap="round" d="M51.500 45.500q2.500-2.200 5 0"/>'
    + '<path class="rk-white" fill="none" stroke-width="1.600" stroke-linecap="round" opacity=".75" d="M34.500 43.500q2-3.500 6-4.200M59.500 43.500q2-3.500 6-4.200"/>',
};
const SLUNECNI = {
  head: '<path class="rk-soft" fill="none" stroke-width="2" stroke-linecap="round" d="M28 41 24 40M80 41l4-1"/>'
    + '<path class="rf-night rok" d="M29.500 41h23.500v8a9.500 9.500 0 0 1-9.500 9.500H39A9.500 9.500 0 0 1 29.500 49Z"/>'
    + '<path class="rf-night rok" d="M55 41h23.500v8A9.500 9.500 0 0 1 69 58.500h-4.500A9.500 9.500 0 0 1 55 49Z"/>'
    + '<path class="rf-shade-lens" d="M29.500 41h23.500v4.500c-8 3-16 3-23.500 0ZM55 41h23.500v4.500c-8 3-15.500 3-23.500 0Z"/>'
    + '<path class="rf-soft ro" d="M27 38.500h54a2 2 0 0 1 2 2v1.500a2 2 0 0 1-2 2H27a2 2 0 0 1-2-2v-1.500a2 2 0 0 1 2-2Z"/>'
    + '<path class="rk-white" fill="none" stroke-width="1.800" stroke-linecap="round" opacity=".38" d="M34 49l8.500-4.500M34 53.500l5-2.600M59.500 49l8.500-4.500M59.500 53.500l5-2.600"/>'
    + '<path class="rh" d="M28 39h22v1.200H28Z"/>',
};
const VIZOR = {
  head: '<path class="rf-ink rol" d="M20 45h6v8h-6a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2ZM82 45h6a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-6Z"/>'
    + '<path class="rf-visor rok" d="M24 45q0-9 9-9h42q9 0 9 9v6q0 9-9 9H33q-9 0-9-9Z"/>'
    + '<path class="rk-white" fill="none" stroke-width="2" stroke-linecap="round" opacity=".55" d="M31 41h26"/>'
    + '<path class="rk-white" fill="none" stroke-width="1.200" stroke-linecap="round" opacity=".28" d="M34 55h40"/>'
    + '<circle class="rf-cyan ro" cx="79" cy="48" r="1.800"/>',
};
const MONOKL = {
  head: '<path class="rk-gold" fill="none" stroke-width="1.500" stroke-linecap="round" stroke-dasharray="1.600 2.600" d="M71 57.500q8 12 1.500 25"/>'
    + '<circle class="rf-lens" cx="66.500" cy="47.500" r="10.500"/>'
    + '<circle class="rk-goldd" fill="none" stroke-width="3.800" cx="66.500" cy="47.500" r="10.500"/>'
    + '<circle class="rk-gold" fill="none" stroke-width="2.400" cx="66.500" cy="47.500" r="10.500"/>'
    + '<path class="rk-white" fill="none" stroke-width="1.600" stroke-linecap="round" opacity=".75" d="M60 44q2-3.500 6-4.500"/>',
};
const KNIR = {
  head: '<path class="rf-brown2 rob" d="M54 56.500c-2.500-4-8-4.800-12.500-3-4 1.600-5.500 5-3 6.500 3.500 1 8-1 15.500 2.500 7.500-3.500 12-1.500 15.500-2.500 2.500-1.500 1-4.900-3-6.500-4.500-1.800-10-1-12.500 3Z"/>'
    + '<path class="rf-brown rob" d="M38.500 59.500c-4.500 1-7-1-6.500-3.500.4-2 3-2.500 3.800-.8"/>'
    + '<path class="rf-brown rob" d="M69.500 59.500c4.500 1 7-1 6.500-3.500-.4-2-3-2.500-3.800-.8"/>'
    + '<path class="rh" d="M42 55c4-1.600 8-.8 10.500 1.400-4-.8-7.500-.4-10.500-1.400Z"/>',
};
const D3 = {
  head: '<path class="rk-cream" fill="none" stroke-width="2" stroke-linecap="round" d="M26 45 22 43m60 2 4-2"/>'
    + '<rect class="rf-light ro" x="25" y="38" width="58" height="22" rx="4.500"/>'
    + '<rect class="rf-red" x="29.500" y="41.500" width="21" height="15" rx="3.200"/><rect class="rf-cyan" x="57.500" y="41.500" width="21" height="15" rx="3.200"/>'
    + '<path class="rk-white" fill="none" stroke-width="1.600" stroke-linecap="round" opacity=".6" d="M33 45.500l6-2.500M61 45.500l6-2.500"/>',
};
const SRDICKA = {
  head: '<path class="rk-pinkd" fill="none" stroke-width="1.800" stroke-linecap="round" d="M32 45 25 43m51 2 7-2"/>'
    + '<path class="rf-pink rop" d="M41.500 58C30.500 51 28 42.500 34 40.200c3.500-1.200 6.500.8 7.500 3.800 1-3 4-5 7.500-3.800 6 2.300 3.500 10.800-7.500 17.800Z"/>'
    + '<path class="rf-pink rop" d="M66.500 58c-11-7-13.500-15.500-7.500-17.800 3.500-1.200 6.500.8 7.500 3.800 1-3 4-5 7.500-3.800 6 2.300 3.500 10.800-7.500 17.800Z"/>'
    + '<path class="rk-white" fill="none" stroke-width="1.600" stroke-linecap="round" opacity=".7" d="M33.500 45c.2-2 1.300-3.200 3-3.700M58.500 45c.2-2 1.300-3.200 3-3.700"/>',
};
const OBVAZ = {
  head: '<path class="rk-ink" fill="none" stroke-width="2" stroke-linecap="round" d="M26 38.500 42 43m0 0 40-8"/>'
    + '<ellipse class="rf-ink rol" cx="41.500" cy="47.500" rx="9.500" ry="8.500"/>'
    + '<path class="rh" d="M34.500 43.500c2-2.500 5-3.500 8-3.200"/>',
};

const HVEZDY = {
  head: '<path class="rk-gold" fill="none" stroke-width="1.800" stroke-linecap="round" d="M30.500 45 25 43.500M77.500 45l5.500-1.500"/>'
    + `<path class="rf-gold rog" fill-rule="evenodd" d="${hvezda5(41.500, 48.200, 12, 6.200)}${hvezda5(41.500, 48.200, 8.800, 4.500)}"/>`
    + `<path class="rf-gold rog" fill-rule="evenodd" d="${hvezda5(66.500, 48.200, 12, 6.200)}${hvezda5(66.500, 48.200, 8.800, 4.500)}"/>`
    + `<path class="rf-starlens" d="${hvezda5(41.500, 48.200, 8.800, 4.500)}${hvezda5(66.500, 48.200, 8.800, 4.500)}"/>`
    + '<path class="rk-gold" fill="none" stroke-width="2" stroke-linecap="round" d="M51.500 45.800q2.500-2 5 0"/>'
    + '<path class="rk-white" fill="none" stroke-width="1.300" stroke-linecap="round" opacity=".8" d="M38.500 42.500l2-3M63.500 42.500l2-3"/>',
};
const LYZARSKE = {
  head: '<rect class="rf-main ro" x="16.500" y="43" width="75" height="9" rx="3"/>'
    + '<path class="rs" d="M16.500 48.500h75V49a3 3 0 0 1-3 3h-69a3 3 0 0 1-3-3Z"/>'
    + '<path class="rf-ink rol" d="M23.500 47.500C23.500 39 30 36.500 38 36.500h32c8 0 14.500 2.500 14.500 11S78 59.500 71 59.500c-6.500 0-9.500-4-17-4s-10.500 4-17 4c-7 0-13.500-3.500-13.500-12Z"/>'
    + '<path class="rf-mirror" d="M27.500 47.500c0-6 4.500-7.500 11-7.500h31c6.500 0 11 1.500 11 7.500S76.500 56 71 56c-5 0-9.500-4-17-4s-12 4-17 4c-5.500 0-9.500-2.500-9.500-8.500Z"/>'
    + '<path class="rf-mirror2" d="M27.600 49c-.2-.5-.1-1-.1-1.500 0-6 4.500-7.500 11-7.500h31c6.500 0 11 1.500 11 7.500 0 .5 0 1-.1 1.500Z"/>'
    + '<path class="rf-mirror3" d="M28.700 44c1.300-3 4.600-4 9.800-4h31c5.200 0 8.500 1 9.800 4Z"/>'
    + '<path class="rk-white" fill="none" stroke-width="1.800" stroke-linecap="round" opacity=".65" d="M33 52.500l7.500-9M39 53l4-4.500M62 52.500l7.500-9"/>',
};
const RUMENEC = {
  head: '<ellipse class="rf-blush" cx="34.500" cy="57" rx="6.500" ry="3.700"/><ellipse class="rf-blush" cx="73.500" cy="57" rx="6.500" ry="3.700"/>'
    + '<circle class="rf-freckle" cx="31.800" cy="56.300" r="1.100"/><circle class="rf-freckle" cx="34.600" cy="57.800" r="1.100"/><circle class="rf-freckle" cx="37.300" cy="56.200" r="1.100"/>'
    + '<circle class="rf-freckle" cx="70.700" cy="56.200" r="1.100"/><circle class="rf-freckle" cx="73.400" cy="57.800" r="1.100"/><circle class="rf-freckle" cx="76.200" cy="56.300" r="1.100"/>'
    + '<path class="rk-white" fill="none" stroke-width="1" stroke-linecap="round" opacity=".55" d="M31.500 55q2-1.300 4.500-1.200M70.500 55q2-1.300 4.500-1.200"/>',
};

/* ---------- Oblečení ---------- */
const TRICKO = {
  mid: '<path class="rf-main ro" d="M31 70 23 77l5 8 6-4v7a9 9 0 0 0 9 9h22a9 9 0 0 0 9-9v-7l6 4 5-8-8-7c-7 4-37 4-44 0Z"/>'
    + '<path class="rs" d="M34 81v7a9 9 0 0 0 9 9h22a9 9 0 0 0 9-9v-7c-12 4.500-28 4.500-40 0Z"/>'
    + '<path class="rh" d="M32 71.500 25 77.500l3 5 4-2.500Z"/>'
    + '<path class="rk-deep" fill="none" stroke-width="2" stroke-linecap="round" d="M43.500 70.500q10.500 8.500 21 0"/>'
    + '<path class="rk-deep" fill="none" stroke-width="1" opacity=".5" stroke-dasharray="2 2" d="M37 92.500h34M26 82l5-3M82 82l-5-3"/>'
    + '<circle class="rf-soft ro" cx="54" cy="83" r="3.800"/>',
};
const MIKINA = {
  mid: '<path class="rf-deep ro" d="M31 70 23 77l5 11 6-5v5a9 9 0 0 0 9 9h22a9 9 0 0 0 9-9v-5l6 5 5-11-8-7c-7 4-37 4-44 0Z"/>'
    + '<path class="rh" d="M32 71.500 25 78l3 6 4-3Z"/>'
    + '<path class="rf-main ro" d="M35 70c5 12 33 12 38 0l4 4c-3 13-43 13-46 0Z"/>'
    + '<path class="rk-white" fill="none" stroke-width="1.600" stroke-linecap="round" d="M50 77.500v7m8-7v7"/>'
    + '<circle class="rf-silver" cx="50" cy="85.500" r="1.200"/><circle class="rf-silver" cx="58" cy="85.500" r="1.200"/>'
    + '<path class="rf-main ro" d="M41.500 87h25l-2.200 6H43.700Z"/>'
    + '<path class="rk-deep" fill="none" stroke-width="1.100" opacity=".5" d="M34 91.500h6m28 0h6"/>',
};
const KRAVATA = {
  mid: '<path class="rf-light ro" d="M43 69l11 10 11-10-2 9-9 3-9-3Z"/>'
    + '<path class="rf-main ro" d="M51 77.500h6l-1.500 3.500h-3Z"/>'
    + '<path class="rf-main ro" d="M52.500 81h3l3.500 11-5 2.500-5-2.500Z"/>'
    + '<path class="rs" d="M54 81h1.500l3.500 11-5 2.500Z"/>'
    + '<path class="rk-white" fill="none" stroke-width="1.100" opacity=".5" d="M51.500 85l5-1m-5.800 4 6.600-1.300"/>',
};
const MOTYLEK = {
  body: '<path class="rf-main ro" d="M54 79 42 72.500v13.500Z"/><path class="rf-main ro" d="M54 79l12-6.500V86Z"/>'
    + '<path class="rs" d="M54 79l-12 7V80Zm0 0 12 7V80Z"/>'
    + '<path class="rk-deep" fill="none" stroke-width="1" opacity=".6" d="M46 76.500v6m4-5v4m12-4v4m4-5v6"/>'
    + '<rect class="rf-deep ro" x="51" y="75.500" width="6" height="7.500" rx="2.500"/>',
};
const SALA = {
  body: '<path class="rf-main ro" d="M31 73.500c9 5.500 37 5.500 46 0l1 6c-10 6.500-38 6.500-48 0Z"/>'
    + '<path class="rf-soft" d="M31 73.500c9 5.500 37 5.500 46 0l.4 2.400c-9.500 5-37.500 5-46.800 0Z"/>'
    + '<path class="rf-main ro" d="M61 80h8.500l1.800 17h-10.300Z"/>'
    + '<path class="rf-soft" d="M61.300 86.500h9.100l.3 3H61Zm-.5 6.500h9.900l.3 3h-10.500Z"/>'
    + '<path class="rk-deep" fill="none" stroke-width="1" opacity=".5" stroke-linecap="round" d="M62 97v2m3-2v2m3-2v2"/>',
};
const PLASC = {
  back: '<path class="rf-deep ro" d="M34 70C26 82 19 94 14 103h80c-5-9-12-21-20-33Z"/>'
    + '<path class="rf-soft" opacity=".35" d="M54 72c-4 10-8 22-12 31h24c-4-9-8-21-12-31Z"/>'
    + '<path class="rs" d="M14 103c3-4 6-8.500 9-14l8 14Zm80 0c-3-4-6-8.500-9-14l-8 14Z"/>',
  body: '<path class="rk-gold" fill="none" stroke-width="2" stroke-linecap="round" d="M39 74q15 7 30 0"/>'
    + '<circle class="rf-gold rog" cx="54" cy="77.500" r="3"/><circle class="rh" cx="53" cy="76.500" r="1"/>',
};
const VESTA = {
  mid: '<path class="rf-denim ro" d="M33 70l9.500 4.500L54 92 65.500 74.500 75 70v17a6 6 0 0 1-6 6H39a6 6 0 0 1-6-6Z"/>'
    + '<path class="rs" d="M54 92 65.500 74.500 75 70v17a6 6 0 0 1-6 6H55Z"/>'
    + '<path class="rf-light ro" d="M42.500 74.500 54 92 65.500 74.500l-4-1.500L54 82l-7.500-9Z"/>'
    + '<path class="rk-white" fill="none" stroke-width="1" opacity=".5" stroke-dasharray="1.800 1.800" d="M36 88v-13m36 13v-13"/>'
    + '<circle class="rf-gold rog" cx="54" cy="86" r="1.600"/><circle class="rf-gold rog" cx="54" cy="90" r="1.600"/>',
};

const ZASTERA = {
  mid: '<path class="rf-light" d="M44 72.500h20v8.500l6.500 1.500 1 11.300q0 2.200-2.200 2.200H38.700q-2.200 0-2.200-2.200l1-11.300 6.500-1.500Z"/>'
    + '<path class="rs" d="M64 81l6.500 1.500 1 11.300q0 2.200-2.200 2.200H64Z" opacity=".5"/>'
    + '<path class="rf-main ro" d="M33.300 80.300h41.400v3.600H33.300Z"/>'
    + '<rect class="rf-soft ro" x="47.500" y="86" width="13" height="6.500" rx="2"/>'
    + '<path class="rf-main" d="M54 91.300c-2.400-1.500-3-3.100-1.900-3.700.7-.4 1.500 0 1.900.6.4-.6 1.200-1 1.900-.6 1.100.6.5 2.200-1.900 3.700Z"/>'
    + '<path class="rk-shade" fill="none" stroke-width=".9" stroke-dasharray="1.500 1.500" opacity=".8" d="M38.300 94h31.400M45.500 74.500v5m17-5v5"/>',
};
const BUNDA = {
  mid: '<path class="rf-main ro" d="M31 70 23 77l5 9 6-4.500V88a9 9 0 0 0 9 9h22a9 9 0 0 0 9-9v-6.500l6 4.500 5-9-8-7c-7 4-37 4-44 0Z"/>'
    + '<path class="rf-light" d="M31 70 23 77l5 9 6-4.500V75Zm46 0 8 7-5 9-6-4.500V75Z"/>'
    + '<path class="rk-deep" fill="none" stroke-width="2" d="M24.600 76.200l4.700 8.200M83.400 76.200l-4.700 8.200"/>'
    + '<path class="rf-deep ro" d="M34 88h40a9 9 0 0 1-.97 4.200H34.970A9 9 0 0 1 34 88Z"/>'
    + '<path class="rk-light" fill="none" stroke-width="1" d="M34.500 90.100h39"/>'
    + '<path class="rf-deep ro" d="M41.500 70.500q12.500 10 25 0l2 1.800q-14.500 12-29 0Z"/>'
    + '<path class="rk-deep" fill="none" stroke-width="1.200" d="M54 79v9"/>'
    + '<circle class="rf-light" cx="54" cy="81" r="1.100"/><circle class="rf-light" cx="54" cy="85.500" r="1.100"/>'
    + '<circle class="rf-light ro" cx="44" cy="83.500" r="4.200"/>'
    + `<path class="rf-main" d="${hvezda5(44, 83.800, 3, 1.300)}"/>`
    + '<path class="rh" d="M32 71.500 25 77.500l3 5 3.500-2.200Z"/>',
};
const LACLACE = {
  mid: '<path class="rf-denim ro" d="M42 74.500h24V84h9v5a8 8 0 0 1-8 8H41a8 8 0 0 1-8-8v-5h9Z"/>'
    + '<path class="rs" d="M66 84h9v5a8 8 0 0 1-8 8h-6.500Z" opacity=".6"/>'
    + '<path class="rf-denim ro" d="M42.500 77 36 72l3-2.500 6 5.500ZM65.500 77 72 72l-3-2.500-6 5.500Z"/>'
    + '<circle class="rf-gold rog" cx="44" cy="77" r="1.600"/><circle class="rf-gold rog" cx="64" cy="77" r="1.600"/>'
    + '<path class="rs" d="M48 79h12v4a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2Z"/>'
    + '<path class="rk-gold" fill="none" stroke-width=".9" stroke-dasharray="1.300 1.300" opacity=".8" d="M48.800 80h10.400M35 89q5 0 6-4.500M73 89q-5 0-6-4.500M43 76.500v6.500m22-6.500v6.500"/>'
    + '<path class="rs" d="M53.300 90.500h1.400V97h-1.400Z"/>',
};
const HAVAJ = {
  mid: '<path class="rf-main ro" d="M31 70 23 77l5 8 6-4v7a9 9 0 0 0 9 9h22a9 9 0 0 0 9-9v-7l6 4 5-8-8-7c-7 4-37 4-44 0Z"/>'
    + '<path class="rs" d="M34 84v4a9 9 0 0 0 9 9h22a9 9 0 0 0 9-9v-4c-12 4.500-28 4.500-40 0Z"/>'
    + listek(31, 79.500, 3.200, 1.500, -40, 'rf-soft') + listek(66.500, 92, 3.200, 1.500, 25, 'rf-soft') + listek(71.500, 78.500, 3, 1.400, 50, 'rf-soft')
    + kvet(39.500, 87.500, 3.600, 'rf-light') + kvet(68.500, 84, 3.200, 'rf-pink') + kvet(26.500, 79, 2.400, 'rf-pink') + kvet(81.500, 79, 2.400, 'rf-light') + kvet(57, 93.200, 2.400, 'rf-pink')
    + '<path class="rf-deep" d="M46.500 73 54 82l7.500-9Z"/>'
    + '<path class="rf-soft ro" d="M43.500 71.500 54 84l-11.500-6-2-4.500ZM64.500 71.500 54 84l11.500-6 2-4.500Z"/>'
    + '<circle class="rf-light" cx="54" cy="88" r="1.100"/><circle class="rf-light" cx="54" cy="92.500" r="1.100"/>',
};

/* ---------- Převleky na celé tělo ----------
   Kombinéza, kukla nebo přilba se kreslí z geometrie postavy (tvary výše), ozdoby na nich se nasazují
   kotvou z fit(). Ruce a boty sedí tam, kde je má robot. */
const KOSMONAUT = {
  back: '<rect class="rf-soft ro" x="27" y="66" width="54" height="30" rx="9"/>',
  mid: (g, nasad) => trup(g, 'rf-light ro')
    + nasad('body', '<rect class="rf-main ro" x="43.500" y="76" width="21" height="10" rx="3.500"/>'
      + '<circle class="rf-light" cx="49" cy="81" r="1.800"/><circle class="rf-light" cx="54" cy="81" r="1.800"/><circle class="rf-gold" cx="59" cy="81" r="1.800"/>'
      + '<ellipse class="rf-soft ro" cx="54" cy="72.500" rx="21" ry="5"/>')
    + ruce(g).map(([x, y]) => `<circle class="rf-light ro" cx="${c(x)}" cy="${c(y)}" r="5"/>`).join('')
    // Pásy (Rover) a nožky (Mochi) boty nedostanou – bota by visela ve vzduchu přes kola.
    + (g.legs === 'treads' || g.legs === 'nubs' ? '' : chodidla(g).map((x) => `<rect class="rf-main ro" x="${c(x - 7.5)}" y="95" width="15" height="8" rx="4"/>`).join('')),
  // Bublina přilby obepíná hlavu každé postavy stejně (o 7 jednotek měřítka kolem dokola).
  top: (g) => {
    const h = g.head;
    const d = 7 * g.s;
    const b = { x: h.x - d, top: h.top - d - 2 * g.s, w: h.w + 2 * d };
    b.h = h.top + h.h + 6 * g.s - b.top;
    const r = c(Math.min(b.w, b.h) * 0.47);
    const kx = b.w / 80;
    const ky = b.h / 66;
    return `<rect class="rf-glass" x="${c(b.x)}" y="${c(b.top)}" width="${c(b.w)}" height="${c(b.h)}" rx="${r}" fill-opacity=".1"/>`
      + `<rect class="rk-silver" fill="none" x="${c(b.x)}" y="${c(b.top)}" width="${c(b.w)}" height="${c(b.h)}" rx="${r}" stroke-width="2.200" opacity=".9"/>`
      + `<g transform="translate(${c(b.x - 14 * kx)} ${c(b.top - 14 * ky)}) scale(${c(kx)} ${c(ky)})">`
      + '<path class="rk-white" fill="none" stroke-width="2.600" stroke-linecap="round" opacity=".55" d="M27 33q5-9 16-11"/>'
      + '<path class="rk-white" fill="none" stroke-width="1.400" stroke-linecap="round" opacity=".3" d="M80 52q-1 8-7 13"/></g>';
  },
};
const DINO = {
  back: '<path class="rf-deep ro" d="M76 88c16 2 24-6 22-20-2 9-8 13-22 12Z"/>',
  mid: (g, nasad) => trup(g, 'rf-main ro')
    + nasad('body', '<ellipse class="rf-soft" cx="54" cy="83" rx="13" ry="9"/>'
      + '<path class="rk-main" fill="none" stroke-width="1.500" opacity=".4" d="M44 80h20m-19 4h18m-16 4h14"/>'
      + '<path class="rf-deep ro" d="M29 82l-6 2 3 5 5-2Zm50 0 6 2-3 5-5-2Z"/>'),
  hood: '<path class="rf-deep ro" d="M33 27 37 12l6 14 5-16 6 15 6-15 5 16 6-14 4 15Z"/>'
    + '<path class="rh" d="M37 14.500 41 24l-3 1.500Zm11-4 4 11-2.500.5Z"/>',
};
const CARODEJ = {
  mid: '<path class="rf-deep ro" d="M31 70 21 103h66L77 70Z"/>'
    + '<path class="rs" d="M54 76 87 103H64Z"/>'
    + '<circle class="rf-gold" cx="40" cy="90" r="1.800"/><circle class="rf-gold" cx="68" cy="86" r="1.800"/><circle class="rf-gold" cx="54" cy="98" r="1.800"/>'
    + '<circle class="rf-gold" cx="30" cy="97" r="1.400"/><circle class="rf-gold" cx="78" cy="96" r="1.400"/>'
    + '<rect class="rf-gold rog" x="33" y="83" width="42" height="3.500"/>',
  hood: CARODEJ_KLOBOUK,
  face: '<path class="rf-light ro" d="M36 62c2 14 8 26 18 32 10-6 16-18 18-32-6 5-12 7-18 7s-12-2-18-7Z"/>'
    + '<path class="rk-shade" fill="none" stroke-width="1.200" opacity=".7" stroke-linecap="round" d="M44 72c1 7 4 13 10 18m10-18c-1 7-4 13-10 18"/>',
};
// Šátek, čelenka nebo kukla: pruh hlavy dané postavy a cípy uvázané u jejího pravého okraje.
const cipy = (g, y, svg) => {
  const o = rozsir(g.head, 1.5);
  return `<g transform="translate(${c(54 + pulSirka(o, y))} ${c(y)}) scale(${c(g.s)})">${svg}</g>`;
};
const NINJA = {
  mid: (g, nasad) => trup(g, 'rf-night rok') + pasTrupu(g, 0.5, 0.71, 'rf-main')
    + nasad('body', '<rect class="rf-gold rog" x="50" y="80" width="8" height="7" rx="1.500"/>'),
  hood: (g) => {
    const o = rozsir(g.head, 1.5);
    const f = g.face;
    const e = g.es;
    const prurez = { x: f.x - g.s, top: g.eyeY - 10 * e, w: f.w + 2 * g.s, h: 20 * e, r: Math.min(8 * e, f.r + 1) };
    const y1 = g.head.top + 6 * g.s;
    const y2 = g.head.top + 12.5 * g.s;
    return `<path class="rf-night rok" fill-rule="evenodd" d="${obrys(o)}${obrys(prurez)}"/>`
      + pas(o, y1, y2, 'rf-main ro')
      + `<path class="rh" d="M${c(54 - pulSirka(o, y1 + 1.5) + 3)} ${c(y1 + 1.5)}h${c(18 * g.s)}v1.400h${c(-18 * g.s)}Z"/>`
      + cipy(g, y1 + 2, '<path class="rf-main ro" d="M-.5 0l10 3-1 7-8-3Z"/><path class="rf-deep ro" d="M-.5 5l9 6-3 6-7-6Z"/>');
  },
};
const KUCHAR = {
  mid: '<path class="rf-light ro" d="M40 70h28l4 8v15H36V78Z"/>'
    + '<rect class="rf-soft ro" x="45" y="84" width="18" height="6" rx="2"/>'
    + '<path class="rk-main" fill="none" stroke-width="2" stroke-linecap="round" d="M41 71l-4-3m30 3 4-3"/>',
  hood: KUCHAR_KLOBOUK,
};
const PIRAT = {
  mid: (g) => trup(g, 'rf-light ro') + pasTrupu(g, 0.22, 0.36, 'rf-main') + pasTrupu(g, 0.47, 0.61, 'rf-main') + pasTrupu(g, 0.72, 0.86, 'rf-main'),
  hood: (g) => {
    const o = rozsir(g.head, 1.5);
    const t = g.head.top;
    const tecky = [-1.5, -0.5, 0.5, 1.5].map((k, i) => `<circle class="rf-light" cx="${c(54 + k * 12.5 * g.s)}" cy="${c(t + (i % 2 ? 7.5 : 5.5) * g.s)}" r="${c(1.8 * g.s)}"/>`).join('');
    return pas(o, o.top, g.face.top + 1.5 * g.s, 'rf-main ro') + tecky
      + cipy(g, t + 6 * g.s, '<path class="rf-deep ro" d="M-1 0l10-5-1 14-8-5Z"/>');
  },
  face: OBVAZ.head,
};
const HRDINA = {
  back: PLASC.back,
  mid: (g, nasad) => trup(g, 'rf-main ro')
    + nasad('body', '<circle class="rf-gold rog" cx="54" cy="80" r="6.500"/><path class="rf-deep" d="M55.500 75l-5 6h3.200l-1.500 5 6-6.500h-3.400Z"/>')
    + pasTrupu(g, 0.79, 0.92, 'rf-gold rog'),
  face: '<rect class="rf-main ro" x="23" y="38" width="62" height="20" rx="10"/>'
    + '<rect class="rf-light" x="33.500" y="43" width="15" height="9" rx="4.500"/><rect class="rf-light" x="59.500" y="43" width="15" height="9" rx="4.500"/>'
    + '<path class="rf-main ro" d="M85 41l9-5-1 9-8 1Z"/>'
    + '<path class="rh" d="M27 40h18v1.400H27Z"/>',
  body: PLASC.body,
};
const KOCKA = {
  back: '<path class="rk-deep" fill="none" stroke-width="8" stroke-linecap="round" d="M72 94c18 2 22-12 14-24"/>'
    + '<path class="rk-main" fill="none" stroke-width="5.500" stroke-linecap="round" d="M72 94c18 2 22-12 14-24"/>',
  mid: '<ellipse class="rf-soft" cx="54" cy="84" rx="12" ry="7.500" opacity=".85"/>',
  hood: '<path class="rf-main ro" d="M24 30 27 8l16 14ZM84 30 81 8 65 22Z"/>'
    + '<path class="rf-pink" d="M28.500 24 30 13.500l8.500 8Zm51 0L78 13.500l-8.500 8Z"/>',
  face: '<path class="rk-white" fill="none" stroke-width="1.600" stroke-linecap="round" opacity=".85" d="M20 51l12 3m-12 6 12-3m56-6-12 3m12 3-12-3"/>'
    + '<path class="rf-pink ro" d="M51 56h6l-3 3.500Z"/>',
};
// Rytíř: přilba kopíruje hlavu, průzorem jsou vidět oči. Chochol se nasadí na temeno.
const RYTIR = {
  mid: (g, nasad) => {
    const t = g.torso;
    const ramena = [t.x - 1, t.x + t.w + 1].map((x) => `<ellipse class="rf-steel ro" cx="${c(x)}" cy="${c(t.top + 8)}" rx="6.500" ry="5"/>`
      + `<path class="rk-silverd" fill="none" stroke-width="1" opacity=".55" d="M${c(x - 4.500)} ${c(t.top + 9.500)}q4.500 2.500 9 0"/>`).join('');
    return trup(g, 'rf-steel ro')
      + nasad('body', '<path class="rf-main ro" d="M43 69h22v19.500q0 3-3 4L54 95l-8-2.500q-3-1-3-4Z"/>'
        + '<path class="rf-gold rog" d="M52.500 74.500h3v4.500h4.500v3h-4.500v5.500h-3V82H48v-3h4.500Z"/>'
        + '<path class="rh" d="M45 71h2v15h-2Z"/>')
      + pasTrupu(g, 0.82, 0.93, 'rf-brown2 rob')
      + ramena;
  },
  hood: (g, nasad) => {
    const o = rozsir(g.head, 1.6);
    const f = g.face;
    const e = g.es;
    const s = g.s;
    const prurez = { x: f.x + 2 * s, top: g.eyeY - 6.5 * e, w: f.w - 4 * s, h: 13 * e, r: 3 * e };
    const pod = prurez.top + prurez.h;
    const otvory = [5, 9].flatMap((dy) => [-12, -7.5, 7.5, 12].map((dx) => `<circle class="rf-night" cx="${c(54 + dx * s)}" cy="${c(pod + dy * e)}" r="${c(1.1 * s)}"/>`)).join('');
    return `<path class="rf-steel ro" fill-rule="evenodd" d="${obrys(o)}${obrys(prurez)}"/>`
      + `<path class="rk-silverd" fill="none" stroke-width="1.100" opacity=".6" d="M${c(prurez.x)} ${c(prurez.top - 2 * e)}H${c(prurez.x + prurez.w)}M${c(prurez.x)} ${c(pod + 2 * e)}H${c(prurez.x + prurez.w)}"/>`
      + `<path class="rf-goldd" d="M${c(54 - 1.6 * s)} ${c(o.top + 1.2)}h${c(3.2 * s)}V${c(prurez.top - 3 * e)}h${c(-3.2 * s)}Z"/>`
      + `<rect class="rh" x="${c(o.x + 4 * s)}" y="${c(o.top + Math.min(o.r, 10 * s) * 0.7 + 2)}" width="${c(2.4 * s)}" height="${c(Math.max(4, prurez.top - 3 * e - (o.top + Math.min(o.r, 10 * s) * 0.7 + 2)))}" rx="${c(1.2 * s)}"/>`
      + otvory
      + nasad('hat', '<rect class="rf-goldd rog" x="51" y="16.500" width="6" height="6" rx="1.500"/>'
        + '<path class="rf-deep ro" d="M54 17.500C52 11 55 5 62 3.500c5-1 8.500 1.500 8.500 5-4.500-2-9-.5-11.500 3-2 2.800-3 4.500-5 6Z"/>'
        + '<path class="rf-main ro" d="M54 17.500C50 10.500 51.500 3.500 58 1c5-2 9.500 0 10 3.500-5-1.500-9.500.5-11.500 4.500-1.500 3-2 5.500-2.500 8.500Z"/>'
        + '<path class="rh" d="M54.500 12c-.5-4 1-7.500 4.500-9.500-1.500 2.500-2.500 5.500-3 9Z"/>');
  },
};
// Žabák: kapuce kolem obličeje a oči posazené na temeni dané hlavy (kulaté, hranaté i široké).
const ZABA = {
  mid: (g) => {
    const t = g.torso;
    return trup(g, 'rf-frog ro')
      + `<ellipse class="rf-froglight" cx="54" cy="${c(t.top + t.h * 0.62)}" rx="${c(t.w * 0.3)}" ry="${c(t.h * 0.3)}"/>`
      + `<circle class="rf-frogd" cx="${c(t.x + t.w * 0.15)}" cy="${c(t.top + t.h * 0.5)}" r="1.700"/><circle class="rf-frogd" cx="${c(t.x + t.w * 0.86)}" cy="${c(t.top + t.h * 0.7)}" r="1.400"/>`;
  },
  hood: (g) => {
    const o = rozsir(g.head, 1.8);
    const f = rozsir(g.face, 1.2);
    const s = g.s;
    const oci = [-1, 1].map((k) => {
      const dx = k * (g.head.w / 2 - 13 * s);
      const x = 54 + dx;
      const y = temeno(o, dx) + 1.5 * s;
      return `<circle class="rf-frog ro" cx="${c(x)}" cy="${c(y)}" r="${c(8.5 * s)}"/><circle class="rf-light" cx="${c(x)}" cy="${c(y - 0.6 * s)}" r="${c(5.4 * s)}"/>`
        + `<circle class="rf-night" cx="${c(x + k * 0.8 * s)}" cy="${c(y - 0.2 * s)}" r="${c(2.8 * s)}"/><circle class="rf-white" cx="${c(x + k * 0.8 * s - 1 * s)}" cy="${c(y - 1.3 * s)}" r="${c(0.9 * s)}"/>`;
    }).join('');
    return `<path class="rf-frog ro" fill-rule="evenodd" d="${obrys(o)}${obrys(f)}"/>`
      + oci;
  },
};
// Včelka: pruhovaný trup podle tvaru postavy, křídla za zády a tykadla na čelence.
const VCELA = {
  back: '<path class="rf-wing rok" d="M37 78C26 66 11 68 12.500 77.500c1.200 7.500 12.500 8.500 24.500.5Z"/>'
    + '<path class="rf-wing rok" d="M71 78C82 66 97 68 95.500 77.500c-1.200 7.500-12.500 8.500-24.500.5Z"/>'
    + '<path class="rk-wingv" fill="none" stroke-width="1" stroke-linecap="round" d="M35 77.500Q25 72 17 74.500M73 77.500Q83 72 91 74.500"/>',
  mid: (g, nasad) => trup(g, 'rf-bee ro') + pasTrupu(g, 0.4, 0.56, 'rf-night') + pasTrupu(g, 0.72, 0.88, 'rf-night')
    + nasad('body', '<path class="rf-night rok" d="M51 92.500h6L54 98Z"/>'),
  hood: (g, nasad) => {
    const o = rozsir(g.head, 1.6);
    return pas(o, o.top, g.head.top + 5 * g.s, 'rf-bee ro')
      + nasad('hat', '<path class="rk-antenna" fill="none" stroke-width="2.200" stroke-linecap="round" d="M47 22c-1.500-6-5-10-9.500-12.500M61 22c1.500-6 5-10 9.500-12.500"/>'
        + '<circle class="rf-night rok" cx="36.500" cy="9" r="3.400"/><circle class="rf-night rok" cx="71.500" cy="9" r="3.400"/>'
        + '<circle class="rh" cx="35.500" cy="8" r="1.100"/><circle class="rh" cx="70.500" cy="8" r="1.100"/>');
  },
};

const polozky = (...rows) => Object.fromEntries(rows.map(([id, label, parts]) => [id, { label, ...parts }]));

// Pozn.: `label` je funkce, ne text – překládá se při vykreslení, ne při načtení modulu.
export const WARDROBE = {
  hat: polozky(
    ['cap', () => tr('Kšiltovka'), KSILTOVKA], ['beanie', () => tr('Kulich'), KULICH], ['tophat', () => tr('Cylindr'), CYLINDR],
    ['crown', () => tr('Koruna'), KORUNA], ['party', () => tr('Párty čepička'), PARTY], ['wizard', () => tr('Čarodějův klobouk'), { head: CARODEJ_KLOBOUK }],
    ['headphones', () => tr('Sluchátka'), SLUCHATKA], ['chef', () => tr('Kuchařská čepice'), { head: KUCHAR_KLOBOUK }],
    ['cowboy', () => tr('Kovbojský klobouk'), KOVBOJ], ['propeller', () => tr('Vrtulková čepice'), VRTULKA], ['santa', () => tr('Mikulášská čepice'), SANTA],
    ['beret', () => tr('Baret'), BARET], ['bucket', () => tr('Rybářský klobouček'), KLOBOUCEK], ['flowers', () => tr('Květinový věneček'), VENECEK],
    ['viking', () => tr('Vikingská helma'), VIKING],
  ),
  face: polozky(
    ['glasses', () => tr('Kulaté brýle'), BRYLE], ['sunglasses', () => tr('Sluneční brýle'), SLUNECNI], ['visor', () => tr('Vizor'), VIZOR],
    ['monocle', () => tr('Monokl'), MONOKL], ['mustache', () => tr('Knír'), KNIR], ['glasses3d', () => tr('3D brýle'), D3],
    ['hearts', () => tr('Srdíčkové brýle'), SRDICKA], ['eyepatch', () => tr('Páska přes oko'), OBVAZ],
    ['stars', () => tr('Hvězdičkové brýle'), HVEZDY], ['goggles', () => tr('Lyžařské brýle'), LYZARSKE], ['blush', () => tr('Ruměnec a pihy'), RUMENEC],
  ),
  outfit: polozky(
    ['tee', () => tr('Tričko'), TRICKO], ['hoodie', () => tr('Mikina'), MIKINA], ['tie', () => tr('Kravata'), KRAVATA],
    ['bowtie', () => tr('Motýlek'), MOTYLEK], ['scarf', () => tr('Šála'), SALA], ['cape', () => tr('Plášť'), PLASC], ['vest', () => tr('Vesta'), VESTA],
    ['apron', () => tr('Zástěra'), ZASTERA], ['varsity', () => tr('Baseballová bunda'), BUNDA], ['overalls', () => tr('Laclové kalhoty'), LACLACE],
    ['aloha', () => tr('Havajská košile'), HAVAJ],
  ),
  costume: polozky(
    ['astronaut', () => tr('Kosmonaut'), KOSMONAUT], ['dino', () => tr('Dinosaurus'), DINO], ['wizard', () => tr('Čaroděj'), CARODEJ],
    ['ninja', () => tr('Nindža'), NINJA], ['chef', () => tr('Kuchař'), KUCHAR], ['pirate', () => tr('Pirát'), PIRAT],
    ['hero', () => tr('Superhrdina'), HRDINA], ['cat', () => tr('Kočka'), KOCKA],
    ['knight', () => tr('Rytíř'), RYTIR], ['frog', () => tr('Žabák'), ZABA], ['bee', () => tr('Včelka'), VCELA],
  ),
};

export const SLOTS = ['hat', 'face', 'outfit', 'costume'];
export const NO_LOOK = Object.freeze({ hat: 'none', face: 'none', outfit: 'none', costume: 'none' });

// Dřívější verze ukládala jedinou položku „accessory“. Zůstane čitelná.
const LEGACY = { cap: ['hat', 'cap'], glasses: ['face', 'glasses'], shirt: ['outfit', 'tee'], spacesuit: ['costume', 'astronaut'] };

export function normalizeLook(source) {
  const look = { ...NO_LOOK };
  const s = typeof source === 'string' ? { accessory: source } : source && typeof source === 'object' ? source : {};
  if (LEGACY[s.accessory]) look[LEGACY[s.accessory][0]] = LEGACY[s.accessory][1];
  for (const slot of SLOTS) if (typeof s[slot] === 'string' && Object.hasOwn(WARDROBE[slot], s[slot])) look[slot] = s[slot];
  // Převlek je oblečení na celé tělo: nekombinuje se s dalším oblečením. Čepice a obličej zůstávají.
  if (look.costume !== 'none') look.outfit = 'none';
  return look;
}

// Výběr jedné položky. Převlek a oblečení se vylučují (obojí je tělo), čepice a doplněk na obličej
// se kombinují s čímkoli.
export function pickLook(look, slot, id) {
  const next = { ...normalizeLook(look) };
  if (!SLOTS.includes(slot) || (id !== 'none' && !Object.hasOwn(WARDROBE[slot], id))) return next;
  if (slot === 'costume' && id !== 'none') next.outfit = 'none';
  if (slot === 'outfit' && id !== 'none') next.costume = 'none';
  next[slot] = id;
  return next;
}

export function renderWardrobe(svg, source) {
  const look = normalizeLook(source);
  const hat = WARDROBE.hat[look.hat];
  const face = WARDROBE.face[look.face];
  const outfit = WARDROBE.outfit[look.outfit];
  const costume = WARDROBE.costume[look.costume];
  if (!hat && !face && !outfit && !costume) return svg;
  const body = costume || outfit;
  // Vlastní pokrývku hlavy převlek ztrácí, když si uživatel vybral čepici. Pokrývka hlavy se kotví
  // k temeni, obličejová část k očím (fit v robot-svg.js), oblečení k trupu. Vrstva zadaná funkcí se
  // kreslí rovnou z geometrie postavy (kukla, přilba, dres) a ozdoby si nasadí sama.
  const typ = /data-robot-type="([A-Za-z]+)"/.exec(svg)?.[1] || 'Scout';
  const g = geometry(typ);
  const nasad = (cast, obsah) => {
    const t = fit(typ, cast);
    return t ? `<g transform="${t}">${obsah}</g>` : obsah;
  };
  const kresba = (obsah, cast) => (!obsah ? '' : typeof obsah === 'function' ? obsah(g, nasad) : nasad(cast, obsah));
  const wrap = (jmeno, obsah) => (obsah ? `<g class="robot-wear robot-wear--${jmeno}">${obsah}</g>` : '');
  const back = wrap('back', kresba(body?.back, 'body'));
  const mid = wrap('mid', kresba(body?.mid, 'body'));
  const head = wrap('hood', hat ? '' : kresba(costume?.hood, 'hat'))
    + wrap('face', kresba(costume?.face, 'face') + kresba(face?.head, 'face'))
    + wrap('hat', kresba(hat?.head, 'hat') + (!hat ? kresba(costume?.top, 'hat') : ''));
  const bodyFront = wrap('body', kresba(body?.body, 'body'));
  let out = svg;
  if (back) out = out.replace('<g class="robot-body">', back + '<g class="robot-body">');
  if (mid) out = out.replace(/<g class="robot-head"/, mid + '<g class="robot-head"');
  if (head) out = out.replace('</g></g></svg>', head + '</g></g></svg>');
  if (bodyFront) out = out.replace('</g></svg>', bodyFront + '</g></svg>');
  // Čepice a převlek s pokrývkou hlavy zakrývají anténu; kdyby trčela skrz ně, vypadalo by to jako chyba.
  if (hat || (costume && (costume.hood || costume.top))) out = out.replace(/class="robot( |")/, 'class="robot robot--worn$1');
  return out;
}

export function robotInWardrobe(type, source) {
  return renderWardrobe(robot(type), source);
}
