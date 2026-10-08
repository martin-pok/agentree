import path from 'node:path';
import fs from 'node:fs/promises';
import { writeJsonAtomic, randomToken, debounce } from './util.js';
import { DEFAULT_SPEND } from './spend.js';
import { normalizeProjects } from './projects.js';
import { ui } from './texty.js';
import { VYCHOZI_TICHO, normalizujTicho } from './nocni-ticho.js';
import { normalizeObservedAccounts } from './provider-accounts.js';

export const DEFAULT_SETTINGS = {
  onboardingDismissed: false,
  welcomeCompleted: false,
  lastSeenVersion: '',
  appearance: 'light',
  // Rodina vzhledu: Obloha (Úsvit a Půlnoc) nebo Koncert (Slonovina a Eben), public/js/appearance.js.
  look: 'obloha',
  language: 'cs',
  // Stahování se nikdy nezapíná samo. Po výslovném přepnutí na automatické režim stáhne pouze
  // přesně ověřený balíček z oficiálního GitHub releasu; instalaci pořád potvrzuje uživatel ve Finderu.
  updateMode: 'manual',
  notifications: {
    needsInput: true,
    limits: true,
    limitReset: true,
    budget: true,
    done: true,
    doneMinSeconds: 120,
    native: true,
    browser: false,
    // Noční ticho (src/nocni-ticho.js): výchozí vypnuto, časy podle místního času počítače.
    ...VYCHOZI_TICHO,
    detekce: true, // oznámení o nově zachyceném agentovi (src/detekce.js)
  },
  disabledConnectors: [],
  lanAccess: false, // přístup z telefonu v domácí síti; výchozí stav je vypnuto
  layout: {}, // uživatelské pořadí karet: { agentSide: ['project', 'details', …], … }
  tailscaleAccess: false, // přístup z vlastní privátní sítě Tailscale; výchozí stav je vypnuto
};

const ALERTS_MAX = 300;

// Pořadí karet, které si uživatel nastavil tažením. Jen známé seznamy a krátké identifikátory:
// z uloženého souboru se nikdy nepřebírá nic jiného.
export const LAYOUT_KEYS = ['agentSide', 'projectSide'];
export function normalizeLayout(input) {
  const out = {};
  if (!input || typeof input !== 'object') return out;
  for (const k of LAYOUT_KEYS) {
    const ids = input[k];
    if (!Array.isArray(ids)) continue;
    const clean = [...new Set(ids.filter((x) => typeof x === 'string' && /^[\w-]{1,40}$/.test(x)))].slice(0, 20);
    if (clean.length) out[k] = clean;
  }
  return out;
}

export const EXTENSION_ORIGIN = /^chrome-extension:\/\/[a-p]{32}$/;
export const EXTENSION_INSTALLATION_ID = /^[A-Za-z0-9-]{8,64}$/;
export const EXTENSION_INSTALLATIONS_MAX = 5;

function normalizeExtensionInstallations(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((x) => x && typeof x === 'object'
      && typeof x.origin === 'string' && EXTENSION_ORIGIN.test(x.origin)
      && typeof x.id === 'string' && (x.id === '' || EXTENSION_INSTALLATION_ID.test(x.id))
      && typeof x.tokenHash === 'string' && /^[0-9a-f]{64}$/.test(x.tokenHash))
    .slice(-EXTENSION_INSTALLATIONS_MAX)
    .map((x) => ({ id: x.id, origin: x.origin, tokenHash: x.tokenHash, pairedAt: Number(x.pairedAt) > 0 ? Number(x.pairedAt) : 0 }));
}

// Účet Agenteeq (src/cloud-sync.js): jestli je zapnutá synchronizace souhrnů, kdy naposledy
// proběhla a id tohoto zařízení v účtu – zvlášť pro každého uživatele. Žádné tokeny, ty jsou v Klíčence.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function normalizeCloud(c) {
  const devices = {};
  for (const [u, dev] of Object.entries(c?.devices && typeof c.devices === 'object' ? c.devices : {}).slice(0, 10)) {
    if (UUID.test(u) && UUID.test(String(dev))) devices[u] = String(dev);
  }
  // volbaCeka: zapnutí z tohoto Macu, které účet ještě nemá (src/cloud-sync.js). Musí přežít restart –
  // jinak by po něm načtení volby z účtu (kde je pořád „vypnuto“) synchronizaci potichu vypnulo.
  return { syncEnabled: c?.syncEnabled === true, syncAt: Number(c?.syncAt) > 0 ? Number(c.syncAt) : 0, volbaCeka: c?.volbaCeka === true, devices };
}

