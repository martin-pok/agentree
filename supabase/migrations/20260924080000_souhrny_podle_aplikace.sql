-- Souhrny v podobě, v jaké je aplikace opravdu má (src/cloud-sync.js).
--
-- Tokeny: aplikace vede po hodinách jen vstup + výstup – hlavní metriku, kterou uživatel pozná
-- i u dodavatele. Rozpad na vstup, výstup a cache po dnech zdroje nedávají, takže tyhle sloupce
-- zůstávají, ale bez výchozí nuly: prázdné = „nevíme“, ne „nula“ (AGENTS.md, pravdivost dat).
alter table public.usage_daily add column tokens bigint not null default 0 check (tokens >= 0);
alter table public.usage_daily
  alter column input_tokens drop not null, alter column input_tokens drop default,
  alter column output_tokens drop not null, alter column output_tokens drop default,
  alter column cache_read_tokens drop not null, alter column cache_read_tokens drop default,
  alter column cache_write_tokens drop not null, alter column cache_write_tokens drop default;
comment on column public.usage_daily.tokens is 'Vstup + výstup za den – stejné číslo jako v aplikaci.';

-- Útrata: aplikace rozlišuje i Extra usage (src/spend.js, KINDS).
alter table public.spend_monthly drop constraint spend_monthly_kind_check;
alter table public.spend_monthly add constraint spend_monthly_kind_check check (kind in ('subscription', 'extra', 'credits', 'api', 'other'));
