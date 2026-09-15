import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { PUBLIC_DIR, VERSION } from './config.js';
import { validateEntry, validateBudgets } from './spend.js';
import { claudeSettingsPath, installHooks, uninstallHooks, hooksStatus } from './hooks-installer.js';
import { SECRET_IDS } from './secrets.js';
import { createSkills } from './skills.js';
import { isLoopback, cookieValue, COOKIE } from './lan.js';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

const SECURITY = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
};

class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export function createHttpServer(app, existingServer = null) {
  const { store, datastore, alerts, config } = app;
  const clients = new Set();
  let server;

  const port = () => server.address()?.port ?? config.port;
  const allowedOrigins = () => {
    const list = [`http://127.0.0.1:${port()}`, `http://localhost:${port()}`];
    // Se zapnutým přístupem z telefonu jsou legitimní i adresy tohoto Macu v místní síti
    // a v jeho privátní síti Tailscale (včetně jména v MagicDNS).
    //
    // Varianta https bez portu je tu kvůli `tailscale serve`: ta stránku vydává na vlastním
    // jméně po 443, takže prohlížeč pošle Origin `https://jmeno.tailnet.ts.net`. Pořád je to
    // naše vlastní adresa — cizí web si Origin podvrhnout nemůže — a bez ní by se z telefonu
    // po HTTPS nedalo ani spárovat.
    if (app.lan) {
      for (const adresa of app.lan.hosts()) {
        list.push(`http://${adresa}:${port()}`);
        list.push(`https://${adresa}`);
      }
    }
    return new Set(list);
  };

  // Hlavičky, které před server staví reverzní proxy. Desktopová aplikace ani prohlížeč na Macu
  // je neposílají, takže jejich přítomnost znamená, že požadavek někdo přeposlal.
  const PROXY_HLAVICKY = ['x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto', 'forwarded', 'tailscale-user-login', 'tailscale-user-name'];
  const hostHlavicka = (req) => String(req.headers.host || '').replace(/:\d+$/, '').toLowerCase();

  // Co je „požadavek z tohoto Macu“. Samotná adresa protistrany nestačí: `tailscale serve`
  // (a každá jiná reverzní proxy běžící na tomhle Macu) se na server připojí z 127.0.0.1,
  // ale požadavek za ní pochází z cizího zařízení v tailnetu. Kdyby si takový požadavek mohl
  // vzít výjimku pro desktopovou aplikaci, zmizelo by spuštěním jediného příkazu párování,
  // token i všechna omezení „tohle jde jen na Macu“ — a to je celá ochrana těchhle dat.
  // Proto musí platit obojí: spojení po smyčce A hlášení se na adresu smyčky, bez stop po proxy.
  function zTohotoMacu(req) {
    if (!isLoopback(req.socket?.remoteAddress)) return false;
    const host = hostHlavicka(req);
    if (host !== '127.0.0.1' && host !== 'localhost') return false;
    return !PROXY_HLAVICKY.some((h) => req.headers[h] !== undefined);
  }

  // Požadavek z tohoto Macu (desktopová aplikace, prohlížeč na Macu) projde jako dřív.
  // Cokoli z místní sítě musí mít token spárovaného zařízení — jinak se k datům nedostane.
  function requireDevice(req, url) {
    if (!app.lan || zTohotoMacu(req)) return;
    if (!datastore.data.settings.lanAccess && !datastore.data.settings.tailscaleAccess) throw new HttpError(403, 'Přístup z telefonu je vypnutý.');
    // Statické soubory (HTML, CSS, JS, ikony) se vydají i nespárovanému telefonu — jinak by neměl
    // z čeho zobrazit párovací obrazovku. Je to týž veřejný kód jako v repozitáři, žádná data.
    const verejne = !url.pathname.startsWith('/api/') && (req.method === 'GET' || req.method === 'HEAD');
    if (verejne || url.pathname === '/api/lan/pair' || url.pathname === '/api/health') return;
    // Spárované telefony mají cookie ještě pod starým názvem — platí obě.
    if (!app.lan.tokenOk(cookieValue(req.headers.cookie) || cookieValue(req.headers.cookie, 'agentree_device'))) {
      throw new HttpError(401, 'Tohle zařízení není spárované. Zadej kód z Agenteeq na Macu.');
    }
  }

  /* ---------- SSE ---------- */

