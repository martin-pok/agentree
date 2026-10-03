import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { keepalive, keepaliveRequest } from '../scripts/supabase-keepalive.mjs';

// Supabase uspí Free projekt bez aktivity v databázi. Udržovací běh proto musí skutečně spustit
// dotaz v Postgresu (RPC `udrzet_aktivitu` = `select 1`), ne jen sáhnout na API Auth.

test('keepalive volá databázovou funkci, ne nastavení Auth, a bez uživatelského tokenu', () => {
  const { url, options } = keepaliveRequest({ url: 'https://example.supabase.co', klic: 'public-key' });
  assert.equal(url.toString(), 'https://example.supabase.co/rest/v1/rpc/udrzet_aktivitu');
  assert.equal(options.method, 'POST');
  assert.equal(options.headers.apikey, 'public-key');
  assert.equal(options.headers.Authorization, undefined, 'žádný uživatelský token');
  assert.equal(options.body, '{}');
});

test('keepalive projde jen tehdy, když databáze dotaz opravdu provedla', async () => {
  assert.equal(await keepalive(async () => new Response('1', { status: 200 })), 200);
  await assert.rejects(() => keepalive(async () => new Response('', { status: 540 })), /Supabase vrátil 540/);
  await assert.rejects(() => keepalive(async () => new Response('{"code":"PGRST202"}', { status: 404 })), /Nasaď migraci/);
  await assert.rejects(() => keepalive(async () => new Response('null', { status: 200 })), /nevrátil očekávaný výsledek/);
});

test('funkce pro udržení aktivity nečte data a anon dostane jen ji', async () => {
  const sql = await fs.readFile(new URL('../supabase/migrations/20261003100000_udrzeni_aktivity.sql', import.meta.url), 'utf8');
  const kod = sql.replace(/--.*$/gm, '');
  assert.match(kod, /security invoker/);
  assert.match(kod, /set search_path = ''/);
  assert.match(kod, /\$\$\s*select 1;\s*\$\$/, 'tělo je jen select 1');
  assert.doesNotMatch(kod, /\bfrom\b(?!\s+public;)/i, 'funkce nečte žádnou tabulku');
  assert.match(kod, /revoke all on function public\.udrzet_aktivitu\(\) from public;/);
  assert.match(kod, /grant execute on function public\.udrzet_aktivitu\(\) to anon, authenticated;/);
  assert.match(await fs.readFile(new URL('../supabase/tests/rls.sql', import.meta.url), 'utf8'), /udrzet_aktivitu/);
});
