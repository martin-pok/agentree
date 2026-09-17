import { api } from './api.js';
import { state, subscribe } from './state.js';
import { esc } from './format.js';
import { modal } from './ui.js';
import { RELEASES, unseenReleases } from './whats-new-data.js';
import { goToExtension } from './jump.js';

const dateCs = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' });

function releaseHtml(r, { lead = false } = {}) {
  return `<article class="wn-release${lead ? ' wn-release--lead' : ''}">
    <header class="wn-head"><span class="wn-version">${esc(r.version)}</span><span class="wn-date">${esc(dateCs(r.date))}</span></header>
    <h3 class="wn-title">${esc(r.title)}</h3>
    <ul class="wn-items">${r.items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
  </article>`;
}

async function markSeen() {
  if (!state.version || state.settings?.lastSeenVersion === state.version) return;
  try {
    state.settings = (await api.saveSettings({ lastSeenVersion: state.version })).settings;
  } catch { /* příště se ukáže znovu – lepší než tiše ztratit informaci */ }
}

let open = false;
export async function showWhatsNew({ releases } = {}) {
  if (open) return;
  open = true;
  const list = releases?.length ? releases : RELEASES.slice(0, 3);
  const older = RELEASES.filter((r) => !list.includes(r));
  const ext = state.integrations?.extension;
  const offerExtension = list.some((r) => r.extension) && (!ext || ext.state === 'missing' || ext.outdated);
  const body = `<div class="wn">
    ${list.map((r, i) => releaseHtml(r, { lead: i === 0 })).join('')}
    ${older.length ? `<details class="wn-older"><summary>Starší změny</summary>${older.map((r) => releaseHtml(r)).join('')}</details>` : ''}
  </div>`;
  const footer = `${offerExtension ? `<button type="button" class="btn" data-wn-extension>${ext?.outdated ? 'Obnovit rozšíření' : 'Nainstalovat rozšíření'}</button>` : ''}<button type="submit" class="btn btn--primary">Rozumím</button>`;
  await modal({
    title: 'Co je nového',
    body,
    footer,
    size: 'reader',
    onOpen: (scrim, close) => {
      scrim.querySelector('[data-wn-extension]')?.addEventListener('click', () => { close(true); goToExtension(); });
    },
  });
  open = false;
  markSeen();
}

export function initWhatsNew() {
  let checked = false;
  subscribe(() => {
    if (checked || !state.loaded || !state.version || !state.settings) return;
    // Nový uživatel má průvodce; novinky se mu ukážou až po další aktualizaci.
    if (!state.settings.welcomeCompleted) return;
    checked = true;
    const unseen = unseenReleases(state.settings.lastSeenVersion, state.version);
    if (unseen.length) showWhatsNew({ releases: unseen });
  });
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-whats-new]')) { e.preventDefault(); showWhatsNew(); }
  });
}
