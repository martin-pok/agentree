import { state, emit } from '../state.js';
import { api } from '../api.js';
import { esc, fmtTok, rel, dateTime, dur, shortPath, plural, timeHM, hourTs, H } from '../format.js';
import { glyph, PROVIDERS, pkey, ICON } from '../icons.js';
import { sparkline, stackBar } from '../charts.js';
import { fill, statusPill, kindLabel, howToAnswer, limitGauges } from '../ui.js';
import { sessionTotal } from '../data.js';

const v = { id: null, el: null, rendered: new Map(), follow: true, loading: false };
const MAX_RENDERED = 400;

// Bezpečný "markdown-lite": nejdřív escapovat, pak přidat jen kód, zvýraznění a odkazy http(s).
function md(text) {
  return String(text || '')
    .split('```')
    .map((part, i) => {
      if (i % 2) {
        const nl = part.indexOf('\n');
        const code = nl >= 0 && /^[\w+.-]*$/.test(part.slice(0, nl).trim()) ? part.slice(nl + 1) : part;
        return `<pre><code>${esc(code.replace(/\n$/, ''))}</code></pre>`;
      }
      let h = esc(part);
      h = h.replace(/`([^`\n]+)`/g, '<code>$1</code>');
      h = h.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
      h = h.replace(/(^|[\s(])(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');
      h = h.replace(/^#{1,6}\s+(.+)$/gm, '<span class="md-h">$1</span>');
      return h.replace(/\n/g, '<br>');
    })
    .join('');
}

const firstLine = (t) => String(t || '').replace(/\s+/g, ' ').trim().slice(0, 220);
const isLong = (t) => String(t || '').includes('\n') || String(t || '').length > 220;

// mcp__Claude_Browser__preview_logs → „Claude Browser · preview logs“
function toolLabel(name) {
  const n = String(name || 'Nástroj');
  if (!n.startsWith('mcp__')) return n;
  const parts = n.split('__').slice(1).map((p) => p.replace(/^plugin_/, '').replace(/_/g, ' ').trim()).filter(Boolean);
  return parts.length > 1 ? `${parts[0]} · ${parts.slice(1).join(' ')}` : parts[0] || 'MCP';
}

function entryClass(e) {
  return `msg msg--${e.role}${e.status === 'error' ? ' is-error' : ''}`;
}

function entryHtml(e) {
  const time = `<time class="msg-time" datetime="${new Date(e.at).toISOString()}">${timeHM(e.at)}</time>`;
  switch (e.role) {
    case 'user':
      return `<div class="msg-head"><span class="msg-who">Ty</span>${time}</div><div class="msg-body md">${md(e.text)}</div>`;
    case 'assistant':
      return `<div class="msg-head"><span class="msg-who">Agent</span>${time}</div><div class="msg-body md">${md(e.text)}</div>`;
    case 'tool':
      return `<div class="tool-line"><span class="tool-name" title="${esc(e.tool || '')}">${esc(toolLabel(e.tool))}</span><span class="tool-text">${esc(firstLine(e.text))}</span>${time}</div>${isLong(e.text) ? `<details><summary>Celý vstup</summary><pre>${esc(e.text)}</pre></details>` : ''}`;
    case 'result':
      return `<div class="tool-line result">${e.status === 'error' ? ICON.close : ICON.check}<span class="tool-text">${esc(firstLine(e.text) || 'Hotovo')}</span></div>${isLong(e.text) ? `<details><summary>Výstup</summary><pre>${esc(e.text)}</pre></details>` : ''}`;
    case 'error':
      return `<div class="msg-sys">${ICON.alert}<span>${esc(e.text)}</span>${time}</div>`;
    default:
      return `<div class="msg-sys"><span>${esc(e.text)}</span>${time}</div>`;
  }
}

function progressHtml(p) {
  const pct = p.total ? (p.done / p.total) * 100 : 0;
  return `<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${p.total}" aria-valuenow="${p.done}" aria-label="Plán úkolů">
    <div class="progress-top"><span>${p.done} z ${p.total} ${plural(p.total, 'úkolu', 'úkolů', 'úkolů')}</span>${p.current ? `<span class="muted">${esc(p.current)}</span>` : ''}</div>
    <div class="progress-track"><i style="width:${pct.toFixed(1)}%"></i></div>
  </div>`;
}

async function load() {
  const id = v.id;
  if (!state.transcripts.has(id)) state.transcripts.set(id, { entries: new Map(), stale: false, loaded: false, error: '' });
  const t = state.transcripts.get(id);
  v.loading = true;
  try {
    const r = await api.session(id);
    if (v.id !== id) return;
    t.entries = new Map(r.transcript.map((e) => [e.seq, e]));
    t.loaded = true;
    t.error = '';
    if (!state.sessions.has(id)) state.sessions.set(id, r.session);
  } catch (err) {
    t.loaded = true;
    t.error = err.status === 404 ? 'Session už není v okně sledování (starší než 30 dní) nebo byla smazána.' : err.message;
  } finally {
    v.loading = false;
    emit(`transcript:${id}`, `session:${id}`);
  }
}

function mount(el, [id]) {
  Object.assign(v, { id, el, rendered: new Map(), follow: true });
  el.innerHTML = `<div class="session">
    <a class="back" href="#/agenti">${ICON.back}Všichni agenti</a>
    <header class="session-head" data-region="head"><div class="skeleton" style="width:40%"></div><div class="skeleton skeleton--lg"></div></header>
    <div data-region="banner"></div>
    <div data-region="live"></div>
    <div class="session-grid">
      <section class="card transcript" aria-labelledby="tr-h">
        <div class="transcript-bar">
          <h2 id="tr-h">Přepis</h2><span class="muted small" data-region="tr-count"></span>
          <label class="check-inline"><input type="checkbox" data-tools checked> Zobrazit nástroje</label>
        </div>
        <ol class="transcript-list" data-list></ol>
        <div class="transcript-empty" data-region="tr-empty"></div>
        <button class="jump" type="button" data-jump hidden>${ICON.down}Nové zprávy</button>
      </section>
      <aside class="session-side" data-region="side"></aside>
    </div>
  </div>`;
  const list = el.querySelector('[data-list]');
  const jump = el.querySelector('[data-jump]');
  list.addEventListener('scroll', () => {
    v.follow = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
    if (v.follow) jump.hidden = true;
  }, { passive: true });
  el.querySelector('[data-tools]').addEventListener('change', (e) => list.classList.toggle('hide-tools', !e.target.checked));
  jump.addEventListener('click', () => {
    list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
    v.follow = true;
    jump.hidden = true;
  });
  load();
}

function renderTranscript(el, t) {
  const list = el.querySelector('[data-list]');
  const jump = el.querySelector('[data-jump]');
  const entries = [...t.entries.values()].sort((a, b) => a.seq - b.seq).slice(-MAX_RENDERED);
  const keep = new Set(entries.map((e) => e.seq));
  for (const [seq, node] of v.rendered) {
    if (!keep.has(seq)) {
      node.el.remove();
      v.rendered.delete(seq);
    }
  }
  let added = false;
  let prev = null;
  for (const e of entries) {
    const html = entryHtml(e);
    const r = v.rendered.get(e.seq);
    if (r) {
      if (r.html !== html) {
        r.el.className = entryClass(e);
        r.el.innerHTML = html;
        r.html = html;
        added = true;
      }
      prev = r.el;
    } else {
      const li = document.createElement('li');
      li.className = entryClass(e);
      li.innerHTML = html;
      if (prev) prev.after(li);
      else list.prepend(li);
      v.rendered.set(e.seq, { el: li, html });
      prev = li;
      added = true;
    }
  }
  fill(el, 'tr-count', entries.length ? `${entries.length} ${plural(entries.length, 'záznam', 'záznamy', 'záznamů')}` : '');
  fill(el, 'tr-empty', t.error ? `<p class="muted">${esc(t.error)}</p>` : !t.loaded ? '<div class="loading"><span class="loader"></span>Načítám přepis…</div>' : entries.length ? '' : '<p class="muted">Přepis je zatím prázdný.</p>');
  if (added) {
    if (v.follow) list.scrollTop = list.scrollHeight;
    else jump.hidden = false;
  }
}

function update() {
  const el = v.el;
  if (!el) return;
  const s = state.sessions.get(v.id);
  const t = state.transcripts.get(v.id);
  const now = Date.now();
  if (t?.stale && !v.loading) {
    t.stale = false;
    load();
  }
  if (t) renderTranscript(el, t);
  if (!s) {
    if (t?.error) fill(el, 'head', `<h2 class="session-title">Agent nenalezen</h2><p class="muted">${esc(t.error)}</p>`);
    return;
  }

  fill(el, 'head', `
    <div class="session-kicker"><span class="icon-tile">${glyph(s.provider)}</span><span>${esc(s.app)}</span><span class="dot-sep" aria-hidden="true"></span><span>${s.source === 'web' ? 'webová aplikace' : 'na tomto Macu'}</span>${s.hooked ? '<span class="badge badge--ok">Okamžité události</span>' : ''}</div>
    <h2 class="session-title">${esc(s.title)}</h2>
    <div class="session-meta">${statusPill(s.status)}<span class="muted">Poslední aktivita <span data-ago="${s.lastAt}">${rel(s.lastAt, now)}</span></span>${s.cwd ? `<code class="path">${esc(shortPath(s.cwd))}</code>` : ''}</div>
    <div class="session-actions">
      ${s.url ? `<a class="btn btn--primary" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${ICON.external}Otevřít konverzaci</a>` : ''}
      ${s.resume ? `<button class="btn${s.url ? '' : ' btn--primary'}" type="button" data-copy="${esc(s.resume)}" data-copy-message="Příkaz zkopírován — vlož ho do Terminálu">${ICON.terminal}Kopírovat příkaz pro pokračování</button>` : ''}
      ${s.cwd ? `<button class="btn" type="button" data-copy="${esc(s.cwd)}">${ICON.folder}Kopírovat cestu</button>` : ''}
    </div>`);

  fill(el, 'banner', s.status === 'needs_input'
    ? `<div class="banner banner--action" role="alert">${ICON.hand}<div><strong>${esc(kindLabel(s.pending?.kind))}</strong><p>${esc(s.reason)}</p><p class="small muted">${esc(howToAnswer(s))}</p></div></div>`
    : s.status === 'limited'
      ? `<div class="banner banner--limit" role="alert">${ICON.alert}<div><strong>Vyčerpaný limit</strong><p>${esc(s.limit?.text || s.reason)}</p>${s.limit?.resetsAt ? `<p class="small muted">Obnoví se ${dateTime(s.limit.resetsAt)}.</p>` : ''}</div></div>`
      : '');

  fill(el, 'live', s.status === 'working'
    ? `<div class="live-strip" role="status">
        <span class="pulse" aria-hidden="true"></span>
        <div class="live-text"><span class="live-activity">${esc(s.activity || 'Pracuje')}</span>
          <span class="live-meta">${s.turnStartedAt ? `Tah běží <span data-clock-from="${s.turnStartedAt}"></span>` : 'Pracuje'}${s.turnSteps ? ` · ${s.turnSteps} ${plural(s.turnSteps, 'krok', 'kroky', 'kroků')}` : ''}</span></div>
        ${s.progress?.total ? progressHtml(s.progress) : '<div class="indeterminate" aria-hidden="true"><i></i></div>'}
      </div>`
    : s.progress?.total ? `<div class="live-strip is-static">${progressHtml(s.progress)}</div>` : '');

  const color = PROVIDERS[pkey(s.provider)];
  const h0 = Math.floor(now / H) * H - 23 * H;
  const spark = new Array(24).fill(0);
  for (const k in s.hourly) {
    const i = Math.floor((hourTs(k) - h0) / H);
    if (i >= 0 && i < 24) spark[i] += s.hourly[k];
  }
  const tok = s.tokens || {};
  const hasTokens = sessionTotal(s) + (tok.cacheRead || 0) > 0;
  const limits = limitGauges(state.limits, now, { size: 'sm', provider: s.provider });

  fill(el, 'side', `
    <section class="card side-card" aria-labelledby="facts-h"><h3 id="facts-h">Detaily</h3>
      <dl class="facts">
        <div><dt>Model</dt><dd>${esc(s.model || '—')}</dd></div>
        <div><dt>Větev</dt><dd>${esc(s.branch || '—')}</dd></div>
        <div><dt>Zahájeno</dt><dd>${dateTime(s.startedAt)}</dd></div>
        <div><dt>Doba trvání</dt><dd>${s.startedAt ? dur(s.lastAt - s.startedAt) : '—'}</dd></div>
        <div><dt>Zadání</dt><dd>${s.turns ?? '—'}</dd></div>
        <div><dt>Tokeny</dt><dd>${hasTokens ? fmtTok(sessionTotal(s)) : '—'}</dd></div>
        <div class="wide"><dt>ID</dt><dd class="mono-sm">${esc(s.id)}</dd></div>
      </dl>
    </section>
    ${hasTokens ? `<section class="card side-card" aria-labelledby="tok-h"><h3 id="tok-h">Složení tokenů</h3>${stackBar([
      { label: 'Vstup', value: tok.input || 0, color: '#1E1B22' },
      { label: 'Výstup', value: tok.output || 0, color: color.color },
      { label: 'Zápis do cache', value: tok.cacheWrite || 0, color: '#45BEC3' },
      { label: 'Čtení z cache', value: tok.cacheRead || 0, color: '#E7E4EA' },
    ])}</section>` : ''}
    ${hasTokens ? `<section class="card side-card" aria-labelledby="spark-h"><h3 id="spark-h">Aktivita za 24 hodin · ${fmtTok(spark.reduce((a, b) => a + b, 0))}</h3><div class="side-spark">${sparkline(spark, color.ink, { height: 64, fill: true })}</div></section>` : ''}
    ${limits.length ? `<section class="card side-card" aria-labelledby="lim-h"><h3 id="lim-h">Limity</h3><div class="gauges gauges--sm">${limits.slice(0, 2).join('')}</div></section>` : ''}
    ${s.lastPrompt ? `<section class="card side-card" aria-labelledby="lp-h"><h3 id="lp-h">Poslední zadání</h3><blockquote class="quote">${esc(s.lastPrompt)}</blockquote></section>` : ''}
  `);
}

export default {
  id: 'agent',
  title: 'Detail agenta',
  mount,
  update,
  unmount() {
    state.transcripts.delete(v.id);
    Object.assign(v, { id: null, el: null, rendered: new Map() });
  },
};
