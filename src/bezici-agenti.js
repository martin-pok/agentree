// Pojistka: každý agent, který na tomhle počítači běží, musí být v přehledu vidět.
//
// Agenteeq pozná agenta hlavně podle přepisu, který si agent sám ukládá. Přepis ale může chybět:
// agent čeká na první zadání (Claude Code i Codex zakládají soubor až s první zprávou), zapisuje do
// složky, o které zatím nevíme, nebo se změnil formát. Bez pojistky by pak agent v přehledu chyběl,
// přestože běží – a to je pro Agenteeq nejhorší možná chyba.
//
// Proto se běžící procesy agentů (src/connectors/processes.js) párují s konverzacemi. Proces, ke
// kterému se žádná konverzace nenašla, se ukáže jako detekovaný proces bez přepisu. Zmizí,
// jakmile se přepis najde nebo proces skončí. Z procesu se bere jen to, co o něm víme jistě:
// že běží, od kdy a v jaké složce. Co právě dělá, neví nikdo – a tak se to ani netvrdí.
import path from 'node:path';
import { touch } from './model.js';
import { lastSegment } from './util.js';
import { ui } from './texty.js';

// Nástroje, které se hledají po procesech. `domov` = proměnná, podle které zapisují jinam.
export const AGENTI = {
  'claude-code': { connector: 'claude-code', app: 'Claude Code', provider: 'anthropic', domov: 'CLAUDE_CONFIG_DIR' },
  codex: { connector: 'codex', app: 'Codex', provider: 'openai', domov: 'CODEX_HOME' },
  'gemini-cli': { connector: 'gemini-cli', app: 'Gemini CLI', provider: 'google' },
  'qwen-code': { connector: 'qwen-code', app: 'Qwen Code', provider: 'alibaba' },
  'copilot-cli': { connector: 'copilot-cli', app: 'Copilot CLI', provider: 'github' },
};

export const PROMENNE_DOMOVA = Object.values(AGENTI).map((a) => a.domov).filter(Boolean);

// Tyto krátce žijící položky nevznikají z konverzace. Stejný tvar ID používají API i klient, aby
// po skončení procesu neukázaly obecné „konverzace nenalezena“.
export const jeProcesovyId = (id) => /:proces-\d+$/.test(String(id || ''));

// Start procesu (z doby běhu) a první zápis do přepisu se mohou rozejít o pár vteřin.
const REZERVA_MS = 15e3;

const slozka = (cesta) => (cesta ? path.resolve(cesta) : '');
const stejnaSlozka = (a, b) => !a || !b || slozka(a) === slozka(b);

/**
 * Procesy, ke kterým se nenašla konverzace. Proces patří konverzaci téhož nástroje, která od jeho
 * startu žila (poslední zápis nebo hook) a běží ve stejné složce, když ji u obou známe. Každá
 * konverzace patří nejvýš jednomu procesu – dva agenti v jedné složce jsou dva agenti.
 * `procesy`: [{ pid, runtime, od, cwd }], `sessions`: modely session ze storu.
 */
export function nesparovane(procesy, sessions) {
  const volne = sessions.filter((s) => !s.proces);
  const zbyva = [];
  // Starší proces si vybírá první a bere nejstarší konverzaci, která od jeho startu žila. Novější
  // proces tak starší konverzaci nikdy nepřebere a spárování mezi průchody nepřeskakuje (záznam
  // v přehledu by jinak blikal) – a novější konverzace zůstanou novějším procesům.
  for (const p of [...procesy].sort((a, b) => a.od - b.od)) {
    const connector = AGENTI[p.runtime]?.connector;
    const zila = (s) => Math.max(s.lastAt || 0, s.hookAt || 0);
    const kandidat = volne
      .filter((s) => s.connector === connector && zila(s) >= p.od - REZERVA_MS && stejnaSlozka(p.cwd, s.cwd))
      .sort((a, b) => zila(a) - zila(b))[0];
    if (kandidat) volne.splice(volne.indexOf(kandidat), 1);
    else zbyva.push(p);
  }
  return zbyva;
}

export function popisProcesu(p, a) {
  const od = new Date(p.od).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
  return p.cwd
    ? ui('{0} běží v {1} od {2}. Přepis zatím není dostupný.', a.app, lastSegment(p.cwd) || p.cwd, od)
    : ui('{0} běží od {1}. Přepis zatím není dostupný.', a.app, od);
}

/**
 * Drží v úložišti „procesové“ agenty. `upravit(procesy)` se volá po každém průchodu procesů;
 * `null` = výpis procesů se nepovedl, a pak se nic nemění (nevíme ≠ nic neběží).
 */
export function createBeziciAgenti({ store }) {
  const drzene = new Set();

  function upravit(procesy) {
    if (!procesy) return;
    const chtene = new Set();
    for (const p of nesparovane(procesy, [...store.sessions.values()])) {
      const a = AGENTI[p.runtime];
      if (!a) continue;
      const localId = `proces-${p.pid}`;
      const id = `${a.connector}:${localId}`;
      chtene.add(id);
      const s = store.ensure({ connector: a.connector, localId, provider: a.provider, app: a.app, source: 'proces' });
      s.proces = { pid: p.pid, od: p.od, popis: popisProcesu(p, a) };
      // Název složky není název konverzace. Dokud nemáme přepis, nesmí se za něj vydávat.
      s.title = ui('{0} · detekovaný proces', a.app);
      if (p.cwd && !s.cwd) s.cwd = p.cwd;
      touch(s, p.od);
      drzene.add(id);
      store.commit(s);
    }
    for (const id of [...drzene]) {
      if (chtene.has(id)) continue;
      drzene.delete(id);
      store.remove(id);
    }
  }

  return { upravit, pocet: () => drzene.size };
}
