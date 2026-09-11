import { state, projectById, launchIntent } from './state.js';
import { api } from './api.js';
import { esc, rel, shortPath, plural } from './format.js';
import { glyph, ICON } from './icons.js';
import { fill, toast, modal, agentHref } from './ui.js';
import { pickFolder, recentFolders, pdot } from './projects-ui.js';

const STORE_KEY = 'agentree.launch';
const PROMPT_MAX = 20000;
const RUN_LABEL = { running: 'Běží', stopping: 'Zastavuji', done: 'Hotovo', failed: 'Selhalo', stopped: 'Zastaveno' };
const MODE_HINT = {
  terminal: 'Otevře se nové okno Terminálu, kde s agentem můžeš dál mluvit.',
  background: 'Agent pracuje bez okna a sám skončí. Průběh uvidíš tady a v přepisu.',
  app: 'Otevře aplikaci s předvyplněným zadáním.',
  web: 'Otevře službu v prohlížeči; zadání je navíc ve schránce (⌘V).',
  local: 'Model běží na tvém Macu — zdarma a bez odesílání dat. Odpovídá přímo v Agentree.',
};

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY)) || {};
  } catch {
    return {};
  }
}
function save(prefs) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(prefs)); } catch { /* soukromé okno */ }
}

export function createLauncher(root) {
  const prefs = { agent: '', modes: {}, cwd: {}, permission: 'plan', sandbox: 'read-only', model: '', projectId: '', brief: true, draft: '', ...load() };
  let busy = false;

  root.innerHTML = `
    <div class="launch-head">
      <div><h2 id="launch-h">Spustit agenta</h2><p class="muted small">Běží na tvých předplatných a limitech. Zdarma: lokální modely v Ollamě.</p></div>
      <button class="link" type="button" data-l="refresh" aria-label="Obnovit nabídku agentů">${ICON.refresh}<span>Obnovit nabídku</span></button>
    </div>
    <div class="launch-agents" role="radiogroup" aria-label="Agent" data-region="agents"></div>
    <div class="launch-compose">
      <label class="sr-only" for="launch-prompt">Zadání pro agenta</label>
      <textarea id="launch-prompt" class="launch-prompt" rows="3" maxlength="${PROMPT_MAX}" data-l-prompt placeholder="Co má agent udělat? Např. „Přidej na web stránku s ceníkem a otestuj ji na mobilu.“"></textarea>
      <div class="launch-controls" data-region="controls"></div>
      <div class="launch-foot">
        <p class="launch-note" data-region="note"></p>
        <span class="launch-kbd muted small"><kbd>⌘</kbd><kbd>↵</kbd></span>
        <button class="btn btn--primary launch-go" type="button" data-l="go">${ICON.spark}Spustit</button>
      </div>
    </div>
    <div class="runs" data-region="runs"></div>`;

  const promptEl = root.querySelector('[data-l-prompt]');
  const goBtn = root.querySelector('[data-l="go"]');
  promptEl.value = prefs.draft || '';

  const targets = () => state.launch?.targets || [];
  const target = () => targets().find((t) => t.id === prefs.agent) || targets()[0] || null;
  const modeOf = (t) => (t && t.modes.includes(prefs.modes[t.id]) ? prefs.modes[t.id] : t?.modes[0]);
  const needsFolder = (t, mode) => Boolean(t?.projectModes.includes(mode));
  const project = () => (prefs.projectId ? projectById(prefs.projectId) : null);
  const cwdFor = (t) => {
    const p = project();
    const saved = prefs.cwd[t?.id];
    if (p?.folders.length) return p.folders.includes(saved) ? saved : p.folders[0];
    return saved || recentFolders(1)[0] || '';
  };
  const persist = () => save({ ...prefs, draft: promptEl.value.slice(0, PROMPT_MAX) });

  function render() {
    const list = targets();
    const t = target();
    if (t && prefs.agent !== t.id) prefs.agent = t.id;
    if (prefs.projectId && !project()) prefs.projectId = '';

    const groups = [['agent', 'Na tomto Macu'], ['local', 'Zdarma lokálně'], ['web', 'Na webu']];
    fill(root, 'agents', list.length
      ? groups.map(([g, label]) => {
        const items = list.filter((x) => x.group === g);
        if (!items.length) return '';
        return `<div class="launch-group"><span class="launch-group-label">${label}</span><div class="launch-chips">${items.map((x) => `<button type="button" class="lchip" role="radio" aria-checked="${x.id === t?.id}" data-agent="${esc(x.id)}">${glyph(x)}<span>${esc(x.label)}</span>${x.beta ? '<span class="badge">Beta</span>' : ''}</button>`).join('')}</div></div>`;
      }).join('')
      : '<p class="muted small">Načítám, co jde na tomto Macu spustit…</p>');

    if (!t) {
      fill(root, 'controls', '');
      fill(root, 'note', '');
      goBtn.disabled = true;
      return;
    }
    goBtn.disabled = busy;
    const mode = modeOf(t);
    const p = project();
    const cwd = cwdFor(t);
    const active = state.projects.items.filter((x) => !x.archived);
    const modes = state.launch.modes || {};

    fill(root, 'controls', `
      ${t.modes.length > 1 ? `<div class="seg seg--light seg--sm" role="group" aria-label="Kde spustit">${t.modes.map((m) => `<button type="button" data-mode="${m}" aria-pressed="${m === mode}">${esc(modes[m] || m)}</button>`).join('')}</div>` : `<span class="lpill">${esc(modes[mode] || mode)}</span>`}
      <label class="lselect">${p ? pdot(p) : ICON.folder}<span class="sr-only">Projekt</span><select data-l-project>
        <option value="">Bez projektu</option>${active.map((x) => `<option value="${esc(x.id)}"${x.id === prefs.projectId ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}
      </select></label>
      ${needsFolder(t, mode) ? `<button type="button" class="lselect lselect--btn${cwd ? '' : ' is-empty'}" data-l="folder" title="${esc(cwd || 'Vybrat složku')}">${ICON.folder}<span>${esc(cwd ? shortPath(cwd) : 'Vybrat složku…')}</span></button>` : ''}
      ${t.id === 'claude-code' && mode === 'background' ? `<label class="lselect"><span class="sr-only">Oprávnění</span><select data-l-pref="permission">${Object.entries(t.permissions).map(([k, l]) => `<option value="${k}"${k === prefs.permission ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>` : ''}
      ${t.id === 'codex' && mode === 'background' ? `<label class="lselect"><span class="sr-only">Sandbox</span><select data-l-pref="sandbox">${Object.entries(t.sandboxes).map(([k, l]) => `<option value="${k}"${k === prefs.sandbox ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>` : ''}
      ${t.id === 'ollama' && t.models.length ? `<label class="lselect"><span class="sr-only">Model</span><select data-l-pref="model">${t.models.map((m) => `<option value="${esc(m)}"${m === prefs.model ? ' selected' : ''}>${esc(m)}</option>`).join('')}</select></label>` : ''}
      ${p?.notes?.trim() ? `<label class="check-inline"><input type="checkbox" data-l-brief${prefs.brief ? ' checked' : ''}> Připojit brief projektu</label>` : ''}`);

    fill(root, 'note', `${esc(MODE_HINT[mode] || '')} ${esc(t.note || '')}`);
    renderRuns();
  }

  function renderRuns() {
    const now = Date.now();
    const runs = (state.runs || []).filter((r) => r.status === 'running' || r.status === 'stopping' || now - (r.endedAt || r.startedAt) < 12 * 3600e3).slice(0, 4);
    const finished = (state.runs || []).some((r) => r.status !== 'running' && r.status !== 'stopping');
    fill(root, 'runs', runs.length
      ? `<div class="runs-head"><span class="launch-group-label">Spuštěno na pozadí</span>${finished ? '<button class="link" type="button" data-l="clear">Skrýt dokončené</button>' : ''}</div>
        <ul class="run-list">${runs.map((r) => {
          const live = r.status === 'running' || r.status === 'stopping';
          const session = r.sessionId && state.sessions.has(r.sessionId);
          return `<li class="run" data-status="${esc(r.status)}">
            <span class="icon-tile">${glyph({ id: r.agent, connector: r.agent === 'claude-code' ? 'claude-code' : r.agent })}</span>
            <span class="run-text"><b>${esc(r.prompt)}</b><small>${esc(r.label)} · ${esc(shortPath(r.cwd || ''))} · <span data-ago="${r.startedAt}">${rel(r.startedAt, now)}</span>${r.error ? ` · <span class="sub-alert">${esc(r.error)}</span>` : ''}</small></span>
            <span class="run-state">${live ? '<i class="live-dot"></i>' : ''}${RUN_LABEL[r.status] || r.status}</span>
            <span class="run-actions">
              ${session ? `<a class="btn btn--sm" href="${agentHref(r.sessionId)}">Přepis</a>` : ''}
              <button class="btn btn--sm" type="button" data-run-log="${esc(r.id)}">Log</button>
              ${r.status === 'running' ? `<button class="btn btn--sm" type="button" data-run-stop="${esc(r.id)}">Zastavit</button>` : ''}
            </span>
          </li>`;
        }).join('')}</ul>`
      : '');
  }

  async function chooseFolder() {
    const t = target();
    const picked = await pickFolder({ title: 'Složka, ve které má agent pracovat' });
    if (!picked || !t) return;
    prefs.cwd[t.id] = picked;
    persist();
    render();
  }

  async function go() {
    const t = target();
    if (!t || busy) return;
    const mode = modeOf(t);
    const text = promptEl.value.trim();
    if (!text) {
      toast('Napiš, co má agent udělat.');
      promptEl.focus();
      return;
    }
    const cwd = needsFolder(t, mode) ? cwdFor(t) : '';
    if (needsFolder(t, mode) && !cwd) {
      await chooseFolder();
      if (!cwdFor(t)) return;
    }
    const p = project();
    const withBrief = p?.notes?.trim() && prefs.brief ? `${text}\n\n---\nKontext projektu ${p.name}:\n${p.notes.trim()}` : text;
    if (withBrief.length > PROMPT_MAX) {
      toast(`Zadání i s briefem může mít nejvýš ${PROMPT_MAX.toLocaleString('cs-CZ')} znaků.`, { tone: 'velvet' });
      return;
    }
    if (mode === 'web') {
      try { await navigator.clipboard.writeText(withBrief); } catch { /* schránka nedostupná — server stejně otevře web */ }
    }
    busy = true;
    goBtn.disabled = true;
    goBtn.classList.add('is-busy');
    try {
      const body = { agent: t.id, mode, prompt: withBrief, cwd: cwdFor(t) || undefined, projectId: prefs.projectId || undefined };
      if (t.id === 'claude-code') body.permission = prefs.permission;
      if (t.id === 'codex') body.sandbox = prefs.sandbox;
      if (t.id === 'ollama') body.model = t.models.includes(prefs.model) ? prefs.model : t.models[0];
      const r = await api.launch(body);
      promptEl.value = '';
      persist();
      const detail = r.sessionId ? { action: { label: 'Přepis', href: agentHref(r.sessionId) } } : {};
      if (r.dry) toast(`Zkušební režim: ${r.label} by se spustil (${state.launch.modes[mode] || mode}).`);
      else if (r.kind === 'local') location.hash = agentHref(r.sessionId);
      else if (r.kind === 'background') toast(`${r.label} pracuje na pozadí`, detail);
      else if (r.kind === 'terminal') toast(`${r.label} běží v Terminálu`, detail);
      else if (mode === 'web') toast(`Otevírám ${r.label} — zadání je i ve schránce`);
      else toast(`Otevírám ${r.label} se zadáním`);
    } catch (err) {
      if (err.status === 402) toast(err.message, { tone: 'velvet', timeout: 10000, action: { label: 'Licence', href: '#/nastaveni' } });
      else toast(err.message, { tone: 'velvet', timeout: 9000 });
      if (err.status === 422 && /složk/i.test(err.message)) root.querySelector('[data-l="folder"]')?.focus();
    } finally {
      busy = false;
      goBtn.classList.remove('is-busy');
      render();
    }
  }

  root.addEventListener('click', async (e) => {
    const chip = e.target.closest('[data-agent]');
    if (chip) { prefs.agent = chip.dataset.agent; persist(); render(); return; }
    const m = e.target.closest('[data-mode]');
    if (m) { prefs.modes[target().id] = m.dataset.mode; persist(); render(); return; }
    const stop = e.target.closest('[data-run-stop]');
    if (stop) {
      stop.disabled = true;
      try { await api.stopRun(stop.dataset.runStop); } catch (err) { toast(err.message, { tone: 'velvet' }); stop.disabled = false; }
      return;
    }
    const logBtn = e.target.closest('[data-run-log]');
    if (logBtn) {
      try {
        const { log } = await api.runLog(logBtn.dataset.runLog);
        await modal({ title: 'Výstup agenta', wide: true, submitLabel: 'Zavřít', body: `<pre class="run-log">${esc(log || 'Agent zatím nic nevypsal.')}</pre>` });
      } catch (err) {
        toast(err.message, { tone: 'velvet' });
      }
      return;
    }
    const a = e.target.closest('[data-l]');
    if (!a) return;
    if (a.dataset.l === 'go') go();
    else if (a.dataset.l === 'folder') chooseFolder();
    else if (a.dataset.l === 'clear') api.clearRuns().catch((err) => toast(err.message, { tone: 'velvet' }));
    else if (a.dataset.l === 'refresh') {
      a.disabled = true;
      try {
        state.launch = await api.refreshLaunch();
        render();
        toast('Nabídka agentů obnovena');
      } catch (err) {
        toast(err.message, { tone: 'velvet' });
      } finally {
        a.disabled = false;
      }
    }
  });

  root.addEventListener('change', (e) => {
    if (e.target.matches('[data-l-project]')) {
      prefs.projectId = e.target.value;
    } else if (e.target.matches('[data-l-pref]')) {
      prefs[e.target.dataset.lPref] = e.target.value;
    } else if (e.target.matches('[data-l-brief]')) {
      prefs.brief = e.target.checked;
    } else return;
    persist();
    render();
  });

  let draftTimer = null;
  promptEl.addEventListener('input', () => {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(persist, 400);
  });
  promptEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      go();
    }
  });

  return {
    update() {
      if (launchIntent.projectId || launchIntent.focus) {
        if (launchIntent.projectId && projectById(launchIntent.projectId)) {
          prefs.projectId = launchIntent.projectId;
          const t = target();
          if (t && t.projectModes.length && !needsFolder(t, modeOf(t))) prefs.modes[t.id] = t.projectModes[0];
        }
        const focus = launchIntent.focus;
        Object.assign(launchIntent, { projectId: null, focus: false });
        persist();
        if (focus) requestAnimationFrame(() => { root.scrollIntoView({ block: 'start', behavior: 'smooth' }); promptEl.focus({ preventScroll: true }); });
      }
      render();
    },
    destroy() {
      clearTimeout(draftTimer);
      persist();
    },
    get runningCount() {
      return (state.runs || []).filter((r) => r.status === 'running').length;
    },
  };
}

export const runsSummary = (runs) => {
  const n = runs.filter((r) => r.status === 'running').length;
  return n ? `${n} ${plural(n, 'agent běží', 'agenti běží', 'agentů běží')} na pozadí` : '';
};
