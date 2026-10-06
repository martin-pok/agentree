// Popis vydání se skládá z toho, co je v repozitáři, ne z toho, co si někdo pamatuje:
// změny bere z CHANGELOG.md a stav podpisu ze souborů, které se opravdu sestavily.
//
// Proč vlastní skript a ne `--notes-from-tag`: popis musí říct, jak se aplikace na Macu
// spustí. A to se liší podle toho, jestli se build podepsal Developer ID, nebo jen ad-hoc.
// Ad-hoc podepsanou aplikaci stažený Mac napoprvé neotevře a nabídne jen „Hotovo“; spustit
// ji jde až tlačítkem „Přesto otevřít“ v Nastavení systému. Kdyby to v popisu nestálo,
// vypadá to jako rozbité vydání.
//
// Spuštění:  node scripts/release-notes.mjs <verze> [složka s přílohami] > poznamky.md
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { adresaObchodu } from '../public/js/obchod.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Vytáhne z CHANGELOG.md sekci jedné verze.
 *
 * Nadpis má tvar `## 0.12.0 – 2026-09-15 · Název`; sekce končí u dalšího `## ` nebo na konci
 * souboru. Když verze v changelogu není, vyhodí chybu – vydání bez popisu změn by bylo horší
 * než žádné vydání.
 */
