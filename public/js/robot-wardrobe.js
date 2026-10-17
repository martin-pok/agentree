// Šatník robota Agenteeq: čepice, obličej, oblečení a převleky na celé tělo. Všechno jsou vektory
// ve stejném viewBoxu 108×112 jako robot (src: robot-svg.js), nic robota nepřeškálovává ani
// nemění. Jen vzhled – žádná položka nic neříká o oprávněních agenta.
//
// Vrstvy: `back` je za tělem (plášť, ocas), `mid` mezi trupem a hlavou (oblečení), `head` uvnitř
// skupiny hlavy (klobouky, brýle – hýbou se s ní) a `body` přes tělo i hlavu (šála, motýlek).
// Barvy jdou přes třídy rf-* (výplň) a rk-* (obrys), takže se věrně přebarví podle --persona
// a světlého i tmavého režimu (workbench.css).
import { robot } from './robot-svg.js';
import { tr } from './i18n.js';

const KSILTOVKA = {
  head: '<path class="rf-main" d="M29 28C29 13 40 7 54 7s25 6 25 21Z"/><path class="rk-deep" fill="none" stroke-width="1.6" d="M54 8v20"/><path class="rf-deep" d="M24 28h60a3 3 0 0 1 0 6H27a3 3 0 0 1-3-6Z"/><circle class="rf-deep" cx="54" cy="7" r="2.6"/>',
};
const KULICH = {
  head: '<path class="rf-main" d="M28 31C28 13 39 6 54 6s26 7 26 25Z"/><rect class="rf-soft" x="25" y="27" width="58" height="10" rx="5"/><path class="rk-main" fill="none" stroke-width="1.4" opacity=".45" d="M35 29v6m8-6v6m8-6v6m8-6v6m8-6v6m8-6v6"/><circle class="rf-soft" cx="54" cy="5.5" r="5"/>',
};
const CYLINDR = {
  head: '<rect class="rf-dark" x="23" y="23" width="62" height="6" rx="3"/><path class="rf-dark" d="M34 25V6a3 3 0 0 1 3-3h34a3 3 0 0 1 3 3v19Z"/><rect class="rf-main" x="34" y="17" width="40" height="6"/>',
};
const KORUNA = {
  head: '<path class="rf-gold" d="M30 29 32 9l11 10 11-14 11 14 11-10 2 20Z"/><rect class="rf-goldd" x="30" y="25" width="48" height="5" rx="1.5"/><circle class="rf-gold" cx="32" cy="8.5" r="2.6"/><circle class="rf-gold" cx="54" cy="4.5" r="2.6"/><circle class="rf-gold" cx="76" cy="8.5" r="2.6"/><circle class="rf-main" cx="54" cy="18" r="3"/><circle class="rf-light" cx="40" cy="27.5" r="1.4"/><circle class="rf-light" cx="68" cy="27.5" r="1.4"/>',
};
const PARTY = {
  head: '<path class="rf-main" d="M39 28 54 4l15 24Z"/><path class="rk-light" fill="none" stroke-width="2.4" opacity=".8" d="M44.5 21h19m-22.5 4.5h26"/><circle class="rf-gold" cx="54" cy="4.5" r="3.4"/>',
};
const CARODEJ_KLOBOUK = '<ellipse class="rf-deep" cx="54" cy="27" rx="35" ry="6"/><path class="rf-main" d="M38 27C41 17 46 8 57 2c-1 8 1 16 15 25Z"/><path class="rf-gold" d="M39.5 24.5q15 4 31 0l1 3q-16 5-33 0Z"/><path class="rf-gold" d="M53 12.5l1.3 2.8 3 .4-2.2 2.1.5 3-2.6-1.4-2.6 1.4.5-3-2.2-2.1 3-.4Z"/>';
const SLUCHATKA = {
  head: '<path class="rk-dark" fill="none" stroke-width="5" stroke-linecap="round" d="M23 44C20 5 88 5 85 44"/><rect class="rf-main" x="10" y="36" width="16" height="26" rx="8"/><rect class="rf-main" x="82" y="36" width="16" height="26" rx="8"/><rect class="rf-deep" x="20" y="41" width="7" height="16" rx="3.5"/><rect class="rf-deep" x="81" y="41" width="7" height="16" rx="3.5"/>',
};
const KUCHAR_KLOBOUK = '<circle class="rf-light" cx="40" cy="16" r="9"/><circle class="rf-light" cx="68" cy="16" r="9"/><circle class="rf-light" cx="54" cy="11" r="10"/><rect class="rf-light" x="32" y="16" width="44" height="14" rx="3"/><path class="rk-shade" fill="none" stroke-width="1.4" opacity=".6" d="M41 21v6m13-8v8m13-6v6"/><rect class="rf-soft" x="32" y="27" width="44" height="5" rx="2"/>';

