import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';

// Přehled účtu na webu (public/js/ucet-web.js): PKCE v prohlížeči, souhrny z Maců a to, že web
// umí jen číst. Prohlížečové API se tu nahradí jen tím, co moduly při načtení potřebují.
globalThis.window ??= { addEventListener() {}, matchMedia: () => ({ matches: false }) };
const { pkcePar, souhrnAgentu, tokenyZaDny, utrataMesice, popisOkna, navratovaAdresa, SLUZBY } = await import('../public/js/ucet-web.js');
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