  function broadcast(event, data) {
    if (!clients.size) return;
    const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of clients) {
      // A stalled browser must not grow an unbounded transcript buffer.
      if (res.writableLength > 1_000_000) { clients.delete(res); res.destroy(); }
      else res.write(msg);
    }
  }

  const listeners = {
    session: (s) => broadcast('session', s),
    'session:remove': (id) => broadcast('session:remove', { id }),
    transcript: (t) => broadcast('transcript', t),
    runtimes: (l) => broadcast('runtimes', l),
    localAgents: (l) => broadcast('localAgents', l),
    customAgents: (l) => broadcast('customAgents', l),
    limits: (l) => broadcast('limits', l),
    credits: (l) => broadcast('credits', l),
    alert: (a) => broadcast('alert', { alert: a, unread: alerts.unread() }),
    'alerts:read': () => broadcast('alerts', { unread: alerts.unread() }),
    spend: (s) => broadcast('spend', s),
    connectors: (l) => broadcast('connectors', l),
    settings: (s) => broadcast('settings', s),
    integrations: (i) => broadcast('integrations', i),
    projects: (p) => broadcast('projects', p),
    runs: (l) => broadcast('runs', l),
    launch: (l) => broadcast('launch', l),
    license: (l) => broadcast('license', l),
    usage: (u) => broadcast('usage', u),
    storage: (st) => broadcast('storage', st),
  };
  for (const [event, fn] of Object.entries(listeners)) store.on(event, fn);

  const heartbeat = setInterval(() => {
    for (const res of clients) res.write(': ping\n\n');
  }, 15000);
  heartbeat.unref?.();

  function stream(req, res) {
    if (clients.size >= 32) throw new HttpError(503, 'Příliš mnoho otevřených spojení. Zavři nepoužívaná okna Agenteeq.');
    res.writeHead(200, {
      ...SECURITY,
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
    });
    res.write(`retry: 2000\nevent: hello\ndata: ${JSON.stringify({ version: VERSION, now: Date.now(), ready: store.ready })}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
  }

  /* ---------- Pomocníci ---------- */

  async function readBody(req) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 1_000_000) throw new HttpError(413, 'Příliš velký požadavek.');
      chunks.push(chunk);
    }
    const raw = Buffer.concat(chunks).toString('utf8');
    if (!raw.trim()) return {};
    try {
      return JSON.parse(raw);
    } catch {
      throw new HttpError(400, 'Neplatný JSON.');
    }
  }

  function send(res, status, data) {
    res.writeHead(status, { ...SECURITY, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(data));
  }

  function tokenOk(req) {
    // Po přejmenování na Agenteeq bereme i starou hlavičku — hooky a rozšíření nainstalované
    // pod názvem Agentree tak fungují dál, dokud je uživatel nepřepojí.
    const given = Buffer.from(String(req.headers['x-agenteeq-token'] || req.headers['x-agentree-token'] || ''));
    const expected = Buffer.from(datastore.data.ingestToken);
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
  }

  // Ochrana proti CSRF: vlastní hlavička vynutí CORS preflight, který server nepovolí; navíc kontrola Origin.
  function guardMutation(req) {
    if (req.headers['x-agenteeq'] !== '1' && req.headers['x-agentree'] !== '1') throw new HttpError(403, 'Chybí hlavička X-Agenteeq.');
    const origin = req.headers.origin;
    if (origin && !allowedOrigins().has(origin)) throw new HttpError(403, 'Nepovolený původ požadavku.');
  }

  // Výsledky aplikační vrstvy ve tvaru { status, error, errors?, field?, upgrade? } převede na HTTP chybu.
  function unwrap(r) {
    if (r && typeof r.status === 'number' && r.error) {
      const extra = {};
      for (const k of ['errors', 'field', 'upgrade']) if (r[k] !== undefined) extra[k] = r[k];
      throw new HttpError(r.status, r.error, extra);
    }
    return r;
  }

  async function readRaw(req, max) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > max) throw new HttpError(413, 'Soubor je příliš velký.');
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  const sessionParam = (m) => {
    try {
      return decodeURIComponent(m[1]);
    } catch {
      throw new HttpError(400, 'Neplatné ID konverzace.');
    }
  };

  const spendResponse = () => ({ spend: app.spendPayload() });
  const ledger = () => datastore.data.spend.ledger;
  const findEntry = (id) => {
    const e = ledger().find((x) => x.id === id);
    if (!e) throw new HttpError(404, 'Položka nenalezena.');
    return e;
  };

  async function refreshIntegrations() {
    const value = await app.integrations();
    store.emit('integrations', value);
    return value;
  }

  /* ---------- Trasy ---------- */

  // Dovednosti se čtou přímo z disku podle `config.sourceHome`, nic se nedrží v paměti.
  const skills = createSkills({ config });

  const routes = [
    ['GET', /^\/api\/skills$/, async () => ({ skills: await skills.list() })],
    // Obsah se hledá podle id z čerstvého seznamu — cesta nikdy nepochází z požadavku.
    ['GET', /^\/api\/skills\/([0-9a-f]{12})\/raw$/, async (_req, m, url) => {
      const skill = await skills.read(m[1]);
      if (!skill) throw new HttpError(404, 'Dovednost nenalezena.');
      const safeName = `${skill.name.replace(/[^\p{L}\p{N} ._-]/gu, '').trim() || 'dovednost'}.md`;
      const headers = { 'Content-Type': 'text/markdown; charset=utf-8', 'Cache-Control': 'no-store' };
      if (url.searchParams.get('download') === '1') headers['Content-Disposition'] = `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}`;
      return { raw: true, headers, body: skill.text };
    }],
    ['POST', /^\/api\/alerts\/clear$/, () => ({ cleared: alerts.clear(), unread: alerts.unread(), items: [] })],

    /* ---------- Přístup z telefonu ---------- */
    ['POST', /^\/api\/remote\/detect$/, async (req) => {
      if (!zTohotoMacu(req)) throw new HttpError(403, 'Zjišťovat tunely lze jen na Macu.');
      return { tunnels: await app.refreshTunnels() };
    }],
    ['GET', /^\/api\/lan$/, (req) => {
      // Kód se ukazuje jen na tomto Macu; z telefonu by jinak stačil jeden dotaz k spárování dalších.
      const s = app.lan.status();
      return zTohotoMacu(req) ? s : { ...s, pin: null, devices: [] };
    }],
    ['POST', /^\/api\/tailscale\/(enable|disable)$/, async (req, m) => {
      if (!zTohotoMacu(req)) throw new HttpError(403, 'Zapnout přístup lze jen na Macu.');
      return unwrap(await app.setTailscaleAccess(m[1] === 'enable'));
    }],
    ['POST', /^\/api\/lan\/(enable|disable)$/, async (req, m) => {
      if (!zTohotoMacu(req)) throw new HttpError(403, 'Zapnout přístup lze jen na Macu.');
      return unwrap(await app.setLanAccess(m[1] === 'enable'));
    }],
    ['POST', /^\/api\/lan\/pin$/, (req) => {
      if (!zTohotoMacu(req)) throw new HttpError(403, 'Kód lze vytvořit jen na Macu.');
      if (!datastore.data.settings.lanAccess && !datastore.data.settings.tailscaleAccess) throw new HttpError(409, 'Nejdřív zapni přístup z telefonu.');
      return { pin: app.lan.newPin() };
    }],
    ['POST', /^\/api\/lan\/pair$/, async (req, _m, url) => {
      const body = await readBody(req);
      const r = unwrap(await app.lan.pair(body?.pin, body?.label));
      // Token jde do cookie: nedostane se do historie prohlížeče ani k JavaScriptu na stránce,
      // a EventSource ho posílá sám, takže realtime stream funguje bez dalšího zařizování.
      const secure = url.protocol === 'https:' ? ' Secure;' : '';
      // SameSite=Lax, ne Strict: telefon typicky otevře adresu z poznámek, QR kódu nebo dlaždice
      // na domovské obrazovce — to je přechod z jiného webu a Strict by u něj cookie neposlal,
      // takže by spárovaný telefon znovu žádal kód. Zápisy dál chrání hlavička X-Agenteeq
      // (cizí web ji bez preflightu nepřidá) a kontrola Origin.
      return {
        raw: true,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
          'Set-Cookie': `${COOKIE}=${r.token}; Path=/; Max-Age=${r.maxAgeSec}; HttpOnly; SameSite=Lax;${secure}`,
        },
        body: JSON.stringify({ device: r.device }),
      };
    }],
    ['DELETE', /^\/api\/lan\/devices\/([\w-]{1,40})$/, async (req, m) => {
      if (!zTohotoMacu(req)) throw new HttpError(403, 'Odpárovat zařízení lze jen na Macu.');
      unwrap(await app.lan.revoke(m[1]));
      return { lan: app.lan.status() };
    }],
    ['POST', /^\/api\/runtimes\/([\w-]{1,40})\/focus$/, async (_req, m) => unwrap(await app.focusRuntime(m[1]))],
    ['GET', /^\/api\/custom-agents$/, () => ({ agents: app.customAgentsPayload(), types: app.customAgentTypes() })],
    ['POST', /^\/api\/custom-agents$/, async (req) => {
      const body = await readBody(req);
      return unwrap(await app.addCustomAgent({ name: body?.name, type: body?.type, url: body?.url }));
    }],
    ['DELETE', /^\/api\/custom-agents\/([\w-]{1,32})$/, async (_req, m) => unwrap(await app.removeCustomAgent(m[1]))],
    ['GET', /^\/api\/usage\/claude$/, async (_req, _m, url) => {
      const days = Math.max(1, Math.min(90, Number(url.searchParams.get('days')) || 30));
      const series = await app.planUsageHistory({ days });
      // Chybějící historie (Mac bez aplikace Claude Desktop) není chyba — 404 plnila konzoli
      // hláškami „Failed to load resource“ u každého nového uživatele.
      if (!series) return { available: false, message: 'Historie vytížení plánu na tomto Macu není.' };
      return series;
    }],
    ['GET', /^\/api\/health$/, () => ({ ok: true, version: VERSION, ready: store.ready, ...(config.lifecycle ? { lifecycle: config.lifecycle } : {}) })],
    ['GET', /^\/api\/state$/, (req) => app.state({ local: zTohotoMacu(req) })],
    ['GET', /^\/api\/sessions\/([^/]+)$/, (_req, m) => {
      const id = decodeURIComponent(m[1]);
      const session = store.summary(id);
      if (!session) throw new HttpError(404, 'Konverzace nenalezena.');
      return { session, transcript: store.transcript(id) };
    }],
    ['GET', /^\/api\/sessions\/([^/]+)\/transcript$/, (_req, m, url) => {
      const entries = store.transcript(decodeURIComponent(m[1]), { after: Number(url.searchParams.get('after')) || 0 });
      if (!entries) throw new HttpError(404, 'Konverzace nenalezena.');
      return { entries };
    }],
    ['POST', /^\/api\/sessions\/([^/]+)\/open$/, async (req, m) => {
      const body = await readBody(req);
      const r = await app.openSession(decodeURIComponent(m[1]), String(body.target || ''));
      if (r.status) throw new HttpError(r.status, r.error);
      return r;
    }],
    ['POST', /^\/api\/hooks\/claude-code$/, async (req) => {
      if (!tokenOk(req)) throw new HttpError(401, 'Neplatný token.');
      const r = await app.connectors['claude-code'].ingestHook(await readBody(req));
      if (!r.ok) throw new HttpError(400, r.error);
      return r;
    }, { token: true }],
    ['POST', /^\/api\/hooks\/claude-statusline$/, async (req) => {
      if (!tokenOk(req)) throw new HttpError(401, 'Neplatný token.');
      const r = app.connectors['claude-code'].ingestStatusline(await readBody(req));
      if (!r.ok) throw new HttpError(400, r.error);
      return { raw: true, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }, body: r.text };
    }, { token: true }],
    ['POST', /^\/api\/ingest\/web$/, async (req) => {
      if (!tokenOk(req)) throw new HttpError(401, 'Neplatný token.');
      const r = app.connectors.web.ingest(await readBody(req));
      if (!r.ok) throw new HttpError(400, r.error);
      app.extensionSeen();
      return r;
    }, { token: true }],
    // Rozšíření si vyzvedne zadání spuštěné z Agenteeq. Jen se svým tokenem, jen jednou.
    ['POST', /^\/api\/extension\/handoff$/, async (req) => {
      if (!tokenOk(req)) throw new HttpError(401, 'Neplatný token.');
      const body = await readBody(req);
      app.extensionSeen();
      return app.takeWebHandoff(body && typeof body === 'object' ? body.site : null);
    }, { token: true }],
    // Rozšíření se hlásí: po startu Chromu, každých 30 minut a při otevření svého okna.
    ['POST', /^\/api\/extension\/hello$/, async (req) => {
      if (!tokenOk(req)) throw new HttpError(401, 'Neplatný token.');
      return app.extensionSeen(await readBody(req));
    }, { token: true }],
    ['POST', /^\/api\/extension\/pair-code$/, async () => app.createExtensionPairCode()],
    ['POST', /^\/api\/extension\/pair$/, async (req) => {
      if (!/^chrome-extension:\/\/[a-p]{32}$/.test(String(req.headers.origin || ''))) throw new HttpError(403, 'Párování je dostupné jen pro rozšíření Agenteeq.');
      const pair = await app.pairExtension(String(req.headers['x-agenteeq-pair-code'] || ''));
      if (!pair) throw new HttpError(401, 'Párovací kód neplatí nebo už vypršel. Vytvoř nový v Agenteeq.');
      return pair;
    }, { token: true }],
    ['POST', /^\/api\/spend\/ledger$/, async (req) => {
      const r = validateEntry(await readBody(req));
      if (!r.ok) throw new HttpError(422, 'Zkontroluj zvýrazněná pole.', { errors: r.errors });
      ledger().push(r.value);
      datastore.save();
      app.spendChanged();
      return { status: 201, body: { entry: r.value, ...spendResponse() } };
    }],
    ['PATCH', /^\/api\/spend\/ledger\/([\w-]+)$/, async (req, m) => {
      const e = findEntry(m[1]);
      const body = await readBody(req);
      const valid = body.endDate === null || (typeof body.endDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.endDate) && body.endDate >= e.date);
      if (!valid) throw new HttpError(422, 'Datum ukončení musí být ve tvaru RRRR-MM-DD a nejdříve v den začátku.');
      e.endDate = body.endDate;
      datastore.save();
      app.spendChanged();
      return { entry: e, ...spendResponse() };
    }],
    ['DELETE', /^\/api\/spend\/ledger\/([\w-]+)$/, (_req, m) => {
      const e = findEntry(m[1]);
      ledger().splice(ledger().indexOf(e), 1);
      datastore.save();
      app.spendChanged();
      return spendResponse();
    }],
    ['PUT', /^\/api\/spend\/budgets$/, async (req) => {
      const sp = datastore.data.spend;
      const r = validateBudgets(await readBody(req), { currency: sp.currency, rates: sp.rates, budgets: sp.budgets });
      if (!r.ok) throw new HttpError(422, 'Zkontroluj zvýrazněná pole.', { errors: r.errors });
      Object.assign(sp, { currency: r.value.currency, rates: r.value.rates, budgets: r.value.budgets });
      datastore.save();
      app.spendChanged();
      return spendResponse();
    }],
    ['GET', /^\/api\/alerts$/, () => ({ unread: alerts.unread(), items: alerts.list().slice(0, 300) })],
    ['POST', /^\/api\/alerts\/read$/, async (req) => {
      const body = await readBody(req);
      const ids = body.ids === 'all' ? 'all' : Array.isArray(body.ids) ? body.ids.filter((x) => typeof x === 'string') : [];
      alerts.markRead(ids);
      return { unread: alerts.unread() };
    }],
    ['POST', /^\/api\/alerts\/test$/, () => {
      const alert = alerts.raise({
        key: `test:${Date.now()}:${Math.random()}`,
        level: 'action',
        kind: 'test',
        title: 'Testovací upozornění',
        body: 'Takhle tě Agenteeq upozorní, když agent bude potřebovat tvé rozhodnutí.',
      });
      return { alert };
    }],
    ['PUT', /^\/api\/settings$/, async (req) => {
      const body = await readBody(req);
      const n = body.notifications && typeof body.notifications === 'object' ? body.notifications : {};
      const cur = datastore.data.settings.notifications;
      if (typeof body.onboardingDismissed === 'boolean') datastore.data.settings.onboardingDismissed = body.onboardingDismissed;
      if (typeof body.welcomeCompleted === 'boolean') datastore.data.settings.welcomeCompleted = body.welcomeCompleted;
      if (body.lastSeenVersion !== undefined) {
        if (typeof body.lastSeenVersion !== 'string' || !/^\d+\.\d+\.\d+$/.test(body.lastSeenVersion)) throw new HttpError(422, 'Neplatná verze.');
        datastore.data.settings.lastSeenVersion = body.lastSeenVersion;
      }
      if (body.appearance !== undefined) {
        if (!['light', 'dark', 'system'].includes(body.appearance)) throw new HttpError(422, 'Vzhled musí být světlý, tmavý nebo podle systému.');
        datastore.data.settings.appearance = body.appearance;
      }
      if (body.avatar !== undefined) {
        const ok = body.avatar === null || (Number.isInteger(body.avatar) && body.avatar >= 0 && body.avatar < 64);
        if (!ok) throw new HttpError(422, 'Neplatný profilový obrázek.');
        datastore.data.settings.avatar = body.avatar;
      }
      for (const k of ['needsInput', 'limits', 'limitReset', 'budget', 'done', 'native', 'browser']) if (typeof n[k] === 'boolean') cur[k] = n[k];
      if (n.doneMinSeconds !== undefined) {
        const v = Number(n.doneMinSeconds);
        if (!(v >= 0 && v <= 86400)) throw new HttpError(422, 'Minimální délka úlohy musí být 0–86400 sekund.');
        cur.doneMinSeconds = Math.round(v);
      }
      // Uložení se čeká: dřív se hned vrátilo 200 a zápis, který potom selhal (plný disk, práva),
      // skončil jen v logu — po restartu se změna potichu ztratila.
      store.emit('settings', datastore.data.settings);
      if (!(await datastore.flush())) throw new HttpError(500, 'Nastavení se nepodařilo uložit na disk. Zkontroluj volné místo a oprávnění ke složce ~/.agenteeq.');
      return { settings: datastore.data.settings };
    }],
    ['POST', /^\/api\/integrations\/claude-hooks\/(install|uninstall)$/, async (_req, m) => {
      const file = claudeSettingsPath(config.sourceHome);
      try {
        if (m[1] === 'install') await installHooks(file, { port: port(), token: datastore.data.ingestToken });
        else await uninstallHooks(file);
      } catch (err) {
        throw new HttpError(err.code === 'INVALID_SETTINGS' ? 422 : 500, err.message);
      }
      await refreshIntegrations();
      return { claudeHooks: await hooksStatus(file, datastore.data.ingestToken) };
    }],
    ['PUT', /^\/api\/secrets\/([\w-]+)$/, async (req, m) => {
      if (!SECRET_IDS[m[1]]) throw new HttpError(404, 'Neznámý klíč.');
      const body = await readBody(req);
      await app.secrets.set(m[1], body.value);
      await app.connectors['cloud-billing'].scan();
      return { integrations: await refreshIntegrations() };
    }],
    ['DELETE', /^\/api\/secrets\/([\w-]+)$/, async (_req, m) => {
      if (!SECRET_IDS[m[1]]) throw new HttpError(404, 'Neznámý klíč.');
      await app.secrets.remove(m[1]);
      await app.connectors['cloud-billing'].scan();
      return { integrations: await refreshIntegrations() };
    }],
    ['POST', /^\/api\/connectors\/rescan$/, async () => {
      await Promise.allSettled(Object.values(app.connectors).map((c) => c.scan()));
      return { connectors: app.connectorList() };
    }],

    /* Projekty */
    ['GET', /^\/api\/projects$/, () => ({ projects: app.projectsPayload() })],
    ['POST', /^\/api\/projects\/assign$/, async (req) => {
      const body = await readBody(req);
      const pid = body.projectId === null || typeof body.projectId === 'string' ? body.projectId : undefined;
      if (pid === undefined) throw new HttpError(422, 'Chybí projekt.');
      unwrap(app.assignToProject(body.sessionIds, pid));
      return { projects: app.projectsPayload() };
    }],
    ['POST', /^\/api\/projects$/, async (req) => {
      const r = unwrap(app.createProject(await readBody(req)));
      return { status: 201, body: { project: r.project, projects: app.projectsPayload() } };
    }],
    ['PATCH', /^\/api\/projects\/([\w-]+)$/, async (req, m) => {
      const r = unwrap(app.updateProject(m[1], await readBody(req)));
      return { project: r.project, projects: app.projectsPayload() };
    }],
    ['DELETE', /^\/api\/projects\/([\w-]+)$/, (_req, m) => {
      unwrap(app.removeProject(m[1]));
      return { projects: app.projectsPayload() };
    }],
    ['GET', /^\/api\/projects\/([\w-]+)\/export$/, (_req, m) => {
      const r = unwrap(app.exportProject(m[1]));
      const slug = r.project.name.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'projekt';
      const d = new Date();
      const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return {
        raw: true,
        headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="agenteeq-${slug}-${date}.csv"`, 'Cache-Control': 'no-store' },
        body: r.csv,
      };
    }],

    ['GET', /^\/api\/projects\/([\w-]+)\/git$/, async (_req, m) => unwrap(await app.projectGit(m[1]))],
    ['POST', /^\/api\/projects\/([\w-]+)\/team$/, async (req, m) => unwrap(await app.launchTeam(m[1], await readBody(req)))],
    ['POST', /^\/api\/projects\/([\w-]+)\/work\/([\w-]+)\/(accept|discard)$/, async (_req, m) => unwrap(await app.projectWorkAction(m[1], m[2], m[3]))],
    ['GET', /^\/api\/projects\/([\w-]+)\/media\/(cover|logo)$/, async (_req, m) => {
      const r = unwrap(await app.readProjectMedia(m[1], m[2]));
      return { raw: true, headers: { 'Content-Type': r.type, 'Cache-Control': 'private, max-age=31536000, immutable', 'Content-Security-Policy': "default-src 'none'; img-src 'self'; sandbox" }, body: r.body };
    }],
    ['PUT', /^\/api\/projects\/([\w-]+)\/media\/(cover|logo)$/, async (req, m) => unwrap(await app.setProjectMedia(m[1], m[2], await readRaw(req, 4_500_000)))],
    ['DELETE', /^\/api\/projects\/([\w-]+)\/media\/(cover|logo)$/, async (_req, m) => unwrap(await app.removeProjectMedia(m[1], m[2]))],

    /* Spouštění agentů */
    ['GET', /^\/api\/launch$/, () => app.launchPayload()],
    ['POST', /^\/api\/launch\/refresh$/, () => app.refreshLaunch()],
    ['POST', /^\/api\/launch$/, async (req) => unwrap(await app.launch(await readBody(req)))],
    ['GET', /^\/api\/runs$/, () => ({ runs: app.runsPayload() })],
    ['POST', /^\/api\/runs\/clear$/, () => {
      app.runs.clearFinished();
      return { runs: app.runsPayload() };
    }],
    ['POST', /^\/api\/runs\/([\w-]+)\/stop$/, (_req, m) => {
      if (!app.runs.get(m[1])) throw new HttpError(404, 'Běh nenalezen.');
      if (!app.runs.stop(m[1])) throw new HttpError(409, 'Běh už skončil.');
      return { runs: app.runsPayload() };
    }],
    ['GET', /^\/api\/runs\/([\w-]+)\/log$/, (_req, m) => {
      if (!app.runs.get(m[1])) throw new HttpError(404, 'Běh nenalezen.');
      return { log: app.runs.tail(m[1], 16000) };
    }],
    ['POST', /^\/api\/sessions\/([^/]+)\/reply$/, async (req, m) => {
      const body = await readBody(req);
      const r = app.localChat.reply(sessionParam(m), body.text);
      if (!r.ok) throw new HttpError(r.status, r.error);
      return { ok: true };
    }],
    ['POST', /^\/api\/sessions\/([^/]+)\/stop$/, (_req, m) => {
      if (!app.localChat.stop(sessionParam(m))) throw new HttpError(409, 'Model právě neodpovídá.');
      return { ok: true };
    }],

    /* Licence, systém */
    ['GET', /^\/api\/license$/, () => ({ license: app.licenseStatus() })],
    ['PUT', /^\/api\/license$/, async (req) => unwrap(app.activateLicense((await readBody(req)).key))],
    ['DELETE', /^\/api\/license$/, () => app.removeLicense()],
    ['POST', /^\/api\/integrations\/autostart\/(install|uninstall)$/, async (_req, m) => unwrap(await app.autostart(m[1]))],
    ['POST', /^\/api\/install\/reveal$/, async () => unwrap(await app.revealInstallPackage())],
    ['GET', /^\/api\/fs\/folders$/, async (_req, _m, url) => unwrap(await app.listFolders(url.searchParams.get('path') || ''))],
  ];

  /* ---------- Statické soubory ---------- */

  async function serveStatic(req, res, url) {
    let rel;
    try {
      rel = decodeURIComponent(url.pathname);
    } catch {
      throw new HttpError(400, 'Neplatná adresa.');
    }
    if (rel === '/') rel = '/index.html';
    let file = path.normalize(path.join(PUBLIC_DIR, rel));
    if (!file.startsWith(PUBLIC_DIR + path.sep)) throw new HttpError(403, 'Zakázáno.');
    let body;
    try {
      body = await fs.readFile(file);
    } catch (err) {
      if (err.code !== 'ENOENT' && err.code !== 'EISDIR') throw err;
      if (path.extname(rel)) throw new HttpError(404, 'Nenalezeno.');
      file = path.join(PUBLIC_DIR, 'index.html');
      body = await fs.readFile(file);
    }
    // Loga, fonty a brand se nikdy nemění v rámci verze; bez trvalé cache je prohlížeč při každém překreslení
    // znovu ověřuje a ikony probliknou. Skripty a styly zůstávají bez cache, ať se úpravy projeví ihned.
    const asset = /^\/(logos|fonts|brand|icons)\//.test(rel);
    res.writeHead(200, { ...SECURITY, 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': asset ? 'private, max-age=31536000, immutable' : 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : body);
  }

  async function handle(req, res) {
    const host = hostHlavicka(req);
    // Hlavička Host se kontroluje proti pevnému seznamu (ochrana proti DNS rebindingu): tento Mac
    // a — jen se zapnutým přístupem z telefonu — jeho vlastní adresy v místní síti.
    const hostOk = host === '127.0.0.1' || host === 'localhost'
      || Boolean(app.lan && app.lan.hosts().includes(host));
    if (!hostOk) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Zakázáno');
      return;
    }
    const url = new URL(req.url, 'http://127.0.0.1');
    requireDevice(req, url);
    if (url.pathname.startsWith('/api/') && req.method === 'GET') {
      if ((req.headers.origin && !allowedOrigins().has(req.headers.origin)) || req.headers['sec-fetch-site'] === 'cross-site') throw new HttpError(403, 'Nepovolený původ požadavku.');
    }
    if (url.pathname === '/api/stream' && req.method === 'GET') return stream(req, res);
    if (url.pathname.startsWith('/api/')) {
      const route = routes.find(([method, re]) => method === req.method && re.test(url.pathname));
      if (!route) {
        const known = routes.some(([, re]) => re.test(url.pathname));
        throw new HttpError(known ? 405 : 404, known ? 'Metoda není povolena.' : 'Neznámá adresa API.');
      }
      const [method, re, handler, opts = {}] = route;
      if (method !== 'GET' && !opts.token) guardMutation(req);
      const result = await handler(req, url.pathname.match(re), url);
      if (result?.raw) {
        res.writeHead(200, { ...SECURITY, ...result.headers });
        res.end(result.body);
        return;
      }
      if (result && typeof result.status === 'number' && result.body) return send(res, result.status, result.body);
      return send(res, 200, result);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Metoda není povolena.');
    return serveStatic(req, res, url);
  }

  const onRequest = (req, res) => {
    handle(req, res).catch((err) => {
      const status = err.status || 500;
      if (status >= 500) console.error('Agenteeq: chyba požadavku', req.method, status);
      if (res.headersSent) {
        res.end();
        return;
      }
      send(res, status, { error: status >= 500 && !err.status ? 'Chyba serveru.' : err.message, ...(err.extra || {}) });
    });
  };

  server = existingServer || http.createServer();
  server.on('request', onRequest);

  // Listener pro místní síť obsluhuje tentýž kód (a tedy i stejnou kontrolu tokenu).
  // Zapne se jen tehdy, když si to uživatel v Nastavení sám zapnul.
  app.bindLan?.(onRequest, () => port());
  // Naslouchat pro síť můžeme teprve tehdy, když hlavní server zná svůj port. Desktopová
  // aplikace si ale port zabírá dřív, než se vůbec načtou data — událost „listening“ tam tedy
  // proběhla už předtím, než jsme se na ni stihli navěsit. Čekat na ni by znamenalo nespustit
  // listener pro telefon nikdy, i když ho uživatel v Nastavení má zapnutý.
  const spustLan = () => { if (app.lan && (datastore.data.settings.lanAccess || datastore.data.settings.tailscaleAccess)) app.lan.start(onRequest, port()); };
  if (server.listening) spustLan();
  else server.on('listening', spustLan);

  server.on('close', () => {
    clearInterval(heartbeat);
    for (const [event, fn] of Object.entries(listeners)) store.off(event, fn);
    for (const res of clients) res.end();
    clients.clear();
    app.lan?.stop().catch(() => {}); // s hlavním serverem zmizí i listener pro telefon
  });

  return server;
}
