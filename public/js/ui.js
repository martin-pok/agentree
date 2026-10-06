import { esc, rel, fmtTok, fmtMoney, STATUS, DAY, resetsLabel, timeHM } from './format.js';
import { ICON, glyph } from './icons.js';
import { gauge } from './charts.js';
import { sessionTotal } from './data.js';
import { tr, LOCALE } from './i18n.js';
import { posunSObsahem } from './plynule-posouvani.js';

// `sloucit: true` – oblast se živými daty (seznam agentů, měřidla, aktivita) se nepřepisuje celá,
// ale sloučí se s novým HTML: shodné uzly zůstanou, změní se jen text a atributy, které se opravdu
// liší, a řádky s `data-key` se jen přesunou. Dřív každá živá událost vyměnila na Agentech přes
// 800 uzlů: WebKit na to potřeboval snímek přes 50 ms, kurzor ztratil najetí, nástupové animace
// karet se přehrály znovu a prohlížeč přišel o kotvu posouvání (obsah pod čtenářem poskočil).
export function fill(root, name, html, { sloucit: slouceni = false, presun = false } = {}) {
  const el = root.querySelector(`[data-region="${name}"]`);
  if (!el || el._html === html) return false;
  if (slouceni && el.firstChild) {
    sloucit(el, html, { presun });
    el._html = html;
    dorovnejCisla(el);
    oznacRolovani();
    return true;
  }
  const fokus = klicFokusu(el);
  // Živé přepisy mohou měnit text karty několikrát za sekundu. Již dekódované logo
  // ponecháme jako stejný DOM uzel, aby mezi dvěma snímky nezmizelo při novém innerHTML.
  const obrazky = new Map();
  for (const img of el.querySelectorAll('img')) {
    if (!img.complete || !img.naturalWidth) continue;
    const key = img.outerHTML;
    if (!obrazky.has(key)) obrazky.set(key, []);
    obrazky.get(key).push(img);
  }
  el.innerHTML = html;
  for (const img of el.querySelectorAll('img')) {
    const old = obrazky.get(img.outerHTML)?.shift();
    if (old) img.replaceWith(old);
  }
  el._html = html;
  if (fokus) vratFokus(el, fokus);
  dorovnejCisla(el);
  oznacRolovani();
  return true;
}

// Animovaná čísla se dorovnají hned při každém vyplnění oblasti, ne až při příští živé události.
// Dřív přepnutí období ve Statistikách změnilo jen cíl čísla (data-value) a text zůstal starý,
// dokud nepřišla další událost ze serveru – čísla tak ukazovala jiné období než tlačítko.
function dorovnejCisla(el) {
  if (typeof window !== 'undefined' && el.querySelector('[data-tween]')) tweenAll(el);
}

/* ---------- Sloučení živé oblasti s novým HTML ---------- */
//
// Vědomě jednoduché: děti se párují podle `data-key` (řádek seznamu), ostatní podle pořadí
// a značky. Pravidla, na kterých závisí plynulost a pravdivost:
//   - zaostřené pole a jeho hodnota se nepřepíšou (živá data nesmějí vzít rozepsaný text),
//   - <details> si nechá otevření, které mu dal člověk,
//   - číslo s `data-tween` řídí tweenAll – sloučení mu změní jen cílovou hodnotu, ne text,
//   - vnořená oblast zapomene své `_html`, aby ji její vlastní fill() opravdu doplnil.
const klic = (n) => (n.nodeType === 1 ? n.getAttribute('data-key') : null);

export function sloucit(el, html, { presun = false } = {}) {
  const sablona = document.createElement('template');
  sablona.innerHTML = html;
  // Polohy řádků se měří jen u odrolované stránky (kvůli kotvě) nebo pro dojezd přesunu.
  const merit = typeof document !== 'undefined' && (scrollY > 0 || (presun && chcePresun()));
  const pred = merit ? polohy(el) : null;
  sloucitDeti(el, sablona.content);
  if (!pred) return;
  ukotvi(el, pred);
  if (presun && chcePresun()) dojezd(el, pred);
}

// Kotva celé obrazovky kolem jednoho živého překreslení (app.js#refresh): změní se i oblasti nad
// seznamem (počty ve filtrech, pruh nahoře), a ty se do měření jedné oblasti nepromítnou – ve
// WebKitu na Linuxu pak řádek pod čtenářem poskočil o 3 px. Měří se jen u odrolované stránky.
export function kotva(el) {
  if (typeof scrollY !== 'number' || scrollY <= 0 || !el) return () => {};
  const pred = polohy(el);
  return () => ukotvi(el, pred);
}

// Kotva: řádek, který čtenář právě vidí, musí po živé události zůstat na stejném místě obrazovky,
// i když se nad ním seznam přeskládal. Chromium to dělá sám (overflow-anchor), WebKit vlastnost
// sice zná, ale v okně aplikace ji neuplatní – obsah pod čtenářem pak poskočil o řádek. Kotvou je
// nejvyšší viditelný řádek, který se posunul stejně jako jeho soused (tím se vyloučí řádek, který
// sám přeskočil jinam). Když prohlížeč vyrovnal posun sám, rozdíl je nula a nic se neděje.
function ukotvi(el, pred) {
  if (scrollY <= 0) return;
  const vyska = innerHeight;
  const posuny = [];
  for (const [n, r0] of pred) {
    if (!n.isConnected || r0.bottom <= 0 || r0.top >= vyska) continue;
    posuny.push(n.getBoundingClientRect().top - r0.top);
  }
  for (let i = 0; i + 1 < posuny.length; i++) {
    if (Math.abs(posuny[i] - posuny[i + 1]) < 1) { posunSObsahem(posuny[i]); return; }
  }
}

// Přesun řádku (FLIP): když živá událost změní pořadí, řádek do nového místa dojede a ostatní
// se rozestoupí, místo aby seznam v jednom snímku přeskládal. Jen transform a opacity (kompozitor),
// jen řádky v okně a nikdy během posouvání nebo při omezeném pohybu. Měří se v souřadnicích okna
// po rozvržení, takže kotva posouvání (overflow-anchor) se do pohybu nepromítne.
const PRESUN_MAX = 40;
const chcePresun = () => typeof Element.prototype.animate === 'function'
  && !matchMedia('(prefers-reduced-motion: reduce)').matches
  && !document.documentElement.classList.contains('is-scrolling')
  && document.visibilityState === 'visible';
