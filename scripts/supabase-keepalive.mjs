/**
 * Jediný neosobní požadavek na API pro udržení Free projektu Supabase aktivního.
 * Nečte ani nezapisuje řádky a neobsahuje žádný uživatelský token.
 */
import { UCET_VYCHOZI } from '../public/js/ucet-config.js';

export function keepaliveRequest(config = UCET_VYCHOZI) {
  const url = new URL('/auth/v1/settings', config.url);
  return {
    url,
    options: {
      headers: {
        apikey: config.klic,
        'Cache-Control': 'no-store',
      },
    },
  };
}

export async function keepalive(fetchImpl = globalThis.fetch) {
  const request = keepaliveRequest();
  const response = await fetchImpl(request.url, request.options);
  if (!response.ok) throw new Error(`Supabase Auth vrátil ${response.status}.`);
  return response.status;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const status = await keepalive();
    console.log(`Supabase Auth je dostupný (${status}).`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
