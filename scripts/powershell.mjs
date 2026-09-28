// Příkaz pro PowerShell, do kterého se nevkládá žádná cesta.
//
// `powershell.exe -Command <text>` rozebere text jako kód. Cesta vepsaná do něj v apostrofech
// se rozbije o první apostrof – dočasná složka leží pod %TEMP%, takže C:\Users\O'Brien\AppData\…
// je běžný případ – a v uvozovkách by se v ní rozvinulo `$`. Proto je skript stálý text a cesty
// dostává jako proměnné prostředí ($env:AGENTEEQ_…), které PowerShell čte jako hodnotu, nikdy
// jako kód. Pravidlo z CLAUDE.md: cíl se nikdy nepředává přes shell, který by ho rozebral podruhé.
//
// Všechny skripty v scripts/ spouštějí PowerShell jen přes tuhle funkci; hlídá to
// test/windows-regression.test.mjs.

/**
 * @param {string} skript  stálý text bez vložených hodnot; hodnoty čte z `$env:NAZEV`
 * @param {Record<string, string>} promenne  AGENTEEQ_… → hodnota (typicky cesta)
 * @returns {{ argumenty: string[], prostredi: Record<string, string> }}
 */
export function powershell(skript, promenne = {}) {
  const prostredi = {};
  for (const [nazev, hodnota] of Object.entries(promenne)) {
    if (!/^AGENTEEQ_[A-Z0-9_]+$/.test(nazev)) throw new Error(`Proměnná ${nazev} pro PowerShell musí mít tvar AGENTEEQ_….`);
    if (!new RegExp(`\\$env:${nazev}(?![A-Za-z0-9_])`).test(skript)) throw new Error(`Skript pro PowerShell proměnnou ${nazev} nepoužívá.`);
    const text = String(hodnota);
    if (text && skript.includes(text)) {
      throw new Error(`Hodnota ${nazev} je vepsaná přímo do skriptu pro PowerShell – patří jen do proměnné prostředí.`);
    }
    prostredi[nazev] = text;
  }
  return {
    argumenty: ['-NoProfile', '-NonInteractive', '-Command',
      `$ErrorActionPreference = 'Stop'; $ProgressPreference = 'SilentlyContinue'; ${skript}`],
    prostredi,
  };
}