const BRYLE = {
  head: '<path class="rk-light" fill="none" stroke-width="2.4" stroke-linecap="round" d="M51 47.5h6M32 46l-6-2m50 2 6-2"/><circle class="rf-glass rk-light" cx="41.5" cy="47.5" r="9.5" stroke-width="2.6"/><circle class="rf-glass rk-light" cx="66.5" cy="47.5" r="9.5" stroke-width="2.6"/>',
};
const SLUNECNI = {
  head: '<rect class="rf-deep rk-light" x="29" y="39.5" width="26" height="18" rx="7.5" stroke-width="2"/><rect class="rf-deep rk-light" x="53" y="39.5" width="26" height="18" rx="7.5" stroke-width="2"/><path class="rk-light" fill="none" stroke-width="2" stroke-linecap="round" opacity=".5" d="M34 45l6-2.5M34 50l10-3.5m16-1.5 6-2.5m-6 7.5 10-3.5"/>',
};
const VIZOR = {
  head: '<rect class="rf-main rk-light" x="24" y="37" width="60" height="23" rx="11.5" stroke-width="2" fill-opacity=".72"/><path class="rk-light" fill="none" stroke-width="2.4" stroke-linecap="round" opacity=".6" d="M33 43h20"/>',
};
const MONOKL = {
  head: '<path class="rk-gold" fill="none" stroke-width="1.4" d="M70 58q7 12 1 24"/><circle class="rf-glass rk-gold" cx="66.5" cy="47.5" r="10.5" stroke-width="2.4"/>',
};
const KNIR = {
  head: '<path class="rf-warm" d="M54 56.5c-3-4.5-8.5-4.5-13.500-2.500-3.500 1.500-4.500 4.500-2.500 5.500 4 .5 9-1.500 16 3 7-4.500 12-2.500 16-3 2-1 1-4-2.500-5.500-5-2-10.500-2-13.500 2.500Z"/>',
};

const TRICKO = {
  mid: '<path class="rf-main" d="M31 70 23 77l5 8 6-4v7a9 9 0 0 0 9 9h22a9 9 0 0 0 9-9v-7l6 4 5-8-8-7c-7 4-37 4-44 0Z"/><path class="rk-deep" fill="none" stroke-width="2" stroke-linecap="round" d="M44 71q10 8 20 0"/><circle class="rf-soft" cx="54" cy="83" r="3.6"/>',
};
const MIKINA = {
  mid: '<path class="rf-deep" d="M31 70 23 77l5 10 6-5v5a9 9 0 0 0 9 9h22a9 9 0 0 0 9-9v-5l6 5 5-10-8-7c-7 4-37 4-44 0Z"/><path class="rf-main" d="M35 70c5 12 33 12 38 0l4 4c-3 13-43 13-46 0Z"/><path class="rk-light" fill="none" stroke-width="1.8" stroke-linecap="round" d="M50 78v7m8-7v7"/><path class="rf-main" d="M42 87h24l-2 6H44Z"/>',
};
const KRAVATA = {
  mid: '<path class="rf-light" d="M43 69l11 10 11-10-2 9-9 3-9-3Z"/><path class="rf-main" d="M51 78h6l-1.500 3h-3Z"/><path class="rf-main" d="M52.500 81h3L58.500 91.500 54 94l-4.500-2.500Z"/>',
};
const MOTYLEK = {
  body: '<path class="rf-main" d="M54 79 42 73v12Zm0 0 12-6v12Z"/><rect class="rf-deep" x="51" y="75.500" width="6" height="7" rx="2.500"/>',
};
const SALA = {
  body: '<path class="rf-main" d="M31 73.500c9 5.500 37 5.500 46 0l1 6c-10 6.500-38 6.500-48 0Z"/><path class="rf-deep" d="M61 80h8l1.500 17h-9.500Z"/><path class="rk-light" fill="none" stroke-width="1.800" stroke-linecap="round" opacity=".75" d="M61.500 88h8m-8.200 4.500h8.500"/>',
};
const PLASC = {
  back: '<path class="rf-deep" d="M34 70C26 82 19 94 14 103h80c-5-9-12-21-20-33Z"/><path class="rf-main" opacity=".35" d="M54 72c-4 10-8 22-12 31h24c-4-9-8-21-12-31Z"/>',
  body: '<path class="rk-gold" fill="none" stroke-width="2" stroke-linecap="round" d="M39 74q15 7 30 0"/><circle class="rf-gold" cx="54" cy="77.500" r="2.800"/>',
};

