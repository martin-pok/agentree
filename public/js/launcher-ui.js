import { state, projectById, launchIntent } from './state.js';
import { api } from './api.js';
import { esc, rel, shortPath, durShort, clock, castiCesty } from './format.js';
import { glyph, ICON } from './icons.js';
import { fill, toast, modal, agentHref } from './ui.js';
import { pickFolder, recentFolders, pdot } from './projects-ui.js';
import { tr, LOCALE } from './i18n.js';
import { spustNapojeni } from './napojeni-ui.js';

const STORE_KEY = 'agenteeq.launch';
const PROMPT_MAX = 20000;
// Nápověda k režimu se skládá s poznámkou cíle (`t.note`) do jedné věty za druhou. Každá
// proto říká něco jiného: režim to, kde se agent otevře, poznámka to, co je na daném cíli
// zvláštní. Když obojí popisovalo totéž, četl uživatel dvakrát tutéž informaci jinými slovy.
const MODE_HINT = {
  terminal: tr('Otevře se nové okno Terminálu, kde s agentem můžeš dál mluvit.'),
  background: tr('Agent pracuje bez okna a sám skončí. Průběh uvidíš tady a v přepisu.'),
  app: tr('Otevře aplikaci s předvyplněným zadáním – v ní ho jen potvrdíš.'),
  web: tr('Otevře službu v prohlížeči.'),
  local: tr('Agent odpovídá přímo tady v Agenteeq.'),
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

const folderLabel = (cwd) => (shortPath(cwd) === '~' ? tr('Domovská složka') : castiCesty(shortPath(cwd)).slice(-2).join('/'));

const RUN_LABEL = { running: tr('Pracuje'), stopping: tr('Zastavuji'), done: tr('Hotovo'), failed: tr('Selhalo'), stopped: tr('Zastaveno') };

// Srozumitelný důvod selhání a jak ho opravit (původní chyba zůstává k dispozici).
export function runProblem(r) {
  const raw = String(r.error || (r.exitCode ? `${tr('Skončilo s kódem')} ${r.exitCode}` : tr('Agent skončil chybou'))).trim();
  if (/authenticat|oauth|log ?in|unauthori|\b401\b|credential/i.test(raw)) {
    // Přihlášení se obnoví tlačítkem v prohlížeči (src/prihlaseni.js), Terminál člověk nepotřebuje.
    const hint = tr('Klikni na Přihlásit znovu – přihlášení se otevře v prohlížeči. Potom úkol spusť znovu.');
    return r.agent === 'codex'
      ? { title: tr('Přihlášení Codexu vypršelo'), hint, napojit: { id: 'codex', druh: 'agent', label: 'Codex', provider: 'openai', logo: 'codex' }, raw }
      : { title: tr('Přihlášení Claude Code vypršelo'), hint, napojit: { id: 'claude-code', druh: 'agent', label: 'Claude Code', provider: 'anthropic', logo: 'claude' }, raw };
  }
  if (/rate.?limit|quota|usage limit|limit reached/i.test(raw)) return { title: tr('Vyčerpaný limit předplatného'), hint: tr('Počkej na obnovení limitu – Agenteeq tě upozorní, až se obnoví.'), raw };
  if (/ENOENT|not found|No such file/i.test(raw)) return { title: `${r.label} ${tr('se nepodařilo spustit')}`, hint: tr('Program agenta nebyl nalezen. Klikni na Obnovit nabídku nebo agenta přeinstaluj.'), raw };
  return { title: `${r.label} ${tr('skončil chybou')}`, hint: tr('Celé znění chyby najdeš níže v části Původní chyba.'), raw };
}

// Řádek běhu: stav má v každém řádku stejné místo; barvu nese jen ikona a název stavu.
function runHtml(r, now) {
  const live = r.status === 'running' || r.status === 'stopping';
  const session = r.sessionId && state.sessions.has(r.sessionId);
  const took = r.endedAt ? durShort(r.endedAt - r.startedAt) : '';
  const mark = live
    ? '<i class="run-mark run-mark--spin" aria-hidden="true"></i>'
    : `<i class="run-mark" aria-hidden="true">${r.status === 'done' ? ICON.check : r.status === 'failed' ? ICON.close : ''}</i>`;
  const timing = live
    ? `<small><span data-clock-from="${r.startedAt}">${clock(now - r.startedAt)}</span></small>`
    : took ? `<small>${r.status === 'failed' ? 'po' : 'za'} ${took}</small>` : '';
  const problem = r.status === 'failed' ? runProblem(r) : null;
  return `<li class="run" data-status="${esc(r.status)}">
    <span class="run-icon">${glyph({ connector: r.agent })}</span>
    <span class="run-text"><b>${esc(r.prompt)}</b><small>${esc(r.label)} · ${esc(shortPath(r.cwd || ''))} · <span data-ago="${r.startedAt}">${rel(r.startedAt, now)}</span></small></span>
    <span class="run-status" role="status">${mark}<span>${RUN_LABEL[r.status] || esc(r.status)}</span>${timing}</span>
    <span class="run-actions">
      ${session ? `<a class="btn btn--sm" href="${agentHref(r.sessionId)}">${tr('Přepis')}</a>` : ''}
      <button class="btn btn--sm" type="button" data-run-log="${esc(r.id)}">${tr('Výstup')}</button>
      ${r.status === 'running' ? `<button class="btn btn--sm" type="button" data-run-stop="${esc(r.id)}">${tr('Zastavit')}</button>` : ''}
    </span>
    ${problem ? `<div class="run-problem">
      <strong>${esc(problem.title)}</strong>
      <p>${esc(problem.hint)}</p>
      <div class="run-problem-actions">
        ${problem.napojit ? `<button class="btn btn--sm btn--primary" type="button" data-run-napojit="${esc(problem.napojit.id)}">${tr('Přihlásit znovu')}</button>` : ''}
        <details class="run-raw"><summary>${tr('Původní chyba')}</summary><pre>${esc(problem.raw)}</pre></details>
      </div>
    </div>` : ''}
  </li>`;
}

// Předání do aplikace nebo webu: přesně řekne, co udělat, zadání má po ruce a sama zmizí.
let handoffTimer = null;

function showHandoff({ target, label, mode, handoff, prompt, autofill }) {
  document.querySelector('.handoff')?.remove();
  clearTimeout(handoffTimer);
  // S rozšířením se zadání do webové služby vloží samo; bez něj zůstává schránka.
  const steps = autofill
    ? [tr('Zadání se do okna vloží samo.'), tr('Zkontroluj ho a odešli Enterem. Kdyby se nevložilo, je ve schránce (⌘V).')]
    : handoff === 'confirm'
      ? [tr('Zadání je v aplikaci předvyplněné.'), tr('Zkontroluj ho a potvrď klávesou Enter.')]
      : handoff === 'confirm-or-paste'
        ? [tr('Zadání by mělo být předvyplněné.'), tr('Pokud není, vlož ho ⌘V – je ve schránce.')]
        : [tr('Zadání máš ve schránce.'), tr('V {0} ho vlož ⌘V a odešli Enterem.', label)];
  const foot = mode !== 'web'
    ? tr('Jakmile agent začne pracovat, uvidíš ho tady v Přehledu.')
    : autofill
      ? tr('Konverzaci uvidíš i tady v Agenteeq.')
      : tr('S rozšířením pro Chrome (Nastavení) se zadání vloží samo a konverzaci uvidíš i tady.');
  const el = document.createElement('div');
  el.className = 'handoff';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.innerHTML = `<div class="handoff-card">
    <span class="handoff-logo">${glyph(target)}</span>
    <div class="handoff-text"><strong>${tr('Otevírám')} ${esc(label)}</strong>
      <ol>${steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
      <p>${esc(foot)}</p></div>
    <div class="handoff-actions">
      <button class="btn btn--sm" type="button" data-handoff-copy>${ICON.copy}${tr('Kopírovat zadání')}</button>
      <button class="icon-btn" type="button" data-handoff-close aria-label="${tr('Zavřít')}">${ICON.close}</button>
    </div>
    <i class="handoff-progress" aria-hidden="true"></i>
  </div>`;
  const close = () => {
    clearTimeout(handoffTimer);
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 220);
  };
  const arm = () => { handoffTimer = setTimeout(close, 12000); };
  el.addEventListener('click', async (e) => {
    if (e.target.closest('[data-handoff-close]')) close();
    else if (e.target.closest('[data-handoff-copy]')) {
      try { await navigator.clipboard.writeText(prompt); toast(tr('Zadání zkopírováno')); } catch { toast(tr('Schránka není dostupná.'), { tone: 'err' }); }
    }
  });
  el.addEventListener('pointerenter', () => { clearTimeout(handoffTimer); el.classList.add('is-paused'); });
  el.addEventListener('pointerleave', () => { el.classList.remove('is-paused'); arm(); });
  document.body.appendChild(el);
  arm();
}

