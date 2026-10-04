import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';

// Přehled účtu na webu (public/js/ucet-web.js): PKCE v prohlížeči, souhrny z Maců a to, že web
// umí jen číst. Prohlížečové API se tu nahradí jen tím, co moduly při načtení potřebují.
globalThis.window ??= { addEventListener() {}, matchMedia: () => ({ matches: false }) };
const { pkcePar, souhrnAgentu, tokenyZaDny, utrataMesice, popisOkna, navratovaAdresa, SLUZBY, platnaRelace, fotoZMetadat } = await import('../public/js/ucet-web.js');
const { SERVICES } = await import('../src/spend.js');
const zdroj = (p) => fs.readFile(new URL(`../${p}`, import.meta.url), 'utf8');

test('PKCE v prohlížeči: výzva je SHA-256 ověřovače v base64url', async () => {
  const { verifier, challenge } = await pkcePar(globalThis.crypto);
  assert.match(verifier, /^[A-Za-z0-9_-]{64}$/);
  assert.equal(challenge, crypto.createHash('sha256').update(verifier).digest('base64url'));
});

test('návrat z přihlášení míří na /app?ucet té stránky, ze které člověk přišel', () => {
  assert.equal(navratovaAdresa({ origin: 'https://agentree-fawn.vercel.app' }), 'https://agentree-fawn.vercel.app/app?ucet');
});

test('souhrny: agenti ze všech Maců dohromady, tokeny za 30 dní, útrata po službách', () => {
  const a = souhrnAgentu([{ working: 2, needs_you: 1, waiting: 0, failed: 0, updated_at: '2026-09-24T10:00:00Z' }, { working: 1, needs_you: 0, waiting: 2, failed: 1, updated_at: '2026-09-24T11:00:00Z' }]);
  assert.deepEqual(a, { working: 3, needs_you: 1, waiting: 2, failed: 1, aktualizovano: Date.parse('2026-09-24T11:00:00Z') });
  const now = Date.UTC(2026, 8, 24, 12);
  const t = tokenyZaDny([{ day: '2026-09-24', provider: 'anthropic', tokens: 100 }, { day: '2026-09-24', provider: 'openai', tokens: 50 }, { day: '2026-08-01', provider: 'openai', tokens: 999 }], now);
  assert.equal(t.hodnoty.length, 30);
  assert.equal(t.hodnoty.at(-1), 150);
  assert.equal(t.celkem, 150, 'den mimo okno 30 dní se nepočítá');
  assert.deepEqual(t.podle, { anthropic: 100, openai: 50 });
  const u = utrataMesice([{ service: 'claude', currency: 'CZK', amount: 2300 }, { service: 'cursor', currency: 'CZK', amount: 460 }, { service: 'claude', currency: 'CZK', amount: 125 }]);
  assert.equal(u.celkem, 2885);
  assert.deepEqual(u.podle[0], ['claude', 2425]);
});

test('okna limitů se pojmenují, neznámá zůstanou, jak přišla', () => {
  assert.equal(popisOkna('anthropic', 'claude-code-five-hour'), 'Claude Code · 5 h');
  assert.equal(popisOkna('anthropic', 'claude-code-seven-day-opus'), 'Claude Code · týden · Opus');
  assert.equal(popisOkna('openai', 'codex-primary'), 'Codex · primary');
  assert.equal(popisOkna('google', 'gemini-daily'), 'Google · gemini daily');
});

test('služby na webu znají všechny služby útraty z aplikace', () => {
  assert.deepEqual(Object.keys(SLUZBY).sort(), Object.keys(SERVICES).sort());
});

