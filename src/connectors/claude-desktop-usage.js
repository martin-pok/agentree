import path from 'node:path';
import { statSafe, readJson } from '../util.js';
import { watchTree, createFileQueue } from '../watch.js';
import { STATUS_WINDOWS } from './claude-code.js';
import { appSupportDir, JE_WINDOWS } from '../platform.js';

// Claude Desktop (macOS) si sám pro sebe ukládá historii vytížení limitů – nejde o veřejně
// zdokumentovaný formát, jen soubor, který jsme na disku našli a ověřili proti skutečným datům
// (viz docs/CONNECTORS.md). Slouží jako záložní zdroj: přesná data ze stavového řádku Claude Code
// (`ingestStatusline` v claude-code.js) mají vždy přednost, tahle historie doplní čísla ve chvíli,
// kdy neběží žádná konverzace a stavový řádek se tudíž nepřekresluje.
const FILE_NAME = 'plan-usage-history.json';

// Poslední vzorek pole `samples`: { t: <ms epoch>, org, u: { fh, sd, xu? } }.
// fh = vytížení 5hodinového okna v %, sd = vytížení týdenního okna v %.
// xu = „extra usage“ – jednotka není ověřená (nejspíš dolary), proto se nikde netvrdí.
export function findLatestSample(json) {
  const samples = Array.isArray(json?.samples) ? json.samples : null;
  if (!samples || !samples.length) return null;
  return samples[samples.length - 1];
}

// Historie vytížení plánu pro graf. Vrací jen čas a hodnotu – identifikátor organizace
// (`sample.org`) se ven nikdy nedostane, do UI ani do API nepatří.
export function planUsageSeries(json, { days = 30, now = Date.now(), maxPoints = 300 } = {}) {
  const raw = Array.isArray(json?.samples) ? json.samples : [];
  const since = now - days * 86400000;
  const samples = raw
    .filter((x) => x && typeof x === 'object' && Number.isFinite(Number(x.t)) && Number(x.t) >= since)
    .sort((a, b) => Number(a.t) - Number(b.t));

  const thin = (points) => {
    if (points.length <= maxPoints) return points;
    const step = Math.ceil(points.length / maxPoints);
    const out = points.filter((_, i) => i % step === 0);
    const last = points[points.length - 1];
    if (out[out.length - 1] !== last) out.push(last);
    return out;
  };
  const series = (key, clamp) => thin(samples
    .filter((x) => typeof x.u?.[key] === 'number' && Number.isFinite(x.u[key]))
    .map((x) => ({ at: Number(x.t), value: clamp ? Math.max(0, Math.min(100, x.u[key])) : x.u[key] })));

  const fiveHour = series('fh', true);
  const sevenDay = series('sd', true);
  const extraUsage = series('xu', false);
  const times = samples.map((x) => Number(x.t));
  return {
    days,
    samples: samples.length,
    from: times.length ? times[0] : null,
    to: times.length ? times[times.length - 1] : null,
    fiveHour,
    sevenDay,
    extraUsage,
  };
}