const KOSMONAUT = {
  back: '<rect class="rf-soft" x="27" y="66" width="54" height="30" rx="9"/>',
  mid: '<rect class="rf-light" x="33" y="69" width="42" height="24" rx="11"/><rect class="rf-main" x="43.500" y="76" width="21" height="10" rx="3.500"/><circle class="rf-light" cx="49" cy="81" r="1.800"/><circle class="rf-light" cx="54" cy="81" r="1.800"/><circle class="rf-gold" cx="59" cy="81" r="1.800"/><ellipse class="rf-soft rk-light" cx="54" cy="72.500" rx="21" ry="5" stroke-width="1.400"/><circle class="rf-light" cx="21" cy="85" r="5"/><circle class="rf-light" cx="87" cy="85" r="5"/><rect class="rf-main" x="30" y="95" width="15" height="8" rx="4"/><rect class="rf-main" x="63" y="95" width="15" height="8" rx="4"/>',
  head: '<rect class="rf-glass rk-light" x="14" y="14" width="80" height="66" rx="31" stroke-width="3.500" fill-opacity=".07"/><path class="rk-light" fill="none" stroke-width="3" stroke-linecap="round" opacity=".75" d="M27 33q5-9 16-11"/>',
};
const DINO = {
  back: '<path class="rf-deep" d="M76 88c16 2 24-6 22-20-2 9-8 13-22 12Z"/>',
  mid: '<rect class="rf-main" x="33" y="69" width="42" height="24" rx="11"/><ellipse class="rf-soft" cx="54" cy="83" rx="13" ry="9"/><path class="rk-main" fill="none" stroke-width="1.5" opacity=".4" d="M44 80h20m-19 4h18m-16 4h14"/><path class="rf-deep" d="M29 82l-6 2 3 5 5-2Zm50 0 6 2-3 5-5-2Z"/>',
  head: '<path class="rf-deep" d="M33 27 37 12l6 14 5-16 6 15 6-15 5 16 6-14 4 15Z"/>',
};
const CARODEJ = {
  mid: '<path class="rf-deep" d="M31 70 21 103h66L77 70Z"/><circle class="rf-gold" cx="40" cy="90" r="1.800"/><circle class="rf-gold" cx="68" cy="86" r="1.800"/><circle class="rf-gold" cx="54" cy="98" r="1.800"/><circle class="rf-gold" cx="30" cy="97" r="1.400"/><circle class="rf-gold" cx="78" cy="96" r="1.400"/><rect class="rf-gold" x="33" y="83" width="42" height="3.500"/>',
  head: CARODEJ_KLOBOUK + '<path class="rf-light" d="M36 62c2 14 8 26 18 32 10-6 16-18 18-32-6 5-12 7-18 7s-12-2-18-7Z"/>',
};
const NINJA = {
  mid: '<rect class="rf-dark" x="33" y="69" width="42" height="24" rx="11"/><rect class="rf-main" x="33" y="81" width="42" height="5"/>',
  head: '<path class="rf-dark" fill-rule="evenodd" d="M39 23h30a18 18 0 0 1 18 18v15a18 18 0 0 1-18 18H39a18 18 0 0 1-18-18V41a18 18 0 0 1 18-18ZM35 38h38a8 8 0 0 1 8 8v4a8 8 0 0 1-8 8H35a8 8 0 0 1-8-8v-4a8 8 0 0 1 8-8Z"/><path class="rf-main" d="M21 29h66v7H21Z"/><path class="rf-main" d="M87 31l10 3-1 7-8-3Z"/><path class="rf-deep" d="M87 36l9 6-3 6-7-6Z"/>',
};
const KUCHAR = {
  mid: '<path class="rf-light" d="M40 70h28l4 8v15H36V78Z"/><rect class="rf-soft" x="45" y="84" width="18" height="6" rx="2"/><path class="rk-main" fill="none" stroke-width="2" stroke-linecap="round" d="M41 71l-4-3m30 3 4-3"/>',
  head: KUCHAR_KLOBOUK + KNIR.head,
};
const PIRAT = {
  mid: '<rect class="rf-light" x="33" y="69" width="42" height="24" rx="11"/><path class="rk-main" fill="none" stroke-width="3.500" stroke-linecap="round" d="M36.500 76h35m-35 6h35m-33 6h31"/>',
  head: '<path class="rk-dark" fill="none" stroke-width="2" d="M27 39l14 1 44-6"/><ellipse class="rf-dark rk-light" cx="41.500" cy="47.500" rx="9" ry="8" stroke-width="1.800"/><path class="rf-main" d="M21 37c0-9 2-14 8-14h50c6 0 8 5 8 14-12 5-54 5-66 0Z"/><circle class="rf-light" cx="35" cy="30" r="1.800"/><circle class="rf-light" cx="47" cy="32" r="1.800"/><circle class="rf-light" cx="60" cy="30" r="1.800"/><circle class="rf-light" cx="72" cy="32" r="1.800"/><path class="rf-deep" d="M85 31l10-5-1 14-8-5Z"/>',
};
const HRDINA = {
  back: PLASC.back,
  mid: '<rect class="rf-main" x="33" y="69" width="42" height="24" rx="11"/><circle class="rf-gold" cx="54" cy="80" r="6.500"/><path class="rf-deep" d="M55.500 75l-5 6h3.200l-1.500 5 6-6.500h-3.400Z"/><rect class="rf-gold" x="33" y="88" width="42" height="3"/>',
  head: '<rect class="rf-main" x="23" y="38" width="62" height="20" rx="10"/><rect class="rf-light" x="33.500" y="43" width="15" height="9" rx="4.500"/><rect class="rf-light" x="59.500" y="43" width="15" height="9" rx="4.500"/><path class="rf-main" d="M85 41l9-5-1 9-8 1Z"/>',
  body: PLASC.body,
};
const KOCKA = {
  back: '<path class="rk-main" fill="none" stroke-width="6" stroke-linecap="round" d="M72 94c18 2 22-12 14-24"/>',
  head: '<path class="rf-main" d="M24 30 27 8l16 14ZM84 30 81 8 65 22Z"/><path class="rf-soft" d="M28 24l1.500-10 8.500 7.500ZM80 24l-1.500-10-8.500 7.500Z"/><path class="rk-light" fill="none" stroke-width="1.600" stroke-linecap="round" opacity=".8" d="M20 51l12 3m-12 6 12-3m56-6-12 3m12 3-12-3"/><path class="rf-soft" d="M51 56h6l-3 3.500Z"/>',
};

