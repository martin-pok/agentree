import { tr } from './i18n.js';
import { adresaSouboru } from './verze.js';
// Statická kopie nezná adresu Macu. Telefon se otevírá pouze přes QR z jeho Nastavení;
// tato obrazovka nabízí ukázku a vysvětlení, nikdy zadání či kopírování síťové adresy.

// Agenteeq se pozná podle odpovědi /api/health. Cokoli jiného (404 z hostingu, HTML místo JSON)
// znamená, že tady žádný server není. Síťová chyba naopak znamená výpadek vlastního serveru –
// tam zůstává původní hláška „server neběží“ a čekání na návrat.
// `doc` jde přes globalThis, ne přímo: v testech (Node) žádný dokument není a holý
// `document` by vyhodil ReferenceError dřív, než se funkce vůbec rozběhne.
export async function jeStatickaKopie(fetchFn = fetch, doc = globalThis.document) {
  if (location.protocol === 'file:') return false;
  // Kopie rozhraní na webu o sobě ví předem (značku vkládá scripts/build-site.mjs), takže
  // se na neexistující server vůbec neptá. Bez toho by každé otevření /app nechalo
  // v konzoli 404 – na veřejné stránce zbytečná špína a dotaz navíc.
  if (doc?.querySelector?.('meta[name="agenteeq-staticka-kopie"]')) return true;
  try {
    const res = await fetchFn('/api/health', { cache: 'no-store' });
    if (!res.ok) return true;
    const data = await res.json().catch(() => null);
    return data?.ok !== true;
  } catch {
    return false;
  }
}

export function pripojovaciObrazovka() {
  document.body.innerHTML = `<main class="pair">
    <div class="pair-box">
      <img src="${adresaSouboru('/icons/icon-192.png')}" alt="" width="64" height="64">
      <h1>${tr('Připoj se ke svému Macu')}</h1>
      <p class="pair-navod">${tr('Na telefonu nejsnáz: v Agenteeq na Macu otevři')} <b>${tr('Nastavení → Otevřít na telefonu')}</b> ${tr('a namiř na QR kód foťák. Telefon se otevře už spárovaný.')}</p>
      <a class="btn btn--primary" href="?ukazka">${tr('Prohlédnout ukázku bez instalace')}</a>
      <small class="pair-jinak">${tr('Máš účet Agenteeq?')} <a href="/app?ucet">${tr('Přihlas se a uvidíš souhrny odkudkoli.')}</a></small>
      <small class="pair-jinak">${tr('Agenteeq na Macu ještě nemáš?')} <a href="/">${tr('Podívej se, co umí a jak ho získat.')}</a></small>
    </div>
  </main>`;
}