function polohy(el) {
  const m = new Map();
  const vyska = innerHeight;
  for (const n of el.querySelectorAll('[data-key]')) {
    if (m.size >= PRESUN_MAX) break;
    const r = n.getBoundingClientRect();
    if (r.bottom > -vyska / 2 && r.top < vyska * 1.5) m.set(n, r);
  }
  return m;
}
function dojezd(el, pred) {
  const vyska = innerHeight;
  const krivka = 'cubic-bezier(.2, .8, .2, 1)';
  for (const n of el.querySelectorAll('[data-key]')) {
    const r0 = pred.get(n);
    const r = n.getBoundingClientRect();
    if (r.bottom < 0 || r.top > vyska) continue;
    // Nový řádek, nebo řádek, který přijel z dálky mimo měřený úsek: objeví se prolnutím, až mu
    // ostatní uvolní místo (do té doby je neviditelný). Bez odkladu by ležel přes řádek, který
    // z jeho místa teprve odjíždí.
    if (!r0) {
      n.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, delay: 100, easing: krivka, fill: 'backwards' });
      continue;
    }
    const dx = r0.left - r.left;
    const dy = r0.top - r.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
    n.animate([{ transform: `translate(${Math.round(dx)}px, ${Math.round(dy)}px)` }, { transform: 'none' }], { duration: 280, easing: krivka });
  }
}

function sloucitDeti(a, b) {
  const klicovane = new Map();
  for (let c = a.firstElementChild; c; c = c.nextElementSibling) {
    const k = klic(c);
    if (k != null) klicovane.set(k, c);
  }
  let kurzor = a.firstChild;
  for (let n = b.firstChild; n;) {
    const dalsi = n.nextSibling;
    const k = klic(n);
    let shoda = null;
    if (k != null) {
      const s = klicovane.get(k);
      if (s && s.nodeName === n.nodeName) { shoda = s; klicovane.delete(k); }
    } else if (kurzor && klic(kurzor) == null && kurzor.nodeType === n.nodeType && kurzor.nodeName === n.nodeName) {
      shoda = kurzor;
    }
    if (shoda) {
      if (shoda === kurzor) kurzor = kurzor.nextSibling;
      else a.insertBefore(shoda, kurzor);
      sloucitUzel(shoda, n);
    } else {
      a.insertBefore(n, kurzor);
    }
    n = dalsi;
  }
  while (kurzor) {
    const d = kurzor.nextSibling;
    a.removeChild(kurzor);
    kurzor = d;
  }
}

function sloucitUzel(a, b) {
  if (a.nodeType !== 1) {
    if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue;
    return;
  }
  const detaily = a.tagName === 'DETAILS';
  for (const at of b.attributes) {
    if (detaily && at.name === 'open') continue;
    if (a.getAttributeNS(at.namespaceURI, at.localName) !== at.value) a.setAttributeNS(at.namespaceURI, at.name, at.value);
  }
  for (const at of [...a.attributes]) {
    if (detaily && at.name === 'open') continue;
    if (!b.hasAttributeNS(at.namespaceURI, at.localName)) a.removeAttributeNS(at.namespaceURI, at.localName);
  }
  const zaostreno = a === document.activeElement;
  if (a.tagName === 'INPUT') {
    if (a.type === 'checkbox' || a.type === 'radio') a.checked = b.hasAttribute('checked');
    else if (!zaostreno) a.value = b.getAttribute('value') ?? '';
    return;
  }
  if (a.tagName === 'TEXTAREA') {
    if (!zaostreno) a.value = b.textContent;
    return;
  }
  if (a.hasAttribute('data-region')) a._html = undefined;
  // Animované číslo: text drží tweenAll (i odpočet při nástupu); sloučení by ho přeskočilo na cíl.
  if (a.hasAttribute('data-tween') && a._tweenTo !== undefined) return;
  sloucitDeti(a, b);
  if (a.tagName === 'SELECT' && !zaostreno) {
    const i = [...b.options].findIndex((o) => o.hasAttribute('selected'));
    a.selectedIndex = i < 0 ? 0 : i;
  }
}

// Překreslení oblasti nesmí vzít fokus prvku, kterým člověk právě něco změnil: přepínač v Nastavení
// se po uložení překreslí s novým stavem a klávesnice pak začínala znovu od začátku stránky. Prvek
// se po překreslení najde podle stálého atributu. Výběr z nabídky (selects.js) má vlastní tlačítko,
// které vznikne až po vložení HTML – na něj se počká do dalšího mikroúkolu.
const KLICE_FOKUSU = ['data-setting', 'data-quiet', 'data-action', 'data-theme-pick', 'data-appearance', 'data-lang', 'data-done-min', 'id', 'name'];
function klicFokusu(el) {
  if (typeof document === 'undefined') return null;
  let a = document.activeElement;
  if (!a || a === document.body || !el.contains(a)) return null;
  const picker = a.classList.contains('picker-trigger') && a.previousElementSibling?.tagName === 'SELECT';
  if (picker) a = a.previousElementSibling;
  const attr = KLICE_FOKUSU.find((k) => a.hasAttribute(k));
  if (!attr) return null;
  const id = a.hasAttribute('data-id') ? `[data-id="${CSS.escape(a.getAttribute('data-id'))}"]` : '';
  return { selector: `${a.tagName.toLowerCase()}[${attr}="${CSS.escape(a.getAttribute(attr))}"]${id}`, picker };
}
function vratFokus(el, { selector, picker }) {
  const cil = el.querySelector(selector);
  if (!cil) return;
  if (!picker) { cil.focus({ preventScroll: true }); return; }
  queueMicrotask(() => {
    const tlacitko = cil.nextElementSibling;
    if (tlacitko?.classList.contains('picker-trigger') && document.activeElement === document.body) tlacitko.focus({ preventScroll: true });
  });
}

/* ---------- Vodorovné rolování: dát najevo, že řádek pokračuje ---------- */
//
// Segmentované přepínače se na úzkém okně rolují vodorovně a posuvník je schovaný. Bez
// další značky se poslední popisek useknul uprostřed slova („Od největ“) a vypadalo to
// jako chyba sazby, ne jako „vpravo je toho víc“. Značky zapnou měkké doznění na té
// straně, kam se dá ještě posunout – když se vejde všechno, nekreslí se nic, jinak by
// doznění zbytečně stmívalo krajní tlačítko.

