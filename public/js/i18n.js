// Jazyk rozhraní. Zdrojem textů je čeština přímo v kódu; tr() ji v angličtině přeloží podle
// slovníku v i18n/en.js. Chybějící překlad se ukáže česky – nikdy prázdně –, a test
// (test/i18n.test.mjs) hlídá, že žádný nechybí.
//
// Jazyk vybírá uživatel v Nastavení a ukládá ho server. Ten ho vepíše do <html lang> už při
// vydání stránky (src/http.js), takže rozhraní naběhne rovnou ve správném jazyce, bez
// probliknutí češtiny. Změna jazyka stránku znovu načte: texty vznikají i při načtení modulů.

import { SYSTEM } from './system.js';

const html = globalThis.document?.documentElement;
const lang = html?.lang === 'en' ? 'en' : 'cs';
const slovnik = lang === 'en' ? (await import('./i18n/en.js')).default : null;

export const JAZYKY = ['cs', 'en'];
export const jazyk = () => lang;
// Formát čísel a dat. Angličtina bere britský zápis: den před měsícem jako v Česku.
export const LOCALE = lang === 'en' ? 'en-GB' : 'cs-CZ';

/**
 * Přeloží český text. Proměnné se píšou jako {0}, {1}… a dosazují se až po překladu, takže
 * angličtina může mít jiný slovosled. Do HTML jdou jen statické texty ze slovníku; proměnné
 * s cizími daty musí volající projít esc() jako kdekoli jinde.
 */
export function tr(text, ...args) {
  const s = slovnik ? (slovnik.texty[text] ?? text) : text;
  return args.length ? s.replace(/\{(\d+)\}/g, (m, i) => (i < args.length ? String(args[i]) : m)) : s;
}

/**
 * Tvar slova podle počtu. Čeština má tři (1 / 2–4 / 5+), angličtina dva; anglické tvary jsou ve
 * slovníku pod trojicí českých.
 */
export function mnozne(n, one, few, many) {
  const a = Math.abs(n);
  if (slovnik) {
    const en = slovnik.mnozne[`${one}|${few}|${many}`];
    if (en) return a === 1 ? en[0] : en[1];
  }
  return a === 1 ? one : a >= 2 && a <= 4 ? few : many;
}

/** Hodnota podle jazyka tam, kde nejde o překlad věty (pořadí, jednotky, celé seznamy). */
export const podleJazyka = (cs, en) => (lang === 'en' ? en : cs);

// Počítač, na kterém Agenteeq běží (public/js/system.js). Na Macu „Mac“, jinde „počítač“ – na
// Windows ani Linuxu by „tento Mac“ nebyla pravda. Věty ho dostávají jako proměnnou:
// tr('Běží na {0}', tomtoPocitaci()). Čeština skloňuje, proto je pomocník pro každý pád, který
// věty potřebují; angličtina má jeden tvar (this Mac / this computer – stejně jako texty, které
// skládá server podle src/platform.js#POCITAC).
const JE_MAC_POCITAC = SYSTEM === 'macos';
const EN_POCITAC = JE_MAC_POCITAC ? 'Mac' : 'computer';
const pocitac = (mac, jiny, en) => podleJazyka(JE_MAC_POCITAC ? mac : jiny, en);
/** 1. a 4. pád: „tento Mac“ / „tento počítač“ – this Mac. */
export const tentoPocitac = () => pocitac('tento Mac', 'tento počítač', `this ${EN_POCITAC}`);
/** 2. pád: „tohoto Macu“ / „tohoto počítače“ – this Mac. */
export const tohotoPocitace = () => pocitac('tohoto Macu', 'tohoto počítače', `this ${EN_POCITAC}`);
/** 3. pád: „tomuto Macu“ / „tomuto počítači“ – this Mac. */
export const tomutoPocitaci = () => pocitac('tomuto Macu', 'tomuto počítači', `this ${EN_POCITAC}`);
/** 6. pád: „tomto Macu“ / „tomto počítači“ – this Mac. */
export const tomtoPocitaci = () => pocitac('tomto Macu', 'tomto počítači', `this ${EN_POCITAC}`);
/** 1. pád, přivlastňovací: „tvůj Mac“ / „tvůj počítač“ – your Mac. */
export const tvujPocitac = () => pocitac('tvůj Mac', 'tvůj počítač', `your ${EN_POCITAC}`);
/** 2. pád, přivlastňovací: „tvého Macu“ / „tvého počítače“ – your Mac. */
export const tvehoPocitace = () => pocitac('tvého Macu', 'tvého počítače', `your ${EN_POCITAC}`);
/** 6. pád, přivlastňovací: „tvém Macu“ / „tvém počítači“ – your Mac. */
export const tvemPocitaci = () => pocitac('tvém Macu', 'tvém počítači', `your ${EN_POCITAC}`);
/**
 * Název systému za „podle“ / „nastavením“: macOS, Windows, jinde obecně „systému“ (the system).
 * Jména systémů se neskloňují, takže stačí jeden tvar.
 */
export const podleSystemu = () => (SYSTEM === 'macos' ? 'macOS' : SYSTEM === 'windows' ? 'Windows' : podleJazyka('systému', 'the system'));
/** Velké první písmeno pro začátek věty: sVelkym(tentoPocitac()) → „Tento Mac“ / „This Mac“. */
export const sVelkym = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);
