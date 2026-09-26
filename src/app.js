import os from 'node:os';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { loadConfig, VERSION, EXTENSION_DIR, ROOT_DIR } from './config.js';
import { syncExtension } from './extension-install.js';
import { DataStore, EXTENSION_ORIGIN, EXTENSION_INSTALLATION_ID, EXTENSION_INSTALLATIONS_MAX } from './datastore.js';
import { Store } from './store.js';
import { AlertEngine } from './alerts.js';
import { createNotifier } from './notify.js';
import { createSecrets } from './secrets.js';
import { spendSummary, spendCsv, SERVICES, KINDS, CURRENCIES, convert } from './spend.js';
import { createRateFeed, rateInfo } from './rates.js';
import { readClaudeAccount, claudePlanFromAccount, chatgptPlanFromLimits, describePlan, subscriptionEntries } from './subscriptions.js';
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
import { createClaudeDesktopCodeConnector } from './connectors/claude-desktop-code.js';
import { createClaudeDesktopUsageConnector } from './connectors/claude-desktop-usage.js';
import { createProcessesConnector } from './connectors/processes.js';
import { createLocalAgentsConnector } from './connectors/local-agents.js';
import { detectApps, openTargets, planOpen, executeOpen, planRuntimeFocus, RUNTIME_APPS, ALL_APPS, copyToClipboard } from './openers.js';
import { migrateLegacyData } from './migrate.js';
import { createOllamaClient } from './ollama.js';
import { RunManager } from './runs.js';
import { createLocalChat } from './local-chat.js';
import { createLanAccess } from './lan.js';
import { detectTunnels, remoteAdvice, remoteUrl } from './tunnel.js';
import { AGENT_TYPES, MAX_AGENTS, normalizeAgent, probeAgent } from './custom-agents.js';
import { appInstalled, oknoDoPopredi } from './platform.js';
import { detectLaunchEnv, launchTargets, planLaunch, writePromptFile, promptFilePath, MODES, PROMPT_MAX } from './launcher.js';
import { verifyLicense } from './license.js';
import { PLANS, PAID_FEATURES, planOf, canUse } from './plans.js';
import { createUcet } from './ucet.js';
import { createNapojeni } from './napojeni.js';
import { spustPrihlaseni } from './prihlaseni.js';
import { createCloudSync, utrataPoMesicich } from './cloud-sync.js';
import { resolveProject, snapshotOf, projectsPayload, validateProject, assignSessions, deleteProject, reorderProjects, projectCsv, COVER_PRESETS, MEDIA_FILE, TEAM_AGENTS } from './projects.js';
import { installLaunchAgent, uninstallLaunchAgent, isLaunchAgentInstalled } from './launch-agent.js';
import { fullUserName } from './platform.js';

export const BIN_PATH = path.join(ROOT_DIR, 'bin', 'agenteeq.mjs');
export const DIST_DIR = path.join(ROOT_DIR, 'dist');
// Bez licence Pro je možné mít tolik aktivních projektů – platí jen, když je `projectsUnlimited` v PAID_FEATURES.
export const FREE_PROJECT_LIMIT = 3;
const DRY_BINS = { claude: '/usr/local/bin/claude', codex: '/usr/local/bin/codex' };
// Přihlášení „nanečisto“ (AGENTEEQ_OPEN=dry): běží, dokud ho nic nezastaví, a nic nevypíše.
const PRIHLASENI_NASUCHO = Object.freeze({ ok: true, dry: true, odkaz: () => null, chceKod: () => false, posliKod: () => false, zastav() {}, bezi: () => true, vystup: () => '' });

// `scripts/build-macos.mjs` ukládá hotový instalační ZIP do `dist/Agenteeq-<verze>-macOS-<arch>.zip`.
// Server odvozuje přesný název sám (verze z package.json, architektura procesu) – nikdy z požadavku klienta.
export async function findInstallPackage(distDir = DIST_DIR, version = VERSION, arch = process.arch) {
  const name = `Agenteeq-${version}-macOS-${arch}.zip`;
  const file = path.join(distDir, name);
  try {
    const st = await fsp.stat(file);
    if (!st.isFile()) return null;
    return { name, path: file, size: st.size, createdAt: Math.round(st.birthtimeMs || st.mtimeMs), version, arch };
  } catch {
    return null;
  }
}
const HOME_HIDDEN = new Set(['Library']);
const hashToken = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

