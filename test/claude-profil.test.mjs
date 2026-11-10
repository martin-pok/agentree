// Plán a účet Claude živě ze serveru Anthropicu (src/claude-profil.js): dva profily Claude Code =
// dva aktivní účty, každý se svým plánem, bez samostatného CLI. Síť je vždy atrapa.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createClaudeProfily, ucetZProfilu, vyuzitiZOdpovedi, PROFIL_API, VYUZITI_API } from '../src/claude-profil.js';
import { startTestServer, tempDir } from './helpers.mjs';

const UUID_A = '11111111-aaaa-4aaa-8aaa-111111111111';
const UUID_B = '22222222-bbbb-4bbb-8bbb-222222222222';
const ORG = '33333333-cccc-4ccc-8ccc-333333333333';
const profil = (uuid, organization_type, rate_limit_tier = 'default_claude_ai') => ({
  account: { uuid, email: `${uuid.slice(0, 4)}@example.test`, display_name: 'Test', has_claude_max: organization_type === 'claude_max', has_claude_pro: organization_type === 'claude_pro' },
  organization: { uuid: ORG, name: 'Org', organization_type, rate_limit_tier, has_extra_usage_enabled: false },
});
const odpoved = (status, body) => ({ ok: status >= 200 && status < 300, status, headers: new Headers(), json: async () => body });

test('odpověď serveru se převede na účet; bez UUID účtu nic nevymýšlí', () => {
  const u = ucetZProfilu(profil(UUID_A, 'claude_max', 'default_claude_max_20x'));
  assert.equal(u.accountUuid, UUID_A);
  assert.equal(u.organizationType, 'claude_max');
  assert.equal(u.organizationRateLimitTier, 'default_claude_max_20x');
  assert.equal(ucetZProfilu({ account: { uuid: 'x' } }), null);
  assert.equal(ucetZProfilu(null), null);
  assert.equal(ucetZProfilu({ account: { uuid: UUID_A }, organization: { organization_type: '<script>' } }).organizationType, '');
});

test('dotaz jde jen na api.anthropic.com, bez přesměrování, a token se čte jednou', async () => {
  let cteni = 0;
  const volani = [];
  const p = createClaudeProfily({
    cist: async () => { cteni++; return { accessToken: 'tok-A', expiresAt: Date.now() + 3600e3 }; },
    fetchImpl: async (url, opts) => { volani.push({ url, opts }); return odpoved(200, profil(UUID_A, 'claude_pro')); },
  });
  assert.equal((await p.nacti('')).stav, 'ok');
  assert.equal((await p.nacti('')).ucet.accountUuid, UUID_A);
  assert.equal(cteni, 1, 'Klíčenka se nečte při každém obnovení');
  assert.equal(volani.length, 2, 'každé obnovení se ptá serveru – data jsou čerstvá');
  assert.equal(volani[0].url, PROFIL_API);
  assert.equal(new URL(volani[0].url).hostname, 'api.anthropic.com');
  assert.equal(volani[0].opts.redirect, 'error');
  assert.equal(volani[0].opts.headers.Authorization, 'Bearer tok-A');
  assert.ok(volani[0].opts.signal, 'dotaz má časový limit');
});

test('odmítnuté přihlášení ani chyba se nehlásí jako účet; krátký výpadek sítě účet drží', async () => {
  let t = 1_000_000;
  let dalsi = odpoved(200, profil(UUID_A, 'claude_pro'));
  const p = createClaudeProfily({
    now: () => t,
    cist: async () => ({ accessToken: 'tok', expiresAt: 0 }),
    fetchImpl: async () => { if (dalsi instanceof Error) throw dalsi; return dalsi; },
  });
  assert.equal((await p.nacti('')).stav, 'ok');
  dalsi = new Error('offline');
  t += 5 * 60e3;
  const vypadek = await p.nacti('');
  assert.equal(vypadek.stav, 'ok', 'pět minut bez sítě nepřepne účet na „Nelze ověřit“');
  assert.equal(vypadek.zCache, true);
  t += 20 * 60e3;
  assert.equal((await p.nacti('')).stav, 'chyba', 'dlouhý výpadek už je „nevím“, ne starý plán');
  dalsi = odpoved(200, profil(UUID_A, 'claude_pro'));
  assert.equal((await p.nacti('')).stav, 'ok');
  dalsi = odpoved(401, {});
  assert.equal((await p.nacti('')).stav, 'odmitnuto');
  dalsi = new Error('offline');
  assert.equal((await p.nacti('')).stav, 'bez-prihlaseni', 'po odmítnutí se token 10 minut znovu nečte a starý účet se nedrží');
});

