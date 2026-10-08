// Vyhledávání v aplikaci (⌘K): kromě agentů a projektů zná i stránky, sekce uvnitř stránek,
// karty Nastavení a jednotlivé přepínače. Každý cíl má cestu (route), volitelně oblast stránky
// (`data-region`), kartu Nastavení a klíč přepínače – vybraný výsledek na ně rovnou skočí
// (public/js/jump.js). Čistě datový modul bez DOM, aby šel testovat v Node (test/hledani.test.mjs).
//
// Hledá se bez ohledu na diakritiku a velikost písmen, po slovech a i podle tvaru slova:
// „limity“ najde „Okna limitů“ i „Docházející limit“, „limty“ s překlepem taky. Synonyma
// (`slova`) jsou česky i anglicky, protože aplikace má obě jazykové verze; nezobrazují se.
import { tr } from './i18n.js';
import { norm } from './format.js';
import { JE_MAC } from './system.js';

const NASTAVENI = () => tr('Nastavení');

// Stránky: [id, route, popisek, synonyma].
const STRANKY = () => [
  ['prehled', tr('Přehled'), 'domu home dashboard start hlavni overview nastenka'],
  ['upozorneni', tr('Upozornění'), 'notifikace oznameni zvonecek alerts notifications'],
  ['agenti', tr('Agenti'), 'sessions konverzace chaty relace agents seznam'],
  ['projekty', tr('Projekty'), 'klienti zakazky slozky projects'],
  ['statistiky', tr('Statistiky'), 'grafy analytika tokeny vyuziti stats statistics usage'],
  ['utrata', tr('Útrata'), 'naklady penize platby vydaje faktury spend costs billing'],
  ['dovednosti', tr('Dovednosti'), 'skills prikazy slash commands'],
  ['nastaveni', tr('Nastavení'), 'settings preferences konfigurace volby'],
];

// Sekce uvnitř stránek: [stránka, data-region, popisek, synonyma, tlačítko k otevření?].
const SEKCE = () => [
  ['prehled', 'decisions', tr('Potřebuje tvé rozhodnutí'), 'ceka povoleni schvaleni otazka needs input approval permission'],
  ['prehled', 'timeline', tr('Dnešní směna'), 'casova osa dnes prubeh timeline today'],
  ['prehled', 'chart', tr('Tokeny z přepisů'), 'graf tokens chart'],
  ['prehled', 'today-apps', tr('Kam dnes šly tokeny'), 'dnes aplikace tokeny today apps'],
  ['prehled', 'limits', tr('Limity předplatných'), 'limit limity okna kvota 5hodinovy tydenni predplatne quota usage limits plan'],
  ['prehled', 'spend', tr('Náklady z API'), 'api naklady cena utrata cost'],
  ['prehled', 'activity', tr('Poslední aktivita'), 'historie nedavne posledni activity recent'],
  ['statistiky', 'chart', tr('Tokeny podle poskytovatele'), 'poskytovatel graf anthropic openai google tokens provider'],
  ['statistiky', 'heat', tr('Kdy agenti pracují'), 'heatmapa hodiny dny tydne cas heatmap hours'],
  ['statistiky', 'projects', tr('Tokeny podle složky'), 'slozka projekt folder project'],
  ['statistiky', 'apps', tr('Tokeny podle aplikace'), 'aplikace nastroj app tool'],
  ['statistiky', 'models', tr('Tokeny podle modelu'), 'model opus sonnet gpt gemini models'],
  ['statistiky', 'limits', tr('Limity a kredity'), 'limit limity kredity kvota 5hodinovy tydenni predplatne historie mereni quota credits usage limits'],
  ['utrata', 'plans', tr('Zjištěné plány'), 'plan predplatne pro max plus team subscription plans'],
  ['utrata', 'provider-accounts', tr('Účty nástrojů'), 'ucty licence ucet accounts licenses'],
  ['utrata', 'budgets', tr('Rozpočty'), 'rozpocet limit utraty mesicni budget budgets', '[data-action="budgets"]'],
  ['utrata', 'credits', tr('Kredity a čerpání'), 'kredity zustatek cerpani credits balance'],
  ['utrata', 'analytics', tr('Posledních 6 měsíců'), 'mesice trend historie months'],
  ['utrata', 'analytics', tr('Rozložení nákladů'), 'rozlozeni druhy kategorie breakdown'],
  ['utrata', 'ledger-section', tr('Záznamy nákladů'), 'zaznamy vydaje platby faktury export csv ledger expenses payments'],
  ['projekty', 'suggest', tr('Návrhy ze složek, kde pracují agenti'), 'navrhy slozky suggestions folders'],
];