export async function createApp(config = loadConfig(), { licensePublicKey, distDir = DIST_DIR, tunnelDetector = detectTunnels, networkInterfaces, installed: installedOverride, hostIdentity, napojeniRun } = {}) {
  // Cesta, kterou má uživatel vybrat v Chromu. Do startu ukazuje na složku v balíčku, pak na kopii.
  let extensionPath = EXTENSION_DIR;
  try {
    const m = await migrateLegacyData({ dataDir: config.dataDir, legacyDirs: config.legacyDataDirs });
    if (m.migrated && !config.quiet) console.log(`Agenteeq: data převzata z ${m.from}`);
  } catch (err) {
    console.error('Agenteeq: převzetí dat ze staré složky selhalo:', err.message);
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
  // Prohlídka a snímky na web nesmí prozradit jméno majitele počítače ani název Macu.
  const host = { name: os.hostname().replace(/\.local$/, ''), user: os.userInfo().username, fullName: '', home: config.sourceHome, ...hostIdentity };
  const log = (...args) => { if (!config.quiet) console.log(...args); };
  const dry = config.openMode === 'dry';

  // Účet Agenteeq (přihlášení přes Google). Adresa se otevírá v prohlížeči stejně jako odkazy
  // z konverzací – přes plán „open“, v testech jen nanečisto.
  // Stav účtu nese i stav synchronizace souhrnů – rozhraní je ukazuje v jedné kartě.
  const ucetStav = () => ({ ...ucet.status(), sync: cloudSync.status() });
  const ucet = createUcet({
    config,
    secrets,
    emit: (stav) => {
      store.emit('ucet', { ...stav, sync: cloudSync.status() });
      // Po přihlášení se načte volba synchronizace z účtu (mohla být zapnutá na jiném Macu).
      if (stav.udalost === 'prihlaseno') cloudSync.nactiVolbu().then(() => cloudSync.synchronizuj()).catch(() => {});
    },
    open: (url) => executeOpen({ kind: 'open', args: [url], label: 'prohlížeč' }, { dry }),
  });
  // Synchronizace souhrnů do účtu (src/cloud-sync.js): jen čísla, jen na výslovné zapnutí.
  const cloudSync = createCloudSync({
    config,
    ucet,
    datastore,
    verze: VERSION,
    emit: () => store.emit('ucet', ucetStav()),
    zdroje: {
      sessions: () => store.list(),
      limity: () => store.limitList(),
      konektory: () => connectorList(),
      utrata: () => {
        const sp = datastore.data.spend;
        const mesice = spend().months.map((m) => m.key);
        const zaznamy = [...(sp.ledger || []), ...connectors['cloud-billing'].autoEntries(), ...subscriptionEntries(subscriptions(Date.now()), Date.now())];
        return utrataPoMesicich(zaznamy, { mesice, prevod: (e) => convert(e.amount, e.currency, sp), mena: sp.currency || 'CZK' });
      },
    },
  });

  // Po přihlášení v prohlížeči se vrátí do popředí okno Agenteeq – jen desktopová aplikace, jinde
  // (Terminál, telefon) žádné okno k vrácení není.
  async function vratOkno() {
    const prikaz = config.desktop && config.openMode === 'exec' ? oknoDoPopredi() : null;
    if (!prikaz) return { ok: false };
    const r = await run(prikaz.cmd, prikaz.args, { timeout: 8000 });
    return { ok: r.ok };
  }

  const ollama = createOllamaClient({ baseUrl: config.ollamaUrl });
  const localChat = createLocalChat({ store, ollama });
  // Stav tunelů (Tailscale / Cloudflare / ngrok). Deklarovaný takhle vysoko schválně: čte ho
  // i přístup z telefonu níž, a `let` v dočasné mrtvé zóně by při čtení shodil celý start.
  let tunely = { at: 0, list: [], advice: null };

  // Jméno Macu v MagicDNS bere přístup z telefonu z detekce Tailscale (tunnelsPayload) – aby
  // adresa mac.tailnet.ts.net prošla kontrolou hlavičky Host. Když MagicDNS zapnutý není,
  // zůstane prázdné a pracuje se s adresou 100.x; nic se nedomýšlí.
  const lan = createLanAccess({
    datastore,
    config,
    tailscaleName: () => tunely.list.find((t) => t.id === 'tailscale' && t.running)?.url || '',
    tailscaleIps: () => tunely.list.find((t) => t.id === 'tailscale' && t.running)?.ips || [],
    ...(networkInterfaces ? { interfaces: networkInterfaces } : {}),
    onAuthorizationChange: () => store.emit('remote:authorization'),
    onListen: (s) => log(`Agenteeq: přístup z telefonu je zapnutý na ${[s.enabled && s.url, s.tailscale.enabled && s.tailscale.url].filter(Boolean).join(' a ')}`),
  });
  const runs = new RunManager({
    dataDir: config.dataDir,
    onChange: (_list, run) => {
      if (run?.status === 'failed') recordRunFailure(run);
      if (store.ready) store.emit('runs', runsPayload());
    },
  });
  const failedRuns = new Set();

  // Běh, který skončil chybou, se musí v session ukázat jako „Selhalo“ s důvodem – nikdy jako „Hotovo“.
  function recordRunFailure(run) {
    if (failedRuns.has(run.id)) return;
    failedRuns.add(run.id);
    const rawError = String(run.error || `Skončilo s kódem ${run.exitCode}`).trim();
    const raw = /[.!?]$/.test(rawError) ? rawError : `${rawError}.`;
    let hint = '';
    if (/authenticat|oauth|log ?in|unauthori|401|credential/i.test(raw)) {
      hint = ' Přihlas se znovu tlačítkem Napojit v Nastavení → Propojení (otevře se v prohlížeči).';
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
    summary.open = openTargets(summary, apps, { aplikace: config.openApps });
    Object.assign(summary, resolveProject(summary, projects(), { worktreeRoot }));
    if (summary.connector === 'local-chat') summary.chat = { available: localChat.has(summary.id) };
  };

  async function openSession(id, target) {
    const s = store.summary(id);
    if (!s) return { status: 404, error: 'Konverzace nenalezena.' };
    if (config.openMode === 'off') return { status: 422, error: 'Otevírání odsud tenhle systém neumí.' };
    // Otevřít aplikaci nebo Terminál umí jen macOS; složku a odkaz i Windows.
    if (!config.openApps && (target === 'terminal' || (target === 'app' && s.connector !== 'web'))) {
      return { status: 422, error: target === 'terminal'
        ? 'Pokračovat v Terminálu umí Agenteeq zatím jen na macOS. Příkaz si můžeš zkopírovat.'
        : 'Otevřít konverzaci přímo v aplikaci umí Agenteeq zatím jen na macOS.' };
    }
    const plan = planOpen(s, target, apps, { aplikace: config.openApps });
    if (!plan) return { status: 422, error: 'Tuto akci pro konverzaci nelze provést.' };
    const r = await executeOpen(plan, { dry });
    if (!r.ok) return { status: 502, error: r.error };
    return { ok: true, label: plan.label, ...(r.dry ? { dry: true, plan } : {}) };
  }

  // Je nástroj opravdu nainstalovaný? `null` = zatím nevím (příkazy se hledají přes přihlašovací shell
  // až po startu; v testech a v suchém běhu se nehledá vůbec). Konektory z toho odvozují, jestli smí
  // říct „je nainstalovaný“ — samotná složka s daty to nedokazuje.
  let launchDetected = false;
  const installed = installedOverride || {
    bin: (name) => (launchDetected ? Boolean(launchEnv.bins?.[name]) : null),
    app: (names) => (config.openMode === 'exec' ? appInstalled(names, config.sourceHome) : null),
  };
  const ctx = { config, store, datastore, secrets, installed, onSpendChanged: () => spendChanged(), extensionRecord: () => datastore.data.extension };
  const list = [
    createClaudeCodeConnector(ctx),
    createCodexConnector(ctx),
    createCursorConnector(ctx),
    createCopilotCliConnector(ctx),
    createVsCodeCopilotConnector(ctx),
    createGeminiFamilyConnector(ctx, { id: 'gemini-cli', name: 'Gemini CLI', dir: '.gemini', provider: 'google', app: 'Gemini CLI', bin: 'gemini' }),
    createGeminiFamilyConnector(ctx, { id: 'qwen-code', name: 'Qwen Code', dir: '.qwen', provider: 'alibaba', app: 'Qwen Code', bin: 'qwen' }),
    createWebConnector(ctx),
    createCloudBillingConnector(ctx),
    createClaudeDesktopUsageConnector(ctx),
    createClaudeDesktopCodeConnector(ctx),
  ];
  if (config.processes) {
    list.push(createProcessesConnector(ctx));
    // Detektor všeho ostatního, co na Macu běží jako AI agent – včetně vlastních a neznámých modelů.
    list.push(createLocalAgentsConnector({ ...ctx, onDetect: (found) => store.setLocalAgents(found) }));
  }
  const connectors = Object.fromEntries(list.map((c) => [c.id, c]));

  // Počet u konektorů se sessions = sessions viditelné v okně sledování (ne počet souborů na disku).
  const SESSION_CONNECTORS = new Set(['claude-code', 'claude-desktop-code', 'codex', 'cursor', 'copilot-cli', 'vscode-copilot', 'gemini-cli', 'qwen-code', 'web']);

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

  // Předplatné zjištěné z tohoto Macu (Claude z účtu Claude Code, ChatGPT z plánu, který hlásí Codex).
  let claudeAccount = null;
  const rateFeed = createRateFeed({ spend: () => datastore.data.spend, save: () => datastore.save(), changed: () => spendChanged(), enabled: config.cloudFetch && !dry });
  async function refreshSubscriptions() {
    const acc = await readClaudeAccount(config.sourceHome);
    const before = JSON.stringify(claudeAccount);
    claudeAccount = acc ? claudePlanFromAccount(acc) : null;
    if (JSON.stringify(claudeAccount) !== before) spendChanged();
  }
  function subscriptions(now = Date.now()) {
    const found = [claudeAccount, chatgptPlanFromLimits(store.limitList())].filter(Boolean);
    return found.map((f) => describePlan(f, datastore.data.spend.ledger, now));
  }

  // Automatické záznamy útraty: denní útrata z Admin API a předplatné podle ceníku.
  const automatickeVydaje = (now) => [...connectors['cloud-billing'].autoEntries(), ...subscriptionEntries(subscriptions(now), now)];

  function spend() {
    const now = Date.now();
    return spendSummary(datastore.data.spend, now, automatickeVydaje(now));
  }

  // Útrata → Export CSV: tytéž záznamy jako souhrn na obrazovce, včetně automatických.
  function exportSpend(mesicu, now = Date.now()) {
    return spendCsv(datastore.data.spend, now, automatickeVydaje(now), mesicu);
  }

  function spendPayload() {
    const sp = datastore.data.spend;
    return { ...spend(), ledger: sp.ledger, budgetsConfig: sp.budgets, rates: sp.rates, rateInfo: rateInfo(sp), subscriptions: subscriptions(), services: SERVICES, kinds: KINDS, currencies: CURRENCIES };
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

  // Snímky konverzací v projektech se ukládají s odstupem – při živé práci se data.json nepřepisuje každou vteřinu.
  const persistSnapshots = debounce(() => datastore.save(), 15000);

  function syncSnapshots() {
    const pd = projects();
    const live = new Map(store.list().map((s) => [s.id, s]));
    for (const s of live.values()) {
      if (s.projectId && !s.parentId) pd.snapshots[s.id] = snapshotOf(s);
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

  function reorderProjectList(ids) {
    if (!reorderProjects(projects(), ids)) return { status: 422, error: 'Pořadí se nepodařilo změnit.' };
    projectsChanged();
    return { ok: true };
  }

  function removeProject(id) {
    if (!/^[\w-]{1,64}$/.test(id) || !deleteProject(projects(), id)) return { status: 404, error: 'Projekt neexistuje.' };
    fsp.rm(path.join(mediaRoot, id), { recursive: true, force: true }).catch(() => {});
    projectsChanged();
    return { ok: true };
  }

  const findProject = (id) => projects().items.find((p) => p.id === id) || null;
  const repoOf = (p) => p.settings.repo || p.folders[0] || '';

  /* Vzhled projektu: vlastní pozadí karty a logo (PNG, JPG, WebP – obsah se ověřuje podle hlavičky souboru, ne podle přípony). */

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
        const branch = `agenteeq/${AGENT_SHORT[agent]}-${slug}-${stamp}`;
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
    if (!w.path.startsWith(worktreeRoot + path.sep)) return { status: 422, error: 'Pracovní kopie leží mimo Agenteeq – uprav ji ručně.' };
    const running = (w.runId && ['running', 'stopping'].includes(runs.get(w.runId)?.status)) || (w.sessionId && store.summary(w.sessionId)?.status === 'working');
    if (running) return { status: 409, error: 'Agent na této větvi ještě pracuje. Počkej, až skončí, nebo ho zastav.' };
    if (dry) return { ok: true, dry: true };
    const info = await repoInfo(repoOf(p));
    if (!info.isRepo) return { status: 422, error: 'Repozitář projektu není dostupný.' };
    let r;
    if (action === 'accept') {
      r = await acceptWork({ repo: info.root, dir: w.path, branch: w.branch, base: w.base, message: `Agenteeq: ${w.label || w.agent} – ${clip(w.prompt, 72)}` });
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
    if (!config.launchAgents) targets = targets.filter((t) => t.group === 'local' || t.group === 'web');
    return { targets, modes: MODES, openMode: config.openMode };
  }

  // Napojení modelů tlačítkem (src/napojeni.js). Přihlašuje se vždy u dodavatele; tady se jen
  // spustí jeho přihlášení a hlídá, kdy je hotovo. V testech dotazy na stav odpovídá atrapa.
  const napojeni = createNapojeni({
    // Dokud se programy nehledaly (jiný systém než macOS, nebo spouštění vypnuté), nevíme – ne „není“.
    bins: () => (launchDetected || dry ? launchEnv.bins : null),
    // Kdy agent na tomhle Macu naposledy pracoval (z konverzací v úložišti, ne z času načtení).
    posledni: (id) => store.list().reduce((m, s) => (s.connector === id && s.lastAt > m ? s.lastAt : m), 0),
    oknoDni: config.windowDays,
    run: napojeniRun || run,
    // Přihlášení běží na pozadí, bez Terminálu; v testech (dry) se nic nespouští.
    prihlas: (bin, args, moznosti) => (dry ? Promise.resolve(PRIHLASENI_NASUCHO) : spustPrihlaseni(bin, args, moznosti)),
    open: (url) => executeOpen({ kind: 'open', args: [url], label: 'prohlížeč' }, { dry }),
    emit: (u) => store.emit('napojeni', u),
    extension: () => ({ ...extensionStatus(), sites: connectors.web.status().sites || {} }),
    plan: async (id) => {
      if (id === 'claude-code') {
        const found = claudePlanFromAccount(await readClaudeAccount(config.sourceHome));
        return found ? describePlan(found).label : '';
      }
      const found = chatgptPlanFromLimits(store.limitList());
      return found ? describePlan(found).label : '';
    },
  });

  async function refreshLaunch() {
    if (config.launchAgents && config.openMode === 'exec') {
      launchEnv = await detectLaunchEnv({ ollama, home: config.sourceHome });
      launchDetected = true;
    } else launchEnv = { bins: dry ? DRY_BINS : {}, chatgptApp: dry, claudeApp: dry, ollama: await ollama.models() };
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
    const webOpen = plan.kind === 'open' && plan.mode === 'web';
    if (!config.launchAgents && plan.kind !== 'local' && !webOpen) return { status: 422, error: 'Spouštění agentů na pozadí umí Agenteeq zatím jen na macOS.' };
    if (config.openMode === 'off' && plan.kind !== 'local') return { status: 422, error: 'Otevírání odsud tenhle systém neumí.' };
    const gate = plan.kind === 'background' ? locked('launchBackground') : plan.kind === 'local' ? locked('localChat') : null;
    if (gate) return gate;

    let sessionId = plan.sessionId || null;
    let runInfo = null;
    let copied = false;
    if (plan.kind === 'terminal') {
      if (!dry) await writePromptFile(promptDir, plan.prompt, uuid);
      const x = await executeOpen({ kind: 'terminal', command: plan.command, label: 'Terminál' }, { dry });
      if (!x.ok) return { status: 502, error: x.error };
    } else if (plan.kind === 'open') {
      // Zadání musí být ve schránce dřív, než se okno služby otevře a uživatel sáhne po ⌘V.
      if (plan.copyPrompt) copied = (await copyToClipboard(plan.prompt, { dry })).ok;
      if (plan.mode === 'web') offerWebHandoff(plan.agent, plan.prompt, plan.handoff === 'confirm-or-paste');
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
      copied,
      autofill: plan.mode === 'web' && extensionConnected(),
      handoff: plan.handoff || null,
      ...(dry ? { dry: true, plan: { ...publicPlan, argv, command } } : {}),
    };
  }

  // Kódex spuštěný na pozadí nemá předem známé ID session – spáruje se podle složky a času startu.
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
      return { status: err.code === 'ENOENT' || err.code === 'ENOTDIR' ? 404 : 403, error: err.code === 'ENOENT' || err.code === 'ENOTDIR' ? 'Složka neexistuje.' : 'Do této složky nemá Agenteeq přístup.' };
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
    if (config.desktop) return { status: 422, error: 'Desktopovou aplikaci přidej v Nastavení systému → Obecné → Přihlašovací položky.' };
    if (!config.autostart) return { status: 422, error: 'Spuštění po přihlášení umí Agenteeq zatím jen na macOS (přes LaunchAgent).' };
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
      extension: { path: extensionPath, sites: WEB_SITES, ...extensionStatus() },
      cloud: connectors['cloud-billing'].providers(),
      keychain: secrets.available,
      nativeNotify: config.desktop || notifier.enabled,
      desktop: config.desktop,
      autostart: {
        supported: !config.desktop && config.autostart,
        installed: await isLaunchAgentInstalled(config.sourceHome),
        command: `"${process.execPath}" "${BIN_PATH}" install-agent`,
      },
      install: { bin: BIN_PATH, root: ROOT_DIR, dataDir: config.dataDir, node: process.version, package: await findInstallPackage(distDir) },
    };
  }

  // „Ukázat ve Finderu“ pro instalační balíček v Nastavení → Instalace pro další lidi.
  // Cesta se nikdy nebere z požadavku – server ji odvodí sám ze složky dist (distDir), jinak by šlo
  // přes tento endpoint otevřít ve Finderu cokoli na disku.
  async function revealInstallPackage() {
    const pkg = await findInstallPackage(distDir);
    // V nainstalované aplikaci žádné `dist/` není – hotový balíček leží jen ve vývojovém repu.
    // Uživateli proto ukážeme samotnou aplikaci: ve Finderu si ji zabalí a výsledný ZIP pošle dál.
    const bundle = path.resolve(ROOT_DIR, '..', '..', '..');
    const target = pkg?.path || (config.desktop && bundle.endsWith('.app') ? bundle : null);
    if (!target) return { status: 404, error: 'Instalační balíček nenalezen. Vytvoř ho příkazem npm run build:mac.' };
    if (config.openMode === 'off') return { status: 422, error: 'Ukázat balíček ve správci souborů tenhle systém neumí.' };
    // -R (ukázat v nadřazené složce) zná jen `open` na macOS; jinde se otevře samotná složka.
    const plan = config.openApps
      ? { kind: 'open', args: ['-R', target], label: 'Finder' }
      : { kind: 'open', args: [path.dirname(target)], label: 'Správce souborů' };
    const r = await executeOpen(plan, { dry });
    if (!r.ok) return { status: 502, error: r.error };
    return { ok: true, ...(r.dry ? { dry: true, plan } : {}) };
  }

  /* ---------- Vlastní agenti (ComfyUI, Ollama, OpenAI-kompatibilní servery) ---------- */
  // Agenteeq od nich jen čte stav. Adresa smí mířit výhradně na tenhle počítač nebo do místní sítě
  // (kontroluje `validateEndpoint` v custom-agents.js), dotaz je vždy GET bez přesměrování, s časovým
  // limitem a stropem na velikost odpovědi. Žádné přihlašovací údaje se neukládají.
  const customStatus = new Map();
  let customJson = '';

  function customAgentsPayload() {
    return datastore.data.customAgents.map((a) => {
      const st = customStatus.get(a.id) || {};
      return {
        id: a.id,
        name: a.name,
        type: a.type,
        typeLabel: AGENT_TYPES[a.type]?.label || a.type,
        origin: a.origin,
        addedAt: a.addedAt,
        running: Boolean(st.running),
        ok: Boolean(st.ok),
        detail: st.detail || '',
        at: st.at || 0,
      };
    });
  }

  function emitCustomAgents() {
    const payload = customAgentsPayload();
    const json = JSON.stringify(payload);
    if (json === customJson) return payload;
    customJson = json;
    if (store.ready) store.emit('customAgents', payload);
    return payload;
  }

  async function probeCustomAgents() {
    const list = datastore.data.customAgents;
    for (const a of list) customStatus.set(a.id, await probeAgent(a));
    for (const id of [...customStatus.keys()]) if (!list.some((a) => a.id === id)) customStatus.delete(id);
    emitCustomAgents();
  }

  async function addCustomAgent(input) {
    const list = datastore.data.customAgents;
    if (list.length >= MAX_AGENTS) return { status: 422, error: `Víc než ${MAX_AGENTS} vlastních agentů Agenteeq nesleduje.` };
    const r = normalizeAgent({ ...input, origin: input?.url ?? input?.origin });
    if (!r.ok) return { status: 400, error: r.error, field: 'url' };
    if (list.some((a) => a.origin === r.agent.origin && a.type === r.agent.type)) return { status: 409, error: 'Tenhle agent už je v seznamu.', field: 'url' };
    list.push(r.agent);
    await datastore.flush();
    customStatus.set(r.agent.id, await probeAgent(r.agent));
    return { agents: emitCustomAgents() };
  }

  async function removeCustomAgent(id) {
    const list = datastore.data.customAgents;
    const i = list.findIndex((a) => a.id === id);
    if (i === -1) return { status: 404, error: 'Takový agent v seznamu není.' };
    list.splice(i, 1);
    customStatus.delete(id);
    await datastore.flush();
    return { agents: emitCustomAgents() };
  }

  // Přepnutí do okna běžící aplikace. Plán se skládá jen z pevného seznamu (openers.js),
  // z požadavku přichází výhradně id běhového prostředí.
  async function focusRuntime(id) {
    const plan = planRuntimeFocus(id);
    if (!plan) return { status: 404, error: 'Tuhle aplikaci Agenteeq neumí přepnout do popředí.' };
    const bezi = store.runtimes.find((r) => r.id === id && r.running);
    if (!bezi) return { status: 409, error: `${plan.label} teď neběží.` };
    const r = await executeOpen(plan, { dry });
    if (!r.ok) return { status: 502, error: r.error };
    return { ok: true, label: plan.label, ...(r.dry ? { dry: true } : {}) };
  }

  // Vzdálený přístup mimo domácí síť: Agenteeq nic neotvírá sám, jen zjistí, jestli má uživatel
  // nainstalovaný tunel (Tailscale / Cloudflare / ngrok) a poradí, co s tím. Zjišťuje se na
  // vyžádání a po startu, ne v každém cyklu – jsou to volání externích binárek.
  async function refreshTunnels() {
    const port = lanPort();
    const list = await tunnelDetector({ port });
    tunely = {
      at: Date.now(),
      list: list.map((t) => ({ ...t, remoteUrl: t.running ? remoteUrl(t, port) : '' })),
      advice: remoteAdvice(list),
    };
    return tunely;
  }
  const tunnelsPayload = () => tunely;

  /* ---------- Přístup z telefonu ---------- */
  // Zapnutí přidá druhý listener na místní síť; vypnutí ho zavře a odpáruje všechna zařízení,
  // aby po vypnutí nezůstal nikde platný token. Požadavek na zapnutí smí přijít jen z tohoto Macu
  // (hlídá to src/http.js) a bez zapnutí se z místní sítě nedá načíst vůbec nic.
  let lanHandler = null;
  let lanPort = () => config.port;
  const bindLan = (handler, portFn) => { lanHandler = handler; if (portFn) lanPort = portFn; };
  let restoringRemote = null;
  let stoppingRemote = false;
  function restoreRemoteAccess() {
    if (stoppingRemote || !lanHandler || (!datastore.data.settings.lanAccess && !datastore.data.settings.tailscaleAccess)) return Promise.resolve();
    if (restoringRemote) return restoringRemote;
    restoringRemote = (async () => {
      if (datastore.data.settings.tailscaleAccess) {
        try { await refreshTunnels(); }
        catch { tunely = { at: Date.now(), list: [], advice: null }; }
      }
      if (stoppingRemote) return;
      store.emit('remote:authorization');
      await lan.start(lanHandler, lanPort());
    })().finally(() => { restoringRemote = null; });
    return restoringRemote;
  }

  async function setLanAccess(enabled) {
    if (enabled && !lanHandler) return { status: 503, error: 'Server ještě není připravený, zkus to za chvíli.' };
    if (enabled && !lan.status().addresses.length) return { status: 422, error: 'Mac není v žádné místní síti – připoj se na Wi-Fi.' };
    return applyAccess('lanAccess', enabled, 'Přístup z telefonu se nepodařilo otevřít.');
  }

  // Přístup z vlastní privátní sítě Tailscale. Chová se stejně jako přístup z domácí sítě –
  // jen se naslouchá na adrese 100.x místo 192.168.x a adresa nikde veřejně neexistuje.
  // Párování kódem a token platí i tady: bez spárovaného zařízení se nepřečte nic.
  async function setTailscaleAccess(enabled) {
    if (enabled && !lanHandler) return { status: 503, error: 'Server ještě není připravený, zkus to za chvíli.' };
    if (enabled) {
      // Adresa z rozsahu 100.64.0.0/10 sama o sobě Tailscale nedokazuje: je to rozsah pro
      // CGNAT (RFC 6598) a od některých operátorů ji Mac dostane i bez něj. Zeptáme se proto
      // přímo Tailscale, jestli běží – jinak bychom otevřeli naslouchání do sítě operátora
      // a v rozhraní tvrdili, že je to „adresa v síti Tailscale“.
      const stav = (await refreshTunnels()).list.find((t) => t.id === 'tailscale');
      if (!stav?.running) {
        return {
          status: 422,
          error: stav?.installed
            ? 'Tailscale je nainstalovaný, ale nejsi přihlášený. Spusť „tailscale up“ a zkus to znovu.'
            : 'Tailscale na tomto Macu neběží. Nainstaluj ho, přihlas se („tailscale up“) a zkus to znovu.',
        };
      }
      if (!lan.status().tailscale.available) return { status: 422, error: 'Tailscale běží, ale tenhle Mac zatím nemá adresu v tailnetu. Zkus to za chvíli.' };
    }
    return applyAccess('tailscaleAccess', enabled, 'Přístup přes Tailscale se nepodařilo otevřít.');
  }

  // Společné přepnutí obou cest. Odpárování zařízení nastává, teprve když se zavírá poslední
  // otevřená cesta – jinak by vypnutí Tailscale odhlásilo i telefon spárovaný v domácí síti.
  async function applyAccess(key, enabled, selhani) {
    const druhy = key === 'lanAccess' ? 'tailscaleAccess' : 'lanAccess';
    datastore.data.settings[key] = Boolean(enabled);
    if (!enabled && !datastore.data.settings[druhy]) datastore.data.lanDevices = [];
    if (!enabled) store.emit('remote:authorization');
    await datastore.flush();
    if (datastore.data.settings.lanAccess || datastore.data.settings.tailscaleAccess) await lan.start(lanHandler, lanPort());
    else await lan.stop();
    store.emit('settings', datastore.data.settings);
    const s = lan.status();
    const bezi = key === 'lanAccess' ? s.listening : s.tailscale.listening;
    if (enabled && !bezi) {
      datastore.data.settings[key] = false;
      await datastore.flush();
      if (!datastore.data.settings[druhy]) await lan.stop();
      else await lan.start(lanHandler, lanPort());
      const chyba = key === 'lanAccess' ? s.error : s.tailscale.error;
      return { status: 502, error: chyba || selhani };
    }
    return { lan: lan.status() };
  }

  // Předání zadání do webové služby, která ho neumí převzít z adresy (Gemini, Qwen) nebo je na
  // adresu příliš dlouhé. Rozšíření si ho po otevření stránky vyzvedne a vloží do pole zprávy.
  // Drží se jen v paměti, jednou, dvě minuty a jen pro tu službu – nikam se neukládá.
  const HANDOFF_TTL = 2 * 60 * 1000;
  const HANDOFF_SITE = { 'claude-web': 'claude' };
  const webHandoffs = new Map();

  function offerWebHandoff(agent, prompt, prefilled) {
    webHandoffs.set(HANDOFF_SITE[agent] || agent, { prompt, prefilled, at: Date.now() });
  }

  function takeWebHandoff(site) {
    const h = typeof site === 'string' ? webHandoffs.get(site) : null;
    if (!h) return { prompt: null };
    webHandoffs.delete(site);
    return Date.now() - h.at <= HANDOFF_TTL ? { prompt: h.prompt, prefilled: Boolean(h.prefilled) } : { prompt: null };
  }

  // Rozšíření se ozývá při startu Chromu, každých 30 minut a při každé konverzaci. Dvě hodiny ticha
  // tedy znamenají, že Chrome neběží nebo je rozšíření vypnuté – to se uživateli řekne na rovinu.
  const EXTENSION_QUIET_MS = 2 * 60 * 60 * 1000;

  // Spárované je jen rozšíření s platným tokenem instalace. Záznam `pairedAt` bez něj zbyl po verzích,
  // kdy rozšíření sdílelo token s hooky – takové rozšíření server odmítá, takže ho nelze hlásit
  // jako připojené. `repair` říká rozhraní, že ho stačí spárovat znovu.
  function extensionStatus(now = Date.now()) {
    const e = datastore.data.extension;
    const paired = datastore.data.extensionInstallations.length > 0;
    const active = connectors.web.status().state === 'connected';
    const state = !paired ? 'missing' : active ? 'active' : now - e.seenAt <= EXTENSION_QUIET_MS ? 'ready' : 'quiet';
    return {
      state,
      pairedAt: paired ? e.pairedAt : 0,
      seenAt: e.seenAt,
      version: e.version,
      expectedVersion: VERSION,
      outdated: paired && Boolean(e.version) && e.version !== VERSION,
      repair: !paired && e.pairedAt > 0,
    };
  }

  // Volá se po každém požadavku, který prokázal token rozšíření. Na disk jen při změně nebo jednou
  // za minutu, aby konverzace posílaná každých pár sekund nezapisovala pořád dokola.
  function extensionSeen(body, now = Date.now()) {
    const e = datastore.data.extension;
    const version = body && typeof body.version === 'string' && /^\d+\.\d+\.\d+$/.test(body.version) ? body.version : e.version;
    const before = extensionStatus(now).state;
    const persist = !e.pairedAt || version !== e.version || now - e.seenAt > 60 * 1000;
    if (!e.pairedAt) e.pairedAt = now;
    e.seenAt = now;
    e.version = version;
    if (persist) datastore.save();
    const after = extensionStatus(now);
    if (persist || before !== after.state) integrations().then((v) => store.emit('integrations', v)).catch(() => {});
    return after;
  }

  function extensionConnected() {
    const st = extensionStatus().state;
    return st === 'active' || st === 'ready';
  }

  // A browser extension must prove a short-lived code deliberately shown in the
  // local dashboard. Its long-lived ingest token is never part of /api/state.
  async function createExtensionPairCode() {
    const code = crypto.randomBytes(12).toString('base64url');
    const expiresAt = Date.now() + 10 * 60 * 1000;
    datastore.data.extensionPairing = { code, expiresAt };
    await datastore.flush();
    return { code, expiresAt };
  }

  // Každé spárování vydá nový token jen pro tuto instalaci a jen pro její původ. Token hooků
  // rozšíření nikdy nedostane, takže jeho únik neotevře hooky ani ostatní prohlížeče. Nové
  // spárování téže instalace její starý token zneplatní.
  async function pairExtension({ code, origin, installationId } = {}) {
    const pair = datastore.data.extensionPairing;
    if (!pair || pair.expiresAt <= Date.now() || typeof code !== 'string' || code.length !== pair.code.length) return null;
    const equal = crypto.timingSafeEqual(Buffer.from(code), Buffer.from(pair.code));
    if (!equal || typeof origin !== 'string' || !EXTENSION_ORIGIN.test(origin)) return null;
    const id = typeof installationId === 'string' && EXTENSION_INSTALLATION_ID.test(installationId) ? installationId : '';
    const token = crypto.randomBytes(32).toString('base64url');
    const now = Date.now();
    datastore.data.extensionPairing = null;
    datastore.data.extensionInstallations = [
      ...datastore.data.extensionInstallations.filter((x) => !(x.origin === origin && x.id === id)),
      { id, origin, tokenHash: hashToken(token), pairedAt: now },
    ].slice(-EXTENSION_INSTALLATIONS_MAX);
    Object.assign(datastore.data.extension, { pairedAt: now, seenAt: now });
    await datastore.flush();
    integrations().then((v) => store.emit('integrations', v)).catch(() => {});
    return { token, version: VERSION };
  }

  // Token platí jen z původu, pro který byl vydán. Porovnávají se hashe stejné délky v konstantním čase.
  function extensionInstallation(token, origin) {
    if (typeof token !== 'string' || !token || typeof origin !== 'string' || !EXTENSION_ORIGIN.test(origin)) return null;
    const given = Buffer.from(hashToken(token), 'hex');
    return datastore.data.extensionInstallations.find((x) => x.origin === origin && crypto.timingSafeEqual(given, Buffer.from(x.tokenHash, 'hex'))) || null;
  }

  // `local: false` znamená požadavek z telefonu – ten nesmí dostat párovací kód ani seznam
  // spárovaných zařízení, jinak by si mohl přizvat další.
  function storageStatus() {
    const r = datastore.recovery;
    return {
      ok: !datastore.writeError,
      error: datastore.writeError ? datastore.writeError.message : null,
      recovery: r ? { at: r.at, from: r.from, preserved: path.basename(r.preserved) } : null,
    };
  }

  async function state({ local = true } = {}) {
    return {
      version: VERSION,
      now: Date.now(),
      ready: store.ready,
      // Úložiště: rozhraní musí ukázat, když se data nedaří zapsat, a jednou i obnovu po poškození.
      storage: storageStatus(),
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
      // Telefon uvidí jen, jestli je účet přihlášený – e-mail a jméno zůstávají na Macu.
      ucet: local ? ucetStav() : { stav: ucet.status().stav },
      usage: datastore.data.usage,
      customAgents: customAgentsPayload(),
      localAgents: store.localAgents,
      lan: local ? lan.status() : { ...lan.status(), pin: null, devices: [] },
      tunnels: local ? tunnelsPayload() : { at: 0, list: [], advice: null },
    };
  }

  const timers = [];
  let connectorsJson = '';

  async function start() {
    const t0 = Date.now();
    // Kopie rozšíření mimo balíček aplikace, ať ho aktualizace Agenteeq nerozbije.
    const ext = await syncExtension({ zdroj: EXTENSION_DIR, dataDir: config.dataDir });
    extensionPath = ext.path;
    if (ext.reason && !config.quiet) console.error('Agenteeq:', ext.reason);
    const whoami = hostIdentity ? Promise.resolve() : fullUserName().then((jmeno) => { if (jmeno) host.fullName = jmeno; });
    const launchReady = refreshLaunch().catch((err) => console.error('Agenteeq: zjištění spustitelných agentů selhalo:', err.message));
    apps = dry ? ALL_APPS : config.openApps && config.openMode === 'exec' ? await detectApps() : {};
    const results = await Promise.allSettled(list.map((c) => c.start()));
    results.forEach((r, i) => { if (r.status === 'rejected') console.error(`Agenteeq: konektor ${list[i].id} selhal:`, r.reason?.message || r.reason); });
    await Promise.all([whoami, launchReady]);
    store.reevaluate();
    store.ready = true;
    syncSnapshots();
    alerts.start();
    // Ověření uloženého přihlášení jde po síti – start aplikace na něj nečeká.
    ucet.start().then(() => cloudSync.nactiVolbu()).then(() => cloudSync.synchronizuj()).catch(() => {});
    cloudSync.start();
    alerts.checkBudgets(spend());
    connectorsJson = JSON.stringify(connectorList());

    const every = (fn, ms) => { const t = setInterval(() => { Promise.resolve().then(fn).catch(() => {}); }, ms); t.unref?.(); timers.push(t); };
    every(() => store.reevaluate(), 5000);
    // Restore after Wi-Fi changes, sleep or Tailscale starting after Agenteeq.
    every(() => restoreRemoteAccess(), 30000);
    if (datastore.data.customAgents.length) probeCustomAgents().catch(() => {});
    every(() => (datastore.data.customAgents.length ? probeCustomAgents() : null), 30000);
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
    refreshSubscriptions().catch(() => {});
    every(() => refreshSubscriptions(), 10 * 60e3);
    rateFeed.start();
    // Selhání zápisu na pozadí (upozornění, projekty, výdaje) dřív skončilo jen v logu.
    let storageJson = JSON.stringify(storageStatus());
    every(() => {
      const next = JSON.stringify(storageStatus());
      if (next !== storageJson) { storageJson = next; store.emit('storage', JSON.parse(next)); }
    }, 5000);
    log(`Agenteeq: načteno ${store.list().length} konverzací za ${Date.now() - t0} ms.`);
  }

  async function stop() {
    stoppingRemote = true;
    for (const t of timers) clearInterval(t);
    rateFeed.stop();
    ucet.stop();
    cloudSync.stop();
    napojeni.stop();
    await restoringRemote;
    await lan.stop();
    for (const c of list) {
      try { c.stop(); } catch { /* ignorovat při ukončení */ }
    }
    persistSnapshots.cancel();
    await datastore.flush();
  }

  return {
    config, host, datastore, store, alerts, secrets, notifier, connectors, runs, localChat,
    installInfo: () => ({ bin: BIN_PATH, root: ROOT_DIR, dataDir: config.dataDir }),
    connectorList, spendPayload, exportSpend, rateFeed, refreshSubscriptions, spendChanged, integrations, state, start, stop, openSession, createExtensionPairCode, pairExtension, extensionInstallation, takeWebHandoff, extensionSeen, extensionStatus,
    licenseStatus, activateLicense, removeLicense, ucet, ucetStav, cloudSync, vratOkno, napojeni,
    createProject, updateProject, reorderProjectList, removeProject, assignToProject, exportProject, projectsPayload: () => projectsPayload(projects()),
    setProjectMedia, removeProjectMedia, readProjectMedia, projectGit, launchTeam, projectWorkAction, checkProjectBudgets, projectMonthTokens,
    launch, launchPayload, refreshLaunch, runsPayload, listFolders, autostart, revealInstallPackage,
    planUsageHistory: (opts) => connectors['claude-desktop-usage']?.series(opts) ?? null,
    lan, setLanAccess, setTailscaleAccess, bindLan, restoreRemoteAccess, focusRuntime, refreshTunnels, tunnelsPayload,
    runtimeFocusable: (id) => Boolean(RUNTIME_APPS[id]),
    customAgentsPayload, addCustomAgent, removeCustomAgent, probeCustomAgents, customAgentTypes: () => Object.entries(AGENT_TYPES).map(([id, t]) => ({ id, label: t.label })),
  };
}
