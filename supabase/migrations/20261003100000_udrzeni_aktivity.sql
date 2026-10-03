-- Udržení Free projektu v chodu.
--
-- Supabase uspí Free projekt, který týden nemá „dostatečnou uživatelskou aktivitu v databázi“
-- (https://supabase.com/docs/guides/platform/free-project-pausing). Dosavadní denní GET
-- /auth/v1/settings databázi nečte: nastavení Auth jde z konfigurace, ne z Postgresu.
--
-- Tahle funkce je nejmenší skutečný dotaz do databáze, který smí anonymní klíč spustit:
-- `select 1`. Nečte ani nezapisuje žádnou tabulku, nevrací žádná data a běží s právy volajícího.
-- Volá ji jen scripts/supabase-keepalive.mjs z GitHub Actions (POST /rest/v1/rpc/udrzet_aktivitu).

create or replace function public.udrzet_aktivitu()
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select 1;
$$;

comment on function public.udrzet_aktivitu() is 'Denní dotaz z GitHub Actions, aby Supabase Free projekt neuspal. Nečte žádná data.';

revoke all on function public.udrzet_aktivitu() from public;
grant execute on function public.udrzet_aktivitu() to anon, authenticated;