function znacky(el) {
  const zbyva = el.scrollWidth - el.clientWidth;
  el.classList.toggle('je-vlevo', zbyva > 1 && el.scrollLeft > 1);
  el.classList.toggle('je-vpravo', zbyva > 1 && el.scrollLeft < zbyva - 1);
}

let naplanovano = false;
export function oznacRolovani() {
  // Mimo prohlížeč (testy nad těmito moduly běží v Node) není co značit.
  if (typeof document === 'undefined' || typeof requestAnimationFrame !== 'function') return;
  if (naplanovano) return;
  naplanovano = true;
  // Po vložení HTML ještě neproběhlo rozvržení; měřit hned by dalo scrollWidth starého obsahu.
  requestAnimationFrame(() => {
    naplanovano = false;
    for (const el of document.querySelectorAll('.seg, .chips--rada')) {
      if (!el._rolovani) {
        el._rolovani = true;
        el.addEventListener('scroll', () => znacky(el), { passive: true });
      }
      znacky(el);
    }
  });
}

if (typeof window !== 'undefined') window.addEventListener('resize', oznacRolovani, { passive: true });

/* ---------- Animovaná čísla ---------- */

const tweenMemory = new Map();
const formatter = (fmt) => (fmt?.startsWith('money:') ? (v) => fmtMoney(v, fmt.slice(6)) : fmt === 'tok' ? fmtTok : (v) => String(Math.round(v)));

export const tween = (key, value, fmt = 'int') =>
  `<span data-tween="${esc(key)}" data-fmt="${esc(fmt)}" data-value="${Number(value) || 0}">${esc(formatter(fmt)(tweenMemory.get(key) ?? value))}</span>`;

// Text animovaného čísla se mění v každém snímku. Přepsat data stávajícího textového uzlu je
// levnější než textContent, který uzel pokaždé zahodí a vytvoří nový (a s ním mutaci stromu).
function nastavText(el, t) {
  const n = el.firstChild;
  if (n && n.nodeType === 3 && !n.nextSibling) { if (n.data !== t) n.data = t; }
  else if (el.textContent !== t) el.textContent = t;
}

export function tweenAll(root) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  for (const el of root.querySelectorAll('[data-tween]')) {
    const to = Number(el.dataset.value) || 0;
    if (el._tweenTo === to) continue;
    el._tweenTo = to;
    const key = el.dataset.tween;
    const fmt = formatter(el.dataset.fmt);
    // Číslo dojíždí z toho, co je právě vidět (i z rozjeté animace), ne z paměti jiného klíče –
    // jinak by po přepnutí období spadlo na nulu a znovu napočítávalo.
    const from = Number.isFinite(el._ukazano) ? el._ukazano : tweenMemory.has(key) ? tweenMemory.get(key) : 0;
    tweenMemory.set(key, to);
    if (reduce || from === to) {
      el._ukazano = to;
      nastavText(el, fmt(to));
      continue;
    }
    const t0 = performance.now();
    const d = from === 0 ? 900 : 240;
    const step = (t) => {
      // Novější cíl (rychlé přepínání) má přednost: stará animace se zastaví a nic nepřepíše.
      if (el._tweenTo !== to) return;
      const p = Math.min(1, (t - t0) / d);
      el._ukazano = from + (to - from) * (1 - (1 - p) ** 3);
      nastavText(el, fmt(p < 1 ? el._ukazano : to));
      if (p < 1 && el.isConnected) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
}

/* ---------- Nástup obrazovky: čísla vyjedou do okének ---------- */

// Číslice písma Urbanist nemají stejnou šířku (tabulkové číslice písmo neumí), takže obyčejné
// napočítávání by číslem cukalo do stran. Při nástupu proto každá číslice dostane okénko o šířce
// své konečné podoby a vyjede v něm jako na válečku počítadla.
// Každý řád se otočí tolikrát, kolikrát by se otočil při skutečném napočítávání od nuly (nejvýš
// dvakrát, rychlejší točení už oko nerozliší), a všechny válečky jedou po stejné křivce jako
// ukazatel. Číslo tak v každém okamžiku čte zhruba tutéž hodnotu jako měřidlo vedle něj a nikdy
// nepřestřelí cíl. Políčko 0 je prázdné: řád, ke kterému napočítávání ještě nedošlo, nesvítí nulou,
// takže číslo vyjede z prázdna.
const ODO_OTACKY = 2;
export function odoSloupce(text) {
  const znaky = [...String(text)];
  const cislice = znaky.filter((z) => z >= '0' && z <= '9');
  let vlevo = 0;
  return znaky.map((znak) => {
    if (znak < '0' || znak > '9') return { znak };
    // Kolik celých otáček řád udělá = číslo tvořené číslicemi vlevo od něj (nejvýš ODO_OTACKY).
    const predpona = cislice.slice(0, vlevo).join('').replace(/^0+/, '');
    vlevo += 1;
    const otacky = predpona.length > 1 ? ODO_OTACKY : Math.min(ODO_OTACKY, Number(predpona || 0));
    const sled = [null];
    for (let j = 1; j <= otacky * 10 + Number(znak); j++) sled.push(j % 10);
    if (sled.length === 1) sled.push(0);
    return { znak, sled };
  });
}

// Bez mezer mezi značkami: z mezery mezi dvěma okénky by se stala mezera v čísle.
// Řády se usazují zprava doleva (--odo-r = řád od jednotek): kdyby desítky dojely k cíli dřív,
// než jednotky přetočí z devítky na nulu, četlo by se chvíli „79 %“ místo „70 %“.
export function odometrHtml(text) {
  const sloupce = odoSloupce(text);
  let rad = sloupce.filter((s) => s.sled).length;
  const kusy = sloupce.map(({ znak, sled }) => {
    if (!sled) return esc(znak);
    rad -= 1;
    return `<span class="odo" style="--odo-r:${Math.min(rad, 4)}"><span class="odo-f">${znak}</span><span class="odo-s" style="--n:${sled.length}">${sled.map((c) => `<span>${c ?? '&nbsp;'}</span>`).join('')}</span></span>`;
  }).join('');
  return `<span class="odo-cislo" aria-hidden="true">${kusy}</span><span class="sr-only">${esc(text)}</span>`;
}

// Čísla nově otevřené obrazovky: animovaná (tween), označená `data-odo` a hodnota uprostřed
// ukazatele. Animovaná čísla se tím rovnou dostanou do cíle, aby je tweenAll nerozpočítal podruhé.
export function nastupCisel(root) {
  const cisla = [];
  for (const el of root.querySelectorAll('[data-tween], [data-odo], .gauge-value:not(.gauge-value--text)')) {
    if (el.firstElementChild) continue;
    let text;
    if (el.dataset.tween) {
      const to = Number(el.dataset.value) || 0;
      tweenMemory.set(el.dataset.tween, to);
      el._tweenTo = to;
      text = formatter(el.dataset.fmt)(to);
    } else {
      text = el.textContent.trim();
    }
    if (!/\d/.test(text) || text.length > 24) continue;
    el.innerHTML = odometrHtml(text);
    el._odo = text;
    cisla.push(el);
  }
  return cisla;
}

// Po nástupu zpátky obyčejný text: dá se vybrat, zkopírovat a čtečka ho přečte jako celek.
export function dokonciCisla(cisla) {
  for (const el of cisla) if (el.isConnected && el._odo && el.querySelector(':scope > .odo-cislo')) el.textContent = el._odo;
}

/* ---------- Toasty, schránka ---------- */

// Jedna zpráva naráz: druhá vždy nahradí první, jinak by se pod sebou hromadily čtyři černé
// pruhy po rychlých klicích. Druh zprávy (ikona a barva) se odvozuje z `tone`:
//   ink (výchozí) = povedlo se, velvet/coral = chyba, info = poznámka bez úspěchu, action = upozornění agenta.
// Jeden název pro jeden druh zprávy. Dřív se pro červený toast používalo 'velvet', 'coral' i 'err'
// (zbytky po starších názvech barev značky) a nešlo poznat, jestli je v tom rozdíl.
const TOAST_KIND = { ink: 'ok', ok: 'ok', err: 'err', info: 'info', action: 'action' };
const TOAST_ICON = () => ({ ok: ICON.check, err: ICON.alert, info: ICON.info, action: ICON.bell });
let toastTimer = 0;

export function toast(message, { tone = 'ink', action, timeout = 4000 } = {}) {
  const box = document.getElementById('toasts');
  if (!box) return;
  // Neznámý tón raději jako poznámka: tvářit se jako úspěch by u chybové hlášky bylo zavádějící.
  const kind = TOAST_KIND[tone] || 'info';
  const prev = box.firstElementChild;
  clearTimeout(toastTimer);
  // Totéž hlášení znovu (třeba opakované „Nabídka obnovena“) jen zopakuje pohyb, nic se nemění.
  if (prev && !prev.classList.contains('is-leaving') && prev.dataset.kind === kind && prev.querySelector('.toast-text')?.textContent === message && !action && !prev.querySelector('.toast-action')) {
    prev.classList.remove('is-bump');
    void prev.offsetWidth;
    prev.classList.add('is-bump');
    if (timeout) toastTimer = setTimeout(() => prev.isConnected && prev.querySelector('.toast-close')?.click(), timeout);
    return;
  }
  box.replaceChildren();
  const el = document.createElement('div');
  el.className = `toast toast--${kind}`;
  el.dataset.kind = kind;
  el.setAttribute('role', kind === 'err' ? 'alert' : 'status');
  el.innerHTML = `<span class="toast-icon" aria-hidden="true">${TOAST_ICON()[kind]}</span><span class="toast-text">${esc(message)}</span>${action ? `<a class="toast-action" href="${esc(action.href)}">${esc(action.label)}</a>` : ''}<button class="toast-close" type="button" aria-label="${tr('Zavřít')}">${ICON.close}</button>`;
  const remove = () => {
    if (!el.isConnected || el.classList.contains('is-leaving')) return;
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 240);
  };
  el.querySelector('.toast-close').addEventListener('click', remove);
  el.querySelector('.toast-action')?.addEventListener('click', remove);
  box.appendChild(el);
  if (timeout) toastTimer = setTimeout(remove, timeout);
}

