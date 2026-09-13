import { state, emit } from '../state.js';
import { api } from '../api.js';
import { esc, fmtTok, rel, dateTime, dur, shortPath, plural, timeHM, hourTs, H } from '../format.js';
import { glyph, PROVIDERS, pkey, ICON } from '../icons.js';
import { miniBars, stackBar } from '../charts.js';
import { fill, statusPill, kindLabel, howToAnswer, limitGauges, openButtons, toast } from '../ui.js';
import { sessionTotal } from '../data.js';
import { projectById } from '../state.js';
import { pdot, projectHref, assignDialog } from '../projects-ui.js';

const v = { id: null, el: null, rendered: new Map(), follow: true, loading: false, browsing: false, onDocPointer: null };
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
    t.error = err.status === 404 ? 'Konverzace je starší než 30 dní nebo byla smazána.' : err.message;
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
        <ol class="transcript-list" data-list tabindex="0" role="region" aria-label="Přepis konverzace"></ol>
        <div class="transcript-empty" data-region="tr-empty"></div>
        <span class="transcript-hint" data-hint aria-hidden="true" hidden>${ICON.down}Klikni a procházej přepis</span>
        <button class="jump" type="button" data-jump hidden>${ICON.down}Nové zprávy</button>
        <div data-reply-slot></div>
      </section>
      <aside class="session-side" data-region="side"></aside>
    </div>
  </div>`;
  const list = el.querySelector('[data-list]');
  const jump = el.querySelector('[data-jump]');
  const hint = el.querySelector('[data-hint]');
  // Přepis nekrade kolečko myši: dokud do něj uživatel neklikne (nebo na něj nepřejde tabulátorem),
  // scrolluje se celá stránka. Escape nebo kliknutí mimo přepis ho zase uvolní.
  const setBrowsing = (on) => {
    if (v.browsing === on) return;
    v.browsing = on;
    list.classList.toggle('is-browsing', on);
    syncHint();
  };
  const syncHint = () => {
    const clipped = !v.browsing && list.scrollHeight - list.clientHeight >= 8;
    hint.hidden = !clipped;
    list.classList.toggle('is-clipped', clipped);
  };
  v.syncHint = syncHint;
  list.addEventListener('pointerdown', () => setBrowsing(true));
  list.addEventListener('focusin', () => setBrowsing(true));
  list.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !v.browsing) return;
    e.stopPropagation();
    setBrowsing(false);
    list.blur();
  });
  v.onDocPointer = (e) => { if (!e.target.closest('.transcript')) setBrowsing(false); };
  document.addEventListener('pointerdown', v.onDocPointer, true);
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
  el.addEventListener('click', async (e) => {
    if (e.target.closest('[data-action="assign"]')) {
      const s = state.sessions.get(v.id);
      if (s) assignDialog([s.id], { current: s.projectId });
      return;
    }
    const stop = e.target.closest('[data-chat-stop]');
    if (stop) {
      stop.disabled = true;
      try { await api.stopChat(v.id); } catch (err) { toast(err.message, { tone: 'velvet' }); } finally { stop.disabled = false; }
    }
  });
  el.addEventListener('submit', async (e) => {
    const form = e.target.closest('[data-reply]');
    if (!form) return;
    e.preventDefault();
    const input = form.querySelector('textarea');
    const text = input.value.trim();
    if (!text) { input.focus(); return; }
    const btn = form.querySelector('[type="submit"]');
    btn.disabled = true;
    try {
      await api.reply(v.id, text);
      input.value = '';
      v.follow = true;
    } catch (err) {
      btn.disabled = false;
      toast(err.message, { tone: 'velvet', timeout: 8000 });
    }
  });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && e.target.closest('[data-reply] textarea')) {
      e.preventDefault();
      e.target.closest('form').requestSubmit();
    }
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
  v.syncHint?.();
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
    <div class="session-kicker"><span class="icon-tile">${glyph(s)}</span><span>${esc(s.app)}</span><span class="dot-sep" aria-hidden="true"></span><span>${s.source === 'web' ? 'webová aplikace' : 'na tomto Macu'}</span>${s.hooked ? '<span class="badge badge--ok">Propojeno</span>' : ''}</div>
    <h2 class="session-title">${esc(s.title)}</h2>
    <div class="session-meta">${statusPill(s.status)}<span class="muted">Poslední aktivita <span data-ago="${s.lastAt}">${rel(s.lastAt, now)}</span></span>${s.cwd ? `<code class="path">${esc(shortPath(s.cwd))}</code>` : ''}</div>
    <div class="session-actions">
      ${openButtons(s)}
      ${s.resume ? `<button class="icon-btn icon-btn--line" type="button" data-copy="${esc(s.resume)}" data-copy-message="Příkaz pro pokračování zkopírován" aria-label="Kopírovat příkaz pro pokračování" title="Kopírovat příkaz pro pokračování">${ICON.copy}</button>` : ''}
    </div>`);

  fill(el, 'banner', s.status === 'needs_input'
    ? `<div class="banner banner--action" role="alert">${ICON.hand}<div><strong>${esc(kindLabel(s.pending?.kind))}</strong><p>${esc(s.reason)}</p><p class="small muted">${esc(howToAnswer(s))}</p></div></div>`
    : s.status === 'limited'
      ? `<div class="banner banner--limit" role="alert">${ICON.alert}<div><strong>Vyčerpaný limit</strong><p>${esc(s.limit?.text || s.reason)}</p>${s.limit?.resetsAt ? `<p class="small muted">Obnoví se ${dateTime(s.limit.resetsAt)}.</p>` : ''}</div></div>`
      : s.status === 'failed'
        ? `<div class="banner banner--action" role="alert">${ICON.alert}<div><strong>Spuštění selhalo</strong><p>${esc(s.failure?.text || s.reason)}</p><p class="small muted">Agenteeq ukazuje přesnou chybu z výstupu agenta. Po vyřešení spusť úlohu znovu.</p></div></div>`
        : '');

  fill(el, 'live', s.status === 'working'
    ? `<div class="live-strip" role="status">
        <span class="pulse" aria-hidden="true"></span>
        <div class="live-text"><span class="live-activity">${esc(s.activity || 'Pracuje')}</span>
          <span class="live-meta">${s.turnStartedAt ? `Pracuje už <span data-clock-from="${s.turnStartedAt}"></span>` : 'Pracuje'}${s.turnSteps ? ` · ${s.turnSteps} ${plural(s.turnSteps, 'krok', 'kroky', 'kroků')}` : ''}</span></div>
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
  const helpers = [...state.sessions.values()].filter((x) => x.parentId === s.id);
  const reviews = helpers.filter((x) => x.subagent?.kind === 'review');
  // Pomocní agenti mají vlastní přepis, takže na ně jde prokliknout a vidět, co vlastně dělali.
  const helperAgents = helpers.filter((x) => x.subagent?.kind !== 'review');
  const parent = s.parentId ? state.sessions.get(s.parentId) : null;
  const limits = limitGauges(state.limits, now, { size: 'sm', provider: s.provider });

  const slot = el.querySelector('[data-reply-slot]');
  if (s.connector === 'local-chat' && s.chat?.available) {
    if (!slot.querySelector('[data-reply]')) {
      slot.innerHTML = `<form class="reply" data-reply>
        <label class="sr-only" for="reply-in">Zpráva pro model</label>
        <textarea id="reply-in" rows="2" maxlength="20000" placeholder="Napiš další zprávu…"></textarea>
        <div class="reply-actions"><span class="muted small"><kbd>⌘</kbd><kbd>↵</kbd> odešle</span><button type="button" class="btn btn--sm" data-chat-stop hidden>Zastavit</button><button type="submit" class="btn btn--sm btn--primary">Odeslat</button></div>
      </form>`;
    }
    const working = s.status === 'working';
    slot.querySelector('[data-chat-stop]').hidden = !working;
    slot.querySelector('[type="submit"]').disabled = working;
  } else if (s.connector === 'local-chat') {
    const note = '<p class="reply-note">Tahle lokální konverzace skončila restartem Agenteeq. Novou začneš v Přehledu přes Spustit agenta → Ollama.</p>';
    if (slot._html !== note) { slot.innerHTML = note; slot._html = note; }
  } else if (slot.innerHTML) {
    slot.innerHTML = '';
  }

  const proj = s.projectId ? projectById(s.projectId) : null;
  fill(el, 'side', `
    <section class="card side-card" aria-labelledby="proj-h"><div class="side-head"><h3 id="proj-h">Projekt</h3><button class="link" type="button" data-action="assign">${proj ? 'Změnit' : 'Zařadit do projektu'}</button></div>
      ${proj
        ? `<a class="pchip" href="${projectHref(proj.id)}">${pdot(proj, 'pdot--lg')}<span>${esc(proj.name)}</span>${ICON.chev}</a><p class="small muted side-note">${s.projectSource === 'folder' ? 'Zařazeno automaticky podle složky.' : 'Zařazeno ručně.'}</p>`
        : `<p class="small muted side-note">${s.projectSource === 'none' ? 'Záměrně mimo projekty.' : 'Zatím v žádném projektu.'}</p>`}
    </section>
    <section class="card side-card" aria-labelledby="facts-h"><h3 id="facts-h">Detaily</h3>
      <dl class="facts">
        <div><dt>Model</dt><dd>${esc(s.model || '—')}</dd></div>
        <div><dt>Větev</dt><dd>${esc(s.branch || '—')}${s.worktree ? `<br><span class="muted">pracovní kopie ${esc(s.worktree)}</span>` : ''}</dd></div>
        ${s.context ? `<div><dt>Kontext</dt><dd>${s.context.usedPercent} %${s.context.size ? ` z ${fmtTok(s.context.size)}` : ''}</dd></div>` : ''}
        ${s.effort ? `<div><dt>Úroveň přemýšlení</dt><dd>${esc(s.effort)}</dd></div>` : ''}
        ${s.repo ? `<div><dt>Repozitář</dt><dd>${esc(s.repo)}</dd></div>` : ''}
        ${s.pr ? `<div><dt>Pull request</dt><dd>${s.pr.url ? `<a href="${esc(s.pr.url)}" target="_blank" rel="noopener noreferrer">#${s.pr.number}</a>` : `#${s.pr.number}`}${s.pr.state ? ` · ${esc(s.pr.state)}` : ''}</dd></div>` : ''}
        ${s.costUsd !== null && s.costUsd !== undefined ? `<div><dt>Cena relace (API ekv.)</dt><dd>${s.costUsd.toLocaleString('cs-CZ', { style: 'currency', currency: 'USD' })}</dd></div>` : ''}
        <div><dt>Zahájeno</dt><dd>${dateTime(s.startedAt)}</dd></div>
        <div><dt>Doba trvání</dt><dd>${s.startedAt ? dur(s.lastAt - s.startedAt) : '—'}</dd></div>
        <div><dt>Zadání</dt><dd>${s.turns ?? '—'}</dd></div>
        <div><dt>Tokeny</dt><dd>${hasTokens ? fmtTok(sessionTotal(s)) : '—'}</dd></div>
        ${reviews.length ? `<div><dt>Automatické kontroly</dt><dd>${reviews.length} · ${fmtTok(reviews.reduce((a, x) => a + sessionTotal(x), 0))}</dd></div>` : ''}
        ${helperAgents.length ? `<div><dt>Pomocní agenti</dt><dd>${helperAgents.length} · ${fmtTok(helperAgents.reduce((a, x) => a + sessionTotal(x), 0))}</dd></div>` : ''}
        ${helperAgents.length ? `<div class="wide"><dt>Co dělali</dt><dd><ul class="helper-list">${helperAgents.map((x) => `<li><a class="link-inline" href="#/agent/${encodeURIComponent(x.id)}">${esc(x.title)}</a><span class="muted small">${fmtTok(sessionTotal(x))}</span></li>`).join('')}</ul></dd></div>` : ''}
        ${s.taskName ? `<div><dt>Spuštění úlohy</dt><dd>${[...state.sessions.values()].filter((x) => x.connector === s.connector && x.taskName === s.taskName).length}</dd></div>` : ''}
        ${parent ? `<div class="wide"><dt>Patří ke konverzaci</dt><dd><a class="link-inline" href="#/agent/${encodeURIComponent(parent.id)}">${esc(parent.title)}</a></dd></div>` : ''}
        <div class="wide"><dt>ID</dt><dd class="mono-sm">${esc(s.id)}</dd></div>
      </dl>
    </section>
    ${hasTokens ? `<section class="card side-card" aria-labelledby="tok-h"><h3 id="tok-h">Složení tokenů</h3>${stackBar([
      { label: 'Vstup', value: tok.input || 0, color: '#16141D' },
      { label: 'Výstup', value: tok.output || 0, color: color.color },
      { label: 'Zápis do cache', value: tok.cacheWrite || 0, color: '#22A38C' },
      { label: 'Čtení z cache', value: tok.cacheRead || 0, color: '#E3E1E9' },
    ])}</section>` : ''}
    ${hasTokens ? `<section class="card side-card" aria-labelledby="spark-h"><h3 id="spark-h">Aktivita za 24 hodin · ${fmtTok(spark.reduce((a, b) => a + b, 0))}</h3><div class="side-spark">${miniBars(spark, color.ink, { height: 64 })}</div></section>` : ''}
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
    if (v.onDocPointer) document.removeEventListener('pointerdown', v.onDocPointer, true);
    Object.assign(v, { id: null, el: null, rendered: new Map(), browsing: false, onDocPointer: null, syncHint: null });
  },
};