test('bez přihlášení se Klíčenka 10 minut znovu neptá', async () => {
  let t = 1_000_000, cteni = 0;
  const p = createClaudeProfily({ now: () => t, cist: async () => { cteni++; return null; }, fetchImpl: async () => { throw new Error('nemá se volat'); } });
  assert.equal((await p.nacti('')).stav, 'bez-prihlaseni');
  t += 60e3;
  await p.nacti('');
  assert.equal(cteni, 1);
  t += 10 * 60e3;
  await p.nacti('');
  assert.equal(cteni, 2);
});

test('dva profily Claude Code = dva aktivní účty se svými plány, i bez samostatného CLI', async () => {
  const druhy = await tempDir('agenteeq-claude-druhy-');
  await fs.mkdir(path.join(druhy, 'projects'), { recursive: true });
  await fs.writeFile(path.join(druhy, '.claude.json'), JSON.stringify({ oauthAccount: { accountUuid: UUID_B } }));
  const sourceHome = await tempDir('agenteeq-claude-prvni-');
  await fs.mkdir(path.join(sourceHome, '.claude', 'projects'), { recursive: true });
  await fs.writeFile(path.join(sourceHome, '.claude.json'), JSON.stringify({ oauthAccount: { accountUuid: UUID_A, subscriptionCreatedAt: '2026-01-05T10:00:00Z' } }));
  const dotazy = [];
  const claudeProfily = { nacti: async (configDir) => {
    dotazy.push(configDir);
    if (configDir === '') return { stav: 'ok', ucet: ucetZProfilu(profil(UUID_A, 'claude_max', 'default_claude_max_5x')) };
    if (configDir === druhy) return { stav: 'ok', ucet: ucetZProfilu(profil(UUID_B, 'claude_pro')) };
    return { stav: 'bez-prihlaseni' };
  }, vyuziti: async (configDir) => (configDir === '' ? vyuzitiZOdpovedi({ five_hour: { utilization: 42, resets_at: new Date(Date.now() + 3600e3).toISOString() }, seven_day: { utilization: 7, resets_at: new Date(Date.now() + 86400e3).toISOString() } })
    : configDir === druhy ? vyuzitiZOdpovedi({ five_hour: { utilization: 91, resets_at: new Date(Date.now() + 1800e3).toISOString() } }) : null) };
  const srv = await startTestServer({ AGENTEEQ_SOURCE_HOME: sourceHome, AGENTEEQ_CLAUDE_CONFIG_DIR: druhy }, { claudeProfily });
  try {
    assert.ok(dotazy.includes('') && dotazy.includes(druhy), 'každý profil se ptá zvlášť');
    const data = srv.app.spendPayload();
    const claude = data.providerAccounts.filter((a) => a.service === 'claude');
    assert.equal(claude.filter((a) => a.active).length, 2, 'oba účty jsou aktivní');
    assert.equal(claude.some((a) => a.state === 'unavailable'), false, 'žádné „Nelze ověřit“');
    const plany = data.subscriptions.items?.filter?.((x) => x.service === 'claude') ?? data.subscriptions.filter?.((x) => x.service === 'claude');
    assert.ok(plany, 'Zjištěné plány obsahují Claude');
    const text = JSON.stringify(plany);
    assert.match(text, /max5x/);
    assert.match(text, /"pro"/);
    assert.match(text, /ověřený na serveru Anthropicu/);
    assert.match(text, /2026-01-05/, 'datum předplatného z místního účtu, jen když jde o stejný účet');
    // Vytížení: každý účet své okno, přesná procenta ze serveru, bez míchání licencí.
    const a = claude.find((x) => x.plan === 'max5x');
    const b = claude.find((x) => x.plan === 'pro');
    assert.equal(a.limits.find((l) => l.key.startsWith('claude:five_hour'))?.primary.usedPercent, 42);
    assert.equal(a.limits.find((l) => l.key.startsWith('claude:seven_day'))?.primary.usedPercent, 7);
    assert.equal(b.limits.find((l) => l.key.startsWith('claude:five_hour'))?.primary.usedPercent, 91);
    assert.equal(b.limits.some((l) => l.key.startsWith('claude:seven_day')), false, 'chybějící okno se nedosadí nulou');
  } finally {
    await srv.close();
  }
});

