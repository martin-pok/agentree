import { api } from '../api.js';
import { esc, norm, rel, fmtNum, shortPath } from '../format.js';
import { ICON } from '../icons.js';
import { fill, emptyState, toast, copy, modal } from '../ui.js';
import { renderMarkdown, splitFrontMatter } from '../markdown.js';

const v = { el: null, items: null, q: '', source: 'all', origin: 'all', sort: 'name', error: '', shown: 36, sig: '' };
const STRANA = 36; // karet najednou: 147 dovedností dělalo na telefonu stránku vysokou přes 37 000 px

const kb = (bytes) => `${fmtNum(Math.max(1, Math.round(bytes / 1024)))} kB`;

// `hidden` vezme prvek i klávesnici a čtečkám obrazovky, ne jen očím.
function ukaz(el, blok, ano) {
  const uzel = el.querySelector(`[data-blok="${blok}"]`);
  if (uzel) uzel.hidden = !ano;
}

/**
 * Které ovládací prvky mají nad daným seznamem vůbec smysl.
 *
 * Ovládání, které nemá co ovládat, jen zabírá místo a budí dojem, že je něco skryté:
 * při jediném zdroji vrátí „Vše“ i ten zdroj tentýž seznam a nad prázdným seznamem nemá
 * smysl ani hledání, ani řazení. Zbude prázdný stav, který řekne, co Agenteeq hledá.
 */
export function ovladani({ pocet, zdroju, puvodu }) {
  return {
    hledani: pocet > 0,
    zdroje: zdroju > 1,
    popis: pocet > 0,
    razeni: pocet > 1,
    puvod: puvodu > 1,
  };
}

// Pořadí od nejužitečnějšího: uživatel nejčastěji hledá to svoje.
const PUVOD = [['own', 'Moje'], ['anthropic', 'Od Anthropicu'], ['openai', 'Od OpenAI'], ['plugin', 'Z pluginu']];

const RAZENI = [
  ['name', 'Podle názvu'],
  ['recent', 'Naposledy upravené'],
  ['size', 'Od největší'],
];

function serad(list) {
  const kopie = [...list];
  if (v.sort === 'recent') return kopie.sort((a, b) => b.at - a.at);
  if (v.sort === 'size') return kopie.sort((a, b) => b.bytes - a.bytes);
  return kopie.sort((a, b) => a.name.localeCompare(b.name, 'cs'));
}

function souhrnHtml(items) {
  const zdroje = new Set(items.map((s) => s.source)).size;
  const bajtu = items.reduce((n, s) => n + s.bytes, 0);
  const posledni = items.reduce((n, s) => Math.max(n, s.at), 0);
  const dlazdice = [
    [fmtNum(items.length), items.length === 1 ? 'dovednost' : 'dovedností'],
    [String(zdroje), zdroje === 1 ? 'zdroj' : zdroje < 5 ? 'zdroje' : 'zdrojů'],
    [kb(bajtu), 'textu celkem'],
    [posledni ? rel(posledni) : '–', 'poslední úprava'],
  ];
  return `<section class="sk-sum" aria-label="Souhrn dovedností">
    ${dlazdice.map(([cislo, popis]) => `<div class="sk-sum-item"><b>${esc(cislo)}</b><span>${esc(popis)}</span></div>`).join('')}
  </section>`;
}

function cardHtml(s) {
  return `<article class="skill" data-skill="${esc(s.id)}">
    <div class="skill-main">
      <h3 class="skill-name"><button type="button" class="skill-open" data-open-skill="${esc(s.id)}">${esc(s.name)}</button></h3>
      ${s.description ? `<p>${esc(s.description)}</p>` : '<p class="muted">Bez popisu v hlavičce souboru.</p>'}
    </div>
    <div class="skill-meta">
      <span class="badge">${esc(s.source)}</span>${s.origin === 'own' ? '<span class="badge badge--ok">Moje</span>' : ''}
      <span class="muted small">${kb(s.bytes)} · upraveno <span data-ago="${s.at}">${rel(s.at)}</span></span>
    </div>
    <code class="skill-path" title="${esc(s.dir)}">${esc(shortPath(s.dir))}</code>
    <div class="skill-actions">
      <button class="btn btn--sm btn--primary" type="button" data-open-skill="${esc(s.id)}">${ICON.open}Číst</button>
      <button class="btn btn--sm btn--ico" type="button" data-copy-skill="${esc(s.id)}" title="Zkopírovat obsah">${ICON.copy}<span class="sr-only">Zkopírovat obsah</span></button>
      <a class="btn btn--sm btn--ico" href="/api/skills/${esc(s.id)}/raw?download=1" download title="Stáhnout soubor">${ICON.down}<span class="sr-only">Stáhnout soubor</span></a>
    </div>
  </article>`;
}

