import os from 'node:os';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { loadConfig, VERSION, EXTENSION_DIR, ROOT_DIR } from './config.js';
import { DataStore } from './datastore.js';
import { Store } from './store.js';
import { AlertEngine } from './alerts.js';
import { createNotifier } from './notify.js';
import { createSecrets } from './secrets.js';
import { spendSummary, SERVICES, KINDS, CURRENCIES } from './spend.js';
import { claudeSettingsPath, hooksStatus } from './hooks-installer.js';
import { run, debounce, clip, uid, HOUR } from './util.js';
import { repoInfo, createWorktree, workDiff, acceptWork, discardWork, cleanupWork, slugify } from './git.js';
import { pushEntry, touch } from './model.js';
import { createClaudeCodeConnector } from './connectors/claude-code.js';
import { createCodexConnector } from './connectors/codex.js';
import { createCursorConnector } from './connectors/cursor.js';
import { createGeminiFamilyConnector } from './connectors/gemini-family.js';
import { createCopilotCliConnector, createVsCodeCopilotConnector } from './connectors/copilot.js';
import { createWebConnector, WEB_SITES } from './connectors/web.js';
import { createCloudBillingConnector } from './connectors/cloud-billing.js';
import { createProcessesConnector } from './connectors/processes.js';
import { detectApps, openTargets, planOpen, executeOpen, ALL_APPS } from './openers.js';
import { migrateLegacyData } from './migrate.js';
import { createOllamaClient } from './ollama.js';
import { RunManager } from './runs.js';
import { createLocalChat } from './local-chat.js';
import { detectLaunchEnv, launchTargets, planLaunch, writePromptFile, promptFilePath, MODES, PROMPT_MAX } from './launcher.js';
import { verifyLicense } from './license.js';
import { PLANS, PAID_FEATURES, planOf, canUse } from './plans.js';
import { resolveProject, snapshotOf, projectsPayload, validateProject, assignSessions, deleteProject, projectCsv, COVER_PRESETS, MEDIA_FILE, TEAM_AGENTS } from './projects.js';
import { installLaunchAgent, uninstallLaunchAgent, isLaunchAgentInstalled } from './launch-agent.js';

export const BIN_PATH = path.join(ROOT_DIR, 'bin', 'agentree.mjs');
// Bez licence Pro je možné mít tolik aktivních projektů — platí jen, když je `projectsUnlimited` v PAID_FEATURES.
export const FREE_PROJECT_LIMIT = 3;
const DRY_BINS = { claude: '/usr/local/bin/claude', codex: '/usr/local/bin/codex' };
const HOME_HIDDEN = new Set(['Library']);