export function sekceZmen(changelog, verze) {
  const radky = String(changelog).split('\n');
  const zacatek = radky.findIndex((r) => r.startsWith(`## ${verze} `) || r.trim() === `## ${verze}`);
  if (zacatek === -1) throw new Error(`CHANGELOG.md nemá sekci pro verzi ${verze}.`);
  let konec = radky.length;
  for (let i = zacatek + 1; i < radky.length; i++) {
    if (radky[i].startsWith('## ')) { konec = i; break; }
  }
  const nadpis = radky[zacatek].replace(/^##\s*/, '').trim();
  const telo = radky.slice(zacatek + 1, konec).join('\n').trim();
  if (!telo) throw new Error(`Sekce ${verze} v CHANGELOG.md je prázdná.`);
  return { nadpis, telo };
}

// Návod k instalaci na webu (site/instalace, site/en/install). Popis vydání na něj odkazuje,
// kdo chce postup i pro Windows nebo řešení potíží.
export const NAVOD_URL = 'https://agentree-fawn.vercel.app/instalace';
const PRIKAZ_TERMINAL = 'curl -fsSL https://agentree-fawn.vercel.app/install.sh | bash';

/**
 * Jak se aplikace na Macu nainstaluje a poprvé otevře. Odpověď závisí na podpisu, takže se
 * neopisuje z paměti, ale z `dist/latest-build.json`, který zapsal build. `dmg` říká, jestli
 * je u vydání obraz disku (pak se instaluje přetažením z jeho okna, jinak z rozbaleného ZIPu).
 *
 * Postup je stejný jako na webu a v docs/INSTALL.md – jedna pravda na všech místech, hlídá
 * test/release-notes.test.mjs a test/site.test.mjs.
 */
export function napovedaProMac(podpis, { dmg = false } = {}) {
  const presun = dmg
    ? 'Otevři stažený obraz disku (**.dmg**) a v okně, které se objeví, přetáhni **Agenteeq** na složku **Aplikace**.'
    : 'Rozbal archiv a přetáhni **Agenteeq.app** do složky **Aplikace**.';
  if (podpis === 'Developer ID') {
    return `${presun} Aplikace je podepsaná\nDeveloper ID a notarizovaná, takže se otevře běžným dvojklikem.`;
  }
  // Ad-hoc podpis je pravda, kterou nemá smysl zamlčet. S platným ad-hoc podpisem vede na
  // macOS 15 podporovaná cesta přes Nastavení systému; Terminál k ní není potřeba.
  return [
    presun,
    '',
    'Tento build zatím **není podepsaný Developer ID ani notarizovaný**, takže ho macOS napoprvé',
    'neotevře sám. Stačí to potvrdit jednou, bez Terminálu:',
    '',
    '1. Otevři Agenteeq ze složky Aplikace. macOS ohlásí, že ho neotevřel – klikni na **Hotovo**.',
    '2. Otevři **Nastavení systému → Soukromí a zabezpečení**, sjeď dolů k hlášce o Agenteeq',
    '   a klikni na **Přesto otevřít**. Tlačítko se objeví až po kroku 1.',
    '3. Potvrď heslem nebo Touch ID a v posledním okně klikni na **Otevřít**.',
    '',
    `Příště se Agenteeq otevře dvojklikem. Podrobný návod i s řešením potíží: ${NAVOD_URL}`,
    '',
    '**Pro pokročilé:** jedním příkazem v Terminálu se Agenteeq stáhne, ověří otiskem SHA-256',
    'z GitHubu a nainstaluje bez kroku v Nastavení:',
    '',
    '```',
    PRIKAZ_TERMINAL,
    '```',
    '',
    'Kdyby macOS místo toho hlásil, že je aplikace **poškozená**, pomůže jako poslední možnost',
    'příkaz `xattr -dr com.apple.quarantine /Applications/Agenteeq.app` v Terminálu.',
  ].join('\n');
}

/**
 * Název vydání pro nadpis popisu: text za „·“ v nadpisu changelogu, s velkým počátečním
 * písmenem. CHANGELOG ho píše malým („0.29.0 – … · nové okno rozšíření…“), protože tam
 * navazuje na verzi a datum; v popisu vydání stojí sám jako nadpis, takže je to začátek věty.
 */
export function nazevVydani(nadpis) {
  const nazev = String(nadpis).split('·').slice(1).join('·').trim() || String(nadpis).trim();
  return nazev.replace(/^\p{Ll}/u, (p) => p.toLocaleUpperCase('cs'));
}

/**
 * Posune nadpisy v těle sekce tak, aby nejvyšší z nich byl o úroveň pod názvem vydání (`##`).
 * Popis vydání má pak čistou osnovu: `## Název` → `### skupiny změn` → `## Ke stažení` …
 * Řádky v kódových blocích (komentáře `# …` v ukázce příkazů) nadpisy nejsou.
 */
export function nadpisyPodNazev(telo, uroven = 3) {
  const radky = String(telo).split('\n');
  const nadpisy = [];
  let vKodu = false;
  radky.forEach((radek, i) => {
    if (/^\s*(```|~~~)/.test(radek)) { vKodu = !vKodu; return; }
    const m = !vKodu && radek.match(/^(#{1,6})\s/);
    if (m) nadpisy.push([i, m[1].length]);
  });
  if (!nadpisy.length) return radky.join('\n');
  const posun = uroven - Math.min(...nadpisy.map(([, u]) => u));
  for (const [i, u] of nadpisy) radky[i] = '#'.repeat(Math.min(6, u + posun)) + radky[i].slice(u);
  return radky.join('\n');
}

const MB = (b) => `${(b / 1024 / 1024).toFixed(1)} MB`;

/**
 * Seznam příloh tak, jak opravdu leží na disku. Co se nesestavilo, se v popisu neobjeví –
 * vydání nesmí slibovat soubor, který u něj není.
 */
export async function prilohy(slozka) {
  const jmena = await fs.readdir(slozka).catch(() => []);
  const out = [];
  for (const jmeno of jmena.sort()) {
    if (!/\.(zip|dmg)$/.test(jmeno)) continue;
    const st = await fs.stat(path.join(slozka, jmeno)).catch(() => null);
    if (st?.isFile()) out.push({ jmeno, bajtu: st.size });
  }
  return out;
}

// Pořadí je zároveň pořadím v popisu vydání: první je to, co si stáhne nejvíc lidí.
// Řadit podle abecedy by postavilo „Windows“ před „macOS“ (velké W je před malým m).
const POPIS_PRILOHY = [
  [/macOS-arm64\.dmg$/, 'aplikace pro Mac s čipem Apple (M1 a novější) – otevři a přetáhni do Aplikací'],
  [/macOS-arm64\.zip$/, 'aplikace pro Mac s čipem Apple (M1 a novější)'],
  [/Windows-x64\.zip$/, 'aplikace pro Windows 10 a 11 (64bit)'],
  // Z obchodu se rozšíření instaluje jedním klikem a aktualizuje samo; ZIP pak zůstává jen pro ruční instalaci.
  [/extension-.*\.zip$/, adresaObchodu()
    ? `rozšíření pro Chrome k ruční instalaci; jednodušší je [Chrome Web Store](${adresaObchodu()})`
    : 'rozšíření pro Chrome; rozbalíš a nahraješ přes „Načíst rozbalené“'],
];

const poradi = (jmeno) => {
  const i = POPIS_PRILOHY.findIndex(([vzor]) => vzor.test(jmeno));
  return i === -1 ? POPIS_PRILOHY.length : i;
};

const popisSouboru = (jmeno) => POPIS_PRILOHY.find(([vzor]) => vzor.test(jmeno))?.[1] || '';

export function poznamky({ changelog, verze, soubory = [], podpisMac = 'ad-hoc' }) {
  const { nadpis, telo } = sekceZmen(changelog, verze);
  // Kopie se stálým jménem (Agenteeq-macOS-arm64.dmg…) jsou tytéž soubory pro odkazy z webu;
  // v seznamu by stály podruhé vedle souboru s verzí, tak se vypisuje jen ten s verzí.
  soubory = soubory.filter((s) => !/^Agenteeq-(macOS|Windows)-/.test(s.jmeno));
  const maMac = soubory.some((s) => /macOS/.test(s.jmeno));
  const maDmg = soubory.some((s) => /macOS-.*\.dmg$/.test(s.jmeno));
  // Název je nadpis sekce změn a stojí na stejné úrovni jako „Ke stažení“ a další sekce níž.
  const casti = [`## ${nazevVydani(nadpis)}`, '', nadpisyPodNazev(telo), ''];

  if (soubory.length) {
    casti.push('## Ke stažení', '');
    for (const s of [...soubory].sort((a, b) => poradi(a.jmeno) - poradi(b.jmeno) || a.jmeno.localeCompare(b.jmeno))) {
      const popis = popisSouboru(s.jmeno);
      casti.push(`- **${s.jmeno}** (${MB(s.bajtu)})${popis ? ` – ${popis}` : ''}`);
    }
    casti.push('');
  }

  if (maMac) casti.push('## Instalace na Macu', '', napovedaProMac(podpisMac, { dmg: maDmg }), '');

  // Požadavky se píšou jen k tomu, co je opravdu přiložené. Věta o macOS u vydání bez
  // aplikace pro Mac (nebo naopak) je slib, který přílohy nekryjí.
  casti.push('## Co Agenteeq potřebuje', '');
  if (maMac) casti.push('- macOS 14 nebo novější.');
  if (soubory.some((s) => /Windows/.test(s.jmeno))) {
    casti.push('- Windows 10 nebo 11 (64bit) s běhovou součástí WebView2, kterou má Windows 11'
      + ' předinstalovanou. Verze pro Windows zatím **nebyla vyzkoušena na skutečném počítači** –'
      + ' překlad ověřuje CI, vzhled okna ne.');
  }
  // Co odchází ze stroje, musí sedět se src/: kurzy ČNB (src/rates.js) běží samy, útrata přes
  // API (src/connectors/cloud-billing.js) a účet (src/ucet.js, src/cloud-sync.js) jen po zapnutí.
  casti.push(
    '- Aplikace nemá žádné běhové závislosti. Sama kontroluje denní kurzy ČNB pro převod měn a'
      + ' dostupnost veřejného releasu Agenteeq na GitHubu; instalační balíček stáhne jen podle tvé'
      + ' volby v Nastavení. Další spojení vzniknou, jen když je zapneš: útrata přes API Anthropicu'
      + ' nebo OpenAI s tvým klíčem správce a účet Agenteeq, kam při zapnuté synchronizaci'
      + ' odcházejí jen souhrnná čísla. Text konverzací, jejich názvy ani kód počítač neopouštějí.',
    '- Konverzace Claude Code a Codexu čte z tohoto počítače. Chaty z prohlížeče vidí až s rozšířením.',
    '',
  );
  return casti.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

// ── Spuštění z příkazové řádky ───────────────────────────────────────────────
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const verze = process.argv[2] || JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8')).version;
  const slozka = process.argv[3] ? path.resolve(process.argv[3]) : path.join(root, 'dist');
  const changelog = await fs.readFile(path.join(root, 'CHANGELOG.md'), 'utf8');
  const soubory = await prilohy(slozka);
  // Stav podpisu zapisuje build. Když soubor není, nehádáme „podepsáno“, ale to opatrnější.
  const build = await fs.readFile(path.join(slozka, 'latest-build.json'), 'utf8').then(JSON.parse, () => null);
  process.stdout.write(poznamky({ changelog, verze, soubory, podpisMac: build?.signature || 'ad-hoc' }));
}
