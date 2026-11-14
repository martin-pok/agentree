// Účet a plán Claude přímo ze serveru Anthropicu – stejný dotaz, kterým je čte Claude Code
// (`GET https://api.anthropic.com/api/oauth/profile` s přihlášením Claude Code). Dřív se plán
// uznal jen po `claude auth status` samostatně nainstalovaného CLI; kdo používá Claude Desktop
// (CLI je jen uvnitř aplikace), viděl „Nelze ověřit“ a jeho účty jen jako „Dříve rozpoznané“
// (vlastník 10. 11. 2026). Každý profil Claude Code (výchozí i každý CLAUDE_CONFIG_DIR) se čte
// zvlášť – dva účty, dvě odpovědi.
//
// Bezpečnost (stejná pravidla jako u cloudových agentů, src/connectors/claude-desktop-code.js):
// token se jen přečte (Klíčenka / .credentials.json), nikdy se neobnovuje ani neukládá, jde jen
// na api.anthropic.com a přesměrování se odmítá. Z odpovědi se bere jen UUID účtu a plán – e-mail ani
// jméno se nečtou a nikam neukládají.
import { prihlaseniClaudeCodeSDuvodem } from './platform.js';

export const PROFIL_API = 'https://api.anthropic.com/api/oauth/profile';
// Vytížení plánu – stejný dotaz, ze kterého Claude Code kreslí /usage („Current session“, „Current
// week“): `utilization` je v procentech 0–100 (Claude Code ho jen zaokrouhlí dolů a připíše „% used“),
// `resets_at` je čas obnovy okna. Stejná data ukládá stránka Usage v Claude Desktopu.
export const VYUZITI_API = 'https://api.anthropic.com/api/oauth/usage';
const MIN = 60e3;
const UUID = /^[0-9a-f-]{36}$/i;

// Odpověď serveru → tvar `oauthAccount`, se kterým pracuje subscriptions.js#claudePlanFromAccount.
// Nepoužitelná odpověď (bez UUID účtu) = null, nikdy „žádný plán“.
export function ucetZProfilu(data) {
  const account = data?.account;
  const org = data?.organization;
  if (!account || typeof account !== 'object' || !UUID.test(account.uuid || '')) return null;
  return {
    accountUuid: account.uuid,
    organizationUuid: UUID.test(org?.uuid || '') ? org.uuid : '',
    organizationType: /^[a-z_]{1,40}$/.test(org?.organization_type || '') ? org.organization_type : '',
    organizationRateLimitTier: /^[a-z0-9_]{1,80}$/.test(org?.rate_limit_tier || '') ? org.rate_limit_tier : '',
    hasExtraUsageEnabled: org?.has_extra_usage_enabled === true,
  };
}

/**
 * Čtení profilů Claude Code. `nacti(configDir)` vrací
 * `{ stav: 'ok', ucet }` | `{ stav: 'bez-prihlaseni' | 'vyprselo' | 'odmitnuto' | 'chyba' }`.
 * Token se drží do vypršení; když ho přečíst nejde (Klíčenka odepřela, nic tam není), další
 * pokus až za 10 minut – macOS se tak neptá na povolení dokola.
 */
const casObnovy = (v) => {
  if (typeof v === 'string') { const t = Date.parse(v); return Number.isFinite(t) ? t : null; }
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v < 1e12 ? Math.round(v * 1000) : Math.round(v);
  return null;
};
// Odpověď /api/oauth/usage → okna 5 h a týden. Okno bez čísla vynechá, nikdy nedosadí nulu.
export function vyuzitiZOdpovedi(data) {
  const okno = (w) => (w && typeof w === 'object' && typeof w.utilization === 'number' && Number.isFinite(w.utilization)
    ? { usedPercent: Math.max(0, Math.min(100, w.utilization)), resetsAt: casObnovy(w.resets_at) }
    : null);
  const out = { five_hour: okno(data?.five_hour), seven_day: okno(data?.seven_day) };
  return out.five_hour || out.seven_day ? out : null;
}

