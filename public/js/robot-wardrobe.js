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
import { robot, fit } from './robot-svg.js';
import { tr } from './i18n.js';

/* ---------- Čepice ---------- */
const KSILTOVKA = {
  head: '<path class="rf-main ro" d="M28 29C28 12 40 6 54 6s26 6 26 23Z"/>'
    + '<path class="rs" d="M28 29c0-4 1-7 2.500-9.500C42 25 66 25 77.500 19.500 79 22 80 25 80 29Z"/>'
    + '<path class="rk-deep" fill="none" stroke-width="1.200" opacity=".55" d="M54 7v22M43 9.500c-3.500 6-5 12-5 19.500m27-19.500c3.500 6 5 12 5 19.500"/>'
    + '<path class="rh" d="M33 21c1.500-6.500 7-11 14-12.500-5 3-8.500 7.500-10.500 14Z"/>'
    + '<path class="rf-deep ro" d="M22.500 28h63a4.200 4.200 0 0 1 0 7.500H28a5 5 0 0 1-5.500-7.500Z"/>'
    + '<rect class="rh" x="27" y="29.800" width="24" height="1.500" rx=".75"/>'
    + '<circle class="rf-deep ro" cx="54" cy="6.500" r="2.600"/>',
};
const KULICH = {
  head: '<path class="rf-main ro" d="M28 32C28 13 39 6 54 6s26 7 26 26Z"/>'
    + '<path class="rk-deep" fill="none" stroke-width="1.200" opacity=".45" d="M38 11c-2 6-3 12-3 21m11-24c-1 8-1 16-1 24m9-25v25m9-24c1 8 1 16 1 24m9-21c2 6 3 12 3 21"/>'
    + '<path class="rh" d="M34 22c2-6 6-10 12-12-4 3-7 7-8 12Z"/>'
    + '<rect class="rf-soft ro" x="24" y="27" width="60" height="11" rx="5.500"/>'
    + '<path class="rk-main" fill="none" stroke-width="1.200" opacity=".5" d="M32 29.500v6m8-6v6m8-6v6m8-6v6m8-6v6m8-6v6"/>'
    + '<circle class="rf-soft ro" cx="54" cy="5.500" r="5.500"/><circle class="rh" cx="52" cy="3.800" r="1.600"/><circle class="rs" cx="56" cy="7.500" r="1.400"/>',
};
const CYLINDR = {
  head: '<path class="rf-ink rol" d="M34 26V6a4 4 0 0 1 4-4h32a4 4 0 0 1 4 4v20Z"/>'
    + '<rect class="rf-main" x="34" y="17.500" width="40" height="7"/>'
    + '<rect class="rh" x="37" y="5" width="3" height="11" rx="1.500"/>'
    + '<rect class="rf-gold rog" x="50" y="16.500" width="8" height="9" rx="1.500"/><rect class="rf-ink" x="52.500" y="19" width="3" height="4"/>'
    + '<ellipse class="rf-ink rol" cx="54" cy="27" rx="33" ry="5.500"/>'
    + '<path class="rh" d="M26 26.500c5-2.500 12-3.500 18-3.500"/>',
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
const CARODEJ_KLOBOUK = '<ellipse class="rf-deep ro" cx="54" cy="28" rx="36" ry="6"/>'
  + '<path class="rf-main ro" d="M37 28C40 18 45 9 55 2c-1 8 2 17 16 26Z"/>'
  + '<path class="rh" d="M42 24c2-6 5-11 9-15-3 6-5 11-6 16Z"/>'
  + '<path class="rf-gold" d="M38.500 25q15.500 4.500 32.500 0l1.200 3.200q-17 5-35.500 0Z"/>'
  + '<path class="rf-gold" d="M53 12.500l1.400 3 3.200.4-2.400 2.200.6 3.200-2.800-1.600-2.800 1.600.6-3.200-2.400-2.200 3.200-.4Z"/>';
const SLUCHATKA = {
  head: '<path class="rk-silverd" fill="none" stroke-width="7.500" stroke-linecap="round" d="M23 44C20 5 88 5 85 44"/>'
    + '<path class="rk-silver" fill="none" stroke-width="5" stroke-linecap="round" d="M23 44C20 5 88 5 85 44"/>'
    + '<path class="rk-white" fill="none" stroke-width="1.400" stroke-linecap="round" opacity=".6" d="M30 24C36 12 52 9 62 11"/>'
    + '<rect class="rf-main ro" x="10" y="36" width="16" height="26" rx="8"/><rect class="rf-main ro" x="82" y="36" width="16" height="26" rx="8"/>'
    + '<rect class="rf-deep" x="19.500" y="41" width="7.500" height="16" rx="3.700"/><rect class="rf-deep" x="81" y="41" width="7.500" height="16" rx="3.700"/>'
    + '<rect class="rh" x="12.500" y="40" width="3" height="10" rx="1.500"/><rect class="rh" x="84.500" y="40" width="3" height="10" rx="1.500"/>',
};
const KUCHAR_KLOBOUK = '<circle class="rf-light" cx="40" cy="16" r="9"/><circle class="rf-light" cx="68" cy="16" r="9"/><circle class="rf-light" cx="54" cy="11" r="10"/>'
  + '<rect class="rf-light" x="32" y="16" width="44" height="14" rx="3"/>'
  + '<path class="rk-shade" fill="none" stroke-width="1.300" opacity=".7" stroke-linecap="round" d="M41 21v6m13-8v8m13-6v6M36 12q4-3 7 0m16-2q4-3 7 0"/>'
  + '<rect class="rf-soft ro" x="32" y="27" width="44" height="5.500" rx="2"/>'
  + '<path class="rh" d="M45 6q4-2.500 8-1.500"/>';
const KOVBOJ = {
  head: '<path class="rf-brown ro" d="M14 29c3 7 14 7 22 4 6 2.200 30 2.200 36 0 8 3 19 3 22-4-4-1-9-3.500-13-7-1-7-5-15-12-15-3 3-18 3-21 0-8 0-12 8-13 15-4 3.500-9 6-13 7Z"/>'
    + '<path class="rs" d="M14 29c3 7 14 7 22 4 6 2.200 30 2.200 36 0 8 3 19 3 22-4-5 3-14 4-22 2-8 2.500-28 2.500-36 0-8 2-17 1-22-2Z"/>'
    + '<path class="rf-brown2 ro" d="M30 24.500c8 3 40 3 48 0l-.8 5c-9 2.500-38 2.500-46.400 0Z"/>'
    + '<path class="rh" d="M41 11c4-2.500 8-3 11-1.500-4 .5-8 2.500-11 5.500Z"/>'
    + '<path class="rf-gold" d="M54 25l1.300 2.600 2.800.4-2 2 .5 2.800-2.600-1.400-2.600 1.400.5-2.800-2-2 2.800-.4Z"/>',
};
const VRTULKA = {
  head: '<path class="rf-main ro" d="M29 31C29 17 40 10 54 10s25 7 25 21Z"/>'
    + '<path class="rf-soft" d="M54 10c-5 0-9 1-12 3.500 2 5 3 11 3 17.500h18c0-6.500 1-12.500 3-17.500C63 11 59 10 54 10Z"/>'
    + '<path class="rh" d="M34 24c1.500-5 5-9 11-10.500-3 3-5 6.500-6 10.500Z"/>'
    + '<rect class="rf-deep ro" x="52.500" y="3.500" width="3" height="7" rx="1.200"/>'
    + '<path class="rf-red ro" d="M54 4.500C47 .5 39 1 36.500 4.500c3.500 3.500 11.500 3.500 17.500 0Z"/>'
    + '<path class="rf-cyan ro" d="M54 4.500C61 .5 69 1 71.500 4.500c-3.500 3.500-11.500 3.500-17.500 0Z"/>'
    + '<circle class="rf-gold ro" cx="54" cy="4.500" r="1.800"/>'
    + '<rect class="rf-deep ro" x="24.500" y="28" width="59" height="6.500" rx="3.200"/>',
};
const SANTA = {
  head: '<path class="rf-red ro" d="M29 31C29 15 41 8 55 8.500c11 .5 19 7 24 17l2 5Z"/>'
    + '<path class="rs" d="M64 11c7 3 12 8 15 15l2 5H64Z"/>'
    + '<path class="rh" d="M34 22c2-6 6-10 13-12-4 3-8 7-9 12Z"/>'
    + '<rect class="rf-light ro" x="24" y="27" width="60" height="9.500" rx="4.700"/>'
    + '<circle class="rf-light ro" cx="82" cy="26" r="5.500"/>'
    + '<path class="rk-shade" fill="none" stroke-width="1.200" opacity=".6" stroke-linecap="round" d="M32 31h4m6 1h4m8-1h4m8 1h4m8-1h4"/>',
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

/* ---------- Převleky na celé tělo ---------- */
const KOSMONAUT = {
  back: '<rect class="rf-soft ro" x="27" y="66" width="54" height="30" rx="9"/>',
  mid: '<rect class="rf-light ro" x="33" y="69" width="42" height="24" rx="11"/>'
    + '<rect class="rf-main ro" x="43.500" y="76" width="21" height="10" rx="3.500"/>'
    + '<circle class="rf-light" cx="49" cy="81" r="1.800"/><circle class="rf-light" cx="54" cy="81" r="1.800"/><circle class="rf-gold" cx="59" cy="81" r="1.800"/>'
    + '<ellipse class="rf-soft ro" cx="54" cy="72.500" rx="21" ry="5"/>'
    + '<circle class="rf-light ro" cx="21" cy="85" r="5"/><circle class="rf-light ro" cx="87" cy="85" r="5"/>'
    + '<rect class="rf-main ro" x="30" y="95" width="15" height="8" rx="4"/><rect class="rf-main ro" x="63" y="95" width="15" height="8" rx="4"/>',
  top: '<rect class="rf-glass" x="14" y="14" width="80" height="66" rx="31" fill-opacity=".1"/>'
    + '<rect class="rk-silver" fill="none" x="14" y="14" width="80" height="66" rx="31" stroke-width="2.200" opacity=".9"/>'
    + '<path class="rk-white" fill="none" stroke-width="2.600" stroke-linecap="round" opacity=".55" d="M27 33q5-9 16-11"/>'
    + '<path class="rk-white" fill="none" stroke-width="1.400" stroke-linecap="round" opacity=".3" d="M80 52q-1 8-7 13"/>',
};
const DINO = {
  back: '<path class="rf-deep ro" d="M76 88c16 2 24-6 22-20-2 9-8 13-22 12Z"/>',
  mid: '<rect class="rf-main ro" x="33" y="69" width="42" height="24" rx="11"/>'
    + '<ellipse class="rf-soft" cx="54" cy="83" rx="13" ry="9"/>'
    + '<path class="rk-main" fill="none" stroke-width="1.500" opacity=".4" d="M44 80h20m-19 4h18m-16 4h14"/>'
    + '<path class="rf-deep ro" d="M29 82l-6 2 3 5 5-2Zm50 0 6 2-3 5-5-2Z"/>',
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
const NINJA = {
  mid: '<rect class="rf-night rok" x="33" y="69" width="42" height="24" rx="11"/>'
    + '<rect class="rf-main" x="33" y="81" width="42" height="5"/>'
    + '<rect class="rf-gold rog" x="50" y="80" width="8" height="7" rx="1.500"/>',
  hood: '<path class="rf-night rok" fill-rule="evenodd" d="M39 23h30a18 18 0 0 1 18 18v15a18 18 0 0 1-18 18H39a18 18 0 0 1-18-18V41a18 18 0 0 1 18-18ZM35 38h38a8 8 0 0 1 8 8v4a8 8 0 0 1-8 8H35a8 8 0 0 1-8-8v-4a8 8 0 0 1 8-8Z"/>'
    + '<path class="rf-main ro" d="M21 29h66v7H21Z"/>'
    + '<path class="rh" d="M24 30.500h18v1.400H24Z"/>'
    + '<path class="rf-main ro" d="M87 31l10 3-1 7-8-3Z"/><path class="rf-deep ro" d="M87 36l9 6-3 6-7-6Z"/>',
};
const KUCHAR = {
  mid: '<path class="rf-light ro" d="M40 70h28l4 8v15H36V78Z"/>'
    + '<rect class="rf-soft ro" x="45" y="84" width="18" height="6" rx="2"/>'
    + '<path class="rk-main" fill="none" stroke-width="2" stroke-linecap="round" d="M41 71l-4-3m30 3 4-3"/>',
  hood: KUCHAR_KLOBOUK,
};
const PIRAT = {
  mid: '<rect class="rf-light ro" x="33" y="69" width="42" height="24" rx="11"/>'
    + '<path class="rk-main" fill="none" stroke-width="3.500" stroke-linecap="round" d="M36.500 76h35m-35 6h35m-33 6h31"/>',
  hood: '<path class="rf-main ro" d="M21 37c0-9 2-14 8-14h50c6 0 8 5 8 14-12 5-54 5-66 0Z"/>'
    + '<circle class="rf-light" cx="35" cy="30" r="1.800"/><circle class="rf-light" cx="47" cy="32" r="1.800"/><circle class="rf-light" cx="60" cy="30" r="1.800"/><circle class="rf-light" cx="72" cy="32" r="1.800"/>'
    + '<path class="rf-deep ro" d="M85 31l10-5-1 14-8-5Z"/>',
  face: OBVAZ.head,
};
const HRDINA = {
  back: PLASC.back,
  mid: '<rect class="rf-main ro" x="33" y="69" width="42" height="24" rx="11"/>'
    + '<circle class="rf-gold rog" cx="54" cy="80" r="6.500"/>'
    + '<path class="rf-deep" d="M55.500 75l-5 6h3.200l-1.500 5 6-6.500h-3.400Z"/>'
    + '<rect class="rf-gold rog" x="33" y="88" width="42" height="3"/>',
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

const polozky = (...rows) => Object.fromEntries(rows.map(([id, label, parts]) => [id, { label, ...parts }]));

// Pozn.: `label` je funkce, ne text – překládá se při vykreslení, ne při načtení modulu.
export const WARDROBE = {
  hat: polozky(
    ['cap', () => tr('Kšiltovka'), KSILTOVKA], ['beanie', () => tr('Kulich'), KULICH], ['tophat', () => tr('Cylindr'), CYLINDR],
    ['crown', () => tr('Koruna'), KORUNA], ['party', () => tr('Párty čepička'), PARTY], ['wizard', () => tr('Čarodějův klobouk'), { head: CARODEJ_KLOBOUK }],
    ['headphones', () => tr('Sluchátka'), SLUCHATKA], ['chef', () => tr('Kuchařská čepice'), { head: KUCHAR_KLOBOUK }],
    ['cowboy', () => tr('Kovbojský klobouk'), KOVBOJ], ['propeller', () => tr('Vrtulková čepice'), VRTULKA], ['santa', () => tr('Mikulášská čepice'), SANTA],
  ),
  face: polozky(
    ['glasses', () => tr('Kulaté brýle'), BRYLE], ['sunglasses', () => tr('Sluneční brýle'), SLUNECNI], ['visor', () => tr('Vizor'), VIZOR],
    ['monocle', () => tr('Monokl'), MONOKL], ['mustache', () => tr('Knír'), KNIR], ['glasses3d', () => tr('3D brýle'), D3],
    ['hearts', () => tr('Srdíčkové brýle'), SRDICKA], ['eyepatch', () => tr('Páska přes oko'), OBVAZ],
  ),
  outfit: polozky(
    ['tee', () => tr('Tričko'), TRICKO], ['hoodie', () => tr('Mikina'), MIKINA], ['tie', () => tr('Kravata'), KRAVATA],
    ['bowtie', () => tr('Motýlek'), MOTYLEK], ['scarf', () => tr('Šála'), SALA], ['cape', () => tr('Plášť'), PLASC], ['vest', () => tr('Vesta'), VESTA],
  ),
  costume: polozky(
    ['astronaut', () => tr('Kosmonaut'), KOSMONAUT], ['dino', () => tr('Dinosaurus'), DINO], ['wizard', () => tr('Čaroděj'), CARODEJ],
    ['ninja', () => tr('Nindža'), NINJA], ['chef', () => tr('Kuchař'), KUCHAR], ['pirate', () => tr('Pirát'), PIRAT],
    ['hero', () => tr('Superhrdina'), HRDINA], ['cat', () => tr('Kočka'), KOCKA],
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
  // Vlastní pokrývku hlavy převlek ztrácí, když si uživatel vybral čepici.
  const vrstvy = {
    back: body?.back || '',
    mid: body?.mid || '',
    head: (hat ? '' : costume?.hood || '') + (costume?.face || '') + (face?.head || '') + (hat?.head || ''),
    top: !hat ? costume?.top || '' : '',
    body: body?.body || '',
  };
  // Šatník je nakreslený pro stavbu Scouta; jiná postava ho dostane přenesený na svou hlavu a trup.
  const typ = /data-robot-type="([A-Za-z]+)"/.exec(svg)?.[1] || 'Scout';
  const wrap = (jmeno, obsah, cast) => {
    if (!obsah) return '';
    const t = fit(typ, cast);
    return `<g class="robot-wear robot-wear--${jmeno}"${t ? ` transform="${t}"` : ''}>${obsah}</g>`;
  };
  let out = svg;
  const back = wrap('back', vrstvy.back, 'body');
  const mid = wrap('mid', vrstvy.mid, 'body');
  const head = wrap('head', vrstvy.head + vrstvy.top, 'head');
  const bodyFront = wrap('body', vrstvy.body, 'body');
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