const polozky = (...rows) => Object.fromEntries(rows.map(([id, label, parts, hlava = true]) => [id, { label, ...parts, tvori: hlava }]));

// Pozn.: `label` je funkce, ne text – překládá se při vykreslení, ne při načtení modulu.
export const WARDROBE = {
  hat: polozky(
    ['cap', () => tr('Kšiltovka'), KSILTOVKA], ['beanie', () => tr('Kulich'), KULICH], ['tophat', () => tr('Cylindr'), CYLINDR],
    ['crown', () => tr('Koruna'), KORUNA], ['party', () => tr('Párty čepička'), PARTY], ['wizard', () => tr('Čarodějův klobouk'), { head: CARODEJ_KLOBOUK }],
    ['headphones', () => tr('Sluchátka'), SLUCHATKA], ['chef', () => tr('Kuchařská čepice'), { head: KUCHAR_KLOBOUK }],
  ),
  face: polozky(
    ['glasses', () => tr('Kulaté brýle'), BRYLE, false], ['sunglasses', () => tr('Sluneční brýle'), SLUNECNI, false], ['visor', () => tr('Vizor'), VIZOR, false],
    ['monocle', () => tr('Monokl'), MONOKL, false], ['mustache', () => tr('Knír'), KNIR, false],
  ),
  outfit: polozky(
    ['tee', () => tr('Tričko'), TRICKO, false], ['hoodie', () => tr('Mikina'), MIKINA, false], ['tie', () => tr('Kravata'), KRAVATA, false],
    ['bowtie', () => tr('Motýlek'), MOTYLEK, false], ['scarf', () => tr('Šála'), SALA, false], ['cape', () => tr('Plášť'), PLASC, false],
  ),
  costume: polozky(
    ['astronaut', () => tr('Kosmonaut'), KOSMONAUT], ['dino', () => tr('Dinosaurus'), DINO], ['wizard', () => tr('Čaroděj'), CARODEJ],
    ['ninja', () => tr('Nindža'), NINJA], ['chef', () => tr('Kuchař'), KUCHAR], ['pirate', () => tr('Pirát'), PIRAT],
    ['hero', () => tr('Superhrdina'), HRDINA], ['cat', () => tr('Kočka'), KOCKA],
  ),
};