// Upozornění na telefon (src/push.js): klíč VAPID tohoto Macu a odběry spárovaných telefonů.
// Odběr = adresa push služby (jen známé služby, src/webpush.js) a veřejné klíče telefonu pro
// šifrování. Nic z toho nejsou data o konverzacích.
export const PUSH_ODBERY_MAX = 10;
export function normalizePush(p) {
  const vapid = p?.vapid && typeof p.vapid.publicKey === 'string' && /^[\w-]{80,100}$/.test(p.vapid.publicKey)
    && p.vapid.privateJwk && p.vapid.privateJwk.kty === 'EC' && p.vapid.privateJwk.crv === 'P-256' && typeof p.vapid.privateJwk.d === 'string'
    ? { publicKey: p.vapid.publicKey, privateJwk: { kty: 'EC', crv: 'P-256', x: String(p.vapid.privateJwk.x), y: String(p.vapid.privateJwk.y), d: p.vapid.privateJwk.d } }
    : null;
  const odbery = (Array.isArray(p?.odbery) ? p.odbery : [])
    .filter((o) => o && typeof o.id === 'string' && /^[\w-]{8,64}$/.test(o.id) && typeof o.endpoint === 'string' && o.endpoint.length <= 1000
      && typeof o.keys?.p256dh === 'string' && /^[\w-]{80,100}$/.test(o.keys.p256dh) && typeof o.keys?.auth === 'string' && /^[\w-]{16,32}$/.test(o.keys.auth))
    .slice(-PUSH_ODBERY_MAX)
    .map((o) => ({
      id: o.id,
      endpoint: o.endpoint,
      keys: { p256dh: o.keys.p256dh, auth: o.keys.auth },
      nazev: typeof o.nazev === 'string' ? o.nazev.slice(0, 60) : '',
      zarizeni: typeof o.zarizeni === 'string' ? o.zarizeni.slice(0, 64) : '',
      vytvoreno: Number(o.vytvoreno) > 0 ? Number(o.vytvoreno) : 0,
      naposledyOk: Number(o.naposledyOk) > 0 ? Number(o.naposledyOk) : 0,
      chyba: typeof o.chyba === 'string' ? o.chyba.slice(0, 40) : '',
    }));
  return { vapid, odbery };
}

// Nástroje, které detekce na tomto Macu kdy zachytila. Ukládá se jen identifikátor z katalogu,
// časy a rozhodnutí uživatele – žádné cesty, příkazy ani obsah, tedy nic osobního.
export const STAVY_NASTROJE = ['novy', 'pridany', 'ignorovany', 'znamy'];
export function normalizeNastroje(input) {
  const out = {};
  if (!input || typeof input !== 'object') return out;
  for (const [id, z] of Object.entries(input).slice(0, 200)) {
    if (!/^[\w-]{1,40}$/.test(id) || !z || typeof z !== 'object') continue;
    if (!STAVY_NASTROJE.includes(z.stav)) continue;
    const poprve = Number(z.poprve) > 0 ? Number(z.poprve) : 0;
    if (!poprve) continue;
    out[id] = { poprve, naposledy: Number(z.naposledy) > 0 ? Number(z.naposledy) : poprve, stav: z.stav, ...(Number(z.pridano) > 0 ? { pridano: Number(z.pridano) } : {}) };
  }
  return out;
}