test('web jen čte: žádný zápis do tabulek souhrnů, všechno přes escapování', async () => {
  const js = await zdroj('public/js/ucet-web.js');
  const volani = [...js.matchAll(/volej\(`\/rest\/v1\/[^`]*`(?:,\s*\{[^}]*\})?\)/g)].map((m) => m[0]);
  assert.ok(volani.length >= 1);
  assert.doesNotMatch(js, /method: '(?:POST|PATCH|PUT|DELETE)'[^}]*rest\/v1/, 'přehled na webu do souhrnů nezapisuje');
  assert.match(js, /volej\(`\/rest\/v1\/\$\{cesta\}`, \{ token: r\.access \}\)/, 'tabulky se čtou jen GETem s tokenem přihlášeného');
  const boot = await zdroj('public/js/boot.js');
  assert.match(boot, /spustUcetWeb\(\)/);
  assert.match(boot, /else if \(!ucet\) pripojovaciObrazovka\(\);/, 'bez účtu zůstává rozcestník na Mac');
  const config = await zdroj('src/config.js');
  assert.match(config, /import \{ UCET_VYCHOZI \} from '\.\.\/public\/js\/ucet-config\.js'/, 'adresa účtů má jediný zdroj');
});


/* ---------- Spolehlivost přihlášení na webu (4. 10. 2026) ---------- */

// Relaci sdílí všechny záložky v localStorage. Atrapa úložiště a serveru účtů.
function prostredi(odpoved) {
  const data = new Map();
  globalThis.localStorage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: (k) => data.delete(k) };
  const poslane = [];
  globalThis.fetch = async (url, init) => {
    const t = JSON.parse(init.body || '{}').refresh_token;
    poslane.push(t);
    const [status, json] = await odpoved(t);
    return { ok: status < 400, status, json: async () => json };
  };
  const uloz = (r) => data.set('agenteeq-ucet-web', JSON.stringify(r));
  const nacti = () => JSON.parse(data.get('agenteeq-ucet-web') || 'null');
  return { poslane, uloz, nacti };
}
const PROSLA = (refresh) => ({ access: 'a0', refresh, expiresAt: Date.now() - 1000, id: 'u', email: 'eva@example.com', jmeno: 'Eva' });
const VYDANA = (n) => [200, { access_token: `a${n}`, refresh_token: `r${n}`, expires_in: 3600, user: { id: 'u', email: 'eva@example.com', user_metadata: { full_name: 'Eva', avatar_url: 'https://lh3.googleusercontent.com/a/x=s96-c' } } }];

test('web: přetížený server ani výpadek přihlášení nesmaže', async () => {
  for (const status of [429, 500, 503]) {
    const p = prostredi(async () => [status, { message: 'později' }]);
    p.uloz(PROSLA('r1'));
    const r = await platnaRelace();
    assert.equal(r.refresh, 'r1', String(status));
    assert.equal(p.nacti().refresh, 'r1', 'relace zůstala uložená');
  }
});

test('web: když token mezitím obnovila jiná záložka, přihlášení zůstane', async () => {
  let p;
  p = prostredi(async (t) => {
    if (t === 'r1') {
      // Druhá záložka byla rychlejší: token r1 už vyměnila a uložila r2.
      p.uloz({ ...PROSLA('r2'), access: 'a2', expiresAt: Date.now() + 3600e3 });
      return [400, { error_code: 'refresh_token_already_used' }];
    }
    return VYDANA(9);
  });
  p.uloz(PROSLA('r1'));
  const r = await platnaRelace();
  assert.equal(r.refresh, 'r2');
  assert.equal(p.nacti().refresh, 'r2');
});

test('web: odmítnutý token odhlásí; vynucená obnova (401) vydá nový a fotku jen z Googlu', async () => {
  const zamitnuto = prostredi(async () => [400, { error_code: 'refresh_token_not_found' }]);
  zamitnuto.uloz(PROSLA('r1'));
  assert.equal(await platnaRelace(), null);
  assert.equal(zamitnuto.nacti(), null);

  const p = prostredi(async () => VYDANA(5));
  p.uloz({ ...PROSLA('r1'), expiresAt: Date.now() + 3600e3 });
  assert.equal((await platnaRelace()).refresh, 'r1', 'platný token se neobnovuje');
  assert.deepEqual(p.poslane, []);
  const r = await platnaRelace({ vynutit: true });
  assert.equal(r.refresh, 'r5');
  assert.equal(r.foto, 'https://lh3.googleusercontent.com/a/x=s192-c');
  assert.equal(fotoZMetadat({ avatar_url: 'https://evil.example/x.png' }), '');
});

test('web: přihlášení nabídne výběr účtu a obnova běží pod zámkem pro všechny záložky', async () => {
  const src = await zdroj('public/js/ucet-web.js');
  assert.match(src, /prompt: 'select_account'/);
  assert.match(src, /locks\?\.request|zamky\.request\('agenteeq-ucet-obnova'/);
  assert.match(src, /referrerpolicy="no-referrer"/);
});
