// Texty, které server posílá do rozhraní (chybové hlášky, stavy zdrojů, popisky, poznámky).
//
// Zdrojem je čeština přímo v kódu, stejně jako v klientu. Server ji posílá tak, jak je, a klient ji
// v angličtině přeloží podle slovníku public/js/i18n/en-server.js (public/js/i18n.js#trServer) – na
// jednom místě, kudy data ze serveru vstupují (public/js/state.js, public/js/api.js). Tvar dat se
// proto nemění: API, stream, rozšíření i uložená upozornění zůstávají, jak byla.
//
// ui() označuje text jako text rozhraní. Test úplnosti (test/i18n.test.mjs) z těchto značek sestaví
// seznam a hlídá, že každý má anglický překlad a že v src/ nevzniká český text mimo ně. Proměnné
// se píšou jako {0}, {1}… a dosazují se tady; klient pak celou větu pozná podle vzoru a v angličtině
// ji složí s týmiž hodnotami (i v jiném pořadí).
//
// Pravidla pro vzory: vzor musí mít pevný text, nejen proměnné, a tvary podle počtu se nepíšou jako
// proměnná – jeden tvar = jeden text (viz src/app.js, konverzace). Výjimkou je „Popisek: obsah“
// (činnost agenta „Spouští příkaz: npm test“): stačí označit popisek, klient přeloží část před dvojtečkou.
import EN from '../public/js/i18n/en.js';
import { vytvorPrekladac } from '../public/js/texty-serveru.js';

export function ui(text, ...args) {
  return args.length ? text.replace(/\{(\d+)\}/g, (m, i) => (i < args.length ? String(args[i]) : m)) : text;
}

const anglicky = {};
/**
 * Překladač pro to, co server posílá mimo rozhraní – oznámení systému (src/alerts.js), CSV exporty,
 * stránky pro prohlížeč. Rozhraní si texty překládá samo; tady se použije tentýž slovník i tatáž
 * pravidla (public/js/texty-serveru.js, bez DOM). Pro češtinu vrací text beze změny.
 *
 * `jenServer`: jen slovník textů ze serveru (ui()), bez textů klientu. Pro pole, kde vedle textu
 * aplikace může stát i text od uživatele – název konverzace „Konverzace bez názvu“ se přeloží,
 * název „Moje“ zůstane, i když ho rozhraní jinde používá jako popisek.
 */
export function prekladac(jazyk, { jenServer = false } = {}) {
  if (jazyk !== 'en') return (text) => text;
  const klic = jenServer ? 'server' : 'vse';
  anglicky[klic] ??= vytvorPrekladac(EN.server, jenServer ? {} : EN.texty, 'en-GB');
  return anglicky[klic];
}
