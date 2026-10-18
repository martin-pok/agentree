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
  const h = '2026-10-07T09';
  const o = odhadCenyApi([
    { model: 'claude-opus-5-5', hourlyUsage: { [h]: { 'claude-opus-5-5': [1e6, 1e6, 1e6, 1e6, 0] } } },
    { model: 'claude-sonnet-4-6', hourlyUsage: { [h]: { 'claude-sonnet-4-6': [2e6, 0, 0, 0, 0] } } },
    { model: 'gpt-5', hourlyUsage: { [h]: { 'gpt-5': [500, 500, 0, 0, 0] } } },
    { model: 'claude-opus-5', hourlyUsage: {} },
  ]);
  assert.equal(Math.round(o.usd * 100) / 100, 4 + 20 + 0.2 + 5 + 6);
  assert.equal(o.sCenou, 6e6);
  assert.equal(o.bezCeny, 1000);
  assert.deepEqual(o.modelyBezCeny, ['gpt-5']);
  assert.deepEqual(odhadCenyApi([]), { usd: 0, sCenou: 0, bezCeny: 0, modelyBezCeny: [] });
});
