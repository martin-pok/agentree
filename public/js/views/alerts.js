import { state, emit } from '../state.js';
import { api } from '../api.js';
import { esc, timeHM, startOfDay, DAY, dateLong } from '../format.js';
import { ICON } from '../icons.js';
import { fill, alertIcon, emptyState, toast, agentHref } from '../ui.js';
import { tr } from '../i18n.js';

const v = { el: null, filter: 'all' };
const FILTERS = [
  ['all', tr('Vše'), () => true],
  ['unread', tr('Nepřečtené'), (a) => !a.read],
  ['needs_input', tr('Rozhodnutí'), (a) => a.kind === 'needs_input'],
  ['limit', tr('Limity'), (a) => a.kind === 'limit' || a.kind === 'limit_near'],
  ['budget', tr('Rozpočet'), (a) => a.kind === 'budget'],
  ['done', tr('Dokončené'), (a) => a.kind === 'done'],
];

export async function markRead(ids) {
  for (const a of state.alerts.items) if (ids === 'all' || ids.includes(a.id)) a.read = true;
  emit('alerts');
  try {
    const r = await api.readAlerts(ids);
    state.alerts.unread = r.unread;
    emit('alerts');
  } catch (err) {
    toast(err.message, { tone: 'err' });
  }
}

function dayLabel(ts) {
  const d = startOfDay(ts);
  const today = startOfDay(Date.now());
  if (d === today) return tr('Dnes');
  if (d === startOfDay(today - DAY)) return tr('Včera');
  return dateLong(ts);
}

function mount(el) {
  v.el = el;
  el.innerHTML = `
    <div class="toolbar" data-enter style="--i:1">
      <div class="seg" role="group" aria-label="${tr('Filtrovat upozornění')}" data-region="filters"></div>
      <div class="toolbar-actions">
        <a class="btn" href="#/nastaveni">${ICON.sliders}${tr('Nastavit upozornění')}</a>
        <button class="btn" type="button" data-read-all-view>${ICON.check}${tr('Označit vše jako přečtené')}</button>
      </div>
    </div>
    <div class="card" data-enter style="--i:2" data-region="list"></div>`;
  el.addEventListener('click', (e) => {
    const f = e.target.closest('[data-filter]');
    if (f) { v.filter = f.dataset.filter; update(); return; }
    if (e.target.closest('[data-read-all-view]')) { markRead('all'); return; }
    const r = e.target.closest('[data-read]');
    if (r) markRead([r.dataset.read]);
  });
}

function update() {
  const el = v.el;
  if (!el) return;
  const items = state.alerts.items;
  fill(el, 'filters', FILTERS.map(([k, l, pred]) => `<button type="button" data-filter="${k}" aria-pressed="${v.filter === k}">${l}<span class="count">${items.filter(pred).length}</span></button>`).join(''));
  const pred = FILTERS.find(([k]) => k === v.filter)[2];
  const list = items.filter(pred);
  if (!list.length) {
    fill(el, 'list', emptyState({
      title: v.filter === 'all' ? tr('Zatím žádná upozornění') : tr('Nic k zobrazení'),
      text: tr('Upozorníme tě, když agent bude potřebovat rozhodnutí, narazí na limit, dokončí dlouhou úlohu nebo když překročíš rozpočet.'),
    }));
    return;
  }
  let day = '';
  fill(el, 'list', `<ul class="alert-list">${list.map((a) => {
    const label = dayLabel(a.at);
    const head = label !== day ? `<li class="alert-day">${esc((day = label))}</li>` : '';
    return `${head}<li class="alert-item level-${esc(a.level)}${a.read ? '' : ' is-unread'}">
      <span class="alert-icon">${alertIcon(a)}</span>
      <div class="alert-main">
        <div class="alert-top"><strong>${esc(a.title)}</strong><time datetime="${new Date(a.at).toISOString()}">${timeHM(a.at)}</time></div>
        ${a.body ? `<p>${esc(a.body)}</p>` : ''}
        ${a.sessionId ? `<a class="link-inline" href="${agentHref(a.sessionId)}" data-read="${esc(a.id)}">${tr('Otevřít agenta')} ${ICON.arrow}</a>` : ''}
      </div>
      ${a.read ? '' : `<button class="icon-btn" type="button" data-read="${esc(a.id)}" aria-label="${tr('Označit jako přečtené')}">${ICON.check}</button>`}
    </li>`;
  }).join('')}</ul>`);
}

export default { id: 'upozorneni', title: tr('Upozornění'), mount, update, unmount: () => { v.el = null; } };