// Dřívější výchozí koruna → euro, jen u dat, kde měnu nikdo ručně nezvolil. Rozpočty se přepočtou
// kurzem, aby „6 000 Kč“ nezačalo znamenat „6 000 €“. Proběhne jednou: pak je měna EUR.
export function meneNaEuro(spend) {
  if (spend.currencySource === 'user' || spend.currency !== 'CZK') return spend;
  const eur = Number(spend.rates?.EUR) || DEFAULT_SPEND.rates.EUR;
  const naEura = (v) => Math.round((Number(v) || 0) / eur * 100) / 100;
  return {
    ...spend,
    currency: 'EUR',
    budgets: {
      total: naEura(spend.budgets.total),
      services: Object.fromEntries(Object.entries(spend.budgets.services || {}).map(([k, v]) => [k, naEura(v)])),
    },
  };
}

export function normalizeData(raw) {
  const data = normalizeDataInner(raw);
  data.spend = meneNaEuro(data.spend);
  return data;
}

function normalizeDataInner(raw) {
  const d = raw && typeof raw === 'object' ? raw : {};
  const s = d.settings && typeof d.settings === 'object' ? d.settings : {};
  const sp = d.spend && typeof d.spend === 'object' ? d.spend : {};
  return {
    version: 1,
    ingestToken: typeof d.ingestToken === 'string' && d.ingestToken.length >= 32 ? d.ingestToken : randomToken(),
    extensionPairing: d.extensionPairing && typeof d.extensionPairing.code === 'string' && d.extensionPairing.code.length >= 12 && Number(d.extensionPairing.expiresAt) > Date.now()
      ? { code: d.extensionPairing.code, expiresAt: Number(d.extensionPairing.expiresAt) }
      : null,
    // Rozšíření pro Chrome: kdy bylo spárováno a kdy se naposledy ozvalo. Uloženo, aby aplikace
    // po restartu neukazovala „nenainstalováno“, dokud rozšíření zrovna neposílá konverzaci.
    extension: {
      pairedAt: Number(d.extension?.pairedAt) > 0 ? Number(d.extension.pairedAt) : 0,
      seenAt: Number(d.extension?.seenAt) > 0 ? Number(d.extension.seenAt) : 0,
      version: typeof d.extension?.version === 'string' && /^\d+\.\d+\.\d+$/.test(d.extension.version) ? d.extension.version : '',
    },
    // Každá instalace rozšíření má vlastní token vázaný na svůj původ (chrome-extension://…).
    // Na disku je jen jeho sha256 – ze zálohy dat se za rozšíření vydávat nedá.
    extensionInstallations: normalizeExtensionInstallations(d.extensionInstallations),
    settings: {
      ...DEFAULT_SETTINGS,
      ...s,
      notifications: { ...DEFAULT_SETTINGS.notifications, ...(s.notifications || {}), ...normalizujTicho(s.notifications) },
      disabledConnectors: Array.isArray(s.disabledConnectors) ? s.disabledConnectors.filter((x) => typeof x === 'string') : [],
      lanAccess: s.lanAccess === true,
      tailscaleAccess: s.tailscaleAccess === true,
      onboardingDismissed: s.onboardingDismissed === true,
      welcomeCompleted: s.welcomeCompleted === true,
      lastSeenVersion: typeof s.lastSeenVersion === 'string' && /^\d+\.\d+\.\d+$/.test(s.lastSeenVersion) ? s.lastSeenVersion : '',
      appearance: ['light', 'dark', 'system'].includes(s.appearance) ? s.appearance : 'light',
      look: s.look === 'koncert' ? 'koncert' : 'obloha',
      language: s.language === 'en' ? 'en' : 'cs',
      updateMode: s.updateMode === 'automatic' ? 'automatic' : 'manual',
      avatar: Number.isInteger(s.avatar) && s.avatar >= 0 && s.avatar < 64 ? s.avatar : null,
      layout: normalizeLayout(s.layout),
      // Pomocník: plovoucí tlačítko s chatem a volitelné formulování odpovědí lokálním modelem (Ollama).
      pomocnik: { zobrazit: s.pomocnik?.zobrazit !== false, model: s.pomocnik?.model !== false },
    },
    projects: normalizeProjects(d.projects),
    license: d.license && typeof d.license.key === 'string' && d.license.key.length < 4000 ? { key: d.license.key, activatedAt: Number(d.license.activatedAt) || Date.now() } : null,
    usage: { launches: Number(d.usage?.launches) || 0 },
    cloud: normalizeCloud(d.cloud),
    spend: {
      currency: typeof sp.currency === 'string' ? sp.currency : DEFAULT_SPEND.currency,
      // Kdo měnu zvolil: 'user' = ručně v Rozpočtech (nikdy se nepřepíše), 'default' = výchozí.
      currencySource: sp.currencySource === 'user' ? 'user' : 'default',
      rates: { ...DEFAULT_SPEND.rates, ...(sp.rates || {}), CZK: 1 },
      // Odkud kurz je: ČNB (automaticky), ručně zadaný, nebo orientační výchozí. Dřívější ruční úpravu
      // (kurz jiný než výchozí bez záznamu o původu) poznáme a nepřepíšeme.
      ratesSource: ['cnb', 'manual', 'default'].includes(sp.ratesSource) ? sp.ratesSource
        : (Number(sp.rates?.USD) && Number(sp.rates.USD) !== DEFAULT_SPEND.rates.USD) || (Number(sp.rates?.EUR) && Number(sp.rates.EUR) !== DEFAULT_SPEND.rates.EUR) ? 'manual' : 'default',
      liveRates: sp.liveRates && /^\d{4}-\d{2}-\d{2}$/.test(sp.liveRates.date) && Number(sp.liveRates.USD) > 0 && Number(sp.liveRates.EUR) > 0
        ? { date: sp.liveRates.date, USD: Number(sp.liveRates.USD), EUR: Number(sp.liveRates.EUR), fetchedAt: Number(sp.liveRates.fetchedAt) || 0 } : null,
      budgets: {
        total: Number(sp.budgets?.total) || 0,
        services: sp.budgets?.services && typeof sp.budgets.services === 'object' ? { ...sp.budgets.services } : {},
      },
      ledger: Array.isArray(sp.ledger) ? sp.ledger.filter((e) => e && typeof e.id === 'string') : [],
    },
    alerts: Array.isArray(d.alerts) ? d.alerts.slice(-ALERTS_MAX) : [],
    alertKeys: d.alertKeys && typeof d.alertKeys === 'object' ? d.alertKeys : {},
    credits: d.credits && typeof d.credits === 'object' ? d.credits : {},
    providerAccounts: normalizeObservedAccounts(d.providerAccounts),
    nastroje: normalizeNastroje(d.nastroje),
    push: normalizePush(d.push),
    // Spárované telefony: v datech leží jen hash tokenu, nikdy použitelný token.
    lanDevices: Array.isArray(d.lanDevices)
      ? d.lanDevices
        .filter((x) => x && typeof x.id === 'string' && typeof x.hash === 'string' && /^[0-9a-f]{64}$/.test(x.hash))
        .slice(0, 10)
        .map((x) => ({ id: x.id.slice(0, 40), label: typeof x.label === 'string' ? x.label.slice(0, 40) : 'Telefon', hash: x.hash, at: Number(x.at) || Date.now() }))
      : [],
    // Vlastní agenti: jen tvarová kontrola, skutečné ověření adresy dělá src/custom-agents.js při zápisu.
    customAgents: Array.isArray(d.customAgents)
      ? d.customAgents
        .filter((x) => x && typeof x.id === 'string' && typeof x.name === 'string' && typeof x.type === 'string' && typeof x.origin === 'string')
        .slice(0, 8)
        .map((x) => ({ id: x.id, name: x.name, type: x.type, origin: x.origin, addedAt: Number(x.addedAt) || Date.now() }))
      : [],
  };
}

