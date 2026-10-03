// Rozšíření Agenteeq v Chrome Web Store – jediné místo s jeho adresou (docs/CHROME-WEB-STORE.md).
//
// Čte ho aplikace (Nastavení → Rozšíření pro Chrome), server na Macu (otevření obchodu rovnou
// v Chromu) i sestavení webu (scripts/build-site.mjs). Adresu známe už během kontroly, zveřejnění
// ale řídí příznak níže, aby web ani aplikace nenabízely neveřejnou stránku.
export const CHROME_WEB_STORE_URL = 'https://chromewebstore.google.com/detail/agenteeq/hocghhpigfilngdajmafkdcljdedanch';
// Veřejný listing ještě čeká na kontrolu. Po schválení přepnout na true a vydat aplikaci.
export const CHROME_WEB_STORE_PUBLISHED = false;

// Web Agenteeq se stažením aplikace pro Mac – co aplikace posílá dál, když ji chceš doporučit.
// Stejná adresa je v <link rel="canonical"> na webu (site/index.html).
export const WEB_AGENTEEQ = 'https://agentree-fawn.vercel.app/';

// Jen skutečná adresa položky v Chrome Web Store – nic jiného se jako „obchod“ neotevře.
export function adresaObchodu(url = CHROME_WEB_STORE_PUBLISHED ? CHROME_WEB_STORE_URL : '') {
  return /^https:\/\/chromewebstore\.google\.com\/detail\/(?:[\w-]+\/)?[a-p]{32}$/.test(String(url || '')) ? url : '';
}
