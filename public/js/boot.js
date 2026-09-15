// Start aplikace. Nejdřív zjistíme, jestli za stránkou vůbec je server Agenteeq – statická kopie
// rozhraní (webhosting) žádný nemá a místo prázdné aplikace ukáže rozcestník na vlastní Mac.
import { jeStatickaKopie, pripojovaciObrazovka } from './connect.js';

if (await jeStatickaKopie()) pripojovaciObrazovka();
else await import('./app.js');
