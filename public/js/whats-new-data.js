// Co je nového — lidsky, česky, z pohledu uživatele. Každé vydání sem MUSÍ přidat záznam
// (hlídá test/whats-new.test.mjs), jinak uživatel neví, co se v aplikaci změnilo.
export const RELEASES = [
  {
    version: '0.11.0',
    date: '2026-09-13',
    title: 'Rozšíření pro Chrome, které víš, že máš',
    extension: true,
    items: [
      'Průvodce i první kroky na Přehledu vysvětlují rozšíření pro Chrome: co dělá a jak ho za minutu nainstalovat.',
      'Rozšíření má nové okno: hned vidíš, jestli je spárované, kdy naposledy poslalo data a které služby sleduje.',
      'Aplikace si pamatuje, že je rozšíření spárované. Po restartu už neukazuje „nenainstalováno“.',
      'Když v Chromu běží starší verze rozšíření, aplikace i rozšíření řeknou, jak ji obnovit.',
      'Po každé aktualizaci se tady ukáže, co se změnilo. Kdykoli se sem vrátíš přes verzi v postranním panelu.',
    ],
  },
  {
    version: '0.10.2',
    date: '2026-09-13',
    title: 'Zadání vždy ve schránce, do Gemini se vloží samo',
    items: [
      'Po spuštění aplikace nebo webu je zadání spolehlivě ve schránce. Dřív se kopírování v okně aplikace a na telefonu tiše nepovedlo.',
      'Čeština ve schránce zůstává celá — žádné „n�zev“ místo „název“.',
      'Gemini a Qwen neumí převzít zadání z adresy. S rozšířením se zadání vloží do jejich okna samo, odešleš ho Enterem.',
      'Přehled má pevné sloupce: bloky už neskáčou podle šířky okna a nevznikají prázdné mezery.',
    ],
  },
  {
    version: '0.10.1',
    date: '2026-09-13',
    title: 'Poctivě o tom, co aplikace nevidí',
    items: [
      'Když ti chybí rozšíření pro Chrome, Přehled i Agenti řeknou, že konverzace z prohlížeče nevidí a jak to napravit.',
    ],
  },
  {
    version: '0.10.0',
    date: '2026-09-13',
    title: 'Útrata ožila, dovednosti mají původ',
    items: [
      'Dovednosti se dají filtrovat podle původu: od Anthropicu, od OpenAI, z pluginu nebo tvoje vlastní.',
      'Nový widget „Kam dnes šly tokeny“ ukáže, který nástroj dnes spotřeboval nejvíc.',
      'Útrata ukazuje kredity a data hned nahoře místo prázdných bloků.',
      'Okno aplikace jde znovu chytit za horní okraj a přesunout.',
    ],
  },
  {
    version: '0.9.9',
    date: '2026-09-13',
    title: 'Čísla ověřená proti zdrojům',
    items: [
      'Tokeny v grafech jsou přepočítané třikrát nezávisle a sedí s přepisy Claude Code a Codexu.',
      'Tmavé záhlaví okna místo bílého systémového pruhu, ploché karty bez stínů, čitelný přepis.',
      'Plynulé rolování na displejích 120 a 240 Hz.',
    ],
  },
];

const parts = (v) => String(v).split('.').map((n) => Number(n) || 0);
export function compareVersions(a, b) {
  const x = parts(a);
  const y = parts(b);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

// Vydání, která uživatel ještě neviděl. Kdo nikdy nic neviděl (první aktualizace s touto
// funkcí), dostane jen aktuální vydání — ne celou historii najednou.
export function unseenReleases(lastSeen, current) {
  const upTo = RELEASES.filter((r) => compareVersions(r.version, current) <= 0);
  if (!lastSeen) return upTo.slice(0, 1);
  return upTo.filter((r) => compareVersions(r.version, lastSeen) > 0);
}
