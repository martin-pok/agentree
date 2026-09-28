// Noční ticho: v nastaveném čase nechodí oznámení ani zvuk. Počítá se podle místního času
// počítače, na kterém Agenteeq běží (ne podle telefonu, ze kterého se člověk zrovna dívá).
//
// Rozsah je polouzavřený: začátek do ticha patří, konec už ne. 22:00–7:00 tedy ztiší 22:00:00
// i 6:59:59, ale v 7:00:00 je po tichu. Začátek za koncem (22:00–7:00) znamená přes půlnoc.
// Stejný začátek a konec se uložit nedá (src/http.js to odmítne) – nejde poznat, jestli má jít
// o prázdný rozsah, nebo o celý den. Kdyby se do souboru dostal ručně, bere se jako prázdný:
// ticho, které si nikdo výslovně nezvolil, nesmí spolknout upozornění.

export const CAS_TICHA = /^([01]\d|2[0-3]):([0-5]\d)$/;
export const VYCHOZI_TICHO = { quietHours: false, quietFrom: '22:00', quietTo: '07:00' };

export function minutyDne(hhmm) {
  const m = CAS_TICHA.exec(String(hhmm || ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function jeNocniTicho(nastaveni, now = Date.now()) {
  if (nastaveni?.quietHours !== true) return false;
  const od = minutyDne(nastaveni.quietFrom);
  const doCasu = minutyDne(nastaveni.quietTo);
  if (od === null || doCasu === null || od === doCasu) return false;
  const d = new Date(now);
  const t = d.getHours() * 60 + d.getMinutes();
  return od < doCasu ? t >= od && t < doCasu : t >= od || t < doCasu;
}

// Uložené hodnoty z data.json: co nemá správný tvar, vrátí se na výchozí. Starý soubor bez těchto
// polí tak znamená vypnuté ticho s časy 22:00–7:00.
export function normalizujTicho(n) {
  return {
    quietHours: n?.quietHours === true,
    quietFrom: CAS_TICHA.test(n?.quietFrom) ? n.quietFrom : VYCHOZI_TICHO.quietFrom,
    quietTo: CAS_TICHA.test(n?.quietTo) ? n.quietTo : VYCHOZI_TICHO.quietTo,
  };
}