export function createLauncher(root) {
  const prefs = { agent: '', modes: {}, cwd: {}, permission: 'plan', sandbox: 'read-only', model: '', projectId: '', brief: true, draft: '', ...load() };
  let busy = false;

  root.innerHTML = `
    <div class="launch-head">
      <div><h2 id="launch-h">${tr('Spustit agenta')}</h2><p class="muted small">${tr('Běží na tvých předplatných a limitech. Zdarma: lokální modely v Ollamě.')}</p></div>
      <button class="link" type="button" data-l="refresh" aria-label="${tr('Obnovit nabídku agentů')}">${ICON.refresh}<span>${tr('Obnovit nabídku')}</span></button>
    </div>
    <div class="launch-agents" role="radiogroup" aria-label="${tr('Agent')}" data-region="agents"></div>
    <div class="launch-compose">
      <label class="sr-only" for="launch-prompt">${tr('Zadání pro agenta')}</label>
      <textarea id="launch-prompt" class="launch-prompt" rows="3" maxlength="${PROMPT_MAX}" data-l-prompt placeholder="${tr('Co má agent udělat? Např. „Přidej na web stránku s ceníkem a otestuj ji na mobilu.“')}"></textarea>
      <div class="launch-controls" data-region="controls"></div>
      <div class="launch-foot">
        <p class="launch-note" data-region="note"></p>
        <span class="launch-kbd" aria-label="${tr('Spustit agenta klávesami Command a Enter')}"><span>${tr('Spustit')}</span><kbd>⌘</kbd><kbd>↵</kbd></span>
        <button class="btn btn--primary launch-go" type="button" data-l="go">${ICON.spark}${tr('Spustit')}</button>
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
  const allowsFolder = (t, mode) => needsFolder(t, mode) || Boolean(t?.optionalFolderModes?.includes(mode));
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

    const groups = [['agent', tr('Na tomto Macu')], ['local', tr('Zdarma lokálně')], ['web', tr('Na webu')]];
    fill(root, 'agents', list.length
      ? groups.map(([g, label]) => {
        const items = list.filter((x) => x.group === g);
        if (!items.length) return '';
        return `<div class="launch-group"><span class="launch-group-label">${label}</span><div class="launch-chips">${items.map((x) => `<button type="button" class="lchip" role="radio" aria-checked="${x.id === t?.id}" data-agent="${esc(x.id)}">${glyph(x)}<span>${esc(x.label)}</span>${x.beta ? `<span class="badge">${tr('Zkušební')}</span>` : ''}</button>`).join('')}</div></div>`;
      }).join('')
      : `<p class="muted small">${tr('Načítám, co jde na tomto Macu spustit…')}</p>`);

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
      ${t.modes.length > 1 ? `<div class="seg seg--light seg--sm" role="group" aria-label="${tr('Kde spustit')}">${t.modes.map((m) => `<button type="button" data-mode="${m}" aria-pressed="${m === mode}">${esc(modes[m] || m)}</button>`).join('')}</div>` : `<span class="lpill">${esc(modes[mode] || mode)}</span>`}
      <label class="lselect">${p ? pdot(p) : ICON.folder}<span class="sr-only">${tr('Projekt')}</span><select data-l-project>
        <option value="">${tr('Bez projektu')}</option>${active.map((x) => `<option value="${esc(x.id)}"${x.id === prefs.projectId ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}
      </select></label>
      ${allowsFolder(t, mode) ? `<button type="button" class="lselect lselect--btn${cwd || !needsFolder(t, mode) ? '' : ' is-empty'}" data-l="folder" title="${esc(cwd || tr('Vybrat složku'))}">${ICON.folder}<span>${esc(cwd ? folderLabel(cwd) : needsFolder(t, mode) ? tr('Vybrat složku…') : tr('Složka (nepovinné)'))}</span></button>` : ''}
      ${t.id === 'claude-code' && mode === 'background' ? `<label class="lselect"><span class="sr-only">${tr('Oprávnění')}</span><select data-l-pref="permission">${Object.entries(t.permissions).map(([k, l]) => `<option value="${k}"${k === prefs.permission ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>` : ''}
      ${t.id === 'codex' && mode === 'background' ? `<label class="lselect"><span class="sr-only">${tr('Sandbox')}</span><select data-l-pref="sandbox">${Object.entries(t.sandboxes).map(([k, l]) => `<option value="${k}"${k === prefs.sandbox ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>` : ''}
      ${t.id === 'ollama' && t.models.length ? `<label class="lselect"><span class="sr-only">${tr('Model')}</span><select data-l-pref="model">${t.models.map((m) => `<option value="${esc(m)}"${m === prefs.model ? ' selected' : ''}>${esc(m)}</option>`).join('')}</select></label>` : ''}
      ${p?.notes?.trim() ? `<label class="check-inline"><input type="checkbox" data-l-brief${prefs.brief ? ' checked' : ''}> ${tr('Připojit podklady projektu')}</label>` : ''}`);

    fill(root, 'note', `${esc(MODE_HINT[mode] || '')} ${esc(t.note || '')}`);
    renderRuns();
  }

  function renderRuns() {
    const now = Date.now();
    const runs = (state.runs || []).filter((r) => r.status === 'running' || r.status === 'stopping' || now - (r.endedAt || r.startedAt) < 12 * 3600e3).slice(0, 4);
    const finished = (state.runs || []).some((r) => r.status !== 'running' && r.status !== 'stopping');
    fill(root, 'runs', runs.length
      ? `<div class="runs-head"><span class="launch-group-label">${tr('Spuštěno na pozadí')}</span>${finished ? `<button class="link" type="button" data-l="clear">${tr('Skrýt dokončené')}</button>` : ''}</div>
        <ul class="run-list">${runs.map((r) => runHtml(r, now)).join('')}</ul>`
      : '');
  }

  async function chooseFolder() {
    const t = target();
    const picked = await pickFolder({ title: tr('Složka, ve které má agent pracovat') });
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
      toast(tr('Napiš, co má agent udělat.'), { tone: 'info' });
      promptEl.focus();
      return;
    }
    const cwd = needsFolder(t, mode) ? cwdFor(t) : '';
    if (needsFolder(t, mode) && !cwd) {
      await chooseFolder();
      if (!cwdFor(t)) return;
    }
    const p = project();
    const withBrief = p?.notes?.trim() && prefs.brief ? `${text}\n\n---\n${tr('Podklady projektu {0}:', p.name)}\n${p.notes.trim()}` : text;
    if (withBrief.length > PROMPT_MAX) {
      toast(tr('Zadání i s podklady projektu může mít nejvýš {0} znaků.', PROMPT_MAX.toLocaleString(LOCALE)), { tone: 'err' });
      return;
    }
    if (mode === 'web') {
      try { await navigator.clipboard.writeText(withBrief); } catch { /* schránka nedostupná – server stejně otevře web */ }
    }
    busy = true;
    goBtn.disabled = true;
    goBtn.classList.add('is-busy');
    try {
      const body = { agent: t.id, mode, prompt: withBrief, cwd: allowsFolder(t, mode) ? cwdFor(t) || undefined : undefined, projectId: prefs.projectId || undefined };
      if (t.id === 'claude-code') body.permission = prefs.permission;
      if (t.id === 'codex') body.sandbox = prefs.sandbox;
      if (t.id === 'ollama') body.model = t.models.includes(prefs.model) ? prefs.model : t.models[0];
      const r = await api.launch(body);
      promptEl.value = '';
      persist();
      const detail = r.sessionId ? { action: { label: tr('Přepis'), href: agentHref(r.sessionId) } } : {};
      if (r.dry) toast(tr('Zkušební režim: {0} by se spustil ({1}).', r.label, state.launch.modes[mode] || mode), { tone: 'info' });
      else if (r.kind === 'local') location.hash = agentHref(r.sessionId);
      else if (r.kind === 'background') toast(`${r.label} ${tr('pracuje na pozadí')}`, detail);
      else if (r.kind === 'terminal') toast(`${r.label} ${tr('běží v Terminálu')}`, detail);
      else showHandoff({ target: t, label: r.label, mode, handoff: r.handoff || 'paste', prompt: withBrief, autofill: Boolean(r.autofill) });
    } catch (err) {
      if (err.status === 402) toast(err.message, { tone: 'err', timeout: 10000, action: { label: tr('Licence'), href: '#/nastaveni' } });
      else toast(err.message, { tone: 'err', timeout: 9000 });
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
      try { await api.stopRun(stop.dataset.runStop); } catch (err) { toast(err.message, { tone: 'err' }); stop.disabled = false; }
      return;
    }
    const znovu = e.target.closest('[data-run-napojit]');
    if (znovu) {
      const cil = runProblem({ agent: znovu.dataset.runNapojit, error: 'login' }).napojit;
      znovu.disabled = true;
      try { await spustNapojeni(cil); } catch (err) { toast(err.message, { tone: 'err', timeout: 8000 }); } finally { znovu.disabled = false; }
      return;
    }
    const logBtn = e.target.closest('[data-run-log]');
    if (logBtn) {
      try {
        const { log } = await api.runLog(logBtn.dataset.runLog);
        await modal({ title: tr('Výstup agenta'), wide: true, submitLabel: tr('Zavřít'), body: `<pre class="run-log">${esc(log || tr('Agent zatím nic nevypsal.'))}</pre>` });
      } catch (err) {
        toast(err.message, { tone: 'err' });
      }
      return;
    }
    const a = e.target.closest('[data-l]');
    if (!a) return;
    if (a.dataset.l === 'go') go();
    else if (a.dataset.l === 'folder') chooseFolder();
    else if (a.dataset.l === 'clear') api.clearRuns().catch((err) => toast(err.message, { tone: 'err' }));
    else if (a.dataset.l === 'refresh') {
      a.disabled = true;
      try {
        state.launch = await api.refreshLaunch();
        render();
        toast(tr('Nabídka agentů obnovena'));
      } catch (err) {
        toast(err.message, { tone: 'err' });
      } finally {
        a.disabled = false;
      }
    }
  });

  root.addEventListener('change', (e) => {
    if (e.target.matches('[data-l-project]')) {
      prefs.projectId = e.target.value;
      persist();
      render();
    } else if (e.target.matches('[data-l-pref]')) {
      prefs[e.target.dataset.lPref] = e.target.value;
      // Viditelný custom picker už hodnotu synchronizoval. Přestavba celého
      // ovládacího pásu by při změně modelu zbytečně blikla a sebrala fokus.
      persist();
    } else if (e.target.matches('[data-l-brief]')) {
      prefs.brief = e.target.checked;
      persist();
    } else return;
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

