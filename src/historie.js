// Dlouhá historie Statistik (90 dní, 12 měsíců). Konektory čtou přepisy jen za sledované okno
// (config.windowDays, výchozí 30 dní) a starší konverzace z paměti mizí. Aby Statistiky uměly i
// delší období, ukládá se každý den jako malý souhrn do <dataDir>/historie.json: tokeny (vstup +
// výstup, stejná metrika jako graf) podle poskytovatele, aplikace, modelu a složky, hodiny
// s aktivitou a konverzace, které ten den začaly.
//
// Dny uvnitř okna se pokaždé přepočítají z živých konverzací (ty jsou zdroj pravdy). Den, který
// z okna vypadne, se zmrazí a dál se nemění – jeho konverzace už v paměti nejsou úplné. Data starší
// než první uložený den neexistují a nedopočítávají se: rozhraní řekne, odkdy historie sahá.
// Žádné přepisy ani názvy konverzací se neukládají, jen součty.
import path from 'node:path';
import { readJson, writeFileAtomic, hourKeyTs, localDay } from './util.js';

const VERZE = 1;
const DAY = 86400e3;
// Uchovává se rok a kousek, aby „12 měsíců“ mělo celý první měsíc.
export const HISTORIE_DNI = 400;
// Den na hraně okna může mít část konverzací už mimo paměť. Přepočítávají se proto jen dny, které
// jsou v okně celé, se dvoudenní rezervou na posun časových pásem a zaokrouhlení.
const REZERVA_DNI = 2;

const pridej = (mapa, klic, hodnota) => {
  if (!klic || !hodnota) return;
  mapa[klic] = (mapa[klic] || 0) + hodnota;
};

/**
 * Denní souhrny z konverzací (shrnutí ze store.list()). Vrací { 'YYYY-MM-DD': den } pro místní dny
 * >= odDne. Den: { tokeny, poskytovatele, aplikace, modely, slozky, hodiny, konverzace, zadani,
 * poskytovatelAplikace, poskytovatelModelu, poskytovatelSlozky }.
 */
export function denniSouhrny(sessions, odDne) {
  const dny = {};
  const den = (klic) => (dny[klic] ||= { tokeny: 0, poskytovatele: {}, aplikace: {}, modely: {}, slozky: {}, hodiny: 0, konverzace: 0, zadani: 0, slozkyKonverzace: {}, barvy: { aplikace: {}, modely: {}, slozky: {} } });
  const aktivniHodiny = {};
  for (const s of sessions) {
    for (const [klic, hodnota] of Object.entries(s.hourly || {})) {
      if (!(hodnota > 0)) continue;
      const ts = hourKeyTs(klic);
      const d = localDay(ts);
      if (d < odDne) continue;
      const z = den(d);
      z.tokeny += hodnota;
      pridej(z.poskytovatele, s.provider || 'other', hodnota);
      pridej(z.aplikace, s.app, hodnota);
      pridej(z.modely, s.model, hodnota);
      pridej(z.slozky, s.project, hodnota);
      // Barva a ikona řádku podle poskytovatele první konverzace v řádku (jako groupTotals).
      if (s.app) z.barvy.aplikace[s.app] ||= s.provider;
      if (s.model) z.barvy.modely[s.model] ||= s.provider;
      if (s.project) z.barvy.slozky[s.project] ||= s.provider;
      (aktivniHodiny[d] ||= new Set()).add(klic);
    }
    // Konverzace a zadání se počítají ke dni, kdy konverzace začala – každá tak jen jednou, i když
    // běžela víc dní. Podagenti se nepočítají (stejně jako v přehledu).
    if (!s.parentId && s.startedAt) {
      const d = localDay(s.startedAt);
      if (d >= odDne) {
        const z = den(d);
        z.konverzace += 1;
        z.zadani += s.turns || 0;
        pridej(z.slozkyKonverzace, s.project, 1);
      }
    }
  }
  for (const [d, mnozina] of Object.entries(aktivniHodiny)) dny[d].hodiny = mnozina.size;
  return dny;
}

export function createHistorie({ dataDir, windowDays, now: hodiny = () => Date.now() }) {
  const file = path.join(dataDir, 'historie.json');
  let data = { verze: VERZE, od: '', dny: {} };
  let ulozeny = '';
  let zapis = Promise.resolve();

  async function load() {
    const ulozena = await readJson(file, null);
    if (ulozena?.verze === VERZE && ulozena.dny && typeof ulozena.dny === 'object') {
      data = { verze: VERZE, od: typeof ulozena.od === 'string' ? ulozena.od : '', dny: ulozena.dny };
      ulozeny = JSON.stringify(data);
    }
  }

  /** Přepočítá dny uvnitř okna z živých konverzací; starší dny nechá být. Vrací true při změně. */
  function aktualizuj(sessions) {
    const now = hodiny();
    const plne = Math.max(1, windowDays - REZERVA_DNI);
    const odDne = localDay(now - (plne - 1) * DAY);
    const nove = denniSouhrny(sessions, odDne);
    for (const d of Object.keys(data.dny)) if (d >= odDne && !nove[d]) delete data.dny[d];
    Object.assign(data.dny, nove);
    const hranice = localDay(now - (HISTORIE_DNI - 1) * DAY);
    for (const d of Object.keys(data.dny)) if (d < hranice) delete data.dny[d];
    // Od kdy historie sahá: první den, za který byla data úplná. Při prvním spuštění je to začátek
    // okna – starší dny Agenteeq nikdy neviděl a nebude je vydávat za nulové.
    if (!data.od) data.od = odDne;
    if (data.od < hranice) data.od = hranice;
    const json = JSON.stringify(data);
    if (json === ulozeny) return false;
    ulozeny = json;
    zapis = zapis.then(() => writeFileAtomic(file, json)).catch((err) => console.error('Agenteeq: historii Statistik se nepodařilo uložit:', err.message));
    return true;
  }

  return {
    load,
    aktualizuj,
    flush: () => zapis,
    /** Pro rozhraní: od kdy historie sahá a souhrny po dnech. */
    snapshot: () => ({ od: data.od, dny: data.dny }),
  };
}
