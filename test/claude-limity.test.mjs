import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadConfig } from '../src/config.js';
import { Store } from '../src/store.js';
import { createSession, deriveStatus } from '../src/model.js';
import { applyClaudeLine, newFileState, quotaLimit, createClaudeCodeConnector } from '../src/connectors/claude-code.js';
import { applyPlanUsageSample } from '../src/connectors/claude-desktop-usage.js';
import { currentLimits, limitWindows, limitGauges, limitObnova } from '../public/js/ui.js';
import { limitsAll } from '../public/js/limits-ui.js';
import { tempDir, writeJsonl, fakeDatastore } from './helpers.mjs';

// Claude Code v aplikaci Claude stavový řádek nespouští, takže přesná okna limitů Claude chyběla.
// Zdroje navíc: odmítnutí 429 s `quotaLimits` v přepisu a čerstvý vzorek historie Claude Desktopu.
// Všechna data v tomto souboru jsou umělá.

const MIN = 60e3;
const H = 3600e3;
const T0 = Date.parse('2026-10-04T08:00:00Z');
const iso = (ms) => new Date(ms).toISOString();
const RESET_S = Math.floor((T0 + 2 * H) / 1000);

function odmitnuti(ts, quota = {}, extra = {}) {
  return {
    type: 'assistant',
    timestamp: iso(ts),
    isApiErrorMessage: true,
    apiErrorStatus: 429,
    error: 'rate_limit',
    entrypoint: 'claude-desktop',
    sessionId: 'S1',
    message: { id: `err-${ts}`, model: '<synthetic>', role: 'assistant', stop_reason: 'stop_sequence', content: [{ type: 'text', text: "You've hit your session limit · resets 10am (Europe/Prague)" }] },
    quotaLimits: {
      status: 'rejected',
      resetsAt: RESET_S,
      unifiedRateLimitFallbackAvailable: false,
      rateLimitType: 'five_hour',
      overageStatus: 'rejected',
      overageDisabledReason: 'org_level_disabled',
      upgradePaths: ['upgrade_plan'],
      isUsingOverage: false,
      ...quota,
    },
    ...extra,
  };
}

const uspech = (ts, id = `ok-${ts}`) => ({
  type: 'assistant', timestamp: iso(ts), sessionId: 'S1',
  message: { id, model: 'claude-opus-5', stop_reason: 'end_turn', content: [{ type: 'text', text: 'Hotovo.' }], usage: { input_tokens: 1, output_tokens: 1 } },
});

test('quotaLimits five_hour: vyčerpáno s přesným časem obnovy od serveru', () => {
  const l = quotaLimit(odmitnuti(T0), T0);
  assert.equal(l.id, 'claude:five_hour:quota');
  assert.equal(l.label, 'Limit 5 h');
  assert.equal(l.windowMinutes, 300);
  assert.equal(l.resetsAt, RESET_S * 1000, 'epoch v sekundách → ms, beze změny');
  assert.equal(l.reached, true);
  assert.equal(l.usedPercent, 100);
  assert.equal(l.at, T0, 'čas měření = čas záznamu');
  assert.equal(l.source, 'transcript-quota');
  assert.equal(l.kind, 'window');
  assert.equal(l.provider, 'anthropic');
  assert.equal(l.overage, 'off', 'důvod vypnutí → dokupované využití vypnuté');
});

test('quotaLimits seven_day a další známé druhy dostanou čitelný název', () => {
  const t = quotaLimit(odmitnuti(T0, { rateLimitType: 'seven_day' }), T0);
  assert.equal(t.id, 'claude:seven_day:quota');
  assert.equal(t.label, 'Týdenní limit');
  assert.equal(t.windowMinutes, 10080);
  const opus = quotaLimit(odmitnuti(T0, { rateLimitType: 'seven_day_opus' }), T0);
  assert.equal(opus.label, 'Týdenní limit · Opus');
  assert.equal(opus.id, 'claude:seven_day_opus:quota');
  const extra = quotaLimit(odmitnuti(T0, { rateLimitType: 'overage' }), T0);
  assert.equal(extra.kind, 'spend', 'vyčerpané extra usage není okno předplatného');
});