export async function copy(text, message = tr('Zkopírováno do schránky')) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  toast(message);
}

/* ---------- Sdílené kousky UI ---------- */

export const statusPill = (status) => `<span class="pill" data-status="${esc(status)}"><i></i>${esc(STATUS[status]?.label || status)}</span>`;

export function kindLabel(kind) {
  if (kind === 'permission') return tr('Žádá o povolení');
  if (kind === 'question') return tr('Ptá se tě');
  if (kind === 'plan') return tr('Čeká na schválení plánu');
  return tr('Potřebuje tvé rozhodnutí');
}

export function howToAnswer(s) {
  if (s.source === 'web') return tr('Odpověz přímo v konverzaci v prohlížeči.');
  if (s.connector === 'claude-code') return tr('Odpověz v okně, kde konverzace běží.');
  if (s.connector === 'codex') return tr('Odpověz ve vlákně v Codexu.');
  if (s.connector === 'cursor') return tr('Potvrď akci v Cursoru.');
  if (s.connector === 'vscode-copilot') return tr('Potvrď akci v panelu Copilotu ve VS Code.');
  return tr('Odpověz v aplikaci, kde agent běží.');
}

export const agentHref = (id) => `#/agent/${encodeURIComponent(id)}`;
// Kam vede klik na upozornění. Souhrn nese vlastní cíl (seznam agentů, Útrata…), ostatní vedou
// do konverzace nebo na seznam upozornění. Cíl přijde ze serveru, ale bere se jen tvar „#/…“.
export const alertHref = (a) => (typeof a.route === 'string' && /^#\/[\w/?=&%.-]*$/.test(a.route) ? a.route
  : a.sessionId ? agentHref(a.sessionId) : '#/upozorneni');

export function activityItem(s) {
  const meta = s.status === 'working' && s.activity
    ? `<span class="live-dot" aria-hidden="true"></span>${esc(s.activity)}`
    : s.proces
      ? `${esc(tr('PID {0} · od {1} · bez přepisu', s.proces.pid, timeHM(s.proces.od)))} · ${esc(s.app)}`
      : `<span data-ago="${s.lastAt}">${rel(s.lastAt)}</span> · ${esc(s.app)}`;
  return `<li data-key="${esc(s.id)}"><a class="act-item" href="${agentHref(s.id)}">
    <span class="icon-tile">${glyph(s)}<i class="status-dot status-${esc(s.status)}"></i></span>
    <span class="act-text"><span class="act-title">${esc(s.title)}</span><span class="act-meta"><span class="sr-only">${esc(STATUS[s.status]?.label || '')}, </span>${meta}</span></span>
    <span class="act-value">${sessionTotal(s) ? fmtTok(sessionTotal(s)) : ''}</span>${ICON.chev}
  </a></li>`;
}

