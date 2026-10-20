import path from 'node:path';
import { ui } from './texty.js';
import { CLAUDE_PERMISSIONS, SLOZKA_S_DOTAZY } from './launcher.js';
import { slozkaSDotazySystemu } from './platform.js';
import { deriveStatus } from './model.js';

// Odpověď agentovi přímo z Agenteeq: konverzace Claude Code pokračuje na pozadí
// (`claude -p --resume <id>`), stejně jako běh spuštěný z pole pro zadání. Výsledek se objeví
// v přehledu sám – přepis zapisuje Claude Code.
//
// Bezpečnost konverzace má přednost před pohodlím:
// - Když ve stejné složce běží proces Claude Code, odpověď se nepošle. Agenteeq neumí spolehlivě
//   poznat, ve které konverzaci ten proces je, a dvě současná pokračování by konverzaci rozdvojila.
// - Když se výpis procesů nepodařil, odpověď se nepošle taky – „nepodařilo se zjistit“ není „nic
//   neběží“ (CLAUDE.md). Totéž platí pro běžící Claude Code, u kterého se nezjistila složka
//   (lsof nebo /proc selhaly, na Windows se nečte vůbec): může běžet právě v téhle konverzaci.
// - Když v konverzaci ještě pracuje (nebo se zastavuje) běh spuštěný z Agenteeq, čeká se na něj.
// - Když je agent na limitu se známým časem obnovy, odpověď by skončila stejnou hláškou o limitu:
//   pole se nenabídne a řekne se proč. Stav „na limitu“ bere ze src/model.js#deriveStatus, nikdy
//   ho neodvozuje znovu. Bez času obnovy (stav platí jen odhadem 5 h od hlášky) se odpovědět dá –
//   limit se mezitím mohl obnovit a uživatel to ví líp než Agenteeq. Rozhraní to řekne poznámkou.
// Codex (`codex exec resume`) zatím ne: syntaxi jsme neověřili na skutečném nástroji.

export const ODPOVED_MAX = 20000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const stejnaSlozka = (a, b) => Boolean(a && b) && path.resolve(a) === path.resolve(b);

/**
 * Lze konverzaci odpovědět z aplikace? Vrací { lze: true, pozn? } nebo { lze: false, proc, kod }.
 * `procesy`: poslední výpis [{ runtime, cwd }] nebo null, když se výpis nepodařil.
 * `dostupne`: umí to tenhle systém (config.launchAgents – zatím jen macOS).
 * `claude`: cesta k programu; false = hledal se a nenašel; null = ještě se nehledal (nevíme).
 */
// Běží ve složce konverzace program téhož nástroje? true / false / null (nevím: výpis procesů
// není, nebo některý proces nemá zjištěnou složku). Podle toho se pozná, jestli konverzace čeká
// v otevřeném Terminálu (přepnout se tam) nebo už neběží (pokračovat novým `--resume`).
const RUNTIME_KONVERZACE = { 'claude-code': 'claude-code', codex: 'codex' };
export function beziVeSlozce(s, procesy) {
  const runtime = RUNTIME_KONVERZACE[s?.connector];
  if (!runtime || !Array.isArray(procesy) || !s.cwd || !path.isAbsolute(s.cwd)) return null;
  const svoje = procesy.filter((p) => p.runtime === runtime);
  if (svoje.some((p) => stejnaSlozka(p.cwd, s.cwd))) return true;
  if (svoje.some((p) => !(p.cwd && path.isAbsolute(p.cwd)))) return null;
  return false;
}

export function lzeOdpovedet(s, { procesy, behy = [], claude = null, dostupne = true, now = Date.now(), home = '', system } = {}) {
  if (!s || s.connector !== 'claude-code') {
    return { lze: false, kod: 'nastroj', proc: ui('Odpovídat z Agenteeq zatím jde jen v konverzacích Claude Code.') };
  }
  if (!UUID.test(String(s.localId || ''))) {
    return { lze: false, kod: 'id', proc: ui('Tuhle konverzaci Claude Code neumí obnovit. Pokračuj v ní tam, kde běží.') };
  }
  if (!dostupne) return { lze: false, kod: 'system', proc: ui('Odpovídat z Agenteeq jde zatím jen na macOS.') };
  if (claude === false) return { lze: false, kod: 'program', proc: ui('Na tomto počítači se nenašel program claude.') };
  if (!claude) return { lze: false, kod: 'nevim', proc: ui('Ještě se zjišťuje, jestli je na tomto počítači program claude.') };
  if (!s.cwd || !path.isAbsolute(s.cwd)) return { lze: false, kod: 'slozka', proc: ui('U konverzace chybí složka, ve které běžela.') };
  if (slozkaSDotazySystemu(s.cwd, home, system)) return { lze: false, kod: 'slozka-chranena', proc: SLOZKA_S_DOTAZY() };
  const naLimitu = Boolean(s.limit?.reached) && deriveStatus(s, now).status === 'limited';
  if (naLimitu && s.limit.resetsAt) {
    return { lze: false, kod: 'limit', proc: ui('Agent je na vyčerpaném limitu. Odpovědět půjde po jeho obnově.') };
  }
  if (behy.some((r) => r.sessionId === s.id && (r.status === 'running' || r.status === 'stopping'))) {
    return { lze: false, kod: 'bezi-beh', proc: ui('Agent ještě pracuje na předchozím zadání z Agenteeq. Počkej, až doběhne.') };
  }
  if (!Array.isArray(procesy)) {
    return { lze: false, kod: 'nevim', proc: ui('Nepodařilo se zjistit, jestli konverzace neběží jinde. Odpověz radši v Terminálu.') };
  }
  if (procesy.some((p) => p.runtime === 'claude-code' && stejnaSlozka(p.cwd, s.cwd))) {
    return { lze: false, kod: 'bezi-proces', proc: ui('V této složce právě běží Claude Code. Odpověz tam, ať se konverzace nerozdvojí.') };
  }
  if (procesy.some((p) => p.runtime === 'claude-code' && !(p.cwd && path.isAbsolute(p.cwd)))) {
    return { lze: false, kod: 'nevim', proc: ui('Nepodařilo se zjistit, jestli konverzace neběží jinde. Odpověz radši v Terminálu.') };
  }
  if (naLimitu) return { lze: true, pozn: ui('Čas obnovy limitu není známý. Odpověď projde, jen pokud se limit už obnovil.') };
  return { lze: true };
}

/** Plán spuštění odpovědi. Vrací { ok, plan } nebo { ok: false, status, error, field }. */
export function planOdpovedi(s, input, kontext) {
  const text = typeof input?.text === 'string' ? input.text.trim() : '';
  if (!text) return { ok: false, status: 422, error: ui('Napiš, co má agent udělat.'), field: 'text' };
  if (text.length > ODPOVED_MAX) return { ok: false, status: 422, error: ui('Odpověď je moc dlouhá.'), field: 'text' };
  const opravneni = input?.permission ?? 'plan';
  if (!CLAUDE_PERMISSIONS[opravneni]) return { ok: false, status: 422, error: ui('Neznámé oprávnění.'), field: 'permission' };
  const l = lzeOdpovedet(s, kontext);
  if (!l.lze) return { ok: false, status: 409, error: l.proc, kod: l.kod };
  return {
    ok: true,
    plan: {
      agent: 'claude-code',
      label: 'Claude Code',
      cwd: s.cwd,
      prompt: text,
      sessionId: s.id,
      permission: opravneni,
      argv: [kontext.claude, '-p', '--resume', s.localId, '--permission-mode', opravneni, '--', text],
    },
  };
}
