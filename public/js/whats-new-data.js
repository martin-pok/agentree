// Co je nového – lidsky, česky, z pohledu uživatele. Každé vydání sem MUSÍ přidat záznam
// (hlídá test/whats-new.test.mjs), jinak uživatel neví, co se v aplikaci změnilo.
export const RELEASES = [
  {
    version: '0.15.1',
    date: '2026-09-20',
    title: 'Přehlednější Dovednosti, výraznější přepínače a živější horní pás',
    items: [
      'Dovednosti mají jasné pořadí: hledání a řazení nahoře, pod nimi popsané filtry Zdroj a Původ. Vybraná položka je tmavá a tučnější, takže je vidět, co je zapnuté.',
      'Jediná karta rozpočtu se roztáhne přes celou šířku, na telefonu také.',
      'Opraveno tlačítko „Všichni agenti“ v horním pásu Přehledu, které mělo bílé pozadí a nečitelný světlý text.',
      'Horní pás Přehledu má výraznější a světlejší barevný přechod.',
    ],
  },
  {
    version: '0.15.0',
    date: '2026-09-20',
    title: 'Čitelnější ovládání, výřez obrázků a vlastní kalendář',
    items: [
      'Odkazy jako „Detail“, „Zdroje dat“ nebo „Zobrazit vše“ vypadají jako tlačítka: mají obrys, šipku a při najetí myší se vyplní. Rozbalovací přehled limitů je taky tlačítko.',
      'Obrázek projektu se ukládá s výřezem, který si sám nastavíš: obrázek posouváš tahem a přibližuješ posuvníkem, hned vidíš, co se uloží, a aplikace řekne doporučené rozměry i to, kdy by byl obrázek rozmazaný. Ukládá se ve vysokém rozlišení, takže je na kartě ostrý.',
      'Datum se vybírá v kalendáři ve stylu aplikace místo systémového okna.',
      'Poslední zadání v detailu agenta jde rozbalit celé a ukazuje celý text, ne jen prvních pár slov.',
      'U průměru tokenů je napsáno, z jakého období vychází (předchozích 7 dní).',
    ],
  },
  {
    version: '0.14.0',
    date: '2026-09-20',
    title: 'Předplatné v Útratě, aktuální kurz a čitelnější tokeny',
    items: [
      'Útrata teď počítá i předplatné. Agenteeq pozná plán Claude z přihlášeného Claude Code a plán ChatGPT z limitů Codexu. U každého uvidíš, z čeho to zjistil, cenu z ceníku a částku v korunách.',
      'Kurz koruny se stahuje z ČNB a u částek stojí, k jakému dni platí. Ručně zadaný kurz zůstane, jak jsi ho nastavil(a). Když se z dat nedá poznat cena (ChatGPT Pro má dvě), vybereš ji sám a do té doby se nepočítá.',
      'Složení tokenů má vlastní měřítko pro spotřebu a pro cache, takže je vidět poměr vstupu a výstupu i rozdíl mezi zápisem a čtením cache.',
      'Nabídka v levém panelu se drží u sebe i na vysokém monitoru a odznak upozornění ukazuje nejvýš 10+.',
      'Opraven tmavý useknutý stín pod tlačítky ve výběru agenta při zaostření klávesnicí.',
    ],
  },
  {
    version: '0.13.0',
    date: '2026-09-20',
    title: 'Přehled všech limitů, obrázky projektů a klidnější upozornění',
    items: [
      'Upozornění se ukazují po jednom a poznáš je na první pohled: zelená s fajfkou znamená, že se akce povedla, červená s vykřičníkem, že ne. Čtyři stejné černé pruhy pod sebou jsou pryč.',
      'Okna limitů mají rozbalovací přehled všech nástrojů. U každého vidíš změřené limity a stáří měření, a u těch, které limit z místních dat neprozradí, je to napsané přímo – nic se nedomýšlí.',
      'Projekty mají obrázky. Nahraj obrázek karty nebo logo klienta (velké fotky se zmenší samy) a najdeš projekt rychleji. Bez obrázku dostane karta elegantní přechod; barva projektu zůstala jako jemný pruh.',
      'Mapa „Kdy agenti pracují“ se při najetí plynule zvětší a ukáže den, hodinu, počet tokenů, v kolika dnech se tam pracovalo a který nástroj měl největší podíl.',
      'Z levého panelu zmizelo „Živá data“, stav spojení už je nahoře vpravo.',
    ],
  },
  {
    version: '0.12.1',
    date: '2026-09-20',
    title: 'Poctivější stavy, přehlednější Nastavení, bezpečnější spouštění',
    items: [
      'Aplikace už netvrdí „nainstalováno“ jen proto, že na disku zůstala složka. Gemini CLI, Qwen Code, Copilot a Cursor se hlásí jako nalezené, jen když je nástroj opravdu na Macu; jinak stojí, že po něm zbyla jen stopa.',
      'Pod číslem „tokenů dnes“ v postranním panelu je vidět, které nástroje ho způsobily, a popisek říká, že jde o vstup a výstup bez cache, ne o cenu ani limit.',
      'Nastavení je o čtvrtinu kratší. Zdroje agentů jsou jeden přehledný seznam, webové služby jedna řada čipů a nenalezené nástroje jsou sbalené. Propojení s Claude Code a instalace pro další lidi se ukážou jen tomu, komu dávají smysl.',
      'Bezpečnost podle nezávislého auditu: konverzace s podvrženým označením už nespustí příkaz s cizím přepínačem, „Otevřít složku“ neotevře balíček jako program, zálohy nastavení Claude Code jsou jen pro tebe a kód pro spárování rozšíření vydá jen Mac.',
    ],
  },
  {
    version: '0.12.0',
    date: '2026-09-15',
    title: 'Agenti na telefonu odkudkoli, přes tvou vlastní síť',
    items: [
      'Nová karta v Nastavení: Přístup přes Tailscale. Jedním přepínačem začne Agenteeq naslouchat i na adrese, kterou tomuhle Macu přidělil tvůj tailnet – a ty vidíš agenty z telefonu i mimo domov.',
      'Žádná veřejná adresa přitom nevzniká. Párování telefonu kódem a token platí dál a domácí síť zůstává samostatný přepínač, takže vypnutí jednoho nezavře druhý.',
      'Aplikace ukáže i to, jestli máš přes „tailscale serve“ zapnuté HTTPS. Bez něj si telefon aplikaci neuloží na plochu; spouštět ho za tebe Agenteeq nebude.',
      'Okno rozšíření pro Chrome má teď stejná písma a barvy jako aplikace, včetně nočního režimu.',
      'Agenteeq má vlastní web s popisem a stahováním. Rozhraní na něm zůstává na adrese /app.',
    ],
  },
  {
    version: '0.11.1',
    date: '2026-09-14',
    title: 'Připraveno na dlouhý provoz',
    items: [
      'Když se soubor s daty poškodí, aplikace naběhne dál: data obnoví z poslední zálohy a řekne ti, co se stalo. Poškozený soubor nechá uložený vedle.',
      'Když se změny nedaří uložit na disk (plný disk, práva ke složce), uvidíš to hned v horní části okna – nic se neztratí potichu.',
      'Po náhodném pádu se lokální služba obnoví sama i po týdnech běhu, ne jen třikrát za celou dobu.',
      'Smazaná konverzace z přehledu zmizí hned, projekty připojené odkazem jsou vidět a agent se špatně nastavenými hodinami nesvítí „pracuje“ navždy.',
      'Na Macu bez Claude Code se nenabízí propojení, které nejde použít, a na telefonu jsou menší odkazy lépe trefitelné.',
    ],
  },
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
      'Čeština ve schránce zůstává celá – žádné „n�zev“ místo „název“.',
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
// funkcí), dostane jen aktuální vydání – ne celou historii najednou.
export function unseenReleases(lastSeen, current) {
  const upTo = RELEASES.filter((r) => compareVersions(r.version, current) <= 0);
  if (!lastSeen) return upTo.slice(0, 1);
  return upTo.filter((r) => compareVersions(r.version, lastSeen) > 0);
}
