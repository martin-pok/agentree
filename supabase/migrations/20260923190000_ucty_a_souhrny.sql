-- Agenteeq v cloudu: účet a souhrny. Nic víc.
--
-- Co sem smí: účet (Google), zařízení, která napojení fungují, tokeny po dnech, útrata po
-- měsících, limity a počty agentů podle stavu. Co sem nesmí nikdy: text konverzací, jejich
-- názvy, cesty ke složkám, poznámky k výdajům ani cokoli z obsahu práce. Hlídá to seznam
-- povolených polí v src/cloud-sync.js a test/cloud-sync.test.mjs; tahle tabulka polí je druhá
-- pojistka – textový sloupec, do kterého by se dal obsah vložit, tu prostě není.
--
-- Každý řádek patří jednomu uživateli (user_id) a čte ho i mění jen on (RLS). Anonymní klíč
-- bez přihlášení nepřečte nic.

-- ---------- Pomocné funkce (mimo veřejné API) ----------

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.nastav_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------- Profil ----------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 120),
  -- Tarif mění jen server (platby), nikdy klient – viz oprávnění ke sloupcům níž.
  plan text not null default 'free' check (plan in ('free', 'pro', 'team')),
  -- Synchronizace souhrnů je opt-in: dokud ji uživatel nezapne, Mac nic neposílá.
  sync_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function private.nastav_updated_at();

-- Profil vznikne s účtem. Jméno se bere z Google účtu, e-mail zůstává jen v auth.users.
create or replace function private.zaloz_profil()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'), 120));
  return new;
end;
$$;

create trigger zaloz_profil after insert on auth.users
  for each row execute function private.zaloz_profil();

-- ---------- Zařízení ----------

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  platform text not null check (platform in ('macos', 'windows', 'linux')),
  app_version text check (app_version ~ '^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$'),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index devices_user_id on public.devices (user_id);

-- ---------- Napojení (co funguje, ne čím) ----------
-- Žádné klíče ani tokeny: API klíče zůstávají v Klíčence na Macu.

create table public.connections (
  device_id uuid not null references public.devices (id) on delete cascade,
  provider text not null check (provider ~ '^[a-z0-9-]{2,40}$'),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('agent', 'web', 'api')),
  plan text check (plan ~ '^[A-Za-z0-9 +._-]{1,40}$'),
  state text not null check (state in ('connected', 'needs_login', 'error')),
  connected_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (device_id, provider)
);
create index connections_user_id on public.connections (user_id);
create trigger connections_updated_at before update on public.connections
  for each row execute function private.nastav_updated_at();

-- ---------- Tokeny po dnech ----------

create table public.usage_daily (
  device_id uuid not null references public.devices (id) on delete cascade,
  day date not null,
  provider text not null check (provider ~ '^[a-z0-9-]{2,40}$'),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  cache_read_tokens bigint not null default 0 check (cache_read_tokens >= 0),
  cache_write_tokens bigint not null default 0 check (cache_write_tokens >= 0),
  sessions integer not null default 0 check (sessions >= 0),
  updated_at timestamptz not null default now(),
  primary key (device_id, day, provider)
);
create index usage_daily_user_day on public.usage_daily (user_id, day);
create trigger usage_daily_updated_at before update on public.usage_daily
  for each row execute function private.nastav_updated_at();

-- ---------- Útrata po měsících ----------
-- Součty podle služby a druhu. Poznámky k výdajům zůstávají na Macu.