export async function createApp(config = loadConfig(), { licensePublicKey } = {}) {
  try {
    const m = await migrateLegacyData({ dataDir: config.dataDir, legacyDir: config.legacyDataDir });
    if (m.migrated && !config.quiet) console.log(`Agentree: data převzata z ${m.from}`);
  } catch (err) {
    console.error('Agentree: převzetí dat ze staré složky selhalo:', err.message);
  }
  const datastore = new DataStore(config.dataDir);
  await datastore.load();
  const store = new Store({ config, datastore });
  const secrets = createSecrets({ keychain: config.keychain });
  const notifier = createNotifier({ enabled: config.nativeNotify });
  const alerts = new AlertEngine({
    store,
    datastore,
    notifier,
    projectNotify: (s) => (s.projectId ? datastore.data.projects.items.find((p) => p.id === s.projectId)?.settings.notify : null) || 'all',
  });
  const host = { name: os.hostname().replace(/\.local$/, ''), user: os.userInfo().username, fullName: '', home: config.sourceHome };
  const log = (...args) => { if (!config.quiet) console.log(...args); };
  const dry = config.openMode === 'dry';

  const ollama = createOllamaClient({ baseUrl: config.ollamaUrl });
  const localChat = createLocalChat({ store, ollama });
  const runs = new RunManager({
    dataDir: config.dataDir,
    onChange: (_list, run) => {
      if (run?.status === 'failed') recordRunFailure(run);
      if (store.ready) store.emit('runs', runsPayload());
    },
  });
  const failedRuns = new Set();

  // Běh, který skončil chybou, se musí v session ukázat jako „Selhalo“ s důvodem — nikdy jako „Hotovo“.
  function recordRunFailure(run) {
    if (failedRuns.has(run.id)) return;
    failedRuns.add(run.id);
    const rawError = String(run.error || `Skončilo s kódem ${run.exitCode}`).trim();
    const raw = /[.!?]$/.test(rawError) ? rawError : `${rawError}.`;
    let hint = '';
    if (/authenticat|oauth|log ?in|unauthori|401|credential/i.test(raw)) {
      hint = run.agent === 'codex' ? ' Přihlas se v Terminálu příkazem codex login.' : ' Přihlas se znovu: v Terminálu spusť claude a zadej /login.';
    } else if (/limit|quota|rate/i.test(raw)) {
      hint = ' Nejspíš vyčerpaný limit předplatného.';
    }
    const now = run.endedAt || Date.now();
    const [connector, localId] = run.sessionId ? [run.sessionId.split(':')[0], run.sessionId.slice(run.sessionId.indexOf(':') + 1)] : ['launch', run.id];
    const provider = run.agent === 'codex' ? 'openai' : run.agent === 'claude-code' ? 'anthropic' : 'other';
    const s = store.get(`${connector}:${localId}`) || store.ensure({ connector, localId, provider, app: run.label });
    if (!s.cwd && run.cwd) s.cwd = run.cwd;
    if (!s.title && !s.firstPrompt) s.title = run.prompt;
    if (!s.startedAt) s.startedAt = run.startedAt;
    s.running = false;
    s.failure = { text: clip(`${raw}${hint}`, 240), at: now };
    pushEntry(s, { at: now, role: 'error', text: `Spuštění selhalo: ${raw}${hint}` });
    touch(s, now);
    store.commit(s, now);
    if (run.projectId && projects().assignments[s.id] === undefined) assignToProject([s.id], run.projectId);
  }
  const projects = () => datastore.data.projects;
  const worktreeRoot = path.join(config.dataDir, 'worktrees');
  const mediaRoot = path.join(config.dataDir, 'media');

  let apps = {};
  store.decorate = (summary) => {
    summary.open = openTargets(summary, apps);
    Object.assign(summary, resolveProject(summary, projects(), { worktreeRoot }));
    if (summary.connector === 'local-chat') summary.chat = { available: localChat.has(summary.id) };
  };

  async function openSession(id, target) {
    const s = store.summary(id);
    if (!s) return { status: 404, error: 'Konverzace nenalezena.' };
    if (config.openMode === 'off') return { status: 422, error: 'Otevírání aplikací je dostupné jen na macOS.' };
    const plan = planOpen(s, target, apps);
    if (!plan) return { status: 422, error: 'Tuto akci pro konverzaci nelze provést.' };
    const r = await executeOpen(plan, { dry });
    if (!r.ok) return { status: 502, error: r.error };
    return { ok: true, label: plan.label, ...(r.dry ? { dry: true, plan } : {}) };
  }

  const ctx = { config, store, datastore, secrets, onSpendChanged: () => spendChanged() };
  const list = [
    createClaudeCodeConnector(ctx),
    createCodexConnector(ctx),
    createCursorConnector(ctx),
    createCopilotCliConnector(ctx),
    createVsCodeCopilotConnector(ctx),
    createGeminiFamilyConnector(ctx, { id: 'gemini-cli', name: 'Gemini CLI', dir: '.gemini', provider: 'google', app: 'Gemini CLI' }),
    createGeminiFamilyConnector(ctx, { id: 'qwen-code', name: 'Qwen Code', dir: '.qwen', provider: 'alibaba', app: 'Qwen Code' }),
    createWebConnector(ctx),
    createCloudBillingConnector(ctx),
  ];
  if (config.processes) list.push(createProcessesConnector(ctx));
  const connectors = Object.fromEntries(list.map((c) => [c.id, c]));

  // Počet u konektorů se sessions = sessions viditelné v okně sledování (ne počet souborů na disku).
  const SESSION_CONNECTORS = new Set(['claude-code', 'codex', 'cursor', 'copilot-cli', 'vscode-copilot', 'gemini-cli', 'qwen-code', 'web']);

  function connectorList() {
    const visible = store.list();
    return list.map((c) => {
      let status;
      try { status = c.status(); } catch (err) { status = { state: 'error', detail: err.message }; }
      if (SESSION_CONNECTORS.has(c.id)) {
        const count = visible.filter((s) => s.connector === c.id).length;
        status = { ...status, count };
        if (status.state === 'connected' && c.id !== 'web') {
          const word = count === 1 ? 'konverzace' : count > 1 && count < 5 ? 'konverzace' : 'konverzací';
          status.detail = `${count} ${word} s aktivitou za ${config.windowDays} dní.${status.hooksActive ? ' Propojení je aktivní.' : ''}`;
        }
      }
      return { id: c.id, name: c.name, provider: c.provider, kind: c.kind, verified: c.verified, source: c.source, description: c.description, ...status };
    });
  }

  function spend() {
    return spendSummary(datastore.data.spend, Date.now(), connectors['cloud-billing'].autoEntries());
  }

  function spendPayload() {
    const sp = datastore.data.spend;
    return { ...spend(), ledger: sp.ledger, budgetsConfig: sp.budgets, rates: sp.rates, services: SERVICES, kinds: KINDS, currencies: CURRENCIES };
  }

  function spendChanged() {
    if (!store.ready) return;
    alerts.checkBudgets(spend());
    store.emit('spend', spendPayload());
  }

  /* ---------- Licence ---------- */

  function licenseStatus() {
    const saved = datastore.data.license;
    const base = { paidFeatures: { ...PAID_FEATURES }, plans: PLANS };
    if (!saved) return { ...base, valid: false, hasKey: false, plan: 'free', planLabel: PLANS.free.label };
    const r = verifyLicense(saved.key, { publicKey: licensePublicKey });
    const plan = planOf(r);
    return { ...base, ...r, hasKey: true, plan, planLabel: PLANS[plan].label, activatedAt: saved.activatedAt, maskedKey: `${saved.key.slice(0, 9)}…${saved.key.slice(-6)}` };
  }

  const locked = (feature) => (canUse(feature, licenseStatus()) ? null : { status: 402, upgrade: true, error: `Tato funkce je součástí tarifu ${PLANS[PAID_FEATURES[feature]]?.label || 'Pro'}. Aktivuj licenci v Nastavení.` });

  function activateLicense(key) {
    const clean = typeof key === 'string' ? key.trim() : '';
    const r = verifyLicense(clean, { publicKey: licensePublicKey });
    if (!r.valid) return { status: 422, error: r.reason };
    datastore.data.license = { key: clean, activatedAt: Date.now() };
    datastore.save();
    const status = licenseStatus();
    store.emit('license', status);
    return { ok: true, license: status };
  }

  function removeLicense() {
    datastore.data.license = null;
    datastore.save();
    const status = licenseStatus();
    store.emit('license', status);
    return { ok: true, license: status };
  }

  /* ---------- Projekty ---------- */

  // Snímky konverzací v projektech se ukládají s odstupem — při živé práci se data.json nepřepisuje každou vteřinu.
  const persistSnapshots = debounce(() => datastore.save(), 15000);

  function syncSnapshots() {
    const pd = projects();
    const live = new Map(store.list().map((s) => [s.id, s]));
    for (const s of live.values()) {
      if (s.projectId) pd.snapshots[s.id] = snapshotOf(s);
      else delete pd.snapshots[s.id];
    }
    for (const [sid, snap] of Object.entries(pd.snapshots)) {
      if (live.has(sid)) continue;
      const next = resolveProject(snap, pd, { worktreeRoot }).projectId;
      if (next) snap.projectId = next;
      else delete pd.snapshots[sid];
    }
  }

  function projectsChanged() {
    if (store.ready) {
      store.reevaluate();
      syncSnapshots();
      store.emit('projects', projectsPayload(projects()));
    }
    datastore.save();
  }

  function createProject(body) {
    const active = projects().items.filter((p) => !p.archived).length;
    if (active >= FREE_PROJECT_LIMIT && !canUse('projectsUnlimited', licenseStatus())) {
      return { status: 402, upgrade: true, error: `Ve verzi Zdarma můžeš mít ${FREE_PROJECT_LIMIT} aktivní projekty. Pro neomezený počet aktivuj licenci Pro.` };
    }
    const r = validateProject(body, projects().items);
    if (!r.ok) return r;
    projects().items.push(r.value);
    projectsChanged();
    return { ok: true, project: r.value };
  }

  function updateProject(id, body) {
    const r = validateProject(body, projects().items, { id });
    if (!r.ok) return r;
    const items = projects().items;
    items[items.findIndex((p) => p.id === id)] = r.value;
    projectsChanged();
    return { ok: true, project: r.value };
  }

  function removeProject(id) {
    if (!/^[\w-]{1,64}$/.test(id) || !deleteProject(projects(), id)) return { status: 404, error: 'Projekt neexistuje.' };
    fsp.rm(path.join(mediaRoot, id), { recursive: true, force: true }).catch(() => {});
    projectsChanged();
    return { ok: true };
  }

  const findProject = (id) => projects().items.find((p) => p.id === id) || null;
  const repoOf = (p) => p.settings.repo || p.folders[0] || '';

  /* Vzhled projektu: vlastní pozadí karty a logo (PNG, JPG, WebP — obsah se ověřuje podle hlavičky souboru, ne podle přípony). */

  const MEDIA_TYPES = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };
  const MEDIA_MAX = { cover: 4_000_000, logo: 1_500_000 };

  function sniffImage(buf) {
    if (buf.length > 8 && buf[0] === 0x89 && buf.toString('latin1', 1, 4) === 'PNG') return 'png';
    if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
    if (buf.length > 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'webp';
    return null;
  }

  async function setProjectMedia(id, kind, buf) {
    const p = findProject(id);
    if (!p || !MEDIA_MAX[kind]) return { status: 404, error: 'Projekt neexistuje.' };
    if (!buf.length) return { status: 422, error: 'Soubor je prázdný.' };
    if (buf.length > MEDIA_MAX[kind]) return { status: 413, error: `Obrázek je příliš velký (nejvýš ${MEDIA_MAX[kind] / 1e6} MB).` };
    const ext = sniffImage(buf);
    if (!ext) return { status: 415, error: 'Nahraj obrázek ve formátu PNG, JPG nebo WebP.' };
    const dir = path.join(mediaRoot, p.id);
    await fsp.mkdir(dir, { recursive: true, mode: 0o700 });
    const file = `${kind}-${Date.now()}.${ext}`;
    await fsp.writeFile(path.join(dir, file), buf, { mode: 0o600 });
    const old = p[kind]?.file;
    p[kind] = { file };
    if (old && old !== file) await fsp.rm(path.join(dir, old), { force: true });
    p.updatedAt = Date.now();
    projectsChanged();
    return { ok: true, project: p, projects: projectsPayload(projects()) };
  }

  async function removeProjectMedia(id, kind) {
    const p = findProject(id);
    if (!p || !MEDIA_MAX[kind]) return { status: 404, error: 'Projekt neexistuje.' };
    const old = p[kind]?.file;
    if (old) await fsp.rm(path.join(mediaRoot, p.id, old), { force: true });
    p[kind] = kind === 'cover' ? { preset: COVER_PRESETS[0] } : null;
    p.updatedAt = Date.now();
    projectsChanged();
    return { ok: true, project: p, projects: projectsPayload(projects()) };
  }

  async function readProjectMedia(id, kind) {
    const p = findProject(id);
    const file = p?.[kind]?.file;
    if (!file || !MEDIA_FILE.test(file) || !file.startsWith(`${kind}-`)) return { status: 404, error: 'Obrázek neexistuje.' };
    const body = await fsp.readFile(path.join(mediaRoot, p.id, file)).catch(() => null);
    if (!body) return { status: 404, error: 'Obrázek neexistuje.' };
    return { ok: true, type: MEDIA_TYPES[file.split('.').pop()], body };
  }

  /* Git a tým agentů v projektu. */

  async function projectGit(id) {
    const p = findProject(id);
    if (!p) return { status: 404, error: 'Projekt neexistuje.' };
    const dir = repoOf(p);
    const repo = dir ? await repoInfo(dir) : null;
    const active = p.work.filter((w) => w.status === 'active');
    const work = await Promise.all(active.slice(-12).map(async (w) => {
      const s = w.sessionId ? store.summary(w.sessionId) : null;
      const r = w.runId ? runs.get(w.runId) : null;
      return {
        ...w,
        diff: await workDiff({ dir: w.path, base: w.base }).catch(() => null),
        session: s ? { id: s.id, status: s.status, reason: s.reason, title: s.title, lastAt: s.lastAt } : null,
        run: r ? { id: r.id, status: r.status, error: r.error } : null,
      };
    }));
    return { ok: true, repo, repoPath: dir, work, history: p.work.filter((w) => w.status !== 'active').slice(-10).reverse() };
  }

  function composePrompt(p, prompt, attachBrief) {
    const parts = [prompt.trim()];
    if (p.settings.instructions.trim()) parts.push(`---\nPravidla projektu ${p.name}:\n${p.settings.instructions.trim()}`);
    if (attachBrief && p.notes.trim()) parts.push(`---\nPodklady projektu ${p.name}:\n${p.notes.trim()}`);
    return parts.join('\n\n');
  }

  const AGENT_SHORT = { 'claude-code': 'claude', codex: 'codex', 'gemini-cli': 'gemini', 'qwen-code': 'qwen' };

  async function launchTeam(id, input) {
    const p = findProject(id);
    if (!p) return { status: 404, error: 'Projekt neexistuje.' };
    const b = input && typeof input === 'object' ? input : {};
    const prompt = typeof b.prompt === 'string' ? b.prompt.trim() : '';
    if (!prompt) return { status: 422, error: 'Napiš, co mají agenti udělat.', field: 'prompt' };
    const agents = Array.isArray(b.agents) ? [...new Set(b.agents)] : p.settings.agents;
    if (!agents.length || agents.length > 4 || agents.some((a) => !TEAM_AGENTS.includes(a))) return { status: 422, error: 'Vyber 1 až 4 agenty.', field: 'agents' };
    const targets = new Map(launchPayload().targets.map((t) => [t.id, t]));
    const missing = agents.filter((a) => !targets.has(a));
    if (missing.length) return { status: 422, error: `Na tomto Macu není k dispozici: ${missing.join(', ')}. Nainstaluj ho nebo ho z týmu odeber.`, field: 'agents' };
    const isolate = typeof b.isolate === 'boolean' ? b.isolate : p.settings.isolate;
    const attachBrief = typeof b.attachBrief === 'boolean' ? b.attachBrief : p.settings.attachBrief;
    const text = composePrompt(p, prompt, attachBrief);
    if (text.length > PROMPT_MAX) return { status: 422, error: `Zadání s pravidly a podklady je delší než ${PROMPT_MAX.toLocaleString('cs-CZ')} znaků.`, field: 'prompt' };
    const repoDir = repoOf(p);
    if (!repoDir) return { status: 422, error: 'Nastav projektu složku repozitáře (Nastavení projektu → Repozitář).', field: 'repo' };
    let info = null;
    let base = '';
    if (isolate) {
      info = await repoInfo(repoDir);
      if (!info.isRepo) return { status: 422, error: 'Složka projektu není Git repozitář. Vyber repozitář, nebo vypni „Každý agent ve vlastní větvi“.', field: 'repo' };
      base = p.settings.baseBranch || info.branch;
      if (!base) return { status: 422, error: 'Repozitář není na žádné větvi. Přepni ho na větev (např. main) nebo ji nastav v projektu.', field: 'repo' };
    }
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const stamp = `${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    const slug = slugify(prompt, 20);
    const results = [];
    // Postupně: `git worktree add` si zamyká repozitář, souběh by zbytečně selhával.
    for (const agent of agents) {
      const t = targets.get(agent);
      const wanted = ['terminal', 'background'].includes(b.mode) ? b.mode : p.settings.mode;
      const mode = t.modes.includes(wanted) ? wanted : t.modes.includes('terminal') ? 'terminal' : t.modes[0];
      let cwd = info?.root || repoDir;
      let work = null;
      if (isolate) {
        const branch = `agentree/${AGENT_SHORT[agent]}-${slug}-${stamp}`;
        const dir = path.join(worktreeRoot, p.id, `${AGENT_SHORT[agent]}-${slug}-${stamp}`);
        if (!dry) {
          const wt = await createWorktree({ repo: info.root, base, branch, dir });
          if (!wt.ok) {
            results.push({ agent, ok: false, error: wt.error });
            continue;
          }
          cwd = dir;
        }
        work = { branch, path: dir, base };
      }
      const r = await launch({ agent, mode, prompt: text, cwd, projectId: p.id, permission: p.settings.permission, sandbox: p.settings.sandbox, skipProjectRules: true });
      if (r.status) {
        if (work && !dry) await discardWork({ repo: info.root, dir: work.path, branch: work.branch });
        results.push({ agent, ok: false, error: r.error });
        continue;
      }
      if (work) {
        work = { id: uid(), agent, label: r.label, ...work, runId: r.run?.id || null, sessionId: r.sessionId || null, prompt: clip(prompt, 240), status: 'active', createdAt: Date.now(), closedAt: null };
        if (!dry) p.work.push(work);
      }
      results.push({ agent, ok: true, label: r.label, mode, kind: r.kind, sessionId: r.sessionId, run: r.run, work, ...(dry ? { dry: true, plan: r.plan } : {}) });
    }
    if (p.work.length > 60) p.work.splice(0, p.work.length - 60);
    projectsChanged();
    const ok = results.filter((x) => x.ok).length;
    if (!ok) return { status: 502, error: results.map((x) => `${x.agent}: ${x.error}`).join(' · ') };
    return { ok: true, results, started: ok, failed: results.length - ok, ...(dry ? { dry: true } : {}) };
  }

  async function projectWorkAction(id, workId, action) {
    const p = findProject(id);
    const w = p?.work.find((x) => x.id === workId && x.status === 'active');
    if (!w) return { status: 404, error: 'Pracovní větev nenalezena.' };
    if (!w.path.startsWith(worktreeRoot + path.sep)) return { status: 422, error: 'Pracovní kopie leží mimo Agentree — uprav ji ručně.' };
    const running = (w.runId && ['running', 'stopping'].includes(runs.get(w.runId)?.status)) || (w.sessionId && store.summary(w.sessionId)?.status === 'working');
    if (running) return { status: 409, error: 'Agent na této větvi ještě pracuje. Počkej, až skončí, nebo ho zastav.' };
    if (dry) return { ok: true, dry: true };
    const info = await repoInfo(repoOf(p));
    if (!info.isRepo) return { status: 422, error: 'Repozitář projektu není dostupný.' };
    let r;
    if (action === 'accept') {
      r = await acceptWork({ repo: info.root, dir: w.path, branch: w.branch, base: w.base, message: `Agentree: ${w.label || w.agent} — ${clip(w.prompt, 72)}` });
      if (r.ok) await cleanupWork({ repo: info.root, dir: w.path, branch: w.branch });
    } else {
      r = await discardWork({ repo: info.root, dir: w.path, branch: w.branch });
    }
    if (!r.ok) return { status: r.conflict ? 409 : 422, error: r.error };
    w.status = action === 'accept' ? 'accepted' : 'discarded';
    w.closedAt = Date.now();
    projectsChanged();
    return { ok: true, merged: Boolean(r.merged), nothing: Boolean(r.nothing) };
  }

  // Měsíční rozpočet tokenů projektu: upozornění při 80 % a 100 %.
  function projectMonthTokens(pid, now = Date.now()) {
    const month = new Date(now).toISOString().slice(0, 7);
    let sum = 0;
    for (const s of store.list(now)) {
      if (s.projectId !== pid) continue;
      for (const [k, v] of Object.entries(s.hourly || {})) if (k.startsWith(month)) sum += v;
    }
    return sum;
  }

  function checkProjectBudgets(now = Date.now()) {
    if (!datastore.data.settings.notifications.budget) return;
    const month = new Date(now).toISOString().slice(0, 7);
    for (const p of projects().items) {
      const budget = p.settings.tokenBudget;
      if (!budget || p.archived) continue;
      const used = projectMonthTokens(p.id, now);
      const pct = (used / budget) * 100;
      const hit = [100, 80].find((t) => pct >= t);
      if (!hit) continue;
      alerts.raise({
        key: `project_budget:${p.id}:${month}:${hit}`,
        level: hit === 100 ? 'critical' : 'warning',
        kind: 'budget',
        title: hit === 100 ? `Projekt ${p.name}: rozpočet tokenů vyčerpán` : `Projekt ${p.name}: ${Math.round(pct)} % rozpočtu tokenů`,
        body: `${used.toLocaleString('cs-CZ')} z ${budget.toLocaleString('cs-CZ')} tokenů tento měsíc.`,
      });
    }
  }

  function assignToProject(sessionIds, projectId) {
    const r = assignSessions(projects(), sessionIds, projectId, (sid) => store.summary(sid));
    if (!r.ok) return { status: 422, error: r.error };
    projectsChanged();
    return { ok: true, count: r.count };
  }

  function exportProject(id) {
    const p = projects().items.find((x) => x.id === id);
    if (!p) return { status: 404, error: 'Projekt neexistuje.' };
    const gate = locked('projectExport');
    if (gate) return gate;
    const live = store.list().filter((s) => s.projectId === id);
    const liveIds = new Set(live.map((s) => s.id));
    const older = Object.values(projects().snapshots).filter((s) => s.projectId === id && !liveIds.has(s.id));
    return { ok: true, project: p, csv: projectCsv([...live, ...older].sort((a, b) => b.lastAt - a.lastAt)) };
  }

  /* ---------- Spouštění agentů ---------- */

  let launchEnv = { bins: {}, chatgptApp: false, ollama: { ok: false, models: [] } };

  function launchPayload() {
    let targets = launchTargets(launchEnv);
    if (config.openMode === 'off') targets = targets.filter((t) => t.group === 'local');
    return { targets, modes: MODES, openMode: config.openMode };
  }

  async function refreshLaunch() {
    if (config.openMode === 'exec') launchEnv = await detectLaunchEnv({ ollama });
    else launchEnv = { bins: dry ? DRY_BINS : {}, chatgptApp: dry, claudeApp: dry, ollama: await ollama.models() };
    const payload = launchPayload();
    if (store.ready) store.emit('launch', payload);
    return payload;
  }

  const runsPayload = () => runs.list().map(({ logFile, ...r }) => r);

  async function launch(input) {
    const body = input && typeof input === 'object' ? { ...input } : {};
    const projectId = typeof body.projectId === 'string' && body.projectId ? body.projectId : null;
    const project = projectId ? findProject(projectId) : null;
    if (projectId && !project) return { status: 422, error: 'Projekt neexistuje.', field: 'projectId' };
    // Pravidla projektu jdou s každým zadáním z projektu (tým je skládá sám).
    if (project && !body.skipProjectRules && typeof body.prompt === 'string' && body.prompt.trim() && project.settings.instructions.trim()) {
      body.prompt = `${body.prompt.trim()}\n\n---\nPravidla projektu ${project.name}:\n${project.settings.instructions.trim()}`;
    }
    const uuid = crypto.randomUUID();
    const promptDir = path.join(config.dataDir, 'prompts');
    const r = await planLaunch(body, launchEnv, { promptFile: promptFilePath(promptDir, uuid), sessionUuid: uuid });
    if (!r.ok) return { status: 422, error: r.error, field: r.field };
    const plan = r.plan;
    if (config.openMode === 'off' && plan.kind !== 'local') return { status: 422, error: 'Spouštění aplikací je dostupné jen na macOS.' };
    const gate = plan.kind === 'background' ? locked('launchBackground') : plan.kind === 'local' ? locked('localChat') : null;
    if (gate) return gate;

    let sessionId = plan.sessionId || null;
    let runInfo = null;
    if (plan.kind === 'terminal') {
      if (!dry) await writePromptFile(promptDir, plan.prompt, uuid);
      const x = await executeOpen({ kind: 'terminal', command: plan.command, label: 'Terminál' }, { dry });
      if (!x.ok) return { status: 502, error: x.error };
    } else if (plan.kind === 'open') {
      const x = await executeOpen({ kind: 'open', args: plan.args, label: plan.label }, { dry });
      if (!x.ok) return { status: 502, error: x.error };
    } else if (plan.kind === 'background') {
      if (!dry) {
        const started = runs.start({ agent: plan.agent, label: plan.label, argv: plan.argv, cwd: plan.cwd, prompt: plan.prompt, sessionId, projectId });
        const { logFile, ...rest } = started;
        runInfo = rest;
        if (started.status === 'failed') return { status: 502, error: `${plan.label} se nepodařilo spustit: ${started.error}` };
      }
    } else if (plan.kind === 'local') {
      sessionId = localChat.start({ model: plan.model, prompt: plan.prompt });
    }

    if (projectId && sessionId) assignToProject([sessionId], projectId);
    datastore.data.usage.launches++;
    datastore.save();
    if (store.ready) store.emit('usage', datastore.data.usage);
    const { prompt, argv, command, ...publicPlan } = plan;
    return {
      ok: true,
      kind: plan.kind,
      mode: plan.mode,
      label: plan.label,
      sessionId,
      run: runInfo,
      copyPrompt: Boolean(plan.copyPrompt),
      handoff: plan.handoff || null,
      ...(dry ? { dry: true, plan: { ...publicPlan, argv, command } } : {}),
    };
  }

  // Kódex spuštěný na pozadí nemá předem známé ID session — spáruje se podle složky a času startu.
  function linkRun(summary) {
    if (summary.connector !== 'codex' || !summary.cwd) return;
    for (const r of runs.list()) {
      if (r.agent !== 'codex' || r.sessionId || r.cwd !== summary.cwd) continue;
      if (summary.startedAt < r.startedAt - 10000 || summary.startedAt > r.startedAt + 120000) continue;
      runs.update(r.id, { sessionId: summary.id });
      for (const p of projects().items) {
        for (const w of p.work) if (w.runId === r.id && !w.sessionId) { w.sessionId = summary.id; datastore.save(); }
      }
      if (r.projectId && projects().assignments[summary.id] === undefined) assignToProject([summary.id], r.projectId);
      break;
    }
  }

  store.on('session', (value) => {
    const pd = projects();
    if (value.projectId) {
      pd.snapshots[value.id] = snapshotOf(value);
      persistSnapshots();
    } else if (pd.snapshots[value.id]) {
      delete pd.snapshots[value.id];
      persistSnapshots();
    }
    linkRun(value);
  });

  /* ---------- Systém ---------- */

  async function listFolders(requested) {
    const home = path.resolve(config.sourceHome);
    if (requested && (typeof requested !== 'string' || !path.isAbsolute(requested))) return { status: 400, error: 'Cesta musí začínat lomítkem.' };
    const target = requested ? path.resolve(requested) : home;
    if (target !== home && !target.startsWith(home + path.sep)) return { status: 403, error: 'Procházet lze jen složky v domovském adresáři. Jinou cestu zadej ručně.' };
    let entries;
    try {
      entries = await fsp.readdir(target, { withFileTypes: true });
    } catch (err) {
      return { status: err.code === 'ENOENT' || err.code === 'ENOTDIR' ? 404 : 403, error: err.code === 'ENOENT' || err.code === 'ENOTDIR' ? 'Složka neexistuje.' : 'Do této složky nemá Agentree přístup.' };
    }
    const atHome = target === home;
    const dirs = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !(atHome && HOME_HIDDEN.has(e.name)))
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b, 'cs'))
      .slice(0, 500);
    // Ve vlastním domovském adresáři se do podsložek nenahlíží (macOS by u Dokumentů/Plochy žádal o povolení).
    const items = await Promise.all(dirs.map(async (name) => {
      const full = path.join(target, name);
      const git = atHome ? false : await fsp.access(path.join(full, '.git')).then(() => true, () => false);
      return { name, path: full, git };
    }));
    return { ok: true, path: target, home, parent: atHome ? null : path.dirname(target), dirs: items };
  }

  async function autostart(action) {
    if (config.openMode === 'off') return { status: 422, error: 'Automatické spouštění je dostupné jen na macOS.' };
    if (!dry) {
      try {
        if (action === 'install') await installLaunchAgent({ script: BIN_PATH, home: config.sourceHome });
        else await uninstallLaunchAgent({ home: config.sourceHome });
      } catch (err) {
        return { status: 500, error: err.message };
      }
    }
    const value = await integrations();
    store.emit('integrations', value);
    return { ok: true, ...(dry ? { dry: true } : {}), integrations: value };
  }

  async function integrations() {
    return {
      claudeHooks: await hooksStatus(claudeSettingsPath(config.sourceHome), datastore.data.ingestToken),
      extension: { path: EXTENSION_DIR, sites: WEB_SITES, token: datastore.data.ingestToken },
      cloud: connectors['cloud-billing'].providers(),
      keychain: secrets.available,
      nativeNotify: notifier.enabled,
      autostart: {
        supported: config.openMode !== 'off',
        installed: await isLaunchAgentInstalled(config.sourceHome),
        command: `"${process.execPath}" "${BIN_PATH}" install-agent`,
      },
      install: { bin: BIN_PATH, root: ROOT_DIR, dataDir: config.dataDir, node: process.version },
    };
  }

  async function state() {
    return {
      version: VERSION,
      now: Date.now(),
      ready: store.ready,
      windowDays: config.windowDays,
      host,
      sessions: store.list(),
      runtimes: store.runtimes,
      limits: store.limitList(),
      credits: store.creditList(),
      connectors: connectorList(),
      spend: spendPayload(),
      alerts: { unread: alerts.unread(), items: alerts.list().slice(0, 100) },
      settings: datastore.data.settings,
      integrations: await integrations(),
      projects: projectsPayload(projects()),
      launch: launchPayload(),
      runs: runsPayload(),
      license: licenseStatus(),
      usage: datastore.data.usage,
    };
  }

  const timers = [];
  let connectorsJson = '';

  async function start() {
    const t0 = Date.now();
    const whoami = run('id', ['-F']).then((r) => { if (r.ok) host.fullName = r.stdout.trim(); });
    const launchReady = refreshLaunch().catch((err) => console.error('Agentree: zjištění spustitelných agentů selhalo:', err.message));
    apps = dry ? ALL_APPS : config.openMode === 'exec' ? await detectApps() : {};
    const results = await Promise.allSettled(list.map((c) => c.start()));
    results.forEach((r, i) => { if (r.status === 'rejected') console.error(`Agentree: konektor ${list[i].id} selhal:`, r.reason?.message || r.reason); });
    await Promise.all([whoami, launchReady]);
    store.reevaluate();
    store.ready = true;
    syncSnapshots();
    alerts.start();
    alerts.checkBudgets(spend());
    connectorsJson = JSON.stringify(connectorList());

    const every = (fn, ms) => { const t = setInterval(() => { Promise.resolve().then(fn).catch(() => {}); }, ms); t.unref?.(); timers.push(t); };
    every(() => store.reevaluate(), 5000);
    every(() => alerts.checkLimitResets(), 20000);
    every(() => checkProjectBudgets(), 60000);
    every(async () => {
      for (const c of list) if (c.kind === 'local' && c.id !== 'processes' && c.id !== 'cursor') await c.scan();
    }, config.scanIntervalMs);
    every(() => {
      const next = JSON.stringify(connectorList());
      if (next !== connectorsJson) { connectorsJson = next; store.emit('connectors', JSON.parse(next)); }
    }, 5000);
    every(() => spendChanged(), HOUR);
    log(`Agentree: načteno ${store.list().length} konverzací za ${Date.now() - t0} ms.`);
  }

  async function stop() {
    for (const t of timers) clearInterval(t);
    for (const c of list) {
      try { c.stop(); } catch { /* ignorovat při ukončení */ }
    }
    persistSnapshots.cancel();
    await datastore.flush();
  }

  return {
    config, host, datastore, store, alerts, secrets, notifier, connectors, runs, localChat,
    connectorList, spendPayload, spendChanged, integrations, state, start, stop, openSession,
    licenseStatus, activateLicense, removeLicense,
    createProject, updateProject, removeProject, assignToProject, exportProject, projectsPayload: () => projectsPayload(projects()),
    setProjectMedia, removeProjectMedia, readProjectMedia, projectGit, launchTeam, projectWorkAction, checkProjectBudgets, projectMonthTokens,
    launch, launchPayload, refreshLaunch, runsPayload, listFolders, autostart,
  };
}
