import test from 'node:test';
import assert from 'node:assert/strict';
import { klicModelu, cenaModelu, odhadCenyApi, CENIK_API_OVERENO } from '../public/js/cenik-api.js';

// Odhad ceny přes API (projekty, roadmapa v0.6 #6): jen modely s ověřeným ceníkem, nic se nedohaduje.

test('ceník API: ID modelu z přepisu najde svou cenu, cizí a staré modely ne', () => {
  assert.equal(klicModelu('claude-opus-4-7'), 'opus-4.7');
  assert.equal(klicModelu('claude-opus-4-7[1m]'), 'opus-4.7');
  assert.equal(klicModelu('claude-sonnet-4-5-20250929'), 'sonnet-4.5');
  assert.equal(klicModelu('claude-opus-4-20250514'), 'opus-4', 'datum se nesplete s verzí');
  assert.equal(klicModelu('claude-opus-5-5'), 'opus-5.5');
  assert.equal(klicModelu('claude-opus-5'), 'opus-5');
  assert.deepEqual(cenaModelu('claude-opus-5-5'), [4, 20, 0.2, 5]);
  assert.deepEqual(cenaModelu('claude-fable-5-1'), [10, 50, 0.25, 12.5]);
  for (const bez of ['gpt-5', 'gemini-2.5-pro', 'claude-3-5-sonnet-20241022', 'claude-haiku-5-5', '', null]) assert.equal(cenaModelu(bez), null, String(bez));
  assert.match(CENIK_API_OVERENO, /^\d{4}-\d{2}-\d{2}$/);
});

test('ceník API: odhad sečte všechny druhy tokenů a řekne, co nepokryl', () => {
  const o = odhadCenyApi([
    { model: 'claude-opus-5-5', tokens: { input: 1e6, output: 1e6, cacheRead: 1e6, cacheWrite: 1e6 } },
    { model: 'claude-sonnet-4-6', tokens: { input: 2e6, output: 0, cacheRead: 0, cacheWrite: 0 } },
    { model: 'gpt-5', tokens: { input: 500, output: 500, cacheRead: 0, cacheWrite: 0 } },
    { model: 'claude-opus-5', tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } },
  ]);
  assert.equal(Math.round(o.usd * 100) / 100, 4 + 20 + 0.2 + 5 + 6);
  assert.equal(o.sCenou, 6e6);
  assert.equal(o.bezCeny, 1000);
  assert.deepEqual(o.modelyBezCeny, ['gpt-5']);
  assert.deepEqual(odhadCenyApi([]), { usd: 0, sCenou: 0, bezCeny: 0, modelyBezCeny: [] });
});
