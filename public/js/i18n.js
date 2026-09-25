// Jazyk rozhraní. Zdrojem textů je čeština přímo v kódu; tr() ji v angličtině přeloží podle
// slovníku v i18n/en.js. Chybějící překlad se ukáže česky – nikdy prázdně –, a test
// (test/i18n.test.mjs) hlídá, že žádný nechybí.
//
// Jazyk vybírá uživatel v Nastavení a ukládá ho server. Ten ho vepíše do <html lang> už při
// vydání stránky (src/http.js), takže rozhraní naběhne rovnou ve správném jazyce, bez
// probliknutí češtiny. Změna jazyka stránku znovu načte: texty vznikají i při načtení modulů.

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