test('server nedostupný a CLI chybí: Claude zůstane „Nelze ověřit“, ne „žádný plán“', async () => {
  const sourceHome = await tempDir('agenteeq-claude-offline-');
  await fs.writeFile(path.join(sourceHome, '.claude.json'), JSON.stringify({ oauthAccount: { accountUuid: UUID_A, organizationType: 'claude_max' } }));
  const srv = await startTestServer({ AGENTEEQ_SOURCE_HOME: sourceHome }, { claudeProfily: { nacti: async () => ({ stav: 'chyba' }) } });
  try {
    const claude = srv.app.spendPayload().providerAccounts.filter((a) => a.service === 'claude');
    assert.equal(claude.some((a) => a.active), false, 'starý soubor na disku není ověřené přihlášení');
    assert.equal(claude.find((a) => !a.id)?.state, 'unavailable');
  } finally {
    await srv.close();
  }
});

test('vytížení: procenta 0–100 a čas obnovy přesně jako /usage v Claude Code', () => {
  const v = vyuzitiZOdpovedi({ five_hour: { utilization: 63.4, resets_at: '2026-11-11T03:00:00.000Z' }, seven_day: { utilization: 120, resets_at: null }, seven_day_sonnet: { utilization: 1 } });
  assert.deepEqual(v.five_hour, { usedPercent: 63.4, resetsAt: Date.parse('2026-11-11T03:00:00.000Z') });
  assert.deepEqual(v.seven_day, { usedPercent: 100, resetsAt: null });
  assert.equal(vyuzitiZOdpovedi({ five_hour: { utilization: null } }), null, 'bez čísla žádné vymyšlené 0 %');
  assert.equal(vyuzitiZOdpovedi({}), null);
  assert.equal(vyuzitiZOdpovedi({ five_hour: { utilization: 5, resets_at: 1794400000 } }).five_hour.resetsAt, 1794400000000, 'sekundy i milisekundy');
});

test('vytížení: dotaz jen na api.anthropic.com bez přesměrování; po 429 pauza, nic se nevymýšlí', async () => {
  let t = 1_000_000;
  const volani = [];
  let status = 200;
  const p = createClaudeProfily({
    now: () => t,
    cist: async () => ({ accessToken: 'tok', expiresAt: 0 }),
    fetchImpl: async (url, opts) => { volani.push({ url, opts }); return { ok: status === 200, status, headers: new Headers(status === 429 ? { 'retry-after': '600' } : {}), json: async () => ({ five_hour: { utilization: 12, resets_at: new Date(t + 3600e3).toISOString() } }) }; },
  });
  assert.equal((await p.vyuziti('')).five_hour.usedPercent, 12);
  assert.equal(volani[0].url, VYUZITI_API);
  assert.equal(volani[0].opts.redirect, 'error');
  assert.equal(volani[0].opts.headers['anthropic-beta'], 'oauth-2025-04-20');
  status = 429;
  assert.equal(await p.vyuziti(''), null);
  status = 200;
  t += 5 * 60e3;
  assert.equal(await p.vyuziti(''), null, 'server řekl 10 minut – do té doby se neptá');
  assert.equal(volani.length, 2);
  t += 6 * 60e3;
  assert.equal((await p.vyuziti('')).five_hour.usedPercent, 12);
});