export function decisionCard(s) {
  const limited = s.status === 'limited';
  const failed = s.status === 'failed';
  const since = s.failure?.at || s.pending?.at || s.limit?.at || s.lastAt;
  return `<li class="decision${limited ? ' is-limit' : ''}" data-key="${esc(s.id)}">
    <span class="icon-tile">${glyph(s)}</span>
    <div class="decision-body">
      <span class="decision-kicker">${failed ? (s.observation ? tr('Vzdálený agent selhal') : tr('Spuštění selhalo')) : limited ? tr('Vyčerpaný limit') : kindLabel(s.pending?.kind)} · ${esc(s.app)} · <span data-ago="${since}">${rel(since)}</span></span>
      <a class="decision-title" href="${agentHref(s.id)}">${esc(s.title)}</a>
      <p class="decision-reason">${esc(s.reason)}</p>
    </div>
    <div class="decision-actions">
      ${s.open?.length ? openButtons(s, { small: true, max: 2 }) : `<a class="btn btn--sm btn--primary" href="${agentHref(s.id)}">${tr('Detail')}</a>`}
    </div>
  </li>`;
}

// Tlačítka „Otevřít v aplikaci / Pokračovat v Terminálu / Otevřít složku“ – nabídku sestavuje server (session.open).
export function openButtons(s, { small = false, max = 3 } = {}) {
  const labels = {
    'Otevřít v Codexu': tr('Otevřít v Codexu'),
    'Otevřít Claude': tr('Otevřít Claude'),
    'Otevřít v Cursoru': tr('Otevřít v Cursoru'),
    'Otevřít ve VS Code': tr('Otevřít ve VS Code'),
    'Otevřít konverzaci': tr('Otevřít konverzaci'),
    'Pokračovat v Terminálu': tr('Pokračovat v Terminálu'),
    'Otevřít složku': tr('Otevřít složku'),
  };
  const icons = { terminal: ICON.terminal, folder: ICON.folder };
  return (s.open || [])
    .slice(0, max)
    .map((t, i) => {
      const sourceLabel = String(t.label ?? '');
      const label = Object.hasOwn(labels, sourceLabel) ? labels[sourceLabel] : (sourceLabel.startsWith('Přepnout do ') ? tr('Přepnout do {0}', sourceLabel.slice(12)) : sourceLabel);
      const icon = t.id === 'app' ? glyph(s, { onDark: i === 0 }) : icons[t.id] || ICON.open;
      return `<button class="btn${small ? ' btn--sm' : ''}${i === 0 ? ' btn--primary' : ''}" type="button" data-open-target="${esc(t.id)}" data-session-id="${esc(s.id)}">${icon}${esc(label)}</button>`;
    })
    .join('');
}

export function legendHtml(series, { box = false } = {}) {
  return series
    .map((s) => `<button class="legend-item" type="button" data-legend="${esc(s.key)}" aria-pressed="${!s.hidden}"><i class="swatch${box ? ' swatch--box' : ''}" style="background:${s.stroke || s.color}"></i>${esc(s.label)}</button>`)
    .join('');
}

export function emptyState({ title, text = '', action = '' }) {
  return `<div class="empty"><span class="empty-mark" aria-hidden="true"><i></i><i></i><i></i></span><strong>${esc(title)}</strong>${text ? `<p>${text}</p>` : ''}${action}</div>`;
}

export function stateBadge(stateName, label) {
  return `<span class="state" data-state="${esc(stateName)}"><i></i>${esc(label)}</span>`;
}

export function alertIcon(a) {
  if (a.kind === 'needs_input' || a.kind === 'test') return ICON.hand;
  if (a.kind === 'limit' || a.kind === 'limit_near' || a.kind === 'failed' || a.kind === 'system') return ICON.alert;
  if (a.kind === 'limit_reset') return ICON.refresh;
  if (a.kind === 'budget') return ICON.wallet;
  if (a.kind === 'done') return ICON.check;
  if (a.kind === 'digest' && a.digest === 'quiet') return ICON.moon;
  if (a.kind === 'novy-nastroj') return ICON.spark;
  return ICON.bell;
}

export function untilLabel(ts, now = Date.now()) {
  const ms = ts - now;
  if (ms <= 0) return tr('teď');
  const m = Math.ceil(ms / 60e3);
  if (m < 60) return tr('za {0} min', m);
  const h = Math.floor(m / 60);
  if (h < 48) return `${tr('za {0} h', h)}${m % 60 ? ` ${m % 60} min` : ''}`;
  const dny = Math.round(h / 24);
  return dny < 5 ? tr('za {0} dny', dny) : tr('za {0} dní', dny);
}

// Údaje o limitech ze stavového řádku Claude Code jsou přesné; odhady z textu hlášek pak nezobrazujeme.
// Vyčerpání dokoupeného extra usage není okno předplatného – patří na Útratu, ne mezi limity plánu.
export const isSpendLimit = (l) => l.kind === 'spend';

// Živá okna Claude (5 h a týden) mají tři zdroje v tomto pořadí přednosti:
// 1. přesná měření od serveru – stavový řádek Claude Code, uložená stránka Usage v Claude Desktopu
//    a odmítnutí 429 s `quotaLimits` z přepisu (vyčerpáno, přesný čas obnovy);
// 2. čerstvý vzorek historie Claude Desktopu (procenta bez času obnovy, nejvýš 30 minut starý).
// Mezi přesnými vyhrává nejnovější měření (při shodě v pořadí výše). Historie se ukáže jen tehdy,
// když okno žádné čerstvé přesné měření nemá – pozdější vzorek historie přesné měření nepřepíše.
// Na každé okno je jeden řádek. Když vybrané měření samo čas obnovy nenese, převezme ho od přesného
// zdroje jen ve stejném okně; jinak by se připojil konec starého okna.
const OKNO_CLAUDE = /^claude:(five_hour|seven_day)(?::|$)/;
const PORADI_PRESNYCH = ['statusline', 'desktop-usage', 'transcript-quota'];
const PRESNE = new Set(PORADI_PRESNYCH);
const LIMIT_FRESH_MS = 30 * 60e3;
const poradi = (l) => {
  const i = PORADI_PRESNYCH.indexOf(l.source);
  return i < 0 ? PORADI_PRESNYCH.length : i;
};