export const SLOTS = ['hat', 'face', 'outfit', 'costume'];
export const NO_LOOK = Object.freeze({ hat: 'none', face: 'none', outfit: 'none', costume: 'none' });
const COVERS = ['hat', 'face', 'outfit'];

// Dřívější verze ukládala jedinou položku „accessory“. Zůstane čitelná.
const LEGACY = { cap: ['hat', 'cap'], glasses: ['face', 'glasses'], shirt: ['outfit', 'tee'], spacesuit: ['costume', 'astronaut'] };

export function normalizeLook(source) {
  const look = { ...NO_LOOK };
  const s = typeof source === 'string' ? { accessory: source } : source && typeof source === 'object' ? source : {};
  if (LEGACY[s.accessory]) look[LEGACY[s.accessory][0]] = LEGACY[s.accessory][1];
  for (const slot of SLOTS) if (typeof s[slot] === 'string' && Object.hasOwn(WARDROBE[slot], s[slot])) look[slot] = s[slot];
  // Převlek je celé tělo: nekombinuje se s čepicí, brýlemi ani oblečením.
  if (look.costume !== 'none') for (const slot of COVERS) look[slot] = 'none';
  return look;
}

// Výběr jedné položky. Převlek vyčistí ostatní sloty a naopak, takže vznikají jen smysluplné kombinace.
export function pickLook(look, slot, id) {
  const next = { ...normalizeLook(look) };
  if (!SLOTS.includes(slot) || (id !== 'none' && !Object.hasOwn(WARDROBE[slot], id))) return next;
  if (slot === 'costume' && id !== 'none') Object.assign(next, NO_LOOK);
  if (COVERS.includes(slot) && id !== 'none') next.costume = 'none';
  next[slot] = id;
  return next;
}

export function renderWardrobe(svg, source) {
  const look = normalizeLook(source);
  const kus = SLOTS.map((slot) => WARDROBE[slot][look[slot]]).filter(Boolean);
  if (!kus.length) return svg;
  const vrstva = (jmeno) => kus.map((k) => k[jmeno] || '').join('');
  const wrap = (jmeno, obsah) => (obsah ? `<g class="robot-wear robot-wear--${jmeno}">${obsah}</g>` : '');
  let out = svg;
  const back = wrap('back', vrstva('back'));
  const mid = wrap('mid', vrstva('mid'));
  const head = wrap('head', vrstva('head'));
  const body = wrap('body', vrstva('body'));
  if (back) out = out.replace('<g class="robot-body">', back + '<g class="robot-body">');
  if (mid) out = out.replace('<g class="robot-head">', mid + '<g class="robot-head">');
  if (head) out = out.replace('</g></g></svg>', head + '</g></g></svg>');
  if (body) out = out.replace('</g></svg>', body + '</g></svg>');
  // Čepice a převleky zakrývají anténu; kdyby trčela skrz ně, vypadalo by to jako chyba.
  if (kus.some((k) => k.tvori)) out = out.replace('class="robot"', 'class="robot robot--worn"');
  return out;
}

export function robotInWardrobe(type, source) {
  return renderWardrobe(robot(type), source);
}
