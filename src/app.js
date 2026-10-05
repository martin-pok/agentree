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
import { createDetekce } from './detekce.js';
import { createSecrets } from './secrets.js';
import { spendSummary, spendCsv, SERVICES, KINDS, CURRENCIES, convert, monthKey } from './spend.js';
import { createRateFeed, rateInfo } from './rates.js';
import { readClaudeAccount, claudePlanFromAccount, describePlan, subscriptionPortfolio } from './subscriptions.js';
import { claudeIdentity, observeAccount, readCodexAccount } from './provider-accounts.js';
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
import { createProcessesConnector, sdilenyVypis } from './connectors/processes.js';
import { createLocalAgentsConnector } from './connectors/local-agents.js';
import { detectApps, openTargets, planOpen, executeOpen, planRuntimeFocus, RUNTIME_APPS, ALL_APPS, copyToClipboard } from './openers.js';
import { migrateLegacyData } from './migrate.js';
import { createOllamaClient } from './ollama.js';
import { RunManager } from './runs.js';
import { createLocalChat } from './local-chat.js';
import { createLanAccess } from './lan.js';
import { detectTunnels, remoteAdvice, remoteUrl } from './tunnel.js';
import { AGENT_TYPES, MAX_AGENTS, normalizeAgent, probeAgent } from './custom-agents.js';
import { appInstalled, oknoDoPopredi, otevritVProhlizeciSRozsirenim, idRozbalenehoRozsireni, SYSTEM, POCITAC } from './platform.js';
import { detectLaunchEnv, launchTargets, planLaunch, writePromptFile, promptFilePath, MODES, PROMPT_MAX } from './launcher.js';
import { verifyLicense } from './license.js';
import { PLANS, PAID_FEATURES, planOf, canUse } from './plans.js';
import { createUcet } from './ucet.js';
import { createNapojeni } from './napojeni.js';
import { createBeziciAgenti, AGENTI as AGENTI_PROCESU, PROMENNE_DOMOVA, jeProcesovyId } from './bezici-agenti.js';
import { spustPrihlaseni } from './prihlaseni.js';
import { adresaObchodu, CHROME_WEB_STORE_URL } from '../public/js/obchod.js';
import { createCloudSync, utrataPoMesicich } from './cloud-sync.js';
import { resolveProject, snapshotOf, projectsPayload, validateProject, assignSessions, deleteProject, reorderProjects, projectCsv, projectMonthTokens as mesicniTokenyProjektu, COVER_PRESETS, MEDIA_FILE, TEAM_AGENTS } from './projects.js';
import { installLaunchAgent, uninstallLaunchAgent, isLaunchAgentInstalled } from './launch-agent.js';
import { fullUserName } from './platform.js';
import { ui } from './texty.js';
import { UpdateService } from './updates.js';
import { watchExactFile } from './watch.js';

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

