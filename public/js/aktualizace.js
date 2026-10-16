// Aktualizace jedním klepnutím: v aplikaci pro Mac se ověřený balíček stáhne (když ještě není),
// aplikace ho sama nainstaluje do Aplikací a restartuje se do nové verze (desktop/Agenteeq.swift).
// Jinde (příkazová řádka, Windows) zůstává stažení a otevření balíčku ve správci souborů.
//
// Celou dobu stahování je vidět skutečný průběh (server ho hlásí v `updates.transfer`). Okno průběhu
// jde schovat a stahování doběhne na pozadí; restart se pak nabídne, nespustí se sám.
import { state, subscribe } from './state.js';
import { api } from './api.js';
import { toast, confirmDialog } from './ui.js';
import { tr } from './i18n.js';
import { esc } from './format.js';

export const umiInstalovat = () => Boolean(state.integrations?.selfInstall);

const vlastniBehy = () => (state.runs || []).filter((r) => r.status === 'running' || r.status === 'stopping').length;
const mb = (bajty) => (bajty / 1048576).toLocaleString(document.documentElement.lang === 'en' ? 'en' : 'cs', { maximumFractionDigits: 0 });

let okno = null;
let odhlasit = null;
let schovano = false;

function zavriOkno() {
  odhlasit?.(); odhlasit = null;
  okno?.remove(); okno = null;
}

function vykresliPrubeh(verze, text) {
  if (schovano) return;
  if (!okno) {
    okno = document.createElement('div');
    okno.className = 'aktualizace-prubeh';
    okno.setAttribute('role', 'dialog');
    okno.setAttribute('aria-modal', 'true');
    okno.setAttribute('aria-labelledby', 'aktualizace-prubeh-titulek');
    okno.innerHTML = `<div class="aktualizace-prubeh-karta">
      <h2 class="aktualizace-prubeh-titulek" id="aktualizace-prubeh-titulek">${esc(tr('Aktualizujeme na {0}', verze))}</h2>
      <div class="aktualizace-prubeh-pruh" role="progressbar" aria-valuemin="0" aria-valuemax="100"><span></span></div>
      <p class="aktualizace-prubeh-text" aria-live="polite"></p>
      <button class="btn" type="button" data-aktualizace-skryt>${esc(tr('Pokračovat na pozadí'))}</button>
    </div>`;
    okno.querySelector('[data-aktualizace-skryt]').addEventListener('click', () => { schovano = true; zavriOkno(); });
    okno.addEventListener('keydown', (e) => { if (e.key === 'Escape') { schovano = true; zavriOkno(); } });
    document.body.append(okno);
    okno.querySelector('[data-aktualizace-skryt]').focus();
  }
  const t = state.updates?.transfer;
  const podil = t?.total ? Math.min(1, t.received / t.total) : null;
  const pruh = okno.querySelector('.aktualizace-prubeh-pruh');
  pruh.classList.toggle('is-neurcity', podil === null);
  if (podil !== null) {
    pruh.style.setProperty('--podil', String(podil));
    pruh.setAttribute('aria-valuenow', String(Math.round(podil * 100)));
  } else pruh.removeAttribute('aria-valuenow');
  okno.querySelector('.aktualizace-prubeh-text').textContent = text
    || (t?.total ? tr('Stahujeme · {0} / {1} MB', mb(t.received), mb(t.total)) : tr('Připravujeme stažení…'));
}

export async function nainstalujAktualizaci() {
  const verze = state.updates?.latestVersion || '';
  // Agenty spuštěné z Agenteeq restart zastaví. Rozhodnutí patří uživateli, ne aktualizaci.
  const behy = vlastniBehy();
  if (behy && !(await confirmDialog({
    title: tr('Restartovat i s běžícími agenty?'),
    message: tr('Agenty spuštěné z Agenteeq ({0}) restart zastaví. Agenti v Terminálu a jiných aplikacích poběží dál.', behy),
    confirmLabel: tr('Aktualizovat a restartovat'),
  }))) return;
  schovano = false;
  try {
    if (state.updates?.status === 'available') {
      vykresliPrubeh(verze);
      odhlasit = subscribe((zmeny) => { if (!zmeny || zmeny.has?.('updates')) vykresliPrubeh(verze); });
      const r = await api.downloadUpdate();
      if (r.update) state.updates = r.update;
      odhlasit?.(); odhlasit = null;
      if (schovano) {
        toast(tr('Agenteeq {0} je stažený. Restart spustíš tlačítkem Aktualizovat.', verze), { timeout: 8000 });
        return;
      }
    }
    await instaluj(verze);
  } catch (err) {
    zavriOkno();
    throw err;
  }
}

async function instaluj(verze) {
  schovano = false;
  vykresliPrubeh(verze, tr('Připravujeme instalaci…'));
  okno?.querySelector('.aktualizace-prubeh-pruh')?.style.setProperty('--podil', '1');
  try {
    await api.installUpdate();
  } catch (err) {
    zavriOkno();
    throw err;
  }
  // Od teď převezme okno aplikace vlastní načítací scénu s průběhem instalace.
}

// Okno aplikace hlásí selhání instalace sem (desktop/Agenteeq.swift → installUpdate). Do té chvíle se
// nic nezměnilo a aplikace běží dál.
window.agenteeqAktualizaceSelhala = (zprava) => {
  zavriOkno();
  toast(String(zprava || tr('Aktualizaci se nepodařilo nainstalovat. Nic se nezměnilo.')), { tone: 'err' });
};