// Čistá funkce bez souborového systému, ať jde snadno testovat.
export function applyPlanUsageSample(store, sample, now = Date.now()) {
  if (!sample || typeof sample !== 'object') return false;
  const at = Number(sample.t);
  if (!Number.isFinite(at) || at <= 0) return false;
  const u = sample.u && typeof sample.u === 'object' ? sample.u : {};
  let wrote = false;

  const window = (key, raw) => {
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return;
    const def = STATUS_WINDOWS[key];
    const used = Math.max(0, Math.min(100, raw));
    store.setLimit({
      id: `claude:${key}:history`,
      provider: 'anthropic',
      app: 'Claude',
      label: def.label,
      usedPercent: used,
      windowMinutes: def.minutes,
      resetsAt: null, // historie zdroj obnovy nemá
      reached: used >= 100,
      plan: null,
      text: '',
      at,
      source: 'plan-history',
      kind: 'window',
    });
    wrote = true;
  };
  window('five_hour', u.fh);
  window('seven_day', u.sd);

  if (typeof u.xu === 'number' && Number.isFinite(u.xu)) {
    // `xu` je vyčerpaný limit extra usage v procentech. Jednotku soubor neuvádí, ale tři indicie
    // to potvrzují: sousední `fh` a `sd` jsou procenta okna, oficiální stavový řádek Claude Code
    // hlásí přesně trojici five_hour / seven_day / spend_limit, kde spend_limit má `used_percentage`,
    // a `xu` na skutečných datech nikdy nepřekročilo 100 (18,2 → 64,4 za měsíc). Přesná data ze
    // stavového řádku mají dál přednost (`claude:spend_limit`), tohle je záloha. 🧪 Beta.
    const used = Math.max(0, Math.min(100, u.xu));
    store.setLimit({
      id: 'claude:spend_limit:history',
      provider: 'anthropic',
      app: 'Claude',
      label: 'Extra usage',
      usedPercent: used,
      value: u.xu,
      windowMinutes: null,
      resetsAt: null,
      reached: used >= 100,
      plan: null,
      text: '',
      at,
      source: 'plan-history',
      kind: 'spend',
    });
    wrote = true;
  }

  void now; // rezervováno pro budoucí použití (stárnutí vzorku), zatím se řídí `at` ze souboru
  return wrote;
}

export function createClaudeDesktopUsageConnector(ctx) {
  const { store, config } = ctx;
  const dir = path.join(appSupportDir(config.sourceHome), 'Claude');
  const file = path.join(dir, FILE_NAME);
  let watcher = null;
  let exists = false;
  let error = '';
  let lastEventAt = 0;
  let lastSampleAt = 0;
  let seenMtime = 0;
  const queue = createFileQueue(sync, 150);

  async function sync(f) {
    if (path.basename(f) !== FILE_NAME) return;
    const stat = await statSafe(file);
    exists = Boolean(stat?.isFile());
    if (!exists) return;
    if (seenMtime === stat.mtimeMs) return;
    const json = await readJson(file, null);
    if (!json) {
      error = 'Soubor s historií limitů Claude Desktop se nepodařilo přečíst.';
      return;
    }
    const sample = findLatestSample(json);
    seenMtime = stat.mtimeMs;
    error = '';
    if (!sample) return;
    if (applyPlanUsageSample(store, sample)) {
      lastEventAt = Date.now();
      lastSampleAt = Number(sample.t) || lastSampleAt;
    }
  }

  async function scan() {
    exists = Boolean(await statSafe(dir));
    await queue.run(file);
  }

  return {
    id: 'claude-desktop-usage',
    name: 'Claude Desktop · historie limitů',
    provider: 'anthropic',
    kind: 'local',
    verified: false,
    source: `${JE_WINDOWS ? '%APPDATA%\\Claude' : '~/Library/Application Support/Claude'}/${FILE_NAME}`,
    description: 'Záložní historie limitů 5 h a týden (a extra usage, pokud je k dispozici) – doplní údaje ze stavového řádku, když zrovna neběží žádná konverzace.',
    async start() {
      await scan();
      watcher = watchTree(dir, (f) => (f ? queue.schedule(f) : scan()));
    },
    scan,
    // Historie se čte přímo ze souboru a nikam se neukládá – Agenteeq z ní nedělá vlastní archiv.
    async series(opts) {
      const stat = await statSafe(file);
      if (!stat?.isFile()) return null;
      const json = await readJson(file, null);
      if (!json) return null;
      return planUsageSeries(json, opts);
    },
    stop() {
      watcher?.close();
      queue.clear();
    },
    idle: () => queue.idle(),
    status() {
      const state = error ? 'error' : lastSampleAt ? 'connected' : exists ? 'idle' : 'missing';
      const detail = error
        ? error
        : lastSampleAt
          ? `Poslední vzorek historie limitů: ${new Date(lastSampleAt).toLocaleString('cs-CZ')}.`
          : exists
            ? 'Claude Desktop je nainstalovaný, ale historie limitů zatím neobsahuje žádný vzorek.'
            : 'Claude Desktop na tomto počítači není.';
      return {
        state,
        detail,
        watching: Boolean(watcher?.active),
        lastEventAt,
      };
    },
  };
}
