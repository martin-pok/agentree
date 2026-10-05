// Popis vydání se skládá z toho, co je v repozitáři, ne z toho, co si někdo pamatuje:
// změny bere z CHANGELOG.md a stav podpisu ze souborů, které se opravdu sestavily.
//
// Proč vlastní skript a ne `--notes-from-tag`: popis musí říct, jak se aplikace na Macu
// spustí. A to se liší podle toho, jestli se build podepsal Developer ID, nebo jen ad-hoc.
// Ad-hoc podepsanou aplikaci stažený Mac napoprvé zablokuje, protože ji Apple neověřil. Kdyby
// v popisu nestálo, jak ji jednou povolit v Nastavení systému, vypadá to jako rozbité vydání.
//
// Spuštění:  node scripts/release-notes.mjs <verze> [složka s přílohami] > poznamky.md
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { adresaObchodu, WEB_AGENTEEQ } from '../public/js/obchod.js';

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

/**
 * Jak se aplikace na Macu otevře. Odpověď závisí na podpisu, takže se neopisuje z paměti,
 * ale z `dist/latest-build.json`, který zapsal build. `dmg` říká, jestli je u vydání obraz
 * disku (instalace přetažením); bez něj se popisuje jen ZIP.
 *
 * Postup pro ad-hoc build je týž jako na webu (site/instalace, site/en/install) a v
 * docs/INSTALL.md a odpovídá nápovědě Applu pro macOS 15 a 26 „Open a Mac app from an unknown
 * developer“ (support.apple.com/guide/mac-help/mh40616): Nastavení systému → Soukromí
 * a zabezpečení → Zabezpečení → Přesto otevřít, heslo, potvrdit. Bez Terminálu.
 */
export function napovedaProMac(podpis, { dmg = false } = {}) {
  const prenos = dmg
    ? 'Otevři **Agenteeq-macOS-arm64.dmg** a v okně, které se ukáže, přetáhni **Agenteeq** na složku\n**Aplikace**. (Kdo chce ZIP: rozbal ho a přetáhni Agenteeq.app do Aplikací.)'
    : 'Rozbal archiv a přetáhni **Agenteeq.app** do složky Aplikace.';
  if (podpis === 'Developer ID') {
    return `${prenos}\n\nAplikace je podepsaná Developer ID a notarizovaná, takže se otevře běžným dvojklikem.`;
  }
  // Ad-hoc podpis je pravda, kterou nemá smysl zamlčet: uživatel by narazil na blokaci
  // a vydání by považoval za vadné. Postup je jednorázový a bez Terminálu.
  return [
    prenos,
    '',
    'Tento build **zatím není podepsaný Developer ID ani notarizovaný**, takže ho macOS při prvním',
    'otevření zablokuje. Je to jednorázový krok:',
    '',
    '1. Otevři Agenteeq ze složky Aplikace. macOS ohlásí, že aplikaci nemůže ověřit – dialog zavři',
    '   (do Koše ji nepřesouvej).',
    '2. Otevři **Nastavení systému → Soukromí a zabezpečení**, sjeď dolů k části **Zabezpečení**',
    '   a u hlášky o Agenteeq klikni na **Přesto otevřít**. Tlačítko tam je asi hodinu po pokusu',
    '   o otevření.',
    '3. Zadej heslo k Macu a v dalším dotazu potvrď **Otevřít**.',
    '',
    'Příště se Agenteeq otevře dvojklikem. Celý postup je na',
    `[stránce Instalace](${WEB_AGENTEEQ}instalace). Kdo pracuje v Terminálu, může místo toho`,
    `použít instalaci jedním příkazem (\`curl -fsSL ${WEB_AGENTEEQ}install.sh | bash\`), která`,
    'ověří otisk balíčku z GitHubu a krok v Nastavení nepotřebuje.',
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
  [/macOS-arm64\.dmg$/, 'instalátor pro Mac s čipem Apple (M1 a novější) – otevřeš a přetáhneš do Aplikací'],
  [/macOS-arm64\.zip$/, 'aplikace pro Mac s čipem Apple (M1 a novější) jako ZIP; používá ho i instalace z Terminálu a aktualizace'],
  [/Windows-x64\.zip$/, 'aplikace pro Windows 10 a 11 (64bit), zatím neověřená na skutečném počítači'],
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
  const maMac = soubory.some((s) => /macOS/.test(s.jmeno));
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

  const maDmg = soubory.some((s) => /macOS-.*\.dmg$/.test(s.jmeno));
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