export async function createApp(config = loadConfig(), { licensePublicKey, distDir = DIST_DIR, tunnelDetector = detectTunnels, networkInterfaces, installed: installedOverride, hostIdentity, napojeniRun, vypisProcesu, updateService, updateFetch, codexAccountReader = readCodexAccount } = {}) {
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
  const updates = updateService || new UpdateService({ version: VERSION, dataDir: config.dataDir, enabled: config.cloudFetch, ...(updateFetch ? { fetchImpl: updateFetch } : {}) });
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
  // `system` řídí v rozhraní „tento Mac“ proti „tento počítač“ a ⌘ proti Ctrl (public/js/system.js).
  const host = { name: os.hostname().replace(/\.local$/, ''), user: os.userInfo().username, fullName: '', home: config.sourceHome, system: SYSTEM, ...hostIdentity };
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
      // Přihlášení přes Google synchronizaci souhrnů zapne – to, co se posílá, stojí u tlačítka
      // přihlášení (docs/ACCOUNTS.md). Vypnout ji jde jedním přepínačem v kartě účtu.
      if (stav.udalost === 'prihlaseno') {
        cloudSync.zapnoutPoPrihlaseni().catch(() => {});
        // Přihlášením si člověk vybral svou identitu z Googlu: profil v panelu ukáže jeho fotku
        // místo dříve vylosovaného obrázku (klepnutím se k obrázku vrátí).
        if (datastore.data.settings.avatar != null) {
          datastore.data.settings.avatar = null;
          datastore.save();
          store.emit('settings', datastore.data.settings);
        }
      }
    },
    open: (url) => executeOpen({ kind: 'open', args: [url], label: ui('prohlížeč') }, { dry }),
  });
  // Synchronizace souhrnů do účtu (src/cloud-sync.js): jen čísla; zapíná ji přihlášení.
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
        const zaznamy = connectors['cloud-billing'].autoEntries();
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
    const rawError = String(run.error || ui('Skončilo s kódem {0}', run.exitCode)).trim();
    // Původní chyba se zkracuje sama, aby rada za ní zůstala celá – a v angličtině šla přeložit.
    const raw = clip(/[.!?]$/.test(rawError) ? rawError : `${rawError}.`, 140);
    let text = raw;
    if (/authenticat|oauth|log ?in|unauthori|401|credential/i.test(raw)) {
      text = ui('{0} Přihlas se znovu tlačítkem Napojit v Nastavení → Propojení (otevře se v prohlížeči).', raw);
    } else if (/limit|quota|rate/i.test(raw)) {
      text = ui('{0} Nejspíš vyčerpaný limit předplatného.', raw);
    }
    const now = run.endedAt || Date.now();
    const [connector, localId] = run.sessionId ? [run.sessionId.split(':')[0], run.sessionId.slice(run.sessionId.indexOf(':') + 1)] : ['launch', run.id];
    const provider = run.agent === 'codex' ? 'openai' : run.agent === 'claude-code' ? 'anthropic' : 'other';
    const s = store.get(`${connector}:${localId}`) || store.ensure({ connector, localId, provider, app: run.label });
    if (!s.cwd && run.cwd) s.cwd = run.cwd;
    if (!s.title && !s.firstPrompt) s.title = run.prompt;
    if (!s.startedAt) s.startedAt = run.startedAt;
    s.running = false;
    s.failure = { text, at: now };
    pushEntry(s, { at: now, role: 'error', text: ui('Spuštění selhalo: {0}', text) });
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
    if (!s) return { status: jeProcesovyId(id) ? 410 : 404, error: jeProcesovyId(id) ? ui('Detekovaný proces už v přehledu není. Pokud vytvořil přepis, najdeš ho mezi agenty.') : ui('Konverzace nenalezena.') };
    if (s.proces) return { status: 409, error: ui('Detekovaný proces nemá dostupný přepis ani konverzaci k otevření.') };
    if (config.openMode === 'off') return { status: 422, error: ui('Otevírání odsud tenhle systém neumí.') };
    // Otevřít aplikaci nebo Terminál umí jen macOS; složku a odkaz i Windows.
    if (!config.openApps && (target === 'terminal' || (target === 'app' && s.connector !== 'web'))) {
      return { status: 422, error: target === 'terminal'
        ? ui('Pokračovat v Terminálu umí Agenteeq zatím jen na macOS. Příkaz si můžeš zkopírovat.')
        : ui('Otevřít konverzaci přímo v aplikaci umí Agenteeq zatím jen na macOS.') };
    }
    const plan = planOpen(s, target, apps, { aplikace: config.openApps });
    if (!plan) return { status: 422, error: ui('Tuto akci pro konverzaci nelze provést.') };
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
  const ctx = {
    config, store, datastore, secrets, installed,
    // Admin API po obnově mění útratu i spotřebu tokenů organizace (integrations.cloud), proto se
    // pošlou obě – jinak by Nastavení a Statistiky ukazovaly tokeny z předchozího načtení.
    onSpendChanged: () => {
      spendChanged();
      if (store.ready) integrations().then((v) => store.emit('integrations', v)).catch(() => {});
    },
    extensionRecord: () => datastore.data.extension,
  };
  const list = [
    createClaudeCodeConnector(ctx),
    createCodexConnector(ctx),
    createCursorConnector(ctx),
    createCopilotCliConnector(ctx),
    createVsCodeCopilotConnector(ctx),
    createGeminiFamilyConnector(ctx, { id: 'gemini-cli', name: 'Gemini CLI', dir: '.gemini', provider: 'google', app: 'Gemini CLI', bin: 'gemini' }),
    createGeminiFamilyConnector(ctx, { id: 'qwen-code', name: 'Qwen Code', dir: '.qwen', provider: 'alibaba', app: 'Qwen Code', bin: 'qwen', format: 'qwen' }),
    createWebConnector(ctx),
    createCloudBillingConnector(ctx),
    createClaudeDesktopUsageConnector(ctx),
    createClaudeDesktopCodeConnector(ctx),
  ];
  // Pojistka proti přehlédnutému agentovi (src/bezici-agenti.js): běžící proces bez konverzace se
  // ukáže sám. Proměnná domova z jeho prostředí (CLAUDE_CONFIG_DIR, CODEX_HOME) přidá konektoru kořen,
  // který aplikace spuštěná z Finderu jinak nevidí – přepis se pak najde a proces se spáruje.
  const bezici = createBeziciAgenti({ store });
  async function beziciAgenti(procesy) {
    for (const p of procesy || []) {
      const domov = AGENTI_PROCESU[p.runtime]?.domov && p.env?.[AGENTI_PROCESU[p.runtime].domov];
      if (!domov || !path.isAbsolute(domov)) continue;
      if (p.runtime === 'claude-code') await connectors['claude-code']?.pridejKoren(path.join(domov, 'projects'));
      if (p.runtime === 'codex') await connectors.codex?.pridejDomov(domov);
    }
    bezici.upravit(procesy);
  }
  if (config.processes) {
    // `vypisProcesu` podstrkují jen testy: omezí skutečný výpis na své procesy (test/helpers.mjs#jenProcesy).
    // Sdílený výpis nesmí být starší než jeden průchod – jinak by kratší AGENTEEQ_PROCESS_MS nic neznamenal
    // a skončený agent by visel až 4 s. Výchozích 5 s průchodu platnost 4 s nemění.
    const vypis = sdilenyVypis(vypisProcesu, config.processIntervalMs < 4000 ? config.processIntervalMs / 2 : 4000);
    list.push(createProcessesConnector({ ...ctx, ollama, procesy: vypis, promenne: PROMENNE_DOMOVA, onAgenti: (procesy) => beziciAgenti(procesy).catch(() => {}) }));
    // Detektor všeho ostatního, co na Macu běží jako AI agent – včetně vlastních a neznámých modelů.
    list.push(createLocalAgentsConnector({ ...ctx, procesy: vypis, onDetect: (found) => store.setLocalAgents(found) }));
  }
  const connectors = Object.fromEntries(list.map((c) => [c.id, c]));

  // Počet u konektorů se sessions = sessions viditelné v okně sledování (ne počet souborů na disku).
  const SESSION_CONNECTORS = new Set(['claude-code', 'claude-desktop-code', 'codex', 'cursor', 'copilot-cli', 'vscode-copilot', 'gemini-cli', 'qwen-code', 'web']);

  // Detekce agentů v činnosti: oznámí nástroj, o kterém Agenteeq zatím nic neví (src/detekce.js).
  // `connectorList` je deklarace funkce, takže tady už existuje.
  const detekce = createDetekce({
    store, datastore, alerts, notifier,
    pripojene: () => new Set(connectorList().filter((c) => c.state === 'connected').map((c) => c.id)),
  });

  function connectorList() {
    const visible = store.list();
    return list.map((c) => {
      let status;
      try { status = c.status(); } catch (err) { status = { state: 'error', detail: err.message }; }
      if (SESSION_CONNECTORS.has(c.id)) {
        const count = visible.filter((s) => s.connector === c.id).length;
        status = { ...status, count };
        if (status.state === 'connected' && c.id !== 'web') {
          // Tvar podle počtu je celý text (src/texty.js): „1 konverzace“ se v angličtině liší od „2 konverzace“.
          const days = config.windowDays;
          const pocet = count === 1 ? ui('1 konverzace s aktivitou za {0} dní.', days) : count > 1 && count < 5 ? ui('{0} konverzace s aktivitou za {1} dní.', count, days) : ui('{0} konverzací s aktivitou za {1} dní.', count, days);
          status.detail = status.hooksActive ? ui('{0} Propojení je aktivní.', pocet) : pocet;
        }
      }
      return { id: c.id, name: c.name, provider: c.provider, kind: c.kind, verified: c.verified, source: c.source, description: c.description, ...status };
    });
  }

  // Předplatné zjištěné z tohoto Macu (Claude z účtu Claude Code, ChatGPT z plánu, který hlásí Codex).
  let claudeAccounts = [];
  let codexAccounts = [];
  let claudeAuth = { loggedIn: null, checkedAt: 0 };
  const claudeAccountWatchers = new Map();
  const codexAccountWatchers = new Map();
  let subscriptionJson = '';
  let subscriptionRefreshGeneration = 0;
  const rateFeed = createRateFeed({ spend: () => datastore.data.spend, save: () => datastore.save(), changed: () => spendChanged(), enabled: config.cloudFetch && !dry });
  async function refreshSubscriptions() {
    const generation = ++subscriptionRefreshGeneration;
    // Samotný starý ~/.claude.json nestačí: po odhlášení může na disku zůstat. Plán přijmeme
    // pouze když vlastní `claude auth status --json` právě potvrdí aktivní přihlášení.
    const codexHomes = [...new Set([config.codexHome || path.join(config.sourceHome, '.codex'), ...connectors.codex.domovy()])].slice(0, 8);
    for (const home of codexHomes) if (!codexAccountWatchers.has(home)) {
      codexAccountWatchers.set(home, watchExactFile(path.join(home, 'auth.json'), () => refreshSubscriptions().catch(() => {}), { retryMs: 1000 }));
    }
    const claudeHomes = [...new Set([config.sourceHome, ...connectors['claude-code'].koreny()
      .filter((root) => path.basename(root) === 'projects').map((root) => path.dirname(root))])].slice(0, 8);
    for (const home of claudeHomes) if (!claudeAccountWatchers.has(home)) {
      claudeAccountWatchers.set(home, watchExactFile(path.join(home, '.claude.json'), () => refreshSubscriptions().catch(() => {}), { retryMs: 1000 }));
    }
    const [auth, codexResults] = await Promise.all([
      napojeni.stav('claude-code').catch(() => ({ napojeno: null })),
      (launchEnv.bins?.codex || codexAccountReader !== readCodexAccount
        ? Promise.all(codexHomes.map((home) => codexAccountReader(launchEnv.bins?.codex, { home }).catch(() => null)))
        : Promise.resolve([])),
    ]);
    if (generation !== subscriptionRefreshGeneration) return;
    const loggedIn = typeof auth.napojeno === 'boolean' ? auth.napojeno : null;
    const authChanged = claudeAuth.loggedIn !== loggedIn;
    claudeAuth = { loggedIn, checkedAt: Date.now() };
    const extraClaude = await Promise.all(claudeHomes.filter((home) => home !== config.sourceHome).map(async (home) => {
      if (!launchEnv.bins?.claude) return null;
      try { await fsp.access(path.join(home, '.claude.json')); } catch { return null; }
      const result = await (napojeniRun || run)(launchEnv.bins.claude, ['auth', 'status', '--json'],
        { timeout: 10000, env: { ...process.env, CLAUDE_CONFIG_DIR: home } });
      let status;
      try { status = JSON.parse(result.stdout); } catch { return null; }
      return status.loggedIn === true ? { home, account: await readClaudeAccount(home) } : null;
    }));
    const primary = auth.napojeno === true ? { home: config.sourceHome, account: await readClaudeAccount(config.sourceHome) } : null;
    if (generation !== subscriptionRefreshGeneration) return;
    const before = JSON.stringify([claudeAccounts, codexAccounts]);
    claudeAccounts = [...new Map([primary, ...extraClaude].filter((item) => item?.account)
      .map(({ account }, index) => {
        const plan = claudePlanFromAccount(account);
        const id = claudeIdentity(account);
        return [id || `unknown:${index}`, { id, provider: 'anthropic', service: 'claude', plan: plan?.plan || null,
          observedAt: Date.now(), evidence: plan?.evidence || '', since: plan?.since || null }];
      })).values()];
    codexAccounts = [...new Map(codexResults.filter((item) => item?.id).map((item) => [item.id, item])).values()];
    let history = datastore.data.providerAccounts;
    for (const claudeAccount of claudeAccounts) if (claudeAccount.id) history = observeAccount(history, claudeAccount);
    for (const codexAccount of codexAccounts) history = observeAccount(history, codexAccount);
    if (JSON.stringify(history) !== JSON.stringify(datastore.data.providerAccounts)) {
      datastore.data.providerAccounts = history;
      datastore.save();
    }
    if (JSON.stringify([claudeAccounts, codexAccounts]) !== before) {
      subscriptionJson = JSON.stringify(subscriptions());
      spendChanged();
    }
    if (authChanged && store.ready) integrations().then((v) => store.emit('integrations', v)).catch(() => {});
  }
  function subscriptions(now = Date.now()) {
    // Historický přepis Codexu nemá identitu účtu. Po přepnutí licence by mohl patřit jinému
    // účtu; Útrata proto přijímá jen plán z aktuálního odečtu oficiálního app-serveru.
    const found = [...claudeAccounts.filter((account) => account.plan).map((account) => ({ service: 'claude', plan: account.plan,
      accountId: account.id, observedAt: account.observedAt, evidence: account.evidence, since: account.since })),
    ...codexAccounts.filter((account) => account.plan).map((account) => ({ service: 'chatgpt', plan: account.plan,
      accountId: account.id, observedAt: account.observedAt, evidence: ui('aktuální účet Codexu') }))].filter(Boolean);
    return subscriptionPortfolio(found);
  }

  function providerAccounts() {
    const current = new Map();
    for (const claudeAccount of claudeAccounts) if (claudeAccount.id) current.set(claudeAccount.id, { plan: claudeAccount.plan, limits: [], credits: null, observedAt: claudeAccount.observedAt });
    for (const codexAccount of codexAccounts) current.set(codexAccount.id, { plan: codexAccount.plan, limits: codexAccount.limits, credits: codexAccount.credits, observedAt: codexAccount.observedAt });
    const rows = datastore.data.providerAccounts.map((item) => ({ ...item, active: current.has(item.id),
      ...(current.get(item.id) || { limits: [], credits: null, observedAt: item.seenAt }) }));
    if (!rows.some((x) => x.provider === 'anthropic' && x.active)) rows.push({ provider: 'anthropic', service: 'claude', id: null, plan: null, active: false, state: claudeAuth.loggedIn === false ? 'signed_out' : 'unavailable', limits: [], credits: null, observedAt: null });
    if (!rows.some((x) => x.provider === 'openai' && x.active)) rows.push({ provider: 'openai', service: 'chatgpt', id: null, plan: null, active: false, state: 'unavailable', limits: [], credits: null, observedAt: null });
    return rows.map((row) => ({ ...row, planLabel: row.plan ? describePlan(row).label : null }))
      .sort((a, b) => Number(b.active) - Number(a.active) || (b.observedAt || 0) - (a.observedAt || 0));
  }

  // Aktivní útrata pochází jen z Admin API. Staré ruční zápisy jsou exportovatelné,
  // ale nezvyšují ověřený součet ani nepředstírají cenu předplatného.
  const automatickeVydaje = () => connectors['cloud-billing'].autoEntries();

  function spend() {
    const now = Date.now();
    return spendSummary(datastore.data.spend, now, automatickeVydaje(now), connectors['cloud-billing'].modelEntries());
  }

  // Export zahrnuje vedle ověřených API nákladů i starší ruční záznamy se zdrojem v CSV.
  function exportSpend(mesicu, now = Date.now()) {
    return spendCsv(datastore.data.spend, now, automatickeVydaje(now), mesicu, datastore.data.settings.language);
  }

  function spendPayload() {
    const sp = datastore.data.spend;
    const sources = connectors['cloud-billing'].providers();
    const connected = Object.values(sources).filter((source) => source.state === 'connected');
    return { ...spend(), billing: { connected: connected.length > 0, at: connected.length ? Math.max(...connected.map((source) => source.at || 0)) : null }, ledger: sp.ledger, budgetsConfig: sp.budgets, rates: sp.rates, rateInfo: rateInfo(sp), subscriptions: subscriptions(), providerAccounts: providerAccounts(), services: SERVICES, kinds: KINDS, currencies: CURRENCIES };
  }

  function spendChanged() {
    if (!store.ready) return;
    alerts.checkBudgets(spend());
    store.emit('spend', spendPayload());
  }

  function subscriptionsChanged() {
    const next = JSON.stringify(subscriptions());
    if (next === subscriptionJson) return false;
    subscriptionJson = next;
    spendChanged();
    return true;
  }

  // Nová rate-limit událost Codexu nese i plan_type. Promítnout ji do Útraty okamžitě,
  // ne až při hodinovém přepočtu. Změny procent bez změny plánu další událost nevytvoří.
  store.on('limits', () => subscriptionsChanged());

  /* ---------- Licence ---------- */

  function licenseStatus() {
    const saved = datastore.data.license;
    const base = { paidFeatures: { ...PAID_FEATURES }, plans: PLANS };
    if (!saved) return { ...base, valid: false, hasKey: false, plan: 'free', planLabel: PLANS.free.label };
    const r = verifyLicense(saved.key, { publicKey: licensePublicKey });
    const plan = planOf(r);
    return { ...base, ...r, hasKey: true, plan, planLabel: PLANS[plan].label, activatedAt: saved.activatedAt, maskedKey: `${saved.key.slice(0, 9)}…${saved.key.slice(-6)}` };
  }

  const locked = (feature) => (canUse(feature, licenseStatus()) ? null : { status: 402, upgrade: true, error: ui('Tato funkce je součástí tarifu {0}. Aktivuj licenci v Nastavení.', PLANS[PAID_FEATURES[feature]]?.label || 'Pro') });

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
      // Agent známý jen z běžícího procesu po skončení zmizí – do projektu se jako snímek neukládá.
      if (s.projectId && !s.parentId && !s.proces) pd.snapshots[s.id] = snapshotOf(s);
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
      return { status: 402, upgrade: true, error: ui('Ve verzi Zdarma můžeš mít {0} aktivní projekty. Pro neomezený počet aktivuj licenci Pro.', FREE_PROJECT_LIMIT) };
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
    if (!reorderProjects(projects(), ids)) return { status: 422, error: ui('Pořadí se nepodařilo změnit.') };
    projectsChanged();
    return { ok: true };
  }

  function removeProject(id) {
    if (!/^[\w-]{1,64}$/.test(id) || !deleteProject(projects(), id)) return { status: 404, error: ui('Projekt neexistuje.') };
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
    if (!p || !MEDIA_MAX[kind]) return { status: 404, error: ui('Projekt neexistuje.') };
    if (!buf.length) return { status: 422, error: ui('Soubor je prázdný.') };
    if (buf.length > MEDIA_MAX[kind]) return { status: 413, error: ui('Obrázek je příliš velký (nejvýš {0} MB).', MEDIA_MAX[kind] / 1e6) };
    const ext = sniffImage(buf);
    if (!ext) return { status: 415, error: ui('Nahraj obrázek ve formátu PNG, JPG nebo WebP.') };
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
    if (!p || !MEDIA_MAX[kind]) return { status: 404, error: ui('Projekt neexistuje.') };
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
    if (!file || !MEDIA_FILE.test(file) || !file.startsWith(`${kind}-`)) return { status: 404, error: ui('Obrázek neexistuje.') };
    const body = await fsp.readFile(path.join(mediaRoot, p.id, file)).catch(() => null);
    if (!body) return { status: 404, error: ui('Obrázek neexistuje.') };
    return { ok: true, type: MEDIA_TYPES[file.split('.').pop()], body };
  }

  /* Git a tým agentů v projektu. */

  async function projectGit(id) {
    const p = findProject(id);
    if (!p) return { status: 404, error: ui('Projekt neexistuje.') };
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
    if (!p) return { status: 404, error: ui('Projekt neexistuje.') };
    const b = input && typeof input === 'object' ? input : {};
    const prompt = typeof b.prompt === 'string' ? b.prompt.trim() : '';
    if (!prompt) return { status: 422, error: ui('Napiš, co mají agenti udělat.'), field: 'prompt' };
    const agents = Array.isArray(b.agents) ? [...new Set(b.agents)] : p.settings.agents;
    if (!agents.length || agents.length > 4 || agents.some((a) => !TEAM_AGENTS.includes(a))) return { status: 422, error: ui('Vyber 1 až 4 agenty.'), field: 'agents' };
    const targets = new Map(launchPayload().targets.map((t) => [t.id, t]));
    const missing = agents.filter((a) => !targets.has(a));
    if (missing.length) return { status: 422, error: ui('Na {0} není k dispozici: {1}. Nainstaluj ho nebo ho z týmu odeber.', POCITAC.tomto, missing.join(', ')), field: 'agents' };
    const isolate = typeof b.isolate === 'boolean' ? b.isolate : p.settings.isolate;
    const attachBrief = typeof b.attachBrief === 'boolean' ? b.attachBrief : p.settings.attachBrief;
    const text = composePrompt(p, prompt, attachBrief);
    if (text.length > PROMPT_MAX) return { status: 422, error: ui('Zadání s pravidly a podklady je delší než {0} znaků.', PROMPT_MAX.toLocaleString('cs-CZ')), field: 'prompt' };
    const repoDir = repoOf(p);
    if (!repoDir) return { status: 422, error: ui('Nastav projektu složku repozitáře (Nastavení projektu → Repozitář).'), field: 'repo' };
    let info = null;
    let base = '';
    if (isolate) {
      info = await repoInfo(repoDir);
      if (!info.isRepo) return { status: 422, error: ui('Složka projektu není Git repozitář. Vyber repozitář, nebo vypni „Každý agent ve vlastní větvi“.'), field: 'repo' };
      base = p.settings.baseBranch || info.branch;
      if (!base) return { status: 422, error: ui('Repozitář není na žádné větvi. Přepni ho na větev (např. main) nebo ji nastav v projektu.'), field: 'repo' };
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
    if (!w) return { status: 404, error: ui('Pracovní větev nenalezena.') };
    if (!w.path.startsWith(worktreeRoot + path.sep)) return { status: 422, error: ui('Pracovní kopie leží mimo Agenteeq – uprav ji ručně.') };
    const running = (w.runId && ['running', 'stopping'].includes(runs.get(w.runId)?.status)) || (w.sessionId && store.summary(w.sessionId)?.status === 'working');
    if (running) return { status: 409, error: ui('Agent na této větvi ještě pracuje. Počkej, až skončí, nebo ho zastav.') };
    if (dry) return { ok: true, dry: true };
    const info = await repoInfo(repoOf(p));
    if (!info.isRepo) return { status: 422, error: ui('Repozitář projektu není dostupný.') };
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

  // Měsíční rozpočet tokenů projektu: upozornění při 80 % a 100 %, měsíc je místní (src/projects.js).
  function projectMonthTokens(pid, now = Date.now()) {
    return mesicniTokenyProjektu(store.list(now), pid, now);
  }

  function checkProjectBudgets(now = Date.now()) {
    if (!datastore.data.settings.notifications.budget) return;
    const month = monthKey(now);
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
        title: hit === 100 ? ui('Projekt {0}: rozpočet tokenů vyčerpán', p.name) : ui('Projekt {0}: {1} % rozpočtu tokenů', p.name, Math.round(pct)),
        body: ui('{0} z {1} tokenů tento měsíc.', used.toLocaleString('cs-CZ'), budget.toLocaleString('cs-CZ')),
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
    if (!p) return { status: 404, error: ui('Projekt neexistuje.') };
    const gate = locked('projectExport');
    if (gate) return gate;
    const live = store.list().filter((s) => s.projectId === id);
    const liveIds = new Set(live.map((s) => s.id));
    const older = Object.values(projects().snapshots).filter((s) => s.projectId === id && !liveIds.has(s.id));
    return { ok: true, project: p, csv: projectCsv([...live, ...older].sort((a, b) => b.lastAt - a.lastAt), Date.now(), datastore.data.settings.language) };
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
    posledni: (id) => store.list().reduce((m, s) => (s.connector === id && !s.proces && s.lastAt > m ? s.lastAt : m), 0),
    oknoDni: config.windowDays,
    run: napojeniRun || run,
    // Přihlášení běží na pozadí, bez Terminálu; v testech (dry) se nic nespouští.
    prihlas: (bin, args, moznosti) => (dry ? Promise.resolve(PRIHLASENI_NASUCHO) : spustPrihlaseni(bin, args, moznosti)),
    open: (url) => executeOpen({ kind: 'open', args: [url], label: ui('prohlížeč') }, { dry }),
    emit: (u) => {
      store.emit('napojeni', u);
      if (u.id === 'claude-code' && u.udalost === 'napojeno') refreshSubscriptions().catch(() => {});
    },
    extension: () => ({ ...extensionStatus(), sites: connectors.web.status().sites || {} }),
    plan: async (id) => {
      if (id === 'claude-code') {
        const found = claudeAccounts.filter((account) => account.plan);
        return found.length === 1 ? describePlan(found[0]).label : '';
      }
      const found = codexAccounts.filter((account) => account.plan);
      return found.length === 1 ? describePlan(found[0]).label : '';
    },
  });

  async function refreshLaunch() {
    if (config.launchAgents && config.openMode === 'exec') {
      launchEnv = await detectLaunchEnv({ ollama, home: config.sourceHome });
      launchDetected = true;
      if (launchEnv.env?.CLAUDE_CONFIG_DIR) await connectors['claude-code']?.pridejKoren(path.join(launchEnv.env.CLAUDE_CONFIG_DIR, 'projects'));
      if (launchEnv.env?.CODEX_HOME) await connectors.codex?.pridejDomov(launchEnv.env.CODEX_HOME);
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
    if (projectId && !project) return { status: 422, error: ui('Projekt neexistuje.'), field: 'projectId' };
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
    if (!config.launchAgents && plan.kind !== 'local' && !webOpen) return { status: 422, error: ui('Spouštění agentů na pozadí umí Agenteeq zatím jen na macOS.') };
    if (config.openMode === 'off' && plan.kind !== 'local') return { status: 422, error: ui('Otevírání odsud tenhle systém neumí.') };
    const gate = plan.kind === 'background' ? locked('launchBackground') : plan.kind === 'local' ? locked('localChat') : null;
    if (gate) return gate;

    let sessionId = plan.sessionId || null;
    let runInfo = null;
    let copied = false;
    if (plan.kind === 'terminal') {
      if (!dry) await writePromptFile(promptDir, plan.prompt, uuid);
      const x = await executeOpen({ kind: 'terminal', command: plan.command, label: ui('Terminál') }, { dry });
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
        if (started.status === 'failed') return { status: 502, error: ui('{0} se nepodařilo spustit: {1}', plan.label, started.error) };
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
    if (value.projectId && !value.proces) {
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
    if (requested && (typeof requested !== 'string' || !path.isAbsolute(requested))) return { status: 400, error: ui('Cesta musí začínat lomítkem.') };
    const target = requested ? path.resolve(requested) : home;
    if (target !== home && !target.startsWith(home + path.sep)) return { status: 403, error: ui('Procházet lze jen složky v domovském adresáři. Jinou cestu zadej ručně.') };
    let entries;
    try {
      entries = await fsp.readdir(target, { withFileTypes: true });
    } catch (err) {
      return { status: err.code === 'ENOENT' || err.code === 'ENOTDIR' ? 404 : 403, error: err.code === 'ENOENT' || err.code === 'ENOTDIR' ? ui('Složka neexistuje.') : ui('Do této složky nemá Agenteeq přístup.') };
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
    if (config.desktop) return { status: 422, error: ui('Desktopovou aplikaci přidej v Nastavení systému → Obecné → Přihlašovací položky.') };
    if (!config.autostart) return { status: 422, error: ui('Spuštění po přihlášení umí Agenteeq zatím jen na macOS (přes LaunchAgent).') };
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

  // „Přidat do Chromu“: stránka rozšíření v Chrome Web Store, rovnou v prohlížeči, který ho umí.
  async function otevriObchod() {
    const url = adresaObchodu();
    if (!url) return { status: 409, error: ui('Rozšíření zatím v Chrome Web Store není. Použij ruční instalaci.') };
    const vChromu = otevritVProhlizeciSRozsirenim(url, config.sourceHome);
    if (vChromu && !dry) {
      const r = await run(vChromu.cmd, vChromu.args, { timeout: 8000 });
      if (r.ok) return { ok: true, prohlizec: vChromu.prohlizec };
    }
    const r = await executeOpen({ kind: 'open', args: [url], label: ui('prohlížeč') }, { dry });
    return r.ok ? { ok: true, prohlizec: vChromu?.prohlizec || '', dry: Boolean(r.dry) } : { status: 422, error: r.error || ui('Prohlížeč se nepodařilo otevřít.') };
  }

  async function integrations() {
    return {
      claudeHooks: await hooksStatus(claudeSettingsPath(config.sourceHome), datastore.data.ingestToken),
      claudeAuth,
      extension: { path: extensionPath, sites: WEB_SITES, obchod: adresaObchodu(), ...extensionStatus() },
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
    if (!target) return { status: 404, error: ui('Instalační balíček nenalezen. Vytvoř ho příkazem npm run build:mac.') };
    if (config.openMode === 'off') return { status: 422, error: ui('Ukázat balíček ve správci souborů tenhle systém neumí.') };
    // -R (ukázat v nadřazené složce) zná jen `open` na macOS; jinde se otevře samotná složka.
    const plan = config.openApps
      ? { kind: 'open', args: ['-R', target], label: 'Finder' }
      : { kind: 'open', args: [path.dirname(target)], label: ui('Správce souborů') };
    const r = await executeOpen(plan, { dry });
    if (!r.ok) return { status: 502, error: r.error };
    return { ok: true, ...(r.dry ? { dry: true, plan } : {}) };
  }

  async function checkForUpdates() {
    const value = await updates.check();
    store.emit('updates', value);
    // Automatická volba znamená stažení ověřeného balíčku, nikdy tichou výměnu běžící aplikace.
    if (value.status === 'available' && datastore.data.settings.updateMode === 'automatic') {
      await downloadUpdate();
      return updates.state();
    }
    return value;
  }

  async function downloadUpdate() {
    const result = await updates.download();
    store.emit('updates', updates.state());
    return result;
  }

  async function revealUpdate() {
    const target = updates.downloadedPath();
    const updatesDir = path.resolve(config.dataDir, 'updates');
    if (!target || path.dirname(path.resolve(target)) !== updatesDir || path.extname(target) !== '.zip') return { status: 404, error: ui('Aktualizační balíček zatím není stažený.') };
    try { if (!(await fsp.stat(target)).isFile()) throw new Error('missing'); } catch { return { status: 404, error: ui('Aktualizační balíček už na disku není.') }; }
    if (config.openMode === 'off') return { status: 422, error: ui('Ukázat aktualizaci ve správci souborů tenhle systém neumí.') };
    const plan = config.openApps ? { kind: 'open', args: ['-R', target], label: 'Finder' } : { kind: 'open', args: [updatesDir], label: ui('Správce souborů') };
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
    if (list.length >= MAX_AGENTS) return { status: 422, error: ui('Víc než {0} vlastních agentů Agenteeq nesleduje.', MAX_AGENTS) };
    const r = normalizeAgent({ ...input, origin: input?.url ?? input?.origin });
    if (!r.ok) return { status: 400, error: r.error, field: 'url' };
    if (list.some((a) => a.origin === r.agent.origin && a.type === r.agent.type)) return { status: 409, error: ui('Tenhle agent už je v seznamu.'), field: 'url' };
    list.push(r.agent);
    await datastore.flush();
    customStatus.set(r.agent.id, await probeAgent(r.agent));
    return { agents: emitCustomAgents() };
  }

  async function removeCustomAgent(id) {
    const list = datastore.data.customAgents;
    const i = list.findIndex((a) => a.id === id);
    if (i === -1) return { status: 404, error: ui('Takový agent v seznamu není.') };
    list.splice(i, 1);
    customStatus.delete(id);
    await datastore.flush();
    return { agents: emitCustomAgents() };
  }

  // Přepnutí do okna běžící aplikace. Plán se skládá jen z pevného seznamu (openers.js),
  // z požadavku přichází výhradně id běhového prostředí.
  async function focusRuntime(id) {
    const plan = planRuntimeFocus(id);
    if (!plan) return { status: 404, error: ui('Tuhle aplikaci Agenteeq neumí přepnout do popředí.') };
    const bezi = store.runtimes.find((r) => r.id === id && r.running);
    if (!bezi) return { status: 409, error: ui('{0} teď neběží.', plan.label) };
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
    if (enabled && !lanHandler) return { status: 503, error: ui('Server ještě není připravený, zkus to za chvíli.') };
    if (enabled && !lan.status().addresses.length) return { status: 422, error: ui('{0} není v žádné místní síti – připoj se na Wi-Fi.', POCITAC.Tento) };
    return applyAccess('lanAccess', enabled, ui('Přístup z telefonu se nepodařilo otevřít.'));
  }

  // Přístup z vlastní privátní sítě Tailscale. Chová se stejně jako přístup z domácí sítě –
  // jen se naslouchá na adrese 100.x místo 192.168.x a adresa nikde veřejně neexistuje.
  // Párování kódem a token platí i tady: bez spárovaného zařízení se nepřečte nic.
  async function setTailscaleAccess(enabled) {
    if (enabled && !lanHandler) return { status: 503, error: ui('Server ještě není připravený, zkus to za chvíli.') };
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
            ? ui('Tailscale je nainstalovaný, ale nejsi přihlášený. Spusť „tailscale up“ a zkus to znovu.')
            : ui('Tailscale na {0} neběží. Nainstaluj ho, přihlas se („tailscale up“) a zkus to znovu.', POCITAC.tomto),
        };
      }
      if (!lan.status().tailscale.available) return { status: 422, error: ui('Tailscale běží, ale {0} zatím nemá adresu v tailnetu. Zkus to za chvíli.', POCITAC.tento) };
    }
    return applyAccess('tailscaleAccess', enabled, ui('Přístup přes Tailscale se nepodařilo otevřít.'));
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
    datastore.data.extensionPairing = null;
    return vydejTokenRozsireni(origin, installationId);
  }

  // ── Párování bez kódu ──────────────────────────────────────────────────────
  // Rozšíření o spárování požádá samo (po instalaci, po startu Chromu, při otevření svého okna).
  // Původ požadavku (chrome-extension://<ID>) nastavuje prohlížeč a web ani jiné rozšíření ho
  // nepodvrhnou. Naše rozšíření – z Chrome Web Store, nebo ze složky, kterou připravila aplikace –
  // se proto spáruje hned a bez kódu. Jakékoli jiné dostane odpověď „kód“: spárovat ho jde jen
  // jednorázovým kódem, který člověk vytvoří na Macu. Schvalovací tlačítko pro cizí rozšíření tu
  // záměrně není – jiné rozšíření by mohlo svou žádost podstrčit těsně před kliknutím.
  // ID položky v obchodě přiděluje Google a známe ho už během kontroly. Důvěra v něj proto nečeká
  // na příznak zveřejnění (ten řídí jen to, jestli aplikace a web obchod nabízejí): verze aplikace
  // vydaná před schválením spáruje instalaci z obchodu sama, hned jak ji Google zveřejní.
  function duveryhodnaRozsireni() {
    const puvody = new Set();
    const obchod = adresaObchodu(CHROME_WEB_STORE_URL).match(/([a-p]{32})$/)?.[1];
    if (obchod) puvody.add(`chrome-extension://${obchod}`);
    const rozbalene = idRozbalenehoRozsireni(extensionPath);
    if (rozbalene) puvody.add(`chrome-extension://${rozbalene}`);
    return puvody;
  }

  async function pozadatOSparovani({ origin, installationId } = {}) {
    if (typeof origin !== 'string' || !EXTENSION_ORIGIN.test(origin) || !duveryhodnaRozsireni().has(origin)) return null;
    return vydejTokenRozsireni(origin, installationId);
  }

  async function vydejTokenRozsireni(origin, installationId) {
    const id = typeof installationId === 'string' && EXTENSION_INSTALLATION_ID.test(installationId) ? installationId : '';
    const token = crypto.randomBytes(32).toString('base64url');
    const now = Date.now();
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
      // Stáhnutý soubor i informace o verzi zůstávají na hostitelském Macu; telefon je nepotřebuje.
      updates: local ? updates.state() : { status: 'disabled', currentVersion: VERSION, checkedAt: 0, latestVersion: '', asset: null, downloaded: null, error: '' },
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
      detekce: detekce.payload(),
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
    // Výsledek aktualizace se promítne přes SSE hned po startu. Síť nesmí brzdit načtení lokálních dat.
    checkForUpdates().catch(() => {});
    // Ověření uloženého přihlášení jde po síti – start aplikace na něj nečeká.
    ucet.start().then(() => cloudSync.nactiVolbu()).then(() => cloudSync.synchronizuj()).catch(() => {});
    cloudSync.start();
    // Až po úvodním načtení konektorů – jinak by se Claude Code oznámil jako nový jen proto, že se
    // jeho přepisy ještě načítají.
    detekce.start();
    alerts.checkBudgets(spend());
    connectorsJson = JSON.stringify(connectorList());

    // Chyba pravidelné úlohy se zapíše jednou (stejná hláška se neopakuje) – tiše spolknutá by
    // v provozu zůstala neviditelná, i kdyby úloha padala při každém průchodu.
    const nahlasene = new Set();
    const every = (fn, ms) => {
      const t = setInterval(() => {
        Promise.resolve().then(fn).catch((err) => {
          const zprava = err?.stack || String(err);
          if (nahlasene.has(zprava)) return;
          nahlasene.add(zprava);
          console.error('Agenteeq: pravidelná úloha selhala:', zprava);
        });
      }, ms);
      t.unref?.();
      timers.push(t);
    };
    every(() => store.reevaluate(), 5000);
    // Restore after Wi-Fi changes, sleep or Tailscale starting after Agenteeq.
    every(() => restoreRemoteAccess(), 30000);
    if (datastore.data.customAgents.length) probeCustomAgents().catch(() => {});
    every(() => (datastore.data.customAgents.length ? probeCustomAgents() : null), 30000);
    every(() => alerts.checkLimitResets(), 20000);
    // Souhrn po skončení nočního ticha a po nárazu upozornění (src/alerts.js#tick). Po probuzení
    // Macu doběhne hned při prvním průchodu.
    every(() => alerts.tick(), 5000);
    every(() => checkProjectBudgets(), 60000);
    every(async () => {
      for (const c of list) if (c.kind === 'local' && c.id !== 'processes' && c.id !== 'cursor') await c.scan();
    }, config.scanIntervalMs);
    every(() => {
      const next = JSON.stringify(connectorList());
      if (next !== connectorsJson) { connectorsJson = next; store.emit('connectors', JSON.parse(next)); }
    }, 5000);
    every(() => spendChanged(), HOUR);
    await refreshSubscriptions().catch(() => {});
    subscriptionJson = JSON.stringify(subscriptions());
    // Časem může zestárnout poslední pozorování plánu Codexu i bez nového souboru.
    every(() => subscriptionsChanged(), 60_000);
    every(() => refreshSubscriptions(), 2 * 60e3);
    every(() => checkForUpdates(), 6 * HOUR);
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
    for (const watcher of claudeAccountWatchers.values()) watcher.close();
    claudeAccountWatchers.clear();
    for (const watcher of codexAccountWatchers.values()) watcher.close();
    codexAccountWatchers.clear();
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
    config, host, datastore, store, alerts, secrets, notifier, connectors, runs, localChat, detekce,
    installInfo: () => ({ bin: BIN_PATH, root: ROOT_DIR, dataDir: config.dataDir }),
    connectorList, spendPayload, exportSpend, rateFeed, refreshSubscriptions, spendChanged, integrations, state, start, stop, openSession, createExtensionPairCode, pairExtension, pozadatOSparovani, extensionInstallation, otevriObchod, takeWebHandoff, extensionSeen, extensionStatus,
    licenseStatus, activateLicense, removeLicense, ucet, ucetStav, cloudSync, vratOkno, napojeni,
    createProject, updateProject, reorderProjectList, removeProject, assignToProject, exportProject, projectsPayload: () => projectsPayload(projects()),
    setProjectMedia, removeProjectMedia, readProjectMedia, projectGit, launchTeam, projectWorkAction, checkProjectBudgets, projectMonthTokens,
    launch, launchPayload, refreshLaunch, runsPayload, listFolders, autostart, revealInstallPackage, checkForUpdates, downloadUpdate, revealUpdate,
    planUsageHistory: (opts) => connectors['claude-desktop-usage']?.series(opts) ?? null,
    lan, setLanAccess, setTailscaleAccess, bindLan, restoreRemoteAccess, focusRuntime, refreshTunnels, tunnelsPayload,
    runtimeFocusable: (id) => Boolean(RUNTIME_APPS[id]),
    customAgentsPayload, addCustomAgent, removeCustomAgent, probeCustomAgents, customAgentTypes: () => Object.entries(AGENT_TYPES).map(([id, t]) => ({ id, label: t.label })),
  };
}
