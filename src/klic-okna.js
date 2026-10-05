// Klíč okna pro spuštění z Terminálu (`agenteeq`, `npm start`) – protějšek klíče, který na Macu
// i ve Windows vyrábí plášť desktopové aplikace (desktop/Agenteeq.swift, desktop/windows/Agenteeq.cpp).
//
// Proč: server poslouchá na 127.0.0.1, ale smyčku sdílí všechny programy a všichni uživatelé
// počítače. Bez tajemství by si přehled, přepisy i akce (spuštění agenta) mohl vzít jiný účet na
// stejném počítači nebo program v sandboxu, který smí na síť, ale ne do tvých souborů. S klíčem
// server bez něj vydá jen /api/health a cesty s vlastním tajemstvím (hooky, rozšíření).
//
// Jak: klíč vznikne při každém spuštění (32 náhodných bajtů). Do prohlížeče jde jednou v adrese
// (`/?k=…`, `agenteeq --open`), server ho vymění za cookie HttpOnly; SameSite=Strict a z adresy ho
// smaže (src/http.js#localKeyGate). Aby `agenteeq --open` otevřel přehled i u serveru, který už běží
// (LaunchAgent, jiný Terminál), leží klíč po dobu běhu v datové složce v souboru s právy 0600 –
// přečte ho jen týž uživatel, tedy ten, kdo k datům Agenteeq smí i bez něj.
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const TVAR = /^[\w-]{32,128}$/;
export const SOUBOR_KLICE = 'klic-okna';

export const novyKlic = () => crypto.randomBytes(32).toString('base64url');

export const adresaSKlicem = (zaklad, klic) => (klic ? `${zaklad}/?k=${klic}` : zaklad);

export async function ulozKlic(dataDir, klic) {
  if (!TVAR.test(klic || '')) return null;
  const soubor = path.join(dataDir, SOUBOR_KLICE);
  await fs.mkdir(dataDir, { recursive: true, mode: 0o700 });
  const tmp = `${soubor}.${process.pid}.tmp`;
  await fs.writeFile(tmp, klic, { mode: 0o600 });
  await fs.rename(tmp, soubor);
  return soubor;
}

export async function nactiKlic(dataDir) {
  try {
    const klic = (await fs.readFile(path.join(dataDir, SOUBOR_KLICE), 'utf8')).trim();
    return TVAR.test(klic) ? klic : '';
  } catch {
    return '';
  }
}

// Smaže jen vlastní klíč – soubor mezitím mohl přepsat jiný běh.
export async function smazKlic(dataDir, klic) {
  if (klic && (await nactiKlic(dataDir)) === klic) await fs.rm(path.join(dataDir, SOUBOR_KLICE), { force: true }).catch(() => {});
}
