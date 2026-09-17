// Popis vydání se skládá z toho, co je v repozitáři, ne z toho, co si někdo pamatuje:
// změny bere z CHANGELOG.md a stav podpisu ze souborů, které se opravdu sestavily.
//
// Proč vlastní skript a ne `--notes-from-tag`: popis musí říct, jak se aplikace na Macu
// spustí. A to se liší podle toho, jestli se build podepsal Developer ID, nebo jen ad-hoc.
// Ad-hoc podepsanou aplikaci stažený Mac odmítne s hláškou „je poškozená“, i když není –
// jenom má karanténní příznak. Kdyby to v popisu nestálo, vypadá to jako rozbité vydání.
//
// Spuštění:  node scripts/release-notes.mjs <verze> [složka s přílohami] > poznamky.md
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
 * ale z `dist/latest-build.json`, který zapsal build.
 */
export function napovedaProMac(podpis) {
  if (podpis === 'Developer ID') {
    return 'Rozbal archiv a přetáhni **Agenteeq.app** do složky Aplikace. Aplikace je podepsaná\nDeveloper ID a notarizovaná, takže se otevře běžným dvojklikem.';
  }
  // Ad-hoc podpis je pravda, kterou nemá smysl zamlčet: uživatel by narazil na hlášku,
  // která vypadá jako poškozený soubor, a vydání by považoval za vadné.
  return [
    'Rozbal archiv a přetáhni **Agenteeq.app** do složky Aplikace.',
    '',
    'Tento build **není podepsaný Developer ID ani notarizovaný**, takže ho macOS po stažení',
    'zavře do karantény a při prvním spuštění ohlásí, že je aplikace poškozená. Poškozená není,',
    'jen nemá podpis. Karanténní příznak sundáš jedním příkazem v Terminálu:',
    '',
    '```',
    'xattr -dr com.apple.quarantine /Applications/Agenteeq.app',
    '```',
    '',
    'Potom se aplikace otevře normálně.',
  ].join('\n');
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
    if (!jmeno.endsWith('.zip')) continue;
    const st = await fs.stat(path.join(slozka, jmeno)).catch(() => null);
    if (st?.isFile()) out.push({ jmeno, bajtu: st.size });
  }
  return out;
}

// Pořadí je zároveň pořadím v popisu vydání: první je to, co si stáhne nejvíc lidí.
// Řadit podle abecedy by postavilo „Windows“ před „macOS“ (velké W je před malým m).
const POPIS_PRILOHY = [
  [/macOS-arm64\.zip$/, 'aplikace pro Mac s čipem Apple (M1 a novější)'],
  [/macOS-x64\.zip$/, 'aplikace pro Mac s procesorem Intel'],
  [/Windows-x64\.zip$/, 'aplikace pro Windows 10 a 11 (64bit)'],
  [/extension-.*\.zip$/, 'rozšíření pro Chrome; rozbalíš a nahraješ přes „Načíst rozbalené“'],
];

const poradi = (jmeno) => {
  const i = POPIS_PRILOHY.findIndex(([vzor]) => vzor.test(jmeno));
  return i === -1 ? POPIS_PRILOHY.length : i;
};

const popisSouboru = (jmeno) => POPIS_PRILOHY.find(([vzor]) => vzor.test(jmeno))?.[1] || '';

export function poznamky({ changelog, verze, soubory = [], podpisMac = 'ad-hoc' }) {
  const { nadpis, telo } = sekceZmen(changelog, verze);
  const maMac = soubory.some((s) => /macOS/.test(s.jmeno));
  const casti = [`### ${nadpis.split('·').slice(1).join('·').trim() || nadpis}`, '', telo, ''];

  if (soubory.length) {
    casti.push('## Ke stažení', '');
    for (const s of [...soubory].sort((a, b) => poradi(a.jmeno) - poradi(b.jmeno) || a.jmeno.localeCompare(b.jmeno))) {
      const popis = popisSouboru(s.jmeno);
      casti.push(`- **${s.jmeno}** (${MB(s.bajtu)})${popis ? ` – ${popis}` : ''}`);
    }
    casti.push('');
  }

  if (maMac) casti.push('## Instalace na Macu', '', napovedaProMac(podpisMac), '');

  // Požadavky se píšou jen k tomu, co je opravdu přiložené. Věta o macOS u vydání bez
  // aplikace pro Mac (nebo naopak) je slib, který přílohy nekryjí.
  casti.push('## Co Agenteeq potřebuje', '');
  if (maMac) casti.push('- macOS 14 nebo novější.');
  if (soubory.some((s) => /Windows/.test(s.jmeno))) {
    casti.push('- Windows 10 nebo 11 (64bit) s běhovou součástí WebView2, kterou má Windows 11'
      + ' předinstalovanou. Verze pro Windows zatím **nebyla vyzkoušena na skutečném počítači** –'
      + ' překlad ověřuje CI, vzhled okna ne.');
  }
  casti.push(
    '- Aplikace nemá žádné běhové závislosti a nic neposílá na internet.',
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