create table public.spend_monthly (
  device_id uuid not null references public.devices (id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  service text not null check (service ~ '^[a-z0-9-]{2,40}$'),
  kind text not null check (kind in ('subscription', 'credits', 'api', 'other')),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  amount numeric(12, 2) not null check (amount >= 0),
  updated_at timestamptz not null default now(),
  primary key (device_id, month, service, kind, currency)
);
create index spend_monthly_user_month on public.spend_monthly (user_id, month);
create trigger spend_monthly_updated_at before update on public.spend_monthly
  for each row execute function private.nastav_updated_at();

-- ---------- Limity ----------

create table public.limits (
  device_id uuid not null references public.devices (id) on delete cascade,
  provider text not null check (provider ~ '^[a-z0-9-]{2,40}$'),
  window_key text not null check (window_key ~ '^[a-z0-9-]{1,24}$'),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  used_pct numeric(5, 2) check (used_pct between 0 and 100),
  reached boolean not null default false,
  resets_at timestamptz,
  measured_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (device_id, provider, window_key)
);
create index limits_user_id on public.limits (user_id);
create trigger limits_updated_at before update on public.limits
  for each row execute function private.nastav_updated_at();

-- ---------- Agenti teď: jen počty podle stavu ----------

create table public.agent_status (
  device_id uuid primary key references public.devices (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  working integer not null default 0 check (working >= 0),
  needs_you integer not null default 0 check (needs_you >= 0),
  waiting integer not null default 0 check (waiting >= 0),
  failed integer not null default 0 check (failed >= 0),
  updated_at timestamptz not null default now()
);
create index agent_status_user_id on public.agent_status (user_id);
create trigger agent_status_updated_at before update on public.agent_status
  for each row execute function private.nastav_updated_at();

-- ---------- Oprávnění ----------
-- Anonymní klíč nesmí nic. Přihlášený uživatel jen své řádky; tarif profilu nezmění.

revoke all on public.profiles, public.devices, public.connections, public.usage_daily,
  public.spend_monthly, public.limits, public.agent_status from anon;

revoke insert, update, delete on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, sync_enabled) on public.profiles to authenticated;

grant select, insert, update, delete on public.connections, public.usage_daily,
  public.spend_monthly, public.limits, public.agent_status to authenticated;
-- U zařízení se po založení mění jen popis a čas posledního spojení, ne vlastník ani id.
-- (Odebrání práva ke sloupci po udělení práva k celé tabulce by nic neudělalo – proto výčet.)
revoke insert, update, delete on public.devices from authenticated;
grant select, insert, delete on public.devices to authenticated;
grant update (name, platform, app_version, last_seen_at) on public.devices to authenticated;

alter table public.profiles enable row level security;
alter table public.devices enable row level security;
alter table public.connections enable row level security;
alter table public.usage_daily enable row level security;
alter table public.spend_monthly enable row level security;
alter table public.limits enable row level security;
alter table public.agent_status enable row level security;

create policy "profil: jen vlastní" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profil: úprava jen vlastní" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "zařízení: čtení vlastních" on public.devices
  for select to authenticated using (user_id = (select auth.uid()));
create policy "zařízení: přidání vlastního" on public.devices
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "zařízení: úprava vlastního" on public.devices
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "zařízení: odebrání vlastního" on public.devices
  for delete to authenticated using (user_id = (select auth.uid()));

-- Souhrny: řádek je uživatele a zařízení musí být jeho – cizí device_id se nedá podstrčit.
do $$
declare
  t text;
begin
  foreach t in array array['connections', 'usage_daily', 'spend_monthly', 'limits', 'agent_status'] loop
    execute format($f$
      create policy "%1$s: čtení vlastních" on public.%1$I
        for select to authenticated using (user_id = (select auth.uid()));
      create policy "%1$s: zápis vlastních" on public.%1$I
        for insert to authenticated with check (
          user_id = (select auth.uid())
          and exists (select 1 from public.devices d where d.id = device_id and d.user_id = (select auth.uid())));
      create policy "%1$s: úprava vlastních" on public.%1$I
        for update to authenticated using (user_id = (select auth.uid())) with check (
          user_id = (select auth.uid())
          and exists (select 1 from public.devices d where d.id = device_id and d.user_id = (select auth.uid())));
      create policy "%1$s: smazání vlastních" on public.%1$I
        for delete to authenticated using (user_id = (select auth.uid()));
    $f$, t);
  end loop;
end;
$$;

-- ---------- Smazání účtu ----------
-- Uživatel smaže celý účet sám (GDPR): smazáním z auth.users zmizí kaskádou všechno jeho.

create or replace function public.smazat_muj_ucet()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Nepřihlášený uživatel nemůže mazat účet.' using errcode = '42501';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.smazat_muj_ucet() from public, anon;
grant execute on function public.smazat_muj_ucet() to authenticated;