// Je měření pořád živé? Obecně jen 30 minut: staré procento už nemůže tvrdit, jaký je stav právě teď.
// Výjimka je odmítnutí od serveru s přesným časem obnovy – okno je vyčerpané až do té chvíle,
// i když od hlášky uběhla hodina (Claude Desktop během čekání nic nového nezapíše).
function zive(l, now) {
  if (isSpendLimit(l) || !Number.isFinite(l.at) || now - l.at < -60e3) return false;
  if (Number(l.resetsAt) > 0 && l.resetsAt <= now) return false;
  if (l.source === 'transcript-quota' && l.reached && Number(l.resetsAt) > now) return true;
  return now - l.at <= LIMIT_FRESH_MS;
}

export function currentLimits(limits, now = Date.now()) {
  const fresh = limits.filter((l) => zive(l, now));
  const claudePresne = fresh.some((l) => l.provider === 'anthropic' && PRESNE.has(l.source));
  const okna = new Map();
  const ostatni = [];
  for (const l of fresh) {
    const klic = l.provider === 'anthropic' ? OKNO_CLAUDE.exec(l.id || '')?.[1] : null;
    if (!klic) ostatni.push(l);
    else okna.set(klic, [...(okna.get(klic) || []), l]);
  }
  const slozena = [...okna.values()].map((zaznamy) => {
    const presne = zaznamy.filter((l) => PRESNE.has(l.source));
    const kandidati = presne.length ? presne : zaznamy;
    const nejnovejsi = kandidati.reduce((a, b) => (b.at > a.at || (b.at === a.at && poradi(b) < poradi(a)) ? b : a));
    if (nejnovejsi.resetsAt || !PRESNE.has(nejnovejsi.source)) return nejnovejsi;
    const presny = presne
      .filter((l) => l.resetsAt && l.resetsAt > nejnovejsi.at)
      .reduce((a, b) => (!a || b.at > a.at ? b : a), null);
    return presny ? { ...nejnovejsi, resetsAt: presny.resetsAt } : nejnovejsi;
  });
  // Hlášky „hit your limit“ jsou odhad z textu; přesná okna je nahrazují.
  return [...slozena, ...ostatni.filter((l) => !(claudePresne && l.provider === 'anthropic' && !PRESNE.has(l.source)))];
}

// Čas obnovy se zobrazuje jen tehdy, když jej poslal zdroj jako konkrétní čas.
export function limitObnova(l, now = Date.now()) {
  const presne = Number(l.resetsAt) > 0 ? Number(l.resetsAt) : 0;
  if (presne && presne > now) return { kdy: presne, presne: true, probehla: false, text: tr('obnova {0}', resetsLabel(presne, now)) };
  if (presne) return { kdy: presne, presne: true, probehla: true, text: tr('obnoveno {0}', resetsLabel(presne, now)) };
  // Historie Claude Desktopu čas obnovy nenese. Říkáme to i s tím, odkud procento je – nedopočítává se.
  if (l.source === 'plan-history') return { kdy: 0, presne: false, probehla: false, text: tr('obnova neznámá · podle Claude Desktopu') };
  return { kdy: 0, presne: false, probehla: false, text: tr('čas obnovy zdroj neuvádí') };
}

// Poznámka k dokupovanému využití – jen když ji zdroj výslovně poslal (`quotaLimits`).
export function limitPoznamka(l) {
  if (l?.overage === 'on') return tr('dokupované využití zapnuté');
  if (l?.overage === 'off') return tr('dokupované využití vypnuté');
  return '';
}

// Stav jednoho okna limitu. Jedno místo pro všechna tři zobrazení (Přehled, Statistiky,
// rozbalený seznam nástrojů) – dřív každé počítalo vlastní popis a u obnoveného okna Codexu
// stálo na Přehledu „0 %“, ve Statistikách „Obnoven“ a v API pořád poslední naměřených 34 %.
// „0 %“ je přitom tvrzení o měření, které po obnově neproběhlo: okno je prázdné, ale změřené není.
// Kdy byl limit změřený, pokud už to není „teď“. Okno se od té doby mohlo změnit a číslo bez data
// by se četlo jako současný stav – týdenní limit Codexu tak 20 hodin po odečtu svítil jako živý.
export function limitAge(l, now = Date.now()) {
  return l.at && now - l.at > 2 * 60e3 ? `${tr('změřeno')} ${rel(l.at, now)}` : '';
}

// Kdy byl zůstatek kreditů zjištěný. Jedno místo pro Přehled, Statistiky i Útratu – číslo bez data
// se četlo jako současný stav, i když pocházelo z měsíc starého odečtu. Nad dva dny se zvýrazní.
export function creditAge(c, now = Date.now()) {
  if (!Number.isFinite(c?.at)) return null;
  return { text: `${tr('zjištěno')} ${rel(c.at, now)}`, kratce: rel(c.at, now), stary: now - c.at > 2 * DAY };
}
export function creditAgeHtml(c, now = Date.now()) {
  const v = creditAge(c, now);
  return v ? `<span class="${v.stary ? 'je-stare' : ''}">${esc(v.text)}</span>` : '';
}

export function limitState(l, now = Date.now()) {
  // Obnovu odvozujeme jen z přesného času od zdroje. Stará nebo interní historická měření
  // filtruje currentLimits dřív, než se k vykreslení vůbec dostanou.
  const renewed = limitObnova(l, now).probehla;
  const reached = Boolean(l.reached) && !renewed;
  const pct = renewed ? 0 : reached ? 100 : Math.round(Number(l.usedPercent) || 0);
  return {
    renewed,
    reached,
    pct,
    // Co se ukáže místo čísla. Obnovené okno se nehlásí jako „0 %“, vyčerpané jako „100 %“.
    label: renewed ? tr('Obnoveno') : reached ? tr('Vyčerpáno') : `${pct} %`,
    tone: renewed ? 'free' : pct >= 95 ? 'out' : pct >= 80 ? 'low' : 'free',
    // Po obnově nikdo nové vytížení nezměřil – „plná kapacita“ ani „právě“ by nebyla pravda.
    advice: renewed ? tr('Limit se od posledního měření obnovil, nový stav zatím nepřišel')
      : reached || pct >= 100 ? tr('Vyčerpáno, počkej na obnovu')
        : pct >= 80 ? tr('Šetři na důležité úlohy')
          : pct >= 50 ? tr('V pohodě pro běžnou práci') : tr('Dobrý čas na velké úlohy'),
  };
}

