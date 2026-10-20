// Sdílená kontrola WCAG 2.2 A/AA přes axe-core pro QA skripty aplikace, webu a rozšíření.
// axe-core je jen nástroj QA (npm install --no-save), do aplikace ani package.json nepatří. Když
// chybí, skript skončí srozumitelnou chybou – tichý přeskok by vypadal jako „bez porušení“.
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export const AXE_TAGY = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

export function nactiAxe() {
  try {
    return fs.readFileSync(require.resolve(process.env.AXE_PATH || 'axe-core/axe.min.js'), 'utf8');
  } catch {
    throw new Error('Chybí axe-core. Nainstaluj ho jen pro QA: npm install --no-save --package-lock=false axe-core@4.10.3');
  }
}

/**
 * Spustí axe na stránce (nebo jen v `kde`, např. otevřeném dialogu) a vrátí porušení jako řádky
 * „id (dopad): cíle“. Stránka musí běžet v kontextu s bypassCSP, jinak CSP vložený skript odmítne.
 */
export async function axePoruseni(page, zdroj, kde = null) {
  if (!(await page.evaluate(() => Boolean(globalThis.axe)))) await page.addScriptTag({ content: zdroj });
  return page.evaluate(async ({ kde, tagy }) => {
    const cil = kde ? document.querySelector(kde) : document;
    if (!cil) return [`kontrolovaná oblast ${kde} na stránce není`];
    return (await globalThis.axe.run(cil, { runOnly: { type: 'tag', values: tagy } }))
      .violations.map((x) => `${x.id} (${x.impact}): ${x.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(', ')}`);
  }, { kde, tagy: AXE_TAGY });
}