// Karty Nastavení: [data-region karty, skupina, popisek, synonyma].
const KARTY = () => [
  ['models', tr('Propojení'), tr('Napojené modely'), 'napojit prihlasit login claude codex modely models connect'],
  ['claude', tr('Propojení'), tr('Propojení s Claude Code'), 'hooky hooks claude code integrace statusline'],
  ['extension', tr('Propojení'), tr('Rozšíření pro Chrome'), 'rozsireni chrome prohlizec parovani webove chaty chatgpt extension browser pairing'],
  ['connectors', tr('Propojení'), tr('Zdroje agentů'), 'zdroje konektory cursor copilot gemini vscode sources connectors'],
  ['moje', tr('Propojení'), tr('Moje nástroje'), 'nastroje zachycene detekce my tools'],
  ['custom', tr('Propojení'), tr('Vlastní agenti'), 'vlastni agent comfyui ollama openai server custom agents'],
  ['notifications', tr('Upozornění'), tr('Kdy a jak tě upozornit'), 'upozorneni oznameni notifikace zvuk notifications alerts'],
  ['account', tr('Účet a vzhled'), tr('Účet Agenteeq'), 'ucet google prihlaseni odhlaseni synchronizace sync account login logout'],
  ['appearance', tr('Účet a vzhled'), tr('Vzhled'), 'vzhled motiv tema tmavy svetly rezim usvit pulnoc slonovina eben dark light mode theme appearance'],
  ['language', tr('Účet a vzhled'), tr('Jazyk aplikace'), 'jazyk cestina anglictina english czech language'],
  ['profile', tr('Účet a vzhled'), tr('Profilový obrázek'), 'avatar fotka obrazek profil picture'],
  ['license', tr('Účet a vzhled'), tr('Licence'), 'licence klic pro aktivace license key'],
  ['cloud', tr('Náklady za API'), tr('Náklady za API'), 'api admin klic naklady anthropic openai admin key costs'],
  ['system', NASTAVENI, tr('Spouštění po přihlášení'), 'spousteni start autostart prihlaseni pozadi dock login items background'],
  ['updates', NASTAVENI, tr('Aktualizace'), 'aktualizace verze nova update version upgrade'],
  ['phone', NASTAVENI, tr('Otevřít na telefonu'), 'telefon mobil iphone android qr phone mobile'],
  ['tailscale', NASTAVENI, tr('Přístup přes Tailscale'), 'tailscale vpn sit tailnet network'],
  ['remote', NASTAVENI, tr('Mimo domov'), 'tunel vzdaleny pristup cloudflare ngrok remote tunnel'],
  ['share', NASTAVENI, tr('Instalace pro další lidi'), 'sdilet instalace kolegove share install'],
  ['privacy', NASTAVENI, tr('Soukromí a bezpečnost'), 'soukromi bezpecnost data gdpr privacy security'],
  ['help', NASTAVENI, tr('Nápověda a zkratky'), 'napoveda zkratky klavesy pomoc help shortcuts keyboard'],
];