export function createClaudeProfily({ config, fetchImpl = globalThis.fetch, cist = null, now = () => Date.now() } = {}) {
  const tokeny = new Map(); // configDir → { p, chybaAt }
  // Poslední potvrzený účet: krátký výpadek sítě (do 15 minut) ho nepřepne na „Nelze ověřit“.
  // Odmítnuté přihlášení ani chybějící token ho nedrží – to je skutečná změna, ne výpadek.
  const posledni = new Map(); // configDir → { ucet, at }
  const vyuzitiPauza = new Map(); // configDir → do kdy se na vytížení neptat (server řekl 429)
  const cti = cist || (async (configDir) => (await prihlaseniClaudeCodeSDuvodem({ ...config, claudeConfigDir: configDir })).p);
  async function prihlaseni(configDir) {
    const t = tokeny.get(configDir) || { p: null, chybaAt: 0 };
    tokeny.set(configDir, t);
    if (t.p && !(t.p.expiresAt && t.p.expiresAt <= now())) return t.p;
    if (t.chybaAt && now() - t.chybaAt < 10 * MIN) return t.p;
    t.p = await cti(configDir).catch(() => null);
    if (!t.p || (t.p.expiresAt && t.p.expiresAt <= now())) t.chybaAt = now();
    return t.p;
  }
  async function nacti(configDir = '') {
    const r = await dotaz(configDir);
    if (r.stav === 'ok') posledni.set(configDir, { ucet: r.ucet, at: now() });
    else if (r.stav === 'chyba') {
      const minule = posledni.get(configDir);
      if (minule && now() - minule.at < 15 * MIN) return { stav: 'ok', ucet: minule.ucet, zCache: true };
    } else posledni.delete(configDir);
    return r;
  }
  async function dotaz(configDir) {
    const p = await prihlaseni(configDir);
    if (!p?.accessToken) return { stav: 'bez-prihlaseni' };
    if (p.expiresAt && p.expiresAt <= now()) return { stav: 'vyprselo' };
    let res;
    try {
      res = await fetchImpl(PROFIL_API, {
        headers: { Authorization: `Bearer ${p.accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json', 'Cache-Control': 'no-cache' },
        redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(10000),
      });
    } catch { return { stav: 'chyba' }; }
    if (res.status === 401 || res.status === 403) {
      // Odvolané přihlášení: token zapomenout, přečte se znovu (Claude Code si ho mezitím obnoví).
      tokeny.set(configDir, { p: null, chybaAt: now() });
      return { stav: 'odmitnuto' };
    }
    if (!res.ok) return { stav: 'chyba' };
    if (Number(res.headers?.get?.('content-length')) > 1024 * 1024) return { stav: 'chyba' };
    let data;
    try { data = await res.json(); } catch { return { stav: 'chyba' }; }
    const ucet = ucetZProfilu(data);
    return ucet ? { stav: 'ok', ucet } : { stav: 'chyba' };
  }
  // Vytížení plánu profilu. null = nevím (bez přihlášení, chyba, server žádá pauzu) – nikdy 0 %.
  async function vyuziti(configDir = '') {
    if ((vyuzitiPauza.get(configDir) || 0) > now()) return null;
    const p = await prihlaseni(configDir);
    if (!p?.accessToken || (p.expiresAt && p.expiresAt <= now())) return null;
    let res;
    try {
      res = await fetchImpl(VYUZITI_API, {
        headers: { Authorization: `Bearer ${p.accessToken}`, 'anthropic-beta': 'oauth-2025-04-20', 'Content-Type': 'application/json', Accept: 'application/json', 'Cache-Control': 'no-cache' },
        redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(10000),
      });
    } catch { return null; }
    if (res.status === 429) {
      const za = Number(res.headers?.get?.('retry-after'));
      vyuzitiPauza.set(configDir, now() + Math.min(60 * MIN, Math.max(5 * MIN, Number.isFinite(za) ? za * 1000 : 0)));
      return null;
    }
    if (!res.ok || Number(res.headers?.get?.('content-length')) > 1024 * 1024) return null;
    try { return vyuzitiZOdpovedi(await res.json()); } catch { return null; }
  }
  // Po udělení nebo odebrání svolení ke Klíčence: zapomenout přihlášení i pauzu po neúspěchu.
  function reset() { tokeny.clear(); posledni.clear(); vyuzitiPauza.clear(); }
  return { nacti, vyuziti, reset };
}