/* ---------- Čtečka ---------- */

function readerBody(s, text) {
  const { front, body } = splitFrontMatter(text);
  const radku = body.split('\n').length;
  const hlavicka = front.filter((f) => f.key !== 'name' && f.key !== 'description');
  return `<div class="reader" tabindex="-1">
    <div class="reader-meta">
      <span class="badge">${esc(s.source)}</span>
      <span class="muted small">${kb(s.bytes)} · ${fmtNum(radku)} ${radku === 1 ? 'řádek' : radku < 5 ? 'řádky' : 'řádků'} · upraveno ${esc(rel(s.at))}</span>
    </div>
    ${s.description ? `<p class="reader-lead">${esc(s.description)}</p>` : ''}
    <button type="button" class="reader-path" data-copy-path="${esc(s.dir)}" title="Zkopírovat cestu">
      ${ICON.copy}<code>${esc(s.dir)}/SKILL.md</code>
    </button>
    ${hlavicka.length ? `<dl class="reader-front">${hlavicka.map((f) => `<dt>${esc(f.key)}</dt><dd>${esc(f.value)}</dd>`).join('')}</dl>` : ''}
    <div class="md">${renderMarkdown(body) || '<p class="muted">Soubor nemá kromě hlavičky žádný obsah.</p>'}</div>
  </div>`;
}

async function openReader(id, opener) {
  const s = v.items?.find((x) => x.id === id);
  if (!s) return;
  let text;
  try {
    text = await api.skillText(id);
  } catch (err) {
    toast(err.message, { tone: 'velvet' });
    return;
  }
  await modal({
    title: s.name,
    size: 'reader',
    body: readerBody(s, text),
    opener,
    footer: `<button type="button" class="btn" data-reader-copy>${ICON.copy}Kopírovat vše</button>
      <a class="btn" href="/api/skills/${esc(s.id)}/raw?download=1" download>${ICON.down}Stáhnout</a>
      <button type="button" class="btn btn--primary" data-close>Zavřít</button>`,
    onOpen: (scrim) => {
      scrim.querySelector('[data-reader-copy]').addEventListener('click', () => copy(text, 'Dovednost je ve schránce'));
      scrim.querySelector('[data-copy-path]')?.addEventListener('click', (e) => copy(e.currentTarget.dataset.copyPath, 'Cesta je ve schránce'));
      // Zaostříme obsah, ne tlačítko: čtečka se otevírá kvůli čtení a šipky mají rovnou rolovat text.
      requestAnimationFrame(() => scrim.querySelector('.reader')?.focus());
    },
  });
}

