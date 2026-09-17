import { api } from './api.js';
import { state, subscribe } from './state.js';
import { ICON, glyph } from './icons.js';
import { goToExtension } from './jump.js';

let dialog;
const steps = [
  { tag: 'Tvůj nový pracovní prostor', title: 'Všichni agenti.\nJeden přehled.', text: 'Méně hledání konverzací. Více soustředění na práci. Agenteeq propojí dění napříč tvými AI nástroji na jednom místě.', visual: 'orchestra' },
  { tag: 'V pravou chvíli', title: 'Víš, kdy je\nřada na tobě.', text: 'Sleduj práci, dokončení i selhání. Když agent potřebuje rozhodnutí, otevři jeho konverzaci přímo z přehledu.', visual: 'attention' },
  { tag: 'Pořádek v každé zakázce', title: 'Konverzace patří\nk projektům.', text: 'Spoj agenty podle klienta nebo složky. Uchovej brief, sleduj aktivitu a zadávej další práci ze stejného místa.', visual: 'projects' },
  { tag: 'Agenti i v prohlížeči', title: 'ChatGPT, Gemini\na Claude.ai taky.', text: 'Rozšíření pro Chrome přidá do přehledu konverzace z webu – stav, přepis i dosažený limit. A zadání, které napíšeš tady, samo vloží do okna služby. Nainstaluješ ho za minutu.', visual: 'browser', action: 'Nainstalovat rozšíření' },
  { tag: 'Připraveno na tvém Macu', title: 'Tvá práce.\nTvá data.', text: 'Lokální přepisy zůstávají na tomto počítači. Claude Code a Codex se načítají automaticky. Další zdroje připojíš v Nastavení.', visual: 'privacy' },
];

function visual(kind) {
  if (kind === 'orchestra') return `<div class="welcome-network"><div class="welcome-line"></div><div class="welcome-logo"><img src="/brand/agenteeq-mark.svg" width="72" height="72" alt="Agenteeq"></div><div class="welcome-providers">${['claude', 'codex', 'cursor'].map((p) => `<span>${glyph(p)}</span>`).join('')}</div></div><p class="welcome-caption">Prostor pro soustředěnou práci</p>`;
  if (kind === 'attention') return `<div class="welcome-demo"><span class="welcome-demo-label">Ukázka stavů</span><div><i class="welcome-dot working"></i><span>Agent pracuje</span><small>máš klid</small></div><div class="welcome-attention"><i class="welcome-dot attention"></i><span>Potřebuje rozhodnutí</span>${ICON.arrowRight || ICON.check}</div><div><i class="welcome-dot done"></i><span>Úloha dokončena</span>${ICON.check}</div></div><p class="welcome-caption">Přesná povolení Claude Code vyžadují hooky.<br>Codex je v přepisech nezveřejňuje.</p>`;
  if (kind === 'projects') return `<div class="welcome-project"><span class="welcome-demo-label">Ukázka projektu</span><div class="welcome-project-title">${ICON.folder}<span>Nový web</span></div><div class="welcome-project-row"><span>Brief a pravidla</span>${ICON.check}</div><div class="welcome-project-row"><span>Konverzace na jednom místě</span><div class="welcome-mini-logos">${glyph('claude')}${glyph('codex')}</div></div><div class="welcome-project-bar"></div></div><p class="welcome-caption">Od prvního zadání po poslední detail</p>`;
  if (kind === 'browser') return `<div class="welcome-browser"><div class="wb-bar"><i></i><i></i><i></i><span>gemini.google.com</span></div><div class="wb-body"><div class="wb-agent">${glyph('gemini')}<span>Gemini</span><em><i class="welcome-dot working"></i>pracuje</em></div><div class="wb-input"><span>Navrhni název kavárny…</span><small>${ICON.spark}Vloženo z Agenteeq</small></div></div></div><div class="welcome-browser-sites">${['openai', 'claude', 'gemini', 'perplexity', 'copilot'].map((p) => `<span>${glyph(p)}</span>`).join('')}</div><p class="welcome-caption">Rozšíření pro Chrome<br>Data jdou jen do Agenteeq na tvém Macu.</p>`;
  const n = state.sessions.size;
  return `<div class="welcome-local"><img src="/brand/agenteeq-mark-dark.svg" width="80" height="80" alt=""><span class="welcome-local-label">Lokálně na tvém Macu</span><span class="welcome-local-count">${n}</span><span>nalezených konverzací</span></div><p class="welcome-caption">Bez účtu. Bez telemetrie.<br>Webové chaty vyžadují rozšíření prohlížeče.</p>`;
}

