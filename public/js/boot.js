// Start aplikace. Nejdřív zjistíme, jestli za stránkou vůbec je server Agenteeq – statická kopie
// rozhraní (webhosting) žádný nemá a místo prázdné aplikace ukáže rozcestník na vlastní Mac.
import { jeStatickaKopie, pripojovaciObrazovka } from './connect.js';

// Výjimka je ukázka pro prohlídku na webu (/app?ukazka): rozhraní poběží nad smyšlenými daty.
// Když se data nenačtou, zbude obyčejný rozcestník – nikdy prázdná aplikace.
const ukazka = new URLSearchParams(location.search).has('ukazka');

if (await jeStatickaKopie()) {
  let spustena = false;
  let ucet = false;
  if (ukazka) {
    try {
      await (await import('./ukazka.js')).spustUkazku();
      spustena = true;
    } catch (err) {
      console.error('Agenteeq: ukázku se nepodařilo spustit', err);
    }
  } else {
    // Účet Agenteeq na webu (/app?ucet, nebo uložené přihlášení): souhrny z Maců odkudkoli.
    try {
      ucet = await (await import('./ucet-web.js')).spustUcetWeb();
    } catch (err) {
      console.error('Agenteeq: přehled účtu se nepodařilo spustit', err);
    }
  }
  if (spustena) await import('./app.js');
  else if (!ucet) pripojovaciObrazovka();
} else await import('./app.js');