// Trvalá data aplikace (~/.agenteeq/data.json): nastavení, rozpočty, výdaje, upozornění.
// Načte a ověří datový soubor. Poškozený obsah dostane kód EBADDATA, aby se dal odlišit od chyby
// oprávnění (tu nejde „opravit“ novým souborem a nesmí se zamaskovat).
async function readDataFile(file) {
  const text = await fs.readFile(file, 'utf8');
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    throw Object.assign(new Error('Neplatný JSON'), { code: 'EBADDATA' });
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Object.assign(new Error('Neplatný kořen dat'), { code: 'EBADDATA' });
  return raw;
}

export class DataStore {
  constructor(dir) {
    this.dir = dir;
    this.file = path.join(dir, 'data.json');
    this.backupFile = path.join(dir, 'data.json.bak');
    this.data = null;
    this.writeError = null;
    this.recovery = null;
    this.writing = Promise.resolve();
    this.scheduleSave = debounce(() => { this.flush(); }, 300);
  }

  async load() {
    let raw = null;
    try {
      raw = await readDataFile(this.file);
    } catch (err) {
      if (err.code === 'EBADDATA') {
        raw = await this.recover();
      } else if (err.code !== 'ENOENT') {
        // Oprávnění nebo složka místo souboru: nový soubor by nepomohl a přepsal by skutečná data.
        throw new Error(ui('Agenteeq nemá oprávnění ke složce ~/.agenteeq, data proto nejdou načíst. Původní soubor zůstal zachovaný.'));
      }
    }
    this.data = normalizeData(raw);
    if (this.recovery) this.data.alerts.push(this.recovery.alert);
    await this.flush();
    // Vlastní datová složka patří jen přihlášenému uživateli – na sdíleném Macu se tak k ní
    // nedostane nikdo další. Cizí složky (AGENTEEQ_HOME mimo domov) se tím nemění na nic horšího.
    await fs.chmod(this.dir, 0o700).catch(() => {});
    return this.data;
  }