test('quotaLimits: neznámý druh je obecný limit, nic se nedomýšlí', () => {
  const nove = quotaLimit(odmitnuti(T0, { rateLimitType: 'monthly_new' }), T0);
  assert.equal(nove.id, 'claude:quota:monthly_new:quota');
  assert.equal(nove.label, 'Limit využití');
  assert.equal(nove.windowMinutes, null, 'délka neznámého okna se nehádá');
  const bez = quotaLimit(odmitnuti(T0, { rateLimitType: undefined }), T0);
  assert.equal(bez.id, 'claude:quota:quota');
  const divny = quotaLimit(odmitnuti(T0, { rateLimitType: '../<b>' }), T0);
  assert.equal(divny.id, 'claude:quota:quota', 'nečekaný řetězec se do id nepropíše');
  assert.equal(quotaLimit(odmitnuti(T0, { rateLimitType: 'constructor' }), T0).label, 'Limit využití', 'vlastnosti prototypu nejsou druh okna');
});

test('quotaLimits: dokupované využití jen podle toho, co pole říkají', () => {
  assert.equal(quotaLimit(odmitnuti(T0, { isUsingOverage: true, overageStatus: 'allowed', overageDisabledReason: undefined }), T0).overage, 'on');
  assert.equal(quotaLimit(odmitnuti(T0, { isUsingOverage: false }), T0).overage, 'off');
  assert.equal(quotaLimit(odmitnuti(T0, { isUsingOverage: false, overageDisabledReason: undefined }), T0).overage, null, 'bez důvodu vypnutí nevíme');
  assert.equal(quotaLimit(odmitnuti(T0, { isUsingOverage: undefined, overageDisabledReason: undefined }), T0).overage, null);
  assert.equal(quotaLimit(odmitnuti(T0, { isUsingOverage: 'true' }), T0).overage, null, 'jen skutečné true/false se bere vážně');
});

test('quotaLimits: poškozené nebo jiné záznamy se ignorují, nerozpoznaný čas obnovy je null', () => {
  assert.equal(quotaLimit({ ...odmitnuti(T0), isApiErrorMessage: false }, T0), null);
  assert.equal(quotaLimit(odmitnuti(T0, { status: 'allowed_warning' }), T0), null, 'varování není vyčerpání');
  assert.equal(quotaLimit({ ...odmitnuti(T0), quotaLimits: [] }, T0), null);
  assert.equal(quotaLimit({ ...odmitnuti(T0), quotaLimits: 'rejected' }, T0), null);
  assert.equal(quotaLimit({ ...odmitnuti(T0), quotaLimits: null }, T0), null);
  assert.equal(quotaLimit(odmitnuti(T0), NaN), null);
  assert.equal(quotaLimit(odmitnuti(T0, { resetsAt: String(RESET_S) }), T0).resetsAt, null, 'řetězec se nepřevádí');
  assert.equal(quotaLimit(odmitnuti(T0, { resetsAt: RESET_S * 1000 }), T0).resetsAt, null, 'milisekundy nejsou ověřený tvar');
  assert.equal(quotaLimit(odmitnuti(T0, { resetsAt: 1.5e9 + 0.5 }), T0).resetsAt, null);
  assert.equal(quotaLimit(odmitnuti(T0, { resetsAt: undefined }), T0).resetsAt, null);
});

test('přepis: odmítnutí 429 nastaví stav relace s přesnou obnovou a nezdvojí limit z textu', () => {
  const s = createSession({ connector: 'claude-code', localId: 'S1', provider: 'anthropic', app: 'Claude Code' });
  const st = newFileState();
  const quota = [];
  const text = [];
  const hooks = { onQuota: (l) => quota.push(l), onLimit: (l) => text.push(l) };
  applyClaudeLine(st, s, uspech(T0 - MIN), hooks);
  applyClaudeLine(st, s, odmitnuti(T0), hooks);
  assert.equal(quota.length, 1);
  assert.equal(text.length, 0, 'odhad z textu „session limit“ by byl druhý řádek téhož okna');
  assert.equal(s.limit.resetsAt, RESET_S * 1000, 'relace má přesný čas obnovy, ne čas přečtený z textu');
  assert.equal(deriveStatus(s, T0 + MIN).status, 'limited');
  // Záznam bez quotaLimits (starší Claude Code) dál jde přes text.
  applyClaudeLine(st, s, { ...odmitnuti(T0 + 2 * MIN), quotaLimits: undefined }, hooks);
  assert.equal(text.length, 1);
});