export function showWelcome() {
  if (dialog) return;
  const opener = document.activeElement;
  dialog = document.createElement('dialog');
  dialog.className = 'welcome-dialog';
  dialog.setAttribute('aria-labelledby', 'welcome-title');
  dialog.innerHTML = `<div class="welcome-art" aria-hidden="true"></div><div class="welcome-content"><div class="welcome-top"><span>Agenteeq <span class="welcome-mac">pro Mac</span></span><button type="button" class="link" data-welcome-skip>Přeskočit</button></div><div class="welcome-copy" aria-live="polite"></div><p class="welcome-error" role="alert" hidden></p><footer class="welcome-footer"><div class="welcome-dots" aria-label="Postup průvodcem"></div><div class="welcome-buttons"><button type="button" class="btn" data-welcome-back>Zpět</button><button type="button" class="btn btn--primary" data-welcome-next>Pokračovat</button></div></footer></div>`;
  document.body.append(dialog);
  let index = 0;
  let busy = false;
  const render = () => {
    const step = steps[index];
    dialog.querySelector('.welcome-art').innerHTML = visual(step.visual);
    const last = steps.length - 1;
    dialog.querySelector('.welcome-copy').innerHTML = `<p class="welcome-kicker">${step.tag}</p><h2 id="welcome-title">${step.title.replace('\n', '<br>')}</h2><p>${step.text}</p>${step.action ? `<button type="button" class="link-inline welcome-action" data-welcome-action>${step.action} ${ICON.arrow}</button>` : ''}`;
    dialog.querySelector('.welcome-dots').innerHTML = steps.map((_, i) => `<span class="${i === index ? 'is-current' : i < index ? 'is-done' : ''}" aria-label="Krok ${i + 1} z ${steps.length}"${i === index ? ' aria-current="step"' : ''}></span>`).join('');
    dialog.querySelector('[data-welcome-back]').hidden = index === 0;
    dialog.querySelector('[data-welcome-next]').textContent = index === last ? 'Otevřít přehled' : 'Pokračovat';
  };
  const finish = async (target = '#/prehled') => {
    if (busy) return;
    busy = true;
    dialog.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    try {
      // Kdo prošel průvodce, zná aktuální verzi – „Co je nového“ se mu ukáže až po další aktualizaci.
      state.settings = (await api.saveSettings({ welcomeCompleted: true, ...(state.version ? { lastSeenVersion: state.version } : {}) })).settings;
      dialog.close(); dialog.remove(); dialog = null;
      if (target === 'extension') goToExtension();
      else location.hash = target;
      (opener?.isConnected ? opener : document.getElementById('page-title'))?.focus();
    } catch {
      const error = dialog.querySelector('.welcome-error');
      error.hidden = false;
      error.textContent = 'Dokončení se nepodařilo uložit. Zkontroluj připojení a zkus to znovu.';
      dialog.querySelectorAll('button').forEach((b) => { b.disabled = false; });
    } finally { busy = false; }
  };
  dialog.querySelector('[data-welcome-skip]').onclick = () => finish();
  dialog.querySelector('[data-welcome-next]').onclick = () => { if (index === steps.length - 1) finish(); else { index++; render(); } };
  dialog.querySelector('.welcome-copy').addEventListener('click', (e) => { if (e.target.closest('[data-welcome-action]')) finish('extension'); });
  dialog.querySelector('[data-welcome-back]').onclick = () => { index--; render(); };
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); finish(); });
  render();
  dialog.showModal();
  dialog.querySelector('[data-welcome-next]').focus();
}

export function initWelcome() {
  let checked = false;
  subscribe(() => {
    if (checked || !state.loaded) return;
    checked = true;
    if (!state.settings?.welcomeCompleted) showWelcome();
  });
  document.addEventListener('click', (e) => { if (e.target.closest('[data-welcome]')) showWelcome(); });
  window.addEventListener('agenteeq-welcome', showWelcome);
}
