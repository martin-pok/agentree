import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { PUBLIC_DIR, VERSION } from './config.js';
import { validateEntry, validateBudgets } from './spend.js';
import { claudeSettingsPath, installHooks, uninstallHooks, hooksStatus } from './hooks-installer.js';
import { SECRET_IDS } from './secrets.js';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const SECURITY = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
};

class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export function createHttpServer(app) {
  const { store, datastore, alerts, config } = app;
  const clients = new Set();
  let server;

  const port = () => server.address()?.port ?? config.port;
  const allowedOrigins = () => new Set([`http://127.0.0.1:${port()}`, `http://localhost:${port()}`]);

  /* ---------- SSE ---------- */

  function broadcast(event, data) {
    if (!clients.size) return;
    const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of clients) res.write(msg);
  }

  const listeners = {
    session: (s) => broadcast('session', s),
    'session:remove': (id) => broadcast('session:remove', { id }),
    transcript: (t) => broadcast('transcript', t),
    runtimes: (l) => broadcast('runtimes', l),
    limits: (l) => broadcast('limits', l),
    credits: (l) => broadcast('credits', l),
    alert: (a) => broadcast('alert', { alert: a, unread: alerts.unread() }),
    'alerts:read': () => broadcast('alerts', { unread: alerts.unread() }),
    spend: (s) => broadcast('spend', s),
    connectors: (l) => broadcast('connectors', l),
    settings: (s) => broadcast('settings', s),
    integrations: (i) => broadcast('integrations', i),
  };
  for (const [event, fn] of Object.entries(listeners)) store.on(event, fn);

  const heartbeat = setInterval(() => {
    for (const res of clients) res.write(': ping\n\n');
  }, 15000);
  heartbeat.unref?.();

  function stream(req, res) {
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
    const given = Buffer.from(String(req.headers['x-dirigent-token'] || ''));
    const expected = Buffer.from(datastore.data.ingestToken);
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
  }

  // Ochrana proti CSRF: vlastní hlavička vynutí CORS preflight, který server nepovolí; navíc kontrola Origin.
  function guardMutation(req) {
    if (req.headers['x-dirigent'] !== '1') throw new HttpError(403, 'Chybí hlavička X-Dirigent.');
    const origin = req.headers.origin;
    if (origin && !allowedOrigins().has(origin)) throw new HttpError(403, 'Nepovolený původ požadavku.');
  }

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

  const routes = [
    ['GET', /^\/api\/health$/, () => ({ ok: true, version: VERSION, ready: store.ready })],
    ['GET', /^\/api\/state$/, () => app.state()],
    ['GET', /^\/api\/sessions\/([^/]+)$/, (_req, m) => {
      const id = decodeURIComponent(m[1]);
      const session = store.summary(id);
      if (!session) throw new HttpError(404, 'Session nenalezena.');
      return { session, transcript: store.transcript(id) };
    }],
    ['GET', /^\/api\/sessions\/([^/]+)\/transcript$/, (_req, m, url) => {
      const entries = store.transcript(decodeURIComponent(m[1]), { after: Number(url.searchParams.get('after')) || 0 });
      if (!entries) throw new HttpError(404, 'Session nenalezena.');
      return { entries };
    }],
    ['POST', /^\/api\/hooks\/claude-code$/, async (req) => {
      if (!tokenOk(req)) throw new HttpError(401, 'Neplatný token.');
      const r = await app.connectors['claude-code'].ingestHook(await readBody(req));
      if (!r.ok) throw new HttpError(400, r.error);
      return r;
    }, { token: true }],
    ['POST', /^\/api\/ingest\/web$/, async (req) => {
      if (!tokenOk(req)) throw new HttpError(401, 'Neplatný token.');
      const r = app.connectors.web.ingest(await readBody(req));
      if (!r.ok) throw new HttpError(400, r.error);
      return r;
    }, { token: true }],
    ['GET', /^\/api\/extension\/pair$/, (req) => {
      if (!/^chrome-extension:\/\/[a-p]{32}$/.test(String(req.headers.origin || ''))) throw new HttpError(403, 'Párování je dostupné jen pro rozšíření Dirigent.');
      return { token: datastore.data.ingestToken, version: VERSION };
    }],
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
        body: 'Takhle tě Dirigent upozorní, když agent bude potřebovat tvé rozhodnutí.',
      });
      return { alert };
    }],
    ['PUT', /^\/api\/settings$/, async (req) => {
      const body = await readBody(req);
      const n = body.notifications && typeof body.notifications === 'object' ? body.notifications : {};
      const cur = datastore.data.settings.notifications;
      for (const k of ['needsInput', 'limits', 'budget', 'done', 'native', 'browser']) if (typeof n[k] === 'boolean') cur[k] = n[k];
      if (n.doneMinSeconds !== undefined) {
        const v = Number(n.doneMinSeconds);
        if (!(v >= 0 && v <= 86400)) throw new HttpError(422, 'Minimální délka úlohy musí být 0–86400 sekund.');
        cur.doneMinSeconds = Math.round(v);
      }
      datastore.save();
      store.emit('settings', datastore.data.settings);
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
    res.writeHead(200, { ...SECURITY, 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : body);
  }

  async function handle(req, res) {
    const host = String(req.headers.host || '').replace(/:\d+$/, '');
    if (host !== '127.0.0.1' && host !== 'localhost') {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Zakázáno');
      return;
    }
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/api/stream' && req.method === 'GET') return stream(req, res);
    if (url.pathname.startsWith('/api/')) {
      const route = routes.find(([method, re]) => method === req.method && re.test(url.pathname));
      if (!route) {
        const known = routes.some(([, re]) => re.test(url.pathname));
        throw new HttpError(known ? 405 : 404, known ? 'Metoda není povolena.' : 'Neznámý endpoint.');
      }
      const [method, re, handler, opts = {}] = route;
      if (method !== 'GET' && !opts.token) guardMutation(req);
      const result = await handler(req, url.pathname.match(re), url);
      if (result && typeof result.status === 'number' && result.body) return send(res, result.status, result.body);
      return send(res, 200, result);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Metoda není povolena.');
    return serveStatic(req, res, url);
  }

  server = http.createServer((req, res) => {
    handle(req, res).catch((err) => {
      const status = err.status || 500;
      if (status >= 500) console.error('Dirigent: chyba požadavku', req.method, req.url, err);
      if (res.headersSent) {
        res.end();
        return;
      }
      send(res, status, { error: status >= 500 && !err.status ? 'Chyba serveru.' : err.message, ...(err.extra || {}) });
    });
  });

  server.on('close', () => {
    clearInterval(heartbeat);
    for (const [event, fn] of Object.entries(listeners)) store.off(event, fn);
    for (const res of clients) res.end();
    clients.clear();
  });

  return server;
}