async function konektor(rows) {
  const home = await tempDir();
  const config = loadConfig({ AGENTEEQ_SOURCE_HOME: home, AGENTEEQ_HOME: path.join(home, 'app') });
  const store = new Store({ config, datastore: fakeDatastore() });
  const file = path.join(home, '.claude', 'projects', '-Users-x-proj', 'S1.jsonl');
  await writeJsonl(file, rows);
  const c = createClaudeCodeConnector({ store, config });
  await c.scan();
  await c.idle?.();
  return { store, c };
}

test('konektor: úspěšná odpověď před obnovou odmítnutí nesmaže, okno zmizí až po obnově', async () => {
  const now = Date.now();
  const reset = Math.floor((now + 2 * H) / 1000);
  const { store, c } = await konektor([
    odmitnuti(now - 20 * MIN, { resetsAt: reset }),
    uspech(now - 10 * MIN),
  ]);
  try {
    const l = store.limits.get('claude:five_hour:quota');
    assert.ok(l, 'odmítnutí z přepisu Claude Desktopu → Code se zapíše jako okno');
    assert.equal(l.reached, true, 'úspěch před obnovou (jiný účet, dokupované využití) okno neuvolní');
    assert.equal(l.resetsAt, reset * 1000);
    assert.equal(store.limits.has('claude:session:claude-opus-5'), false, 'žádný druhý řádek z textu');
    assert.equal(currentLimits(store.limitList(), now).length, 1);
    assert.equal(currentLimits(store.limitList(), reset * 1000 + 1).length, 0, 'po obnově zmizí');
  } finally {
    c.stop();
  }
});

test('živá okna: odmítnutí platí do obnovy i po 30 minutách, ale ne déle', () => {
  const now = T0 + 90 * MIN;
  const q = quotaLimit(odmitnuti(T0), T0);
  const rows = currentLimits([q], now);
  assert.equal(rows.length, 1, 'vyčerpání s přesnou obnovou drží až do obnovy, i když je hláška 90 min stará');
  assert.equal(currentLimits([q], RESET_S * 1000).length, 0);
  assert.equal(currentLimits([{ ...q, resetsAt: null }], now).length, 0, 'bez času obnovy platí běžných 30 minut');
  assert.equal(currentLimits([{ ...q, resetsAt: null }], T0 + 29 * MIN).length, 1);
});

test('přednost: stavový řádek > odmítnutí > historie Desktopu, mezi přesnými rozhoduje novější měření', () => {
  const q = quotaLimit(odmitnuti(T0), T0);
  const status = (at, pct) => ({ id: 'claude:five_hour', provider: 'anthropic', app: 'Claude', label: 'Limit 5 h', usedPercent: pct, windowMinutes: 300, resetsAt: RESET_S * 1000, reached: pct >= 100, at, source: 'statusline', kind: 'window' });
  const hist = (at, pct) => ({ id: 'claude:five_hour:history', provider: 'anthropic', app: 'Claude', label: 'Limit 5 h', usedPercent: pct, windowMinutes: 300, resetsAt: null, reached: false, at, source: 'plan-history', kind: 'window' });

  let r = currentLimits([q, status(T0, 100)], T0 + MIN);
  assert.equal(r.length, 1);
  assert.equal(r[0].source, 'statusline', 'při shodném čase vyhrává stavový řádek');

  r = currentLimits([q, status(T0 - 10 * MIN, 42)], T0 + MIN);
  assert.equal(r[0].source, 'transcript-quota', 'pozdější odmítnutí je pravdivější než starší 42 %');

  r = currentLimits([q, hist(T0 + 10 * MIN, 30)], T0 + 11 * MIN);
  assert.equal(r.length, 1);
  assert.equal(r[0].source, 'transcript-quota', 'pozdější vzorek historie přesné odmítnutí nepřepíše');

  r = currentLimits([hist(T0, 30)], T0 + MIN);
  assert.equal(r[0].source, 'plan-history', 'bez přesného měření zůstane čerstvá historie');
});

