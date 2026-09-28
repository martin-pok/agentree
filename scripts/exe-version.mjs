// Verze pláště pro Windows, jak ji opravdu nese Agenteeq.exe (VERSIONINFO → FileVersion).
//
// Build ji do .exe razítkuje z package.json (desktop/windows/Agenteeq.rc.in) a pak ji z hotového
// souboru přečte zpátky. Když se přečíst nepodaří, je to „nepodařilo se zjistit“, ne verze
// z package.json: dřív se chyba tiše nahradila `|| version` a CI hlásilo „Verze pláště: 0.29.0“
// hned pod hláškou, že Agenteeq.exe neexistuje (běh 36351816717). Proto build při chybě
// i při nesouladu končí, žádná záloha.
//
// Rozhodování je čistá funkce nad výsledkem procesu, aby šla testovat bez PowerShellu.
import { spawnSync } from 'node:child_process';
import { powershell } from './powershell.mjs';

// Cesta jde do PowerShellu proměnnou prostředí, ne vepsaná do příkazu: -Command by ji rozebral
// podruhé a složka s apostrofem nebo „Design & Web“ by příkaz rozbila (scripts/powershell.mjs).
export function prikazVerzePlaste(exe) {
  const { argumenty, prostredi } = powershell(
    '(Get-Item -LiteralPath $env:AGENTEEQ_PLAST_EXE).VersionInfo.FileVersion',
    { AGENTEEQ_PLAST_EXE: exe },
  );
  return { prikaz: 'powershell.exe', argumenty, prostredi };
}

const prvniRadek = (text) => String(text ?? '').split(/\r?\n/).map((r) => r.trim()).find(Boolean) || '';

/**
 * Rozhodne nad výsledkem procesu (tvar jako spawnSync: error, status, stdout, stderr).
 * Vrátí zjištěnou verzi, jen když se opravdu přečetla a sedí s package.json. Jinak vyhodí
 * chybu, která říká, jestli se verzi nepodařilo zjistit, nebo jestli nesedí.
 */
export function overitVerziPlaste(vysledek, ocekavana) {
  const { error, status, stdout, stderr } = vysledek || {};
  const duvod = prvniRadek(stderr);
  if (error) {
    throw new Error(`Verzi pláště se nepodařilo zjistit: PowerShell nešel spustit (${error.message}).`);
  }
  if (status !== 0) {
    throw new Error(`Verzi pláště se nepodařilo zjistit: PowerShell skončil ${status === null ? 'bez kódu (přerušen)' : `s kódem ${status}`}${duvod ? ` – ${duvod}` : ''}.`);
  }
  const zjistena = String(stdout ?? '').trim();
  if (!zjistena) {
    throw new Error(`Verzi pláště se nepodařilo zjistit: Agenteeq.exe nevrátil FileVersion${duvod ? ` – ${duvod}` : ''}.`);
  }
  if (zjistena !== String(ocekavana)) {
    throw new Error(`Plášť nese verzi ${zjistena}, package.json ${ocekavana}. Archiv by hlásil jinou verzi, než jakou má.`);
  }
  return zjistena;
}

/** Přečte a ověří verzi z hotového .exe. `spust` jde v testu podvrhnout. */
export function zjistitVerziPlaste(exe, ocekavana, { spust = spawnSync } = {}) {
  const { prikaz, argumenty, prostredi } = prikazVerzePlaste(exe);
  const vysledek = spust(prikaz, argumenty, {
    encoding: 'utf8',
    windowsHide: true,
    env: { ...process.env, ...prostredi },
  });
  return overitVerziPlaste(vysledek, ocekavana);
}
