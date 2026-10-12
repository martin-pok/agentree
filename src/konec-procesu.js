// Konec procesu uprostřed tahu: konverzace nesmí „pracovat“, když proces, který ji vedl, skončil.
//
// Konec tahu je v přepisu explicitní (end_turn, přerušení, chyba API, hook Stop). Když ale proces
// skončí uprostřed tahu – zavřený Terminál, kill, pád, dvojité Ctrl+C bez hooků –, nezapíše už nic
// a konverzace by „pracovala“ až do vypršení (Claude Code 30 min, Codex 15 min). Výpis procesů
// (src/connectors/processes.js) přitom ví, že v její složce už žádný proces toho nástroje neběží.
//
// Tady se z toho dělá fakt `s.procesSkoncil` (čas zjištění); stav z něj odvozuje jen
// src/model.js#deriveStatus. Pravidla jsou schválně přísná, protože „nevím“ není „skončil“:
// - posuzuje se jen konverzace, u které byl proces ve stejné složce během běhu opravdu vidět
//   (vazba) – kde se nikdy nespárovala (jiná složka, worktree, start Agenteeq až po pádu), zůstává
//   dnešní chování;
// - konec = žádný vázaný proces neběží a ve složce konverzace neběží žádný proces téhož nástroje
//   (dva procesy v jedné složce nejdou rozlišit – dokud běží kterýkoli, nic se nemění);
// - nepovedený výpis (null) a proces téhož nástroje bez zjištěné složky (lsof selhal, Windows ji
//   nečte vůbec) znamenají „nevím“: nic se nemění a počítání začíná znovu;
// - konec musí potvrdit dva po sobě jdoucí výpisy – jeden výpadek ve výpisu není konec;
// - před zapsáním se přepis přečte znovu: `claude -p` nebo `codex exec` normálně skončí hned po
//   odpovědi a závěr tahu z přepisu musí mít přednost, i kdyby ho sledování souborů doručilo pozdě;
// - proces běhu spuštěného z Agenteeq (src/runs.js) se nikdy neváže – jeho konec a chybu eviduje
//   běh sám (`failure`), ve složce ale počítá jako běžící proces.
import path from 'node:path';
import { ui } from './texty.js';

// Které konverzace a podle jakého procesu. Jen nástroje v příkazové řádce, jejichž proces vede
// konverzaci po celý tah: Claude Desktop (záložka Code), aplikace Codex a VS Code spouštějí agenta
// po svém a výpis procesů o jejich konverzacích nic spolehlivého neříká.
export const SLEDOVANE = {
  'claude-code': { runtime: 'claude-code', aplikace: ['Claude Code'] },
  codex: { runtime: 'codex', aplikace: ['Codex CLI', ui('Codex · na pozadí')] },
};

// Kolik po sobě jdoucích výpisů musí potvrdit, že proces chybí.
export const POTVRZENI = 2;

const slozka = (cesta) => (cesta && path.isAbsolute(cesta) ? path.resolve(cesta) : '');

/**
 * `upravit(procesy)` se volá po každém výpisu procesů agentů: [{ pid, runtime, cwd }] nebo null,
 * když se výpis nepovedl. `behy()` = běhy z src/runs.js, `obnov(konektory)` znovu přečte přepisy.
 */
export function createKonecProcesu({ store, behy = () => [], obnov = async () => {} }) {
  const vazby = new Map(); // id konverzace → { pidy: Set, chybi: počet výpisů bez procesu }
  let zaneprazdneno = false;

  const posuzovana = (s) => {
    const sled = SLEDOVANE[s.connector];
    if (!sled || !sled.aplikace.includes(s.app) || s.source !== 'local' || s.proces) return null;
    // Jen tah, který ještě „pracuje“ a o jehož konci se zatím nerozhodlo.
    if (!s.running || (s.procesSkoncil || 0) >= (s.runningAt || 0)) return null;
    return slozka(s.cwd) ? sled : null;
  };

  async function upravit(procesy, now = Date.now()) {
    // Přepis se právě čte znovu; výpis, který mezitím přišel, nic nemění.
    if (zaneprazdneno) return;
    if (!Array.isArray(procesy)) {
      for (const v of vazby.values()) v.chybi = 0;
      return;
    }
    const pidyBehu = new Set(behy().map((r) => r.pid).filter(Boolean));
    const zive = new Set();
    const kandidati = [];
    for (const s of store.sessions.values()) {
      const sled = posuzovana(s);
      if (!sled) continue;
      zive.add(s.id);
      const v = vazby.get(s.id) || { pidy: new Set(), chybi: 0 };
      vazby.set(s.id, v);
      const svoje = procesy.filter((p) => p.runtime === sled.runtime);
      if (svoje.some((p) => !slozka(p.cwd))) {
        v.chybi = 0;
        continue;
      }
      const cwd = slozka(s.cwd);
      const tady = svoje.filter((p) => slozka(p.cwd) === cwd);
      for (const p of tady) if (!pidyBehu.has(p.pid)) v.pidy.add(p.pid);
      if (!v.pidy.size || tady.length || svoje.some((p) => v.pidy.has(p.pid))) {
        v.chybi = 0;
        continue;
      }
      if (++v.chybi >= POTVRZENI) kandidati.push({ s, runningAt: s.runningAt });
    }
    for (const id of vazby.keys()) if (!zive.has(id)) vazby.delete(id);
    if (!kandidati.length) return;

    zaneprazdneno = true;
    try {
      await obnov([...new Set(kandidati.map((k) => k.s.connector))]).catch(() => {});
    } finally {
      zaneprazdneno = false;
    }
    for (const { s, runningAt } of kandidati) {
      vazby.delete(s.id);
      // Přepis mezitím tah ukončil nebo v něm agent pokračuje: platí přepis.
      if (store.get(s.id) !== s || !s.running || s.runningAt !== runningAt) continue;
      s.procesSkoncil = Math.max(now, s.runningAt || 0);
      store.commit(s);
    }
  }

  return { upravit };
}
