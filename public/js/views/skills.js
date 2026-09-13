import { api } from '../api.js';
import { esc, norm, rel, fmtNum, shortPath } from '../format.js';
import { ICON } from '../icons.js';
import { fill, emptyState, toast, copy } from '../ui.js';

const v = { el: null, items: null, q: '', source: 'all', error: '' };

const kb = (bytes) => `${fmtNum(Math.max(1, Math.round(bytes / 1024)))} kB`;

function rowHtml(s) {
  return `<article class="skill">
    <div class="skill-main">
      <h3>${esc(s.name)}</h3>
      ${s.description ? `<p>${esc(s.description)}</p>` : '<p class="muted">Bez popisu v hlavičce souboru.</p>'}
      <div class="skill-meta"><span class="badge">${esc(s.source)}</span><span class="muted small">${kb(s.bytes)} · upraveno <span data-ago="${s.at}">${rel(s.at)}</span></span>
        <code class="skill-path" title="${esc(s.dir)}">${esc(shortPath(s.dir))}</code></div>
    </div>
    <div class="skill-actions">
      <button class="btn btn--sm" type="button" data-copy-skill="${esc(s.id)}">${ICON.copy}Kopírovat</button>
      <a class="btn btn--sm" href="/api/skills/${esc(s.id)}/raw?download=1" download>${ICON.down}Stáhnout</a>
    </div>
  </article>`;
}

async function load() {
  try {
    v.items = (await api.skills()).skills;
    v.error = '';
  } catch (err) {
    v.items = [];
    v.error = err.message;
  }
  update();
}

function mount(el) {
  v.el = el;
  el.innerHTML = `
    <div class="toolbar" data-enter style="--i:1">
      <div class="seg seg--light" role="group" aria-label="Filtrovat podle zdroje" data-region="sources"></div>
      <label class="search-field">${ICON.search}<span class="sr-only">Hledat dovednost</span><input type="search" data-q placeholder="Název nebo popis…" autocomplete="off"></label>
    </div>
    <p class="note" data-enter style="--i:2">Dovednosti jsou soubory <code>SKILL.md</code> na tomto Macu — od Claude, jeho pluginů a Codexu. Agenteeq je jen čte; zkopírovaný text můžeš vložit jiné službě nebo agentovi.</p>
    <div data-enter style="--i:3" data-region="list"></div>`;
  el.querySelector('[data-q]').addEventListener('input', (e) => { v.q = e.target.value; update(); });
  el.addEventListener('click', async (e) => {
    const src = e.target.closest('[data-source-filter]');
    if (src) { v.source = src.dataset.sourceFilter; update(); return; }
    const btn = e.target.closest('[data-copy-skill]');
    if (!btn) return;
    btn.disabled = true;
    try {
      const text = await api.skillText(btn.dataset.copySkill);
      await copy(text, 'Dovednost je ve schránce');
    } catch (err) {
      toast(err.message, { tone: 'velvet' });
    } finally {
      btn.disabled = false;
    }
  });
  if (!v.items) load();
  else update();
}

function update() {
  const el = v.el;
  if (!el) return;
  if (v.error) {
    fill(el, 'list', emptyState({ title: 'Dovednosti se nepodařilo načíst', text: esc(v.error) }));
    return;
  }
  if (!v.items) {
    fill(el, 'list', '<div class="loading" role="status"><span class="loader"></span>Hledám dovednosti na tomto Macu…</div>');
    return;
  }
  const sources = [...new Set(v.items.map((s) => s.source))];
  fill(el, 'sources', [['all', 'Vše'], ...sources.map((s) => [s, s])]
    .map(([k, label]) => `<button type="button" data-source-filter="${esc(k)}" aria-pressed="${v.source === k}">${esc(label)}<span class="count">${k === 'all' ? v.items.length : v.items.filter((s) => s.source === k).length}</span></button>`).join(''));

  const q = norm(v.q.trim());
  const list = v.items.filter((s) => (v.source === 'all' || s.source === v.source) && (!q || norm(`${s.name} ${s.description}`).includes(q)));
  fill(el, 'list', list.length
    ? `<div class="skills">${list.map(rowHtml).join('')}</div>`
    : emptyState({
      title: v.items.length ? 'Tomuto filtru neodpovídá žádná dovednost' : 'Na tomto Macu zatím žádné dovednosti nejsou',
      text: v.items.length ? 'Zkus jiný zdroj nebo hledaný výraz.' : 'Agenteeq hledá soubory SKILL.md u Claude (včetně pluginů a plánovaných úloh) a u Codexu.',
    }));
}

export default {
  id: 'dovednosti',
  title: 'Dovednosti',
  mount,
  update,
  unmount: () => { v.el = null; },
};