// Přesný budoucí čas má i odpočet („za 2 h 13 min“), který se překresluje každou minutu.
export function obnovaHtml(l, now = Date.now()) {
  const o = limitObnova(l, now);
  if (o.presne && !o.probehla) return `<span class="lwin-reset">${tr('obnova')} <span data-until="${o.kdy}">${untilLabel(o.kdy, now)}</span> · ${esc(resetsLabel(o.kdy, now))}</span>`;
  return `<span class="lwin-reset${o.kdy ? '' : ' is-unknown'}">${esc(o.text)}</span>`;
}

// Okna limitů: kolik je vyčerpáno, kdy se obnoví a co z toho plyne pro práci.
export function limitWindows(limits, now = Date.now()) {
  const rows = currentLimits(limits, now)
    .filter((l) => typeof l.usedPercent === 'number' || l.reached)
    .sort((a, b) => (a.windowMinutes || 1e9) - (b.windowMinutes || 1e9) || a.app.localeCompare(b.app));
  if (!rows.length) return '';
  return `<ul class="lwin">${rows.map((l) => {
    const { pct, tone, advice, label } = limitState(l, now);
    return `<li class="lwin-row" data-tone="${tone}">
      <span class="lwin-logo">${glyph(l.id.startsWith('codex') ? { connector: 'codex' } : l.provider)}</span>
      <span class="lwin-main">
        <span class="lwin-top"><b>${esc(l.app)} · ${esc(l.label)}</b><span class="lwin-pct${/\d/.test(label) ? '' : ' lwin-pct--text'}">${esc(label)}</span></span>
        <span class="lwin-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="${esc(`${l.app} ${l.label}`)}"><i style="width:${pct}%"></i></span>
        <span class="lwin-sub"><span>${esc([advice, limitPoznamka(l)].filter(Boolean).join(' · '))}</span>${obnovaHtml(l, now)}${limitAge(l, now) ? `<span class="lwin-age">${esc(limitAge(l, now))}</span>` : ''}</span>
      </span>
    </li>`;
  }).join('')}</ul>`;
}

export function limitGauges(limits, now, { size = 'md', provider } = {}) {
  // Stejná přednost zdrojů jako v `currentLimits`: jakmile dorazí přesná data ze stavového řádku,
  // záložní historie se skryje. Jinak by u jednoho limitu svítila dvě různá čísla.
  return currentLimits(limits, now)
    .filter((l) => !provider || l.provider === provider)
    .map((l) => {
      const s = limitState(l, now);
      const cerstve = s.reached && now - l.at < 7 * DAY;
      if (!cerstve && (now - l.at > 7 * DAY || typeof l.usedPercent !== 'number')) return null;
      const color = s.tone === 'out' ? 'var(--velvet-ink)' : s.tone === 'low' ? 'var(--brass)' : 'var(--teal)';
      const sub = limitObnova(l, now).text;
      // Stáří na vlastním řádku; po šesti hodinách zvýrazněné, protože limity se mění rychle.
      const age = limitAge(l, now);
      return { at: l.at, html: gauge({ pct: s.pct, color, value: s.label, label: `${l.app} · ${l.label}`, sub, note: limitPoznamka(l), age, stare: now - l.at > 6 * 3600e3, size, reached: s.reached }) };
    })
    .filter(Boolean)
    .sort((a, b) => b.at - a.at)
    .map((x) => x.html);
}

/* ---------- Modální dialog ---------- */

function clearErrors(form) {
  for (const el of form.querySelectorAll('.field-error')) el.remove();
  for (const el of form.querySelectorAll('[aria-invalid]')) {
    el.removeAttribute('aria-invalid');
    el.removeAttribute('aria-describedby');
  }
  const fe = form.querySelector('.form-error');
  if (fe) fe.hidden = true;
}

function markErrors(form, errors) {
  let first = null;
  for (const [name, msg] of Object.entries(errors || {})) {
    const key = name.replace(/^services\./, 'svc_').replace(/^rates\./, 'rate_');
    const field = form.elements.namedItem(key);
    if (!field || !field.insertAdjacentHTML) continue;
    const id = `err-${key}`;
    field.setAttribute('aria-invalid', 'true');
    field.setAttribute('aria-describedby', id);
    field.insertAdjacentHTML('afterend', `<span class="field-error" id="${id}">${esc(msg)}</span>`);
    first = first || field;
  }
  (first?.classList.contains('picker-source') ? first.nextElementSibling : first)?.focus();
}

