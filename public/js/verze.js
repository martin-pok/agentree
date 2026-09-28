// Verze kódu stránky a adresy log a ikon se značkou obsahu (docs/ARCHITECTURE.md → Mezipaměť a čerstvost).
//
// Server (src/verze-souboru.js) i sestavení webu vkládají do stránky seznam `cesta → značka obsahu`
// a verzi, pro kterou je kód stránky. Adresa se značkou smí v prohlížeči zůstat natrvalo, protože
// s novým obsahem vznikne nová adresa – loga se tak při překreslení nikdy neptají serveru znovu
// a po aktualizaci nikdy neukážou staré. Bez seznamu (testy v Node, starší stránka) se vrací holá
// cesta: tu server posílá s `no-cache`, takže je vždy čerstvá, jen o jeden dotaz dražší.
let data;
function nactiData() {
  if (data === undefined) {
    try {
      data = JSON.parse(globalThis.document?.getElementById('agenteeq-verze')?.textContent || 'null') || {};
    } catch {
      data = {};
    }
  }
  return data;
}

// Značka je base64url z hashe; nic jiného se do atributu src nedostane.
export function adresaSouboru(cesta) {
  const v = nactiData().soubory?.[cesta];
  return typeof v === 'string' && /^[\w-]{1,64}$/.test(v) ? `${cesta}?v=${v}` : cesta;
}

export function verzeStranky() {
  const v = nactiData().verze;
  return typeof v === 'string' ? v : '';
}
