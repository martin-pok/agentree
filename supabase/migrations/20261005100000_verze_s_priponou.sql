-- Verze aplikace v tabulce zařízení i pro předběžná vydání.
--
-- Původní kontrola (20260923190000) brala jen „1.2.3“. Zařízení s předběžnou verzí
-- („0.37.0-beta.1“, „0.37.0+build.5“) proto databáze odmítla založit celé – a s ním i všechny
-- souhrny, protože každý řádek souhrnu musí patřit existujícímu zařízení. Klient od 5. 10. 2026
-- posílá jiný tvar než „1.2.3“ jako null (src/cloud-sync.js#verzeProUcet), takže tahle migrace
-- jen dovolí přesnější údaj; bez ní nic nepadá.
--
-- Přípona: pomlčka nebo plus a 1–32 znaků [0-9A-Za-z.-] (podle SemVer, s horní mezí délky).
-- Null zůstává povolený („verzi neznáme“).

alter table public.devices drop constraint if exists devices_app_version_check;
alter table public.devices add constraint devices_app_version_check
  check (app_version ~ '^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}((-|\+)[0-9A-Za-z.-]{1,32})?$');

comment on column public.devices.app_version is 'Verze Agenteeq na zařízení: 1.2.3 s volitelnou příponou -beta.1 / +build.5, nebo null, když ji klient neposlal.';