// `size` přidá variantu okna (např. 'reader' pro čtení souboru), `footer` nahradí výchozí dvojici
// tlačítek vlastním obsahem a `onOpen` dostane kořen okna hned po vložení do stránky –
// díky tomu má i vlastní patička kde navěsit obsluhu, aniž by se duplikovala práce s Esc,
// zámkem tabulátoru a vrácením zaostření.
export function modal({ title, body, submitLabel = tr('Uložit'), cancelLabel = tr('Zrušit'), danger = false, onSubmit, wide = false, size = '', footer = null, onOpen = null, opener: openerOverride = null }) {
  return new Promise((resolve) => {
    const opener = openerOverride || document.activeElement;
    const id = `m-${Math.random().toString(36).slice(2, 8)}`;
    const scrim = document.createElement('div');
    scrim.className = 'modal-scrim';
    scrim.innerHTML = `<div class="modal${wide ? ' modal--wide' : ''}${size ? ` modal--${size}` : ''}" role="dialog" aria-modal="true" aria-labelledby="${id}">
      <form novalidate>
        <header class="modal-head"><h2 id="${id}">${esc(title)}</h2><button type="button" class="icon-btn" data-close aria-label="${tr('Zavřít')}">${ICON.close}</button></header>
        <div class="modal-body">${body}</div>
        <p class="form-error" role="alert" hidden></p>
        <footer class="modal-foot">${footer ?? `<button type="button" class="btn" data-close>${esc(cancelLabel)}</button><button type="submit" class="btn ${danger ? 'btn--danger' : 'btn--primary'}">${esc(submitLabel)}</button>`}</footer>
      </form>
    </div>`;
    document.body.appendChild(scrim);
    document.body.classList.add('has-modal');
    const form = scrim.querySelector('form');
    const submit = form.querySelector('[type="submit"]');
    let closed = false;

    const close = (result) => {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKey, true);
      scrim.classList.add('is-closing');
      setTimeout(() => scrim.remove(), 180);
      document.body.classList.remove('has-modal');
      if (opener?.isConnected) opener.focus();
      resolve(result);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close(false);
      } else if (e.key === 'Tab') {
        const f = [...scrim.querySelectorAll('button, input, select, textarea, a[href]')].filter((x) => !x.disabled && x.offsetParent !== null);
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    };
    document.addEventListener('keydown', onKey, true);
    onOpen?.(scrim, close);
    // Zavření až po clicku brání tomu, aby se po mousedown overlay odstranil a
    // zbytek gesta propadl na tlačítko pod ním.
    scrim.addEventListener('click', (e) => { if (e.target === scrim) close(false); });
    for (const b of scrim.querySelectorAll('[data-close]')) b.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      close(false);
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearErrors(form);
      if (!onSubmit) { close(true); return; }
      submit.disabled = true;
      submit.classList.add('is-busy');
      try {
        const r = await onSubmit(form);
        if (r !== false) close(r ?? true);
      } catch (err) {
        if (err.errors) markErrors(form, err.errors);
        const fe = form.querySelector('.form-error');
        fe.textContent = err.message;
        fe.hidden = false;
      } finally {
        submit.disabled = false;
        submit.classList.remove('is-busy');
      }
    });
    requestAnimationFrame(() => (form.querySelector('.modal-body input, .modal-body .picker-trigger, .modal-body textarea') || submit || scrim.querySelector('button')).focus());
  });
}

export const confirmDialog = ({ title, message, confirmLabel = tr('Potvrdit'), danger = false }) =>
  modal({ title, body: `<p class="modal-text">${esc(message)}</p>`, submitLabel: confirmLabel, danger });

/* ---------- Paleta příkazů ---------- */

export function createPalette(getItems, onPick) {
  const root = document.createElement('div');
  root.className = 'palette';
  root.hidden = true;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', tr('Rychlé hledání'));
  root.innerHTML = `<div class="palette-box">
    <div class="palette-input">${ICON.search}<input type="text" placeholder="${tr('Hledat agenta, projekt nebo sekci…')}" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="true" aria-controls="palette-list" aria-autocomplete="list"><kbd>Esc</kbd></div>
    <ul class="palette-list" id="palette-list" role="listbox"></ul>
  </div>`;
  document.body.appendChild(root);
  const input = root.querySelector('input');
  const list = root.querySelector('ul');
  let items = [];
  let index = 0;
  let opener = null;

  const setActive = ({ scroll = true } = {}) => {
    for (const option of list.querySelectorAll('[data-i]')) {
      option.setAttribute('aria-selected', String(Number(option.dataset.i) === index));
    }
    input.setAttribute('aria-activedescendant', items.length ? `pl-${index}` : '');
    if (scroll) list.querySelector(`#pl-${index}`)?.scrollIntoView({ block: 'nearest' });
  };

  const render = () => {
    items = getItems(input.value);
    index = Math.min(index, Math.max(0, items.length - 1));
    let group = '';
    list.innerHTML = items.length
      ? items.map((it, i) => {
        const head = it.group !== group ? `<li class="pl-group" role="presentation">${esc((group = it.group))}</li>` : '';
        return `${head}<li role="option" id="pl-${i}" data-i="${i}" aria-selected="${i === index}">${it.icon || ''}<span class="pl-text"><span>${esc(it.label)}</span>${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</span></li>`;
      }).join('')
      : `<li class="pl-group" role="presentation">${tr('Nic nenalezeno')}</li>`;
    setActive();
  };
  const close = () => {
    if (root.hidden) return;
    root.hidden = true;
    // Stránka pod překryvem se smí zase posouvat, až když překryv zmizí.
    document.body.classList.remove('has-modal');
    if (opener?.isConnected) opener.focus();
  };
  const pick = (i) => {
    const it = items[i];
    if (!it) return;
    root.hidden = true;
    onPick(it);
  };

  input.addEventListener('input', () => { index = 0; render(); });
  // Capture chrání Escape i tehdy, když je fokus v comboboxu nebo v jiném
  // vloženém ovládacím prvku palety.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || root.hidden) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    close();
  }, true);
  root.addEventListener('keydown', (e) => {
    const n = Math.max(1, items.length);
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); index = (index + 1) % n; render(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); index = (index - 1 + n) % n; render(); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(index); }
    else if (e.key === 'Tab') { e.preventDefault(); input.focus(); }
  });
  list.addEventListener('click', (e) => {
    const li = e.target.closest('[data-i]');
    if (li) pick(Number(li.dataset.i));
  });
  list.addEventListener('pointerover', (e) => {
    const li = e.target.closest('[data-i]');
    if (!li || !list.contains(li)) return;
    const next = Number(li.dataset.i);
    if (next !== index) { index = next; setActive(); }
  });
  // Stejná ochrana jako u modalu: neodstraňuj overlay v půlce gesta.
  root.addEventListener('click', (e) => { if (e.target === root) close(); });

  return {
    open() {
      opener = document.activeElement;
      root.hidden = false;
      // Vyhledávání překrývá celou stránku, takže pod ním nemá co rolovat. Bez tohohle zámku se
      // po dojetí seznamu na konec začala posouvat stránka vzadu – kolečko patří tomu, co je navrchu.
      document.body.classList.add('has-modal');
      input.value = '';
      index = 0;
      render();
      input.focus();
    },
    close,
    get isOpen() { return !root.hidden; },
  };
}

export function switchRow({ key, label, desc = '', checked, disabled = false }) {
  return `<div class="set-row">
    <div class="set-row-text"><span class="set-label" id="lbl-${esc(key)}">${esc(label)}</span>${desc ? `<p class="set-desc">${desc}</p>` : ''}</div>
    <button class="switch" type="button" role="switch" aria-checked="${Boolean(checked)}" aria-labelledby="lbl-${esc(key)}" data-setting="${esc(key)}"${disabled ? ' disabled' : ''}></button>
  </div>`;
}
