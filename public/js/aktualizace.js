// Aktualizace jedním klepnutím: v aplikaci pro Mac se ověřený balíček stáhne (když ještě není),
// aplikace ho sama nainstaluje do Aplikací a restartuje se do nové verze (desktop/Agenteeq.swift).
// Jinde (příkazová řádka, Windows) zůstává stažení a otevření balíčku ve správci souborů.
import { state } from './state.js';
import { api } from './api.js';
import { toast } from './ui.js';
import { tr } from './i18n.js';

export const umiInstalovat = () => Boolean(state.integrations?.selfInstall);

export async function nainstalujAktualizaci() {
  if (state.updates?.status === 'available') {
    const r = await api.downloadUpdate();
    if (r.update) state.updates = r.update;
  }
  const verze = state.updates?.latestVersion || '';
  await api.installUpdate();
  toast(tr('Instaluji Agenteeq {0} a restartuji…', verze));
}

// Okno aplikace hlásí selhání instalace sem (desktop/Agenteeq.swift → installUpdate). Do té chvíle se
// nic nezměnilo a aplikace běží dál.
window.agenteeqAktualizaceSelhala = (zprava) => toast(String(zprava || tr('Aktualizaci se nepodařilo nainstalovat. Nic se nezměnilo.')), { tone: 'err' });
