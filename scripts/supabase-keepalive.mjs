/**
 * Jeden neosobní dotaz do databáze, aby Supabase Free projekt neuspal (docs/ACCOUNTS.md).
 *
 * Supabase počítá jen aktivitu v databázi. Dřívější GET /auth/v1/settings ji nevytvářel, protože
 * nastavení Auth nejde z Postgresu. Funkce `public.udrzet_aktivitu()` (supabase/migrations) je
 * `select 1`: nečte ani nezapisuje žádnou tabulku a spustí ji i publikovatelný klíč.
 * Neobsahuje žádný uživatelský token a odpověď se nikam nevypisuje.
 */
import { UCET_VYCHOZI } from '../public/js/ucet-config.js';

export function keepaliveRequest(config = UCET_VYCHOZI) {
  const url = new URL('/rest/v1/rpc/udrzet_aktivitu', config.url);
  return {
    url,
    options: {
      method: 'POST',
      headers: {
        apikey: config.klic,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
      body: '{}',
    },
  };
}

export async function keepalive(fetchImpl = globalThis.fetch) {
  const request = keepaliveRequest();
  const response = await fetchImpl(request.url, request.options);
  if (response.status === 404) {
    throw new Error('Supabase nezná funkci udrzet_aktivitu (404). Nasaď migraci supabase/migrations/20261003100000_udrzeni_aktivity.sql.');
  }
  if (!response.ok) throw new Error(`Supabase vrátil ${response.status}.`);
  // Úspěch je jen skutečně provedený dotaz: funkce vrací 1. Jiná odpověď = databáze dotaz neprovedla.
  const vysledek = await response.json().catch(() => null);
  if (vysledek !== 1) throw new Error('Supabase odpověděl, ale dotaz do databáze nevrátil očekávaný výsledek.');
  return response.status;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const status = await keepalive();
    console.log(`Databáze Supabase odpověděla na udržovací dotaz (${status}).`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