// Jednotlivé přepínače: [karta, data-setting, popisek, synonyma].
const PREPINACE = () => [
  ['notifications', 'native', JE_MAC ? tr('Oznámení v macOS') : tr('Oznámení systému'), 'oznameni system macos windows native'],
  ['notifications', 'needsInput', tr('Agent potřebuje tvé rozhodnutí'), 'rozhodnuti povoleni schvaleni needs input'],
  ['notifications', 'limits', tr('Docházející limit předplatného'), 'limit limity dochazi vycerpani 80 95 limits'],
  ['notifications', 'limitReset', tr('Obnovený limit'), 'limit obnoveni reset'],
  ['notifications', 'budget', tr('Rozpočet'), 'rozpocet budget'],
  ['notifications', 'detekce', tr('Nově zachycený agent'), 'detekce novy nastroj detection'],
  ['notifications', 'done', tr('Dokončený úkol'), 'hotovo dokonceno done finished'],
  ['notifications', 'quietHours', tr('Noční ticho'), 'ticho noc nerusit spanek quiet hours do not disturb'],
  ['notifications', 'push-telefon', tr('Upozornění na tento telefon'), 'telefon mobil iphone android push notifikace phone mobile'],
  ['appearance', 'appearanceSystem', tr('Střídat podle systému'), 'automaticky system tmavy svetly auto dark mode'],
  ['appearance', 'pomocnikZobrazit', tr('Pomocník'), 'pomocnik asistent chat robot tlacitko skryt schovat assistant helper'],
];

/**
 * Všechny cíle vyhledávání. Každý: { id, druh: 'stranka'|'sekce'|'nastaveni', label, kde, slova,
 * route, region?, karta?, prepinac?, klik? }. `klik` je tlačítko, které cíl otevře (dialog). `kde` je cesta k cíli, jak ji uživatel uvidí pod názvem.
 */
export function cileHledani() {
  const stranky = STRANKY();
  const nazev = Object.fromEntries(stranky.map(([id, label]) => [id, label]));
  const nastaveni = NASTAVENI();
  const skupina = (s) => (typeof s === 'function' ? s() : s);
  return [
    ...stranky.map(([id, label, slova]) => ({ id: `stranka:${id}`, druh: 'stranka', label, kde: '', slova, route: `#/${id}` })),
    ...SEKCE().map(([stranka, region, label, slova, klik]) => ({ id: `sekce:${stranka}:${region}:${label}`, druh: 'sekce', label, kde: nazev[stranka], slova, route: `#/${stranka}`, region, ...(klik ? { klik } : {}) })),
    ...KARTY().map(([karta, sk, label, slova]) => {
      const s = skupina(sk);
      return { id: `karta:${karta}`, druh: 'nastaveni', label, kde: s === nastaveni ? nastaveni : `${nastaveni} › ${s}`, slova, route: '#/nastaveni', karta };
    }),
    ...PREPINACE().map(([karta, prepinac, label, slova]) => {
      const k = KARTY().find(([id]) => id === karta);
      return { id: `prepinac:${prepinac}`, druh: 'nastaveni', label, kde: `${nastaveni} › ${k[2]}`, slova, route: '#/nastaveni', karta, prepinac };
    }),
  ];
}

/* ---------- Shoda a pořadí ---------- */

const slovaZ = (text) => norm(text).split(/[^\p{L}\p{N}]+/u).filter(Boolean);

// Překlep o jeden znak (záměna, vynechání, přidání, přehozená dvojice) – Damerauova vzdálenost ≤ 1.
function jedenPreklep(a, b) {
  if (a === b) return true;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0;
  while (i < la && i < lb && a[i] === b[i]) i++;
  if (la === lb) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true;
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
  }
  return la > lb ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

// Jak dobře jedno hledané slovo sedí na jedno slovo textu (0 = vůbec).
function shodaSlova(q, w) {
  if (w === q) return 1;
  if (w.startsWith(q)) return 0.9;
  // Tvar slova: „limity“ ~ „limitu“ ~ „limit“. Společný začátek aspoň 4 znaky a liší se jen koncovka.
  let p = 0;
  while (p < q.length && p < w.length && q[p] === w[p]) p++;
  if (p >= 4 && p >= q.length - 2 && p >= w.length - 3) return 0.8;
  if (q.length >= 3 && w.includes(q)) return 0.55;
  if (q.length >= 4 && (jedenPreklep(q, w) || jedenPreklep(q, w.slice(0, q.length)))) return 0.5;
  return 0;
}

