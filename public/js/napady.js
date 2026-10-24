// Generátor nápadů v prázdném poli zadání: každých 7 s se plynule vystřídá jiný tip z napady-data.js.
// Pořadí se zamíchá a po vyčerpání zamíchá znovu, takže se nic neopakuje dřív, než projdou všechny.
// Je to jen náhled nad polem (aria-hidden, nereaguje na klik): pole samo dál funguje jako obyčejné
// textové pole. Bez pohybu (prefers-reduced-motion) se text jen vymění.
import { NAPADY } from './napady-data.js';
import { tr, jazyk } from './i18n.js';

const INTERVAL_MS = 7000;
const ODCHOD_MS = 320;

export function zamichej(pole, nahoda = Math.random) {
  const a = [...pole];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(nahoda() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Nekonečný proud nápadů bez opakování v rámci jednoho kola; nové kolo nezačne tím, čím staré skončilo.
export function proudNapadu(nahoda = Math.random) {
  let kolo = [], posledni = null;
  return () => {
    if (!kolo.length) {
      kolo = zamichej(NAPADY, nahoda);
      if (kolo[0] === posledni && kolo.length > 1) kolo.push(kolo.shift());
    }
    posledni = kolo.shift();
    return posledni;
  };
}

const textNapadu = (n) => (jazyk() === 'en' ? n[1] : n[0]);

export function pripojNapady(pole, { interval = INTERVAL_MS } = {}) {
  const obal = pole.parentElement;
  if (!obal || obal.querySelector('.launch-napad')) return { obnov: () => {}, zrus: () => {} };
  const dalsi = proudNapadu();
  const vrstva = document.createElement('div');
  vrstva.className = 'launch-napad';
  vrstva.setAttribute('aria-hidden', 'true');
  vrstva.innerHTML = '<span class="launch-napad-uvod"></span> <span class="launch-napad-text"></span>';
  const uvod = vrstva.firstElementChild;
  const text = vrstva.lastElementChild;
  uvod.textContent = tr('Co má agent udělat? Např.');
  text.textContent = `„${textNapadu(dalsi())}“`;
  obal.append(vrstva);

  // Stejné odsazení a písmo jako pole, ať text sedí přesně tam, kde začne psaní.
  const srovnej = () => {
    const cs = getComputedStyle(pole);
    for (const k of ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'fontSize', 'fontFamily', 'fontWeight', 'lineHeight', 'letterSpacing']) vrstva.style[k] = cs[k];
  };
  const viditelnost = () => { vrstva.hidden = pole.value.length > 0; };
  srovnej();
  viditelnost();
  const pozorovatel = new ResizeObserver(() => { if (!pole.isConnected) { zrus(); return; } srovnej(); });
  pozorovatel.observe(pole);
  pole.addEventListener('input', viditelnost);

  const bezPohybu = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let casovac = null, odchod = null;
  const vymen = () => {
    if (!pole.isConnected) { zrus(); return; }
    if (document.hidden || vrstva.hidden) return;
    const novy = `„${textNapadu(dalsi())}“`;
    if (bezPohybu()) { text.textContent = novy; return; }
    text.classList.add('je-pryc');
    clearTimeout(odchod);
    odchod = setTimeout(() => {
      text.textContent = novy;
      text.classList.remove('je-pryc');
      text.classList.add('je-prichod');
      // Dvojitý snímek: prohlížeč nejdřív vykreslí výchozí polohu, pak teprve animuje příchod.
      requestAnimationFrame(() => requestAnimationFrame(() => text.classList.remove('je-prichod')));
    }, ODCHOD_MS);
  };
  casovac = setInterval(vymen, interval);
  function zrus() {
    clearInterval(casovac);
    clearTimeout(odchod);
    pozorovatel.disconnect();
    pole.removeEventListener('input', viditelnost);
  }
  return { obnov: viditelnost, zrus };
}
