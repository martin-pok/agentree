-- Kontrola oprávnění v cloudové databázi. Spouští se nad projektem Supabase (SQL editor nebo
-- nástroj execute_sql) a nic po sobě nenechá: na konci vyhodí výjimku s výsledkem, takže se celá
-- transakce vrátí. Každý řádek výsledku musí končit „true“; „CHYBA“ znamená díru v RLS.
do $$
declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  dev_a uuid;
  dev_b uuid;
  n int;
  vysledky text[] := '{}';
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  values (a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-a@example.invalid', '{"full_name":"Test A"}', now(), now()),
         (b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-b@example.invalid', '{"name":"Test B"}', now(), now());
  select count(*) into n from public.profiles where id in (a, b) and display_name in ('Test A', 'Test B') and plan = 'free' and sync_enabled = false;
  vysledky := vysledky || ('profil vznikl s účtem: ' || (n = 2));

  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.devices (name, platform) values ('Mac B', 'macos') returning id into dev_b;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.devices (name, platform, app_version) values ('Mac A', 'macos', '0.26.0') returning id into dev_a;
  insert into public.usage_daily (device_id, day, provider, input_tokens, output_tokens, sessions) values (dev_a, current_date, 'anthropic', 1000, 200, 3);
  insert into public.agent_status (device_id, working, needs_you) values (dev_a, 2, 1);
  select count(*) into n from public.devices;
  vysledky := vysledky || ('A vidí jen své zařízení: ' || (n = 1));
  select count(*) into n from public.devices where id = dev_b;
  vysledky := vysledky || ('A nevidí zařízení B: ' || (n = 0));
  begin
    insert into public.usage_daily (device_id, day, provider, input_tokens) values (dev_b, current_date, 'openai', 5);
    vysledky := vysledky || 'A zapsal do cizího zařízení: CHYBA'::text;
  exception when others then vysledky := vysledky || ('A nezapíše do cizího zařízení: true (' || sqlstate || ')');
  end;
  begin
    insert into public.usage_daily (device_id, day, provider, user_id, input_tokens) values (dev_a, current_date - 1, 'openai', b, 5);
    vysledky := vysledky || 'A zapsal řádek za B: CHYBA'::text;
  exception when others then vysledky := vysledky || ('A nezapíše řádek za B: true (' || sqlstate || ')');
  end;
  begin
    update public.profiles set plan = 'pro' where id = a;
    vysledky := vysledky || 'A si změnil tarif: CHYBA'::text;
  exception when others then vysledky := vysledky || ('A si tarif nezmění: true (' || sqlstate || ')');
  end;
  update public.profiles set sync_enabled = true where id = a;
  get diagnostics n = row_count;
  vysledky := vysledky || ('A zapne synchronizaci: ' || (n = 1));
  update public.profiles set sync_enabled = true where id = b;
  get diagnostics n = row_count;
  vysledky := vysledky || ('A nezmění profil B: ' || (n = 0));
  begin
    update public.devices set user_id = b where id = dev_a;
    vysledky := vysledky || 'A předal zařízení B: CHYBA'::text;
  exception when others then vysledky := vysledky || ('A nepřepíše vlastníka zařízení: true (' || sqlstate || ')');
  end;
  begin
    insert into public.usage_daily (device_id, day, provider, input_tokens) values (dev_a, current_date - 2, 'anthropic', -1);
    vysledky := vysledky || 'záporné tokeny prošly: CHYBA'::text;
  exception when others then vysledky := vysledky || ('záporné tokeny neprojdou: true (' || sqlstate || ')');
  end;
  execute 'reset role';

  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
  begin
    select count(*) into n from public.devices;
    vysledky := vysledky || ('anon čte zařízení: CHYBA ' || n);
  exception when others then vysledky := vysledky || ('anon nepřečte nic: true (' || sqlstate || ')');
  end;
  begin
    perform public.smazat_muj_ucet();
    vysledky := vysledky || 'anon smazal účet: CHYBA'::text;
  exception when others then vysledky := vysledky || ('anon nesmaže účet: true (' || sqlstate || ')');
  end;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.smazat_muj_ucet();
  execute 'reset role';
  select count(*) into n from public.usage_daily where user_id = a;
  vysledky := vysledky || ('smazání účtu smaže souhrny: ' || (n = 0));
  select count(*) into n from public.devices where user_id = a;
  vysledky := vysledky || ('smazání účtu smaže zařízení: ' || (n = 0));
  select count(*) into n from public.devices where id = dev_b;
  vysledky := vysledky || ('účet B zůstal: ' || (n = 1));

  raise exception 'VYSLEDEK (vše vráceno zpět): %', array_to_string(vysledky, ' | ');
end;
$$;