test('historie Claude Desktopu: 29 minut stará je živá, 31 minut jen v grafu', () => {
  const home = '/tmp/nepouzito';
  const config = loadConfig({ AGENTEEQ_SOURCE_HOME: home, AGENTEEQ_HOME: home });
  const store = new Store({ config, datastore: fakeDatastore() });
  applyPlanUsageSample(store, { t: T0, org: 'org_x', u: { fh: 64, sd: 23 } });
  const limity = store.limitList();
  const ted = currentLimits(limity, T0 + 29 * MIN);
  assert.deepEqual(ted.map((l) => l.usedPercent).sort((a, b) => a - b), [23, 64]);
  assert.ok(ted.every((l) => l.resetsAt === null), 'čas obnovy se z historie nedopočítává');
  assert.equal(limitObnova(ted[0], T0 + 29 * MIN).text, 'obnova neznámá · podle Claude Desktopu');
  assert.equal(currentLimits(limity, T0 + 31 * MIN).length, 0, 'starší vzorek není aktuální stav');
  assert.equal(currentLimits(limity, T0 + 30 * MIN).length, 2, 'hranice 30 minut včetně');
});

test('Přehled a Statistiky: Claude vedle Codexu, s logem, obnovou a poznámkou o dokupovaném využití', () => {
  const now = T0 + 5 * MIN;
  const limity = [
    { id: 'codex:codex:primary', provider: 'openai', app: 'Codex', label: 'Limit 5 h', usedPercent: 34, windowMinutes: 300, resetsAt: now + H, reached: false, at: now, kind: 'window' },
    quotaLimit(odmitnuti(T0), T0),
    { id: 'claude:seven_day:history', provider: 'anthropic', app: 'Claude', label: 'Týdenní limit', usedPercent: 41, windowMinutes: 10080, resetsAt: null, reached: false, at: now - 3 * MIN, source: 'plan-history', kind: 'window' },
  ];
  const html = limitWindows(limity, now);
  assert.equal((html.match(/class="lwin-row"/g) || []).length, 3);
  assert.match(html, /Claude · Limit 5 h[\s\S]*Vyčerpáno[\s\S]*dokupované využití vypnuté[\s\S]*data-until="\d+"/);
  assert.match(html, /Claude · Týdenní limit[\s\S]*41 %[\s\S]*obnova neznámá · podle Claude Desktopu/);
  assert.match(html, /Codex · Limit 5 h/);
  assert.equal((html.match(/lwin-logo/g) || []).length, 3, 'každý řádek má logo poskytovatele');
  const gauges = limitGauges(limity, now).join('');
  assert.match(gauges, /Claude · Limit 5 h/);
  assert.match(gauges, /dokupované využití vypnuté/);
  assert.match(gauges, /Claude · Týdenní limit/);
  assert.doesNotMatch(html + gauges, /undefined|NaN/);
});

test('Všechny nástroje: Claude bez čerstvého měření řekne proč a co udělat', () => {
  const now = T0;
  const base = { limits: [], sessions: new Map(), integrations: {} };
  const sDesktopem = limitsAll({ ...base, connectors: [{ id: 'claude-code', state: 'connected' }, { id: 'claude-desktop-usage', state: 'connected' }] }, now);
  assert.match(sDesktopem, /Žádné čerstvé měření – v Claude Desktopu otevři Nastavení → Využití, nebo propoj Claude Code v Nastavení a spusť ho v Terminálu\./);
  const bezDesktopu = limitsAll({ ...base, integrations: { claudeHooks: { installed: true, current: true } }, connectors: [{ id: 'claude-code', state: 'connected' }, { id: 'claude-desktop-usage', state: 'missing' }] }, now);
  assert.match(bezDesktopu, /Žádné čerstvé měření – spusť Claude Code v Terminálu se stavovým řádkem\./);
  assert.doesNotMatch(bezDesktopu, /Claude Desktopu otevři/, 'cestu přes Desktop nenabízí, když Desktop na počítači není');
  // S čerstvým měřením poznámka zmizí a řádek ukáže okno.
  const sDaty = limitsAll({ ...base, limits: [quotaLimit(odmitnuti(T0 - MIN), T0 - MIN)], connectors: [{ id: 'claude-code', state: 'connected' }] }, now);
  assert.doesNotMatch(sDaty, /Žádné čerstvé měření/);
  assert.match(sDaty, /Limit 5 h<\/span><b>Vyčerpáno/);
});
