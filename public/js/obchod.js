// Rozšíření Agenteeq v Chrome Web Store – jediné místo s jeho adresou (docs/CHROME-WEB-STORE.md).
//
// Čte ho aplikace (Nastavení → Rozšíření pro Chrome), server na Macu (otevření obchodu rovnou
// v Chromu) i sestavení webu (scripts/build-site.mjs). Dokud je prázdné, rozšíření v obchodě není
// a všude se ukazuje ruční instalace. Po schválení sem patří adresa ze stránky rozšíření v obchodě:
//   https://chromewebstore.google.com/detail/agenteeq/<32 písmen a–p>
export const CHROME_WEB_STORE_URL = '';

// Jen skutečná adresa položky v Chrome Web Store – nic jiného se jako „obchod“ neotevře.
export function adresaObchodu(url = CHROME_WEB_STORE_URL) {
  return /^https:\/\/chromewebstore\.google\.com\/detail\/(?:[\w-]+\/)?[a-p]{32}$/.test(String(url || '')) ? url : '';
}
