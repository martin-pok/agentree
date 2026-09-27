// Přihlášení u dodavatele na pozadí, bez Terminálu (docs/ACCOUNTS.md, „Napojení modelů“).
//
// `claude auth login --claudeai` i `codex login` umí běžet bez okna: samy otevřou přihlašovací
// stránku v prohlížeči a počkají, až se z ní vrátí odpověď na jejich vlastní adresu na localhostu.
// Dřív je Agenteeq pouštělo v Terminálu, kde se člověk nejdřív díval na výpis a otázky a teprve
// potom se dostal k prohlížeči. Teď běží jako obyčejný podproces: argumenty jdou přímo programu
// (žádný shell, složka „Design & Web“ se nerozpadne) a výstup čte jen Agenteeq.
//
// Z výstupu se bere jediná věc – záložní odkaz „If the browser didn't open, visit: …“. Když se
// prohlížeč sám neotevře, otevře ho Agenteeq. Claude Code pak na stránce ukáže kód, který by se
// jinak vkládal do Terminálu; Agenteeq ho nechá vložit do svého okna a předá ho procesu na vstup.
import { spawn } from 'node:child_process';
import path from 'node:path';

// Odkaz z výstupu se otevírá v prohlížeči, takže projde jen adresa dodavatele – nikdy nic jiného,
// co by se ve výpisu mohlo objevit.
const DODAVATELE = ['claude.com', 'claude.ai', 'anthropic.com', 'openai.com', 'chatgpt.com'];
const MAX_VYSTUP = 64 * 1024;

export function odkazZVystupu(text) {
  for (const [kandidat] of String(text || '').matchAll(/https:\/\/[^\s"'<>]+/g)) {
    let url;
    try { url = new URL(kandidat); } catch { continue; }
    if (DODAVATELE.some((d) => url.hostname === d || url.hostname.endsWith(`.${d}`))) return url.href;
  }
  return null;
}

// Claude Code se při ruční cestě ptá „Paste code here if prompted >“.
export const chceKod = (text) => /paste (the )?code/i.test(String(text || ''));

// Program z npm (`#!/usr/bin/env node`) potřebuje v PATH i node, který leží ve stejné složce.
// Aplikace spuštěná z Finderu má PATH jen systémové, proto se složka programu přidá dopředu.
export function prostrediPro(bin, base = process.env) {
  const oddelovac = path.delimiter;
  const cesty = [path.dirname(bin), ...String(base.PATH || '').split(oddelovac)].filter(Boolean);
  return { ...base, PATH: [...new Set(cesty)].join(oddelovac) };
}

/**
 * Spustí přihlášení a vrátí se, jakmile proces opravdu běží (nebo se ho nepodařilo spustit).
 * Vrácený objekt drží proces: `odkaz()` = záložní adresa z výstupu, `chceKod()`, `posliKod()`,
 * `zastav()` a `konec` (Promise s kódem ukončení). Nic z toho se neukládá.
 */
export function spustPrihlaseni(bin, args, { spawnImpl = spawn, env = prostrediPro(bin), naVystup = () => {}, naKonec = () => {} } = {}) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawnImpl(bin, args, { env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    } catch (err) {
      resolve({ ok: false, error: `Přihlášení se nepodařilo spustit: ${err.message}` });
      return;
    }
    let vystup = '';
    let bezi = false;
    let skoncil = false;
    let hotovo;
    const konec = new Promise((r) => { hotovo = r; });
    const pridej = (chunk) => {
      if (vystup.length < MAX_VYSTUP) vystup += String(chunk);
      naVystup(vystup);
    };
    child.stdout?.on('data', pridej);
    child.stderr?.on('data', pridej);
    child.stdin?.on('error', () => {}); // proces skončil dřív, než dostal kód
    const ovladani = {
      ok: true,
      odkaz: () => odkazZVystupu(vystup),
      chceKod: () => chceKod(vystup),
      vystup: () => vystup,
      bezi: () => bezi && !skoncil,
      posliKod(kod) {
        if (skoncil || !child.stdin?.writable) return false;
        child.stdin.write(`${kod}\n`);
        return true;
      },
      zastav() {
        if (!skoncil) {
          try { child.kill(); } catch { /* už neběží */ }
        }
      },
      konec,
    };
    child.on('spawn', () => {
      bezi = true;
      resolve(ovladani);
    });
    child.on('error', (err) => {
      skoncil = true;
      hotovo(null);
      if (!bezi) resolve({ ok: false, error: `Přihlášení se nepodařilo spustit: ${err.code === 'ENOENT' ? 'program nebyl nalezen' : err.message}` });
    });
    child.on('exit', (code) => {
      skoncil = true;
      hotovo(code);
      if (bezi) naKonec(code, vystup);
    });
  });
}