/* ---------- Stránka ---------- */

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
    <div data-enter style="--i:0" data-region="sum"></div>
    <div class="toolbar" data-enter style="--i:1" data-blok="hledani">
      <label class="search-field">${ICON.search}<span class="sr-only">Hledat dovednost</span><input type="search" data-q placeholder="Název, popis nebo cesta…" autocomplete="off"></label>
      <div class="sk-sort" data-blok="razeni"><span class="sk-filtr-popis" id="sk-r">Řadit</span><div class="seg seg--light seg--sm" role="group" aria-labelledby="sk-r" data-region="sort"></div></div>
    </div>
    <section class="sk-filters" data-enter style="--i:2" aria-label="Filtry dovedností">
      <div class="sk-filtr" data-blok="zdroje"><span class="sk-filtr-popis" id="sk-z">Zdroj</span><div class="seg seg--light" role="group" aria-labelledby="sk-z" data-region="sources"></div></div>
      <div class="sk-filtr" data-blok="puvod"><span class="sk-filtr-popis" id="sk-p">Původ</span><div class="seg seg--light" role="group" aria-labelledby="sk-p" data-region="origins"></div></div>
    </section>
    <p class="note sk-note" data-enter style="--i:2" data-blok="popis">Dovednosti jsou soubory <code>SKILL.md</code> na tomto Macu – od Claude, jeho pluginů a Codexu. Agenteeq je jen čte a nikam neodesílá.</p>
    <div data-enter style="--i:3" data-region="list"></div>`;
  el.querySelector('[data-q]').addEventListener('input', (e) => { v.q = e.target.value; update(); });
  el.addEventListener('click', async (e) => {
    if (e.target.closest('[data-more]')) { v.shown += STRANA; update(); return; }
    const src = e.target.closest('[data-source-filter]');
    if (src) { v.source = src.dataset.sourceFilter; update(); return; }
    const sort = e.target.closest('[data-sort]');
    if (sort) { v.sort = sort.dataset.sort; update(); return; }
    const orig = e.target.closest('[data-origin-filter]');
    if (orig) { v.origin = orig.dataset.originFilter; update(); return; }
    const open = e.target.closest('[data-open-skill]');
    if (open) { openReader(open.dataset.openSkill, open); return; }
    const btn = e.target.closest('[data-copy-skill]');
    if (!btn) {
      // Klik kamkoli do karty mimo tlačítka otevře čtení – myš tak nemusí mířit na odkaz.
      const karta = e.target.closest('.skill');
      if (karta && !e.target.closest('a, button')) openReader(karta.dataset.skill, karta.querySelector('.skill-open'));
      return;
    }
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
  fill(el, 'sum', v.items.length ? souhrnHtml(v.items) : '');

  const sources = [...new Set(v.items.map((s) => s.source))];
  const pritomne = PUVOD.filter(([k]) => v.items.some((s) => s.origin === k));
  // Filtr, který se chystáme schovat, nesmí zůstat zapnutý – uživatel by pak koukal na
  // zúžený seznam a neměl čím ho vrátit zpátky.
  const viditelne = ovladani({ pocet: v.items.length, zdroju: sources.length, puvodu: pritomne.length });
  if (!viditelne.zdroje) v.source = 'all';
  if (!viditelne.puvod) v.origin = 'all';
  if (!viditelne.razeni) v.sort = 'name';

  fill(el, 'sources', [['all', 'Vše'], ...sources.map((s) => [s, s])]
    .map(([k, label]) => `<button type="button" data-source-filter="${esc(k)}" aria-pressed="${v.source === k}">${esc(label)}<span class="count">${k === 'all' ? v.items.length : v.items.filter((s) => s.source === k).length}</span></button>`).join(''));
  fill(el, 'sort', RAZENI.map(([k, label]) => `<button type="button" data-sort="${k}" aria-pressed="${v.sort === k}">${esc(label)}</button>`).join(''));
  // Ukazujeme jen původy, které se mezi dovednostmi opravdu vyskytují – prázdné tlačítko nemá smysl.
  fill(el, 'origins', [['all', 'Vše'], ...pritomne]
    .map(([k, label]) => `<button type="button" data-origin-filter="${esc(k)}" aria-pressed="${v.origin === k}">${esc(label)}<span class="count">${k === 'all' ? v.items.length : v.items.filter((s) => s.origin === k).length}</span></button>`).join(''));

  for (const [blok, ano] of Object.entries(viditelne)) ukaz(el, blok, ano);

  const q = norm(v.q.trim());
  const list = serad(v.items.filter((s) => (v.source === 'all' || s.source === v.source)
    && (v.origin === 'all' || s.origin === v.origin)
    && (!q || norm(`${s.name} ${s.description} ${s.dir}`).includes(q))));
  const sig = [v.q, v.source, v.origin, v.sort].join('|');
  if (sig !== v.sig) { v.sig = sig; v.shown = STRANA; }
  const ukazane = list.slice(0, v.shown);
  fill(el, 'list', list.length
    ? `<div class="skills">${ukazane.map(cardHtml).join('')}</div>${list.length > ukazane.length
      ? `<div class="skills-more"><span class="muted small">Zobrazeno ${ukazane.length} z ${list.length}</span><button class="btn" type="button" data-more>Zobrazit dalších ${Math.min(STRANA, list.length - ukazane.length)}</button></div>` : ''}`
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
