// Rozhraní Agenteeq se dá otevřít odkudkoli – i ze statické kopie na webhostingu. Data ale vždycky
// leží na Macu. Když za stránkou žádný server Agenteeq není, nemá smysl hlásit „server neběží“ a
// ukazovat 127.0.0.1: na telefonu je to sám telefon. Místo toho se zeptáme, kde ten Mac je,
// a prohlížeč pošleme rovnou tam – dál už běží všechno na jeho vlastní adrese.

const KLIC = 'agenteeq.adresa';
const PORT = 4620;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Agenteeq se pozná podle odpovědi /api/health. Cokoli jiného (404 z hostingu, HTML místo JSON)
// znamená, že tady žádný server není. Síťová chyba naopak znamená výpadek vlastního serveru –
// tam zůstává původní hláška „server neběží“ a čekání na návrat.
export async function jeStatickaKopie(fetchFn = fetch) {
  if (location.protocol === 'file:') return false;
  try {
    const res = await fetchFn('/api/health', { cache: 'no-store' });
    if (!res.ok) return true;
    const data = await res.json().catch(() => null);
    return data?.ok !== true;
  } catch {
    return false;
  }
}

// Z toho, co člověk napíše, udělá adresu, na kterou se dá bezpečně přejít. Vrací prázdný řetězec,
// když to adresa není – jiné schéma než http(s), přihlašovací údaje v adrese nebo nesmysl.
// Místní adresy (IP v domácí síti, jméno .local) jedou po http a doplní se jim port 4620,
// tunel venku (Tailscale, Cloudflare) běží po https na svém vlastním jménu.
export function normalizovatAdresu(vstup) {
  const t = String(vstup || '').trim().replace(/\s+/g, '');
  if (!t) return '';
  // Jiné schéma než http(s) sem nepatří (javascript:, data:, file:). Dvojtečka následovaná číslem
  // je naopak port, ne schéma – `macbook.local:4620` musí projít.
  if (/^[a-z][a-z0-9+.-]*:(?!\d)/i.test(t) && !/^https?:\/\//i.test(t)) return '';
  const jeIp = /^\d{1,3}(\.\d{1,3}){3}(:\d+)?$/.test(t);
  const jeLocal = /^[a-z0-9-]+\.local(:\d+)?$/i.test(t);
  const uplna = /^https?:\/\//i.test(t) ? t : `${jeIp || jeLocal ? 'http' : 'https'}://${t}`;
  let u;
  try { u = new URL(uplna); } catch { return ''; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
  if (u.username || u.password || !u.hostname) return '';
  if (!/^[a-z0-9.:[\]-]+$/i.test(u.hostname)) return '';
  // Holá IP bez portu je skoro jistě Agenteeq v domácí síti – port doplníme, ať ho nikdo nehledá.
  if (!u.port && u.protocol === 'http:' && /^\d{1,3}(\.\d{1,3}){3}$/.test(u.hostname)) u.port = String(PORT);
  return `${u.protocol}//${u.host}/`;
}

export function ulozenaAdresa(store = localStorage) {
  try { return normalizovatAdresu(store.getItem(KLIC)); } catch { return ''; }
}

export function pripojovaciObrazovka(zprava = '') {
  const posledni = ulozenaAdresa();
  document.body.innerHTML = `<main class="pair">
    <form class="pair-box" novalidate>
      <img src="/icons/icon-192.png" alt="" width="64" height="64">
      <h1>Kde máš Agenteeq?</h1>
      <p>Tohle je jen rozhraní. Agenti, limity i útrata zůstávají na tvém Macu – napiš adresu, na které tam Agenteeq běží.</p>
      <label class="sr-only" for="adresa">Adresa Macu</label>
      <input id="adresa" name="adresa" class="pair-adresa" type="text" inputmode="url" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="192.168.1.10:4620" value="${esc(posledni)}" required>
      ${zprava ? `<p class="pair-error" role="alert">${esc(zprava)}</p>` : ''}
      <button class="btn btn--primary" type="submit">Otevřít</button>
      <small>Adresu najdeš v Agenteeq na Macu v <b>Nastavení → Otevřít na telefonu</b>. Mimo domov ji zpřístupní <b>Přístup přes Tailscale</b> o kartu níž.</small>
    </form>
  </main>`;
  const form = document.querySelector('.pair-box');
  const input = form.elements.adresa;
  input.focus();
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const cil = normalizovatAdresu(input.value);
    if (!cil) return pripojovaciObrazovka('Tohle nevypadá jako adresa. Zkus třeba 192.168.1.10:4620.');
    try { localStorage.setItem(KLIC, cil); } catch { /* soukromé okno adresu neuloží, nevadí */ }
    location.href = cil;
    return undefined;
  });
}