/**
 * Skóre shody dotazu s textovými poli (vyšší = lepší, 0 = neshoduje se). `pole` je seznam
 * [text, váha]; každé hledané slovo musí někde sedět, jinak výsledek nevyhovuje.
 */
export function skore(dotaz, pole) {
  const q = slovaZ(dotaz);
  if (!q.length) return 0;
  const tokeny = pole.map(([text, vaha]) => [slovaZ(text), vaha]);
  let soucet = 0;
  for (const slovo of q) {
    let nejlepsi = 0;
    for (const [slova, vaha] of tokeny) {
      for (const w of slova) nejlepsi = Math.max(nejlepsi, shodaSlova(slovo, w) * vaha);
    }
    if (!nejlepsi) return 0;
    soucet += nejlepsi;
  }
  const hlavni = norm(pole[0]?.[0] || '');
  const nq = norm(dotaz.trim());
  if (hlavni.startsWith(nq)) soucet += 2;
  else if (hlavni.includes(nq)) soucet += 1;
  return soucet;
}

/**
 * Cíle seřazené podle shody s dotazem. Výsledek, který sedí jen přes cestu (např. „vzhled“ v
 * „Nastavení › Účet a vzhled“ u karty Licence), se vedle přímé shody nezobrazí – jen by zašuměl.
 */
export function hledejCile(dotaz, cile = cileHledani()) {
  const shody = cile
    .map((c, poradi) => ({ c, poradi, s: skore(dotaz, [[c.label, 3], [c.slova, 2], [c.kde, 1]]) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.poradi - b.poradi);
  const prah = (shody[0]?.s || 0) * 0.35;
  return shody.filter((x) => x.s >= prah).map((x) => ({ ...x.c, skore: x.s }));
}

/**
 * Našeptávání: když název začíná tím, co uživatel napsal (bez ohledu na diakritiku), vrátí
 * zbytek názvu k doplnění. Normalizace zachovává počet znaků (NFD bez diakritiky), takže zbytek
 * se dá vzít přímo z původního názvu.
 */
export function doplneni(dotaz, label) {
  if (!dotaz || !label || dotaz.length >= label.length) return '';
  if (/\s$/.test(dotaz) && !/\s/.test(label[dotaz.length - 1])) return '';
  return norm(label).startsWith(norm(dotaz)) ? label.slice(dotaz.length) : '';
}

/**
 * Úseky názvu, které se shodují s hledanými slovy – pro zvýraznění. Vrací [[od, do], …] seřazené
 * a sloučené; indexy platí pro původní text (norm zachovává délku).
 */
export function useky(text, dotaz) {
  const q = slovaZ(dotaz);
  const n = norm(text);
  const out = [];
  const re = /[\p{L}\p{N}]+/gu;
  for (let m; (m = re.exec(n));) {
    const w = m[0];
    for (const slovo of q) {
      if (w.startsWith(slovo)) out.push([m.index, m.index + slovo.length]);
      else if (shodaSlova(slovo, w) >= 0.8) {
        let p = 0;
        while (p < slovo.length && p < w.length && slovo[p] === w[p]) p++;
        out.push([m.index, m.index + p]);
      } else if (slovo.length >= 3 && w.includes(slovo)) {
        const i = w.indexOf(slovo);
        out.push([m.index + i, m.index + i + slovo.length]);
      }
    }
  }
  out.sort((a, b) => a[0] - b[0]);
  const sloucene = [];
  for (const u of out) {
    const posl = sloucene.at(-1);
    if (posl && u[0] <= posl[1]) posl[1] = Math.max(posl[1], u[1]);
    else sloucene.push([...u]);
  }
  return sloucene;
}