  // Poškozený data.json aplikaci neshodí (dřív: pád při každém startu, s LaunchAgentem pořád dokola).
  // Soubor se zachová vedle pod jiným jménem, data se vezmou z poslední dobré zálohy, a když ani ta
  // není, začne se od výchozích hodnot. Uživatel se to dozví upozorněním – nic se neděje potichu.
  async recover() {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const preserved = `${this.file}.poskozeno-${stamp}`;
    await fs.rename(this.file, preserved).catch(() => {});
    let raw = null;
    try {
      raw = await readDataFile(this.backupFile);
    } catch {
      raw = null;
    }
    const name = path.basename(preserved);
    this.recovery = {
      at: Date.now(),
      from: raw ? 'backup' : 'defaults',
      preserved,
      alert: {
        id: `recovery-${Date.now()}`,
        at: Date.now(),
        read: false,
        key: `data-recovery:${stamp}`,
        level: 'critical',
        kind: 'system',
        title: raw ? ui('Data Agenteeq byla poškozená – obnovena ze zálohy') : ui('Data Agenteeq byla poškozená'),
        body: raw
          ? ui('Načetla se poslední dobrá záloha, chybět mohou nejvýš poslední změny. Poškozený soubor zůstal uložený jako {0} ve složce ~/.agenteeq.', name)
          : ui('Záloha nebyla k dispozici, nastavení začíná od výchozích hodnot. Poškozený soubor zůstal uložený jako {0} ve složce ~/.agenteeq – projekty a výdaje z něj jde obnovit.', name),
      },
    };
    console.error(`Agenteeq: data.json byl poškozený, ${raw ? 'obnoveno ze zálohy' : 'začínám od výchozích hodnot'}; původní soubor: ${preserved}`);
    return raw;
  }

  save() {
    this.scheduleSave();
  }

  // Vrací true/false podle toho, jestli zápis skutečně prošel. Před zápisem se poslední platný soubor
  // uloží jako záloha – z ní se obnoví, kdyby se data.json poškodil mimo aplikaci.
  flush() {
    this.scheduleSave.cancel();
    const snapshot = JSON.parse(JSON.stringify(this.data));
    this.writing = this.writing.then(async () => {
      await readDataFile(this.file).then(() => fs.copyFile(this.file, this.backupFile)).catch(() => {});
      await writeJsonAtomic(this.file, snapshot);
      this.writeError = null;
      return true;
    }).catch((err) => {
      this.writeError = { message: err.message, at: Date.now() };
      console.error('Agenteeq: nepodařilo se uložit data', err.message);
      return false;
    });
    return this.writing;
  }

  pushAlert(alert) {
    this.data.alerts.push(alert);
    if (this.data.alerts.length > ALERTS_MAX) this.data.alerts.splice(0, this.data.alerts.length - ALERTS_MAX);
    this.save();
  }
}
