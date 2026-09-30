// Co je nového – lidsky, česky, z pohledu uživatele. Každé vydání sem MUSÍ přidat záznam
// (hlídá test/whats-new.test.mjs), jinak uživatel neví, co se v aplikaci změnilo.
// `en` nese totéž anglicky (věcně podle CHANGELOG.md, se stejným počtem bodů); v angličtině
// rozhraní se ukazuje místo češtiny (public/js/whats-new.js).
export const RELEASES = [
  {
    version: '0.29.7',
    date: '2026-09-30',
    title: 'Čistší posouvání Nastavení',
    items: ['Nadpis a nabídka zůstávají na místě. Horní tlačítka při posouvání na širokém okně nepřekrývají karty a po návratu nahoru se znovu objeví.'],
    en: {
      title: 'Cleaner scrolling in Settings',
      items: ['The heading and navigation stay in place. On wide windows, top controls no longer cover cards while scrolling and reappear when you return to the top.'],
    },
  },
  {
    version: '0.29.6',
    date: '2026-09-30',
    title: 'Plynulejší posun a stálá loga',
    items: [
      'Malé kroky trackpadu v aplikaci se provedou spolehlivěji i po přepnutí obrazovky nebo směru posouvání.',
      'Loga služeb při živé aktualizaci karet zůstávají na místě; změněná značka se načte správně.',
    ],
    en: {
      title: 'Smoother scrolling and stable logos',
      items: [
        'Small trackpad steps in the app respond more reliably after switching screens or changing scroll direction.',
        'Service logos stay visible while cards update live; a changed logo still loads correctly.',
      ],
    },
  },
  {
    version: '0.29.5',
    date: '2026-09-30',
    title: 'Codex z ChatGPT pro Mac je rozpoznaný',
    items: [
      'Agenteeq najde Codex přibalený v ChatGPT pro Mac i při spuštění z Finderu. Stav přihlášení se ověří přímo v Codexu; dostupné jsou také režimy na pozadí a v Terminálu.',
    ],
    en: {
      title: 'Codex in ChatGPT for Mac is recognized',
      items: [
        'Agenteeq finds the Codex CLI bundled with ChatGPT for Mac even when launched from Finder. Sign-in is checked with Codex itself, and background and Terminal modes are available.',
      ],
    },
  },
  {
    version: '0.29.4',
    date: '2026-09-29',
    title: 'Rozhodnutí jen tehdy, když se agent ptá',
    items: [
      'Prázdná sekce rozhodnutí ukazuje skutečný stav: žádný agent teď nečeká na tvou odpověď. Selhání a vyčerpané limity zůstávají ve svých vlastních přehledech.',
    ],
    en: {
      title: 'Decisions only when an agent asks',
      items: [
        'The empty decisions section now shows the actual status: no agent is waiting for your answer. Failures and exhausted limits stay in their own views.',
      ],
    },
  },
  {
    version: '0.29.3',
    date: '2026-09-28',
    title: 'Přehled ukazuje jen ověřený stav',
    items: [
      'Nadpis i podnabídka Nastavení zůstávají při posouvání na místě.',
      'Selhaný agent má vlastní filtr. V „Potřebuje tvé rozhodnutí“ uvidíš jen agenta, který se skutečně ptá.',
      'U limitů se nezobrazuje staré měření ani dopočítaný čas obnovy. Tokeny jsou jasně označené jako záznam z místních přepisů.',
    ],
    en: {
      title: 'The overview shows verified status',
      items: [
        'The Settings heading and submenu remain in place while you scroll.',
        'Failed agents have their own filter. “Needs your decision” shows only agents that actually asked you a question.',
        'Old limit readings and calculated reset times are no longer displayed. Tokens are clearly identified as readings from local transcripts.',
      ],
    },
  },
  {
    version: '0.29.2',
    date: '2026-09-28',
    title: 'Menu Nastavení zůstává na místě',
    items: [
      'Podnabídka na levé straně Nastavení zůstává při posouvání dlouhé skupiny ve stejné výšce. Už nevyjede až k hornímu okraji okna.',
    ],
    en: {
      title: 'The Settings menu stays in place',
      items: [
        'The Settings submenu on the left remains at the same height while you scroll through a long group. It no longer slides up to the top edge of the window.',
      ],
    },
  },
  {
    version: '0.29.1',
    date: '2026-09-28',
    title: 'Posouvání funguje i po změně obrazovky',
    items: [
      'Kolečko a trackpad se znovu plynule rozjedou po posunu klávesnicí, posuvníkem i po přepnutí obrazovky. Předchozí dojezd už další krok nezablokuje.',
      'Noční ticho nepřeruší práci oznámením. Po jeho skončení se ozve jen za upozornění, která stále platí; více událostí za minutu shrne do jedné zprávy.',
    ],
    en: {
      title: 'Scrolling works after switching screens too',
      items: [
        'The mouse wheel and trackpad start scrolling smoothly again after scrolling with the keyboard or the scrollbar, and after switching screens. The previous glide no longer blocks the next step.',
        'Quiet hours don’t interrupt you with notifications. When they end, you only hear about alerts that still apply; several events within a minute are summed up in one message.',
      ],
    },
  },
  {
    version: '0.29.0',
    date: '2026-09-27',
    title: 'Nové okno rozšíření a jednotná tlačítka',
    extension: true,
    items: [
      'Rozšíření pro Chrome má nové okno: nahoře vidíš, kolik agentů právě pracuje, pod tím všechny otevřené konverzace s AI a co v nich agent dělá („odpovídá“, „narazil na limit“, „dokončil před 3 min“). Kliknutím na řádek se přepneš do té karty. V Chromu v jiném jazyce než češtině mluví rozšíření anglicky.',
      'Rozšíření se s Agenteeq spáruje samo hned po instalaci, žádný kód už neopisuješ.',
      'Tlačítka, pole a volby mají v aplikaci, na webu i v rozšíření jeden oblý tvar a jen tři výšky. Vybraná volba už neztuční, takže text při výběru neposkočí.',
      'Napojení Claude Code a Codexu neotevírá Terminál: přihlašovací stránka se otevře rovnou v prohlížeči a Agenteeq napojení sám potvrdí. Když se prohlížeč neotevře, pomůže záložní odkaz.',
      'U každého okna limitů je vidět, kdy se obnoví – přesný čas s odpočtem, nebo výslovně, že ho zdroj neuvádí. Obnova týdenního limitu Claude se už chybně neukazuje na dnešek nebo zítřek.',
    ],
    en: {
      title: 'A new extension window and unified buttons',
      items: [
        'The Chrome extension has a new window: at the top you see how many agents are working right now, below it all open AI conversations and what the agent is doing in each (“replying”, “hit a limit”, “finished 3 min ago”). Click a row to switch to that tab. In Chrome set to a language other than Czech, the extension speaks English.',
        'The extension pairs with Agenteeq on its own right after installation – no more copying a code.',
        'Buttons, fields and options have one rounded shape and just three heights in the app, on the website and in the extension. A selected option no longer turns bold, so the text doesn’t jump when you select it.',
        'Connecting Claude Code and Codex no longer opens Terminal: the sign-in page opens straight in your browser and Agenteeq confirms the connection itself. If the browser doesn’t open, a fallback link helps.',
        'Every limit window shows when it resets – the exact time with a countdown, or an explicit note that the source doesn’t say. The Claude weekly limit reset no longer wrongly shows today or tomorrow.',
      ],
    },
  },
  {
    version: '0.28.1',
    date: '2026-09-26',
    title: 'Vzdálený Claude se objeví v přehledu',
    items: [
      'Claude Code spuštěný vzdáleně z Claude Desktopu se nově načte automaticky z místní cache, včetně už existujících relací. Dříve ho přehled úplně vynechal.',
      'Vidíš poslední hlášený stav a dostupnou část přepisu. Pokud Claude neuložil celou historii a tokeny, aplikace to výslovně řekne. Interní formát tohoto zdroje zůstává v betě.',
    ],
    en: {
      title: 'Remote Claude shows up in the overview',
      items: [
        'Claude Code started remotely from Claude Desktop now loads automatically from the local cache, including sessions that already exist. Previously the overview left it out entirely.',
        'You see the last reported status and the available part of the transcript. If Claude didn’t store the whole history and tokens, the app says so explicitly. The internal format of this source remains in beta.',
      ],
    },
  },
  {
    version: '0.28.0',
    date: '2026-09-26',
    title: 'Napojení agentů a Nastavení drží krok',
    items: [
      'Claude Code se najde i tam, kam ho instalátor přidal mimo cestu Finderu. U agenta je vidět poslední místní aktivita; neznámá instalace se už nevydává za chybějící.',
      'Menu Nastavení přepíná skupiny bez posouvání nadpisu a levého panelu. Kolečko myši má plynulý dojezd a karty při posouvání neposkakují pod kurzorem.',
      'V Nastavení → Účet a vzhled si vybereš češtinu nebo English. Jazyk se uloží a rozhraní se načte rovnou v něm.',
      'Web má české i anglické ukázky aplikace a všechny hlavní sekce mají stejné boční okraje. Prohlídka funguje i bez připojení k Macu.',
    ],
    en: {
      title: 'Agent connections and Settings keep up',
      items: [
        'Claude Code is found even where the installer put it outside Finder’s path. The agent shows its last local activity; an unknown installation no longer passes itself off as missing.',
        'The Settings menu switches groups without moving the heading or the left panel. The mouse wheel glides smoothly and cards don’t jump under the cursor while scrolling.',
        'In Settings → Account and appearance you can choose Czech or English. The language is saved and the interface loads straight in it.',
        'The website has Czech and English app previews, and all main sections have the same side margins. The tour works even without a connection to your Mac.',
      ],
    },
  },
  {
    version: '0.27.0',
    date: '2026-09-25',
    title: 'Útratu si stáhneš do tabulky',
    items: [
      'V Útratě u Výdajů je nové tlačítko „Export CSV“. Stáhne posledních 12 měsíců – každé předplatné v každém měsíci, kdy běželo, takže součty sedí s tím, co vidíš v aplikaci.',
      'U každé platby je původní částka, kurz i přepočet do měny, kterou máš v aplikaci, aby šel převod zkontrolovat. Soubor otevřeš rovnou v Excelu nebo Numbers.',
    ],
    en: {
      title: 'Download your spending as a spreadsheet',
      items: [
        'Under Expenses in Spend there’s a new “Export CSV” button. It downloads the last 12 months – every subscription in every month it ran, so the totals match what you see in the app.',
        'Each payment includes the original amount, the rate and the conversion to the currency you use in the app, so the conversion can be checked. The file opens straight in Excel or Numbers.',
      ],
    },
  },
  {
    version: '0.26.0',
    date: '2026-09-25',
    title: 'Rozšíření ukáže, jestli službu čte správně',
    extension: true,
    items: [
      'V okně rozšíření na stránce ChatGPT, Gemini, Claude.ai a dalších klikni na „Ověřit tuto stránku“. Uvidíš, co rozšíření na stránce našlo: konverzaci, pole pro zadání, počty zpráv a jestli zachytilo, že agent pracoval a skončil.',
      'Když něco nesedí, klikni na „Nesedí“ a ulož vzorek stránky. Je to jen stavba stránky bez textu zpráv, názvů a odkazů – podle něj se rozšíření opraví.',
    ],
    en: {
      title: 'The extension shows whether it reads a service correctly',
      items: [
        'In the extension window on ChatGPT, Gemini, Claude.ai and other sites, click “Check the page”. You’ll see what the extension found on the page: the conversation, the prompt field, message counts and whether it caught the agent working and finishing.',
        'If something’s off, click “They don’t” and save a page sample. It’s only the page structure, without message text, titles or links – the extension gets fixed based on it.',
      ],
    },
  },
  {
    version: '0.25.0',
    date: '2026-09-24',
    title: 'Účet Agenteeq a modely napojené jedním klikem',
    extension: true,
    items: [
      'Rozšíření pro Chrome je potřeba jednou spárovat znovu: v Nastavení vytvoř jednorázový kód a vlož ho do rozšíření. Dosavadní spojení přestalo platit.',
      'Při spárování dostane každý prohlížeč vlastní přístupový klíč, který platí jen pro něj. Dřív rozšíření sdílelo klíč s propojením Claude Code, takže kdo ho získal, mohl podvrhnout i upozornění z Claude Code.',
      'Nové spárování starý klíč téhož prohlížeče zneplatní a ostatní prohlížeče nechá připojené. Na disku se ukládá jen otisk klíče, ne klíč samotný.',
      'Modely napojíš jedním klikem v Nastavení → Propojení → Napojené modely. Přihlásíš se přímo u Anthropicu nebo OpenAI a Agenteeq sám pozná, až je hotovo.',
      'Rozšíření pro Chrome už z webových chatů nebere text ani názvy konverzací – jen jestli agent pracuje, nebo čeká.',
      'Souhrny ze všech svých Maců uvidíš i na webu: agentree-fawn.vercel.app/app?ucet. Stačí se přihlásit stejným účtem Google.',
      'Po přihlášení si můžeš zapnout synchronizaci souhrnů: tokeny, útrata, limity a počty agentů. Co přesně odchází, uvidíš v kartě účtu. Vypnutím se souhrny z účtu smažou.',
      'Nově se můžeš přihlásit přes Google v Nastavení → Účet a vzhled. Z Googlu si Agenteeq vezme jen jméno a e-mail; konverzace a kód zůstávají na tvém Macu. Bez účtu funguje všechno jako dřív.',
      'Přehled, Projekty a Útrata se při otevření plynule rozsvítí: karty vyjedou, měřidlo rozpočtu se dokreslí a čísla vyjedou na své místo. Jen jednou po otevření, ne při každé změně. Když máš v systému omezený pohyb, ukáže se všechno rovnou.',
    ],
    en: {
      title: 'Agenteeq account and one-click model connections',
      items: [
        'The Chrome extension needs to be paired again once: create a one-time code in Settings and paste it into the extension. The previous connection has stopped working.',
        'When pairing, each browser gets its own access key that works only for it. Previously the extension shared a key with the Claude Code connection, so anyone who got hold of it could also fake Claude Code alerts.',
        'A new pairing invalidates the old key of the same browser and leaves other browsers connected. Only a fingerprint of the key is stored on disk, not the key itself.',
        'Connect models with one click in Settings → Connections → Connected models. You sign in directly with Anthropic or OpenAI and Agenteeq notices on its own when it’s done.',
        'The Chrome extension no longer takes text or conversation titles from web chats – only whether the agent is working or waiting.',
        'You can see summaries from all your Macs on the web too: agentree-fawn.vercel.app/app?ucet. Just sign in with the same Google account.',
        'After signing in you can turn on syncing of summaries: tokens, spend, limits and agent counts. The account card shows exactly what is sent. Turning it off deletes the summaries from the account.',
        'You can now sign in with Google in Settings → Account and appearance. Agenteeq takes only your name and email from Google; conversations and code stay on your Mac. Without an account everything works as before.',
        'Overview, Projects and Spend light up smoothly when opened: cards slide in, the budget gauge draws itself and numbers roll into place. Only once after opening, not on every change. If reduced motion is on in your system, everything appears straight away.',
      ],
    },
  },
  {
    version: '0.24.0',
    date: '2026-09-22',
    title: 'Čísla v Agenteeq odpovídají zdrojům',
    items: [
      'Tokeny Claude Code už nejsou nadsazené. Když relaci rozdělíš (fork), nový soubor si nese celou historii té původní a Agenteeq ji počítal podruhé – za měsíc to dělalo o 59 % víc, než kolik se spotřebovalo.',
      'Kredity Codexu ukazují skutečný zůstatek. Když došly, Codex hlásil nulu, ale Agenteeq dál ukazoval poslední kladné číslo. Teď je vidět nula i kdy byla zjištěná.',
      'Vyčerpaný limit jednoho modelu už nezmizí jen proto, že v téže relaci odpověděl jiný model. Limit ví, který model narazil.',
      'U limitů i kreditů je vidět, jak starý je údaj. Co je staré, je zvýrazněné, aby se to nečetlo jako stav teď.',
      'Místo „dokoupeno“ stojí „doplněno“: z dat Codexu nejde poznat, jestli se kredity koupily, nebo vrátily. A počítá se jen uvnitř jedné konverzace, takže zmizela doplnění, která ve skutečnosti nebyla.',
    ],
    en: {
      title: 'Agenteeq numbers match their sources',
      items: [
        'Claude Code tokens are no longer inflated. When you fork a session, the new file carries the entire history of the original, and Agenteeq counted it twice – over a month that came to 59 % more than was actually used.',
        'Codex credits show the real balance. When they ran out, Codex reported zero, but Agenteeq kept showing the last positive number. Now you see zero and when it was detected.',
        'A used-up limit of one model no longer disappears just because another model replied in the same session. The limit knows which model hit it.',
        'Limits and credits show how old the data is. Stale data is highlighted so it isn’t read as the current state.',
        'Instead of “bought” it now says “topped up”: Codex data can’t tell whether credits were bought or refunded. And it only counts within one conversation, so top-ups that never actually happened are gone.',
      ],
    },
  },
  {
    version: '0.23.1',
    date: '2026-09-22',
    title: 'Grafy v čase říkají pravdu o tom, co je pod kurzorem',
    items: [
      'Kurzor v grafech kreditů a limitů už neuskakuje o dny. Body se ukládají jen v okamžicích změny, takže se dřív hledal „nejbližší bod“ — i když ležel týden jinam. Teď se čte poslední odečet před kurzorem a svislice sleduje kurzor přesně.',
      'Bublina rozlišuje, jestli jsi na skutečném měření („Hodnota“), nebo jestli hodnota jen drží z dřívějška („Poslední známá“ a pod tím, kdy se naměřila).',
      'U zůstatku kreditů je vidět, kdy byl zjištěný. Když je starší než dva dny, zvýrazní se — abys ho nečetl jako stav teď.',
    ],
    en: {
      title: 'Time charts tell the truth about what’s under the cursor',
      items: [
        'The cursor in credit and limit charts no longer jumps by days. Points are stored only when something changes, so the “nearest point” used to be picked — even if it was a week away. Now the last reading before the cursor is used and the vertical line follows the cursor exactly.',
        'The tooltip shows whether you’re on an actual measurement (“Value”) or whether the value is only carried over from earlier (“Last known”, with when it was measured below).',
        'The credit balance shows when it was detected. If it’s older than two days, it’s highlighted — so you don’t read it as the current state.',
      ],
    },
  },
  {
    version: '0.23.0',
    date: '2026-09-22',
    title: 'Telefon připojíš QR kódem',
    items: [
      'V Nastavení → Otevřít na telefonu je vedle jednorázového kódu i QR. Namíříš na něj foťák a telefon se otevře rovnou spárovaný. Nic neopisuješ — ani adresu, ani číslo.',
      'Kód se z adresy hned smaže, takže nezůstane v historii prohlížeče. Šestimístné číslo je pořád pod QR, když čtečku použít nechceš.',
      'Web Agenteeq má tlačítko Stáhnout a poctivý postup pro první spuštění. Snímky na něm ukazují skutečnou aplikaci, ne nakreslenou atrapu.',
    ],
    en: {
      title: 'Connect your phone with a QR code',
      items: [
        'In Settings → Open on phone there’s a QR code next to the one-time code. Point your camera at it and the phone opens already paired. You don’t copy anything — neither the address nor the number.',
        'The code is removed from the address straight away, so it doesn’t stay in the browser history. The six-digit number is still below the QR code if you’d rather not use a scanner.',
        'The Agenteeq website has a Download button and an honest first-launch guide. Its screenshots show the real app, not a drawn mock-up.',
      ],
    },
  },
  {
    version: '0.22.0',
    date: '2026-09-21',
    title: 'Poslední aktivita doplní řádky podle místa',
    items: [
      'Když rozbalíš „Všechny nástroje a služby“, pravý sloupec se prodlouží. Poslední aktivita teď doplní tolik řádků, kolik se pod ni vejde, takže dole nezůstane prázdno. Po sbalení se zase zkrátí.',
      'Banner průvodce má místo barevného přechodu kreslenou žárovku. Je nakreslená čárou v barvě textu, takže drží ve světlém i tmavém režimu.',
    ],
    en: {
      title: 'Recent activity fills rows to fit the space',
      items: [
        'When you expand “All tools and services”, the right column gets longer. Recent activity now fills in as many rows as fit below it, so no empty space is left at the bottom. When collapsed, it shortens again.',
        'The guide banner has a drawn light bulb instead of a colour gradient. It’s drawn with a line in the text colour, so it works in both light and dark mode.',
      ],
    },
  },
  {
    version: '0.21.1',
    date: '2026-09-21',
    title: 'Průvodce se přizpůsobí tvaru obrazovky',
    items: [
      'Na vysokém okně se průvodce natahoval přes celou obrazovku do úzkého sloupce a vizuál plaval uprostřed prázdna. Teď je to vodorovná karta 920 × 600: obrázek vlevo, text vpravo. Na nízkém okně se stáhne na výšku obrazovky, na telefonu jde obrázek nahoru a text pod něj.',
    ],
    en: {
      title: 'The guide adapts to the shape of the screen',
      items: [
        'On a tall window the guide stretched over the whole screen into a narrow column, with the visual floating in empty space. Now it’s a horizontal 920 × 600 card: image on the left, text on the right. On a short window it shrinks to the screen height; on a phone the image goes on top and the text below it.',
      ],
    },
  },
  {
    version: '0.21.0',
    date: '2026-09-21',
    title: 'Průvodce je vidět a mluví o dnešních funkcích',
    items: [
      'V Nastavení je místo nenápadného tlačítka banner s barevným pruhem a popisem, co průvodce ukáže.',
      'Průvodce má novou obrazovku o limitech a penězích: okna limitů všech nástrojů, předplatná přepočítaná do korun kurzem ČNB a kalendářní „Dnes“.',
      'Doplněné texty u projektů (logo klienta, vlastní pořadí karet tažením) a u soukromí (klíč okna aplikace, telefon jen pro čtení).',
    ],
    en: {
      title: 'The guide is visible and covers today’s features',
      items: [
        'Instead of an inconspicuous button, Settings has a banner with a coloured stripe and a description of what the guide shows.',
        'The guide has a new screen about limits and money: limit windows of all tools, subscriptions converted to Czech crowns at the Czech National Bank rate, and a calendar “Today”.',
        'Added texts about projects (client logo, custom card order by dragging) and privacy (app window key, read-only phone).',
      ],
    },
  },
  {
    version: '0.20.1',
    date: '2026-09-21',
    title: 'Rolování ve vyhledávání zůstane ve vyhledávání',
    items: [
      'Když jsi ve vyhledávání (⌘K) dojel seznamem na konec, začala se posouvat stránka vzadu. Kolečko teď patří tomu, co je navrchu: seznam si posouvání nechá u sebe a stránka pod překryvem stojí, dokud vyhledávání nezavřeš.',
      'Totéž platí pro upozornění, dialogy, výběr složky i spodní nabídku na telefonu.',
    ],
    en: {
      title: 'Scrolling in search stays in search',
      items: [
        'When you reached the end of the list in search (⌘K), the page behind it started scrolling. The wheel now belongs to whatever is on top: the list keeps the scrolling to itself and the page under the overlay stays put until you close search.',
        'The same goes for alerts, dialogs, folder picking and the bottom menu on the phone.',
      ],
    },
  },
  {
    version: '0.20.0',
    date: '2026-09-21',
    title: 'Dnes je kalendářní den, karty už neproblikávají',
    items: [
      'Období „Dnes“ počítá od půlnoci. Dosud bylo nejkratší období „24 hodin“, do kterého ráno patřila i noční práce z předchozího dne – proto čísla nesedila s tím, co za dnešek počítáš ty. Obě období jsou teď vedle sebe a přibylo „14 dní“.',
      'Obrázky na kartách projektů zůstanou na místě. Dřív každé překreslení (přetažení karty, příchod živých dat) vyrobilo nový obrázek a pod ním na okamžik prosvitl podkladový přechod.',
      'Vybraná služba ve „Spustit agenta“ měla obrys dvakrát, což na tmavém pozadí vypadalo jako stín. Zůstal jeden.',
      'Stav vpravo nahoře se jmenuje „Připojeno“.',
    ],
    en: {
      title: 'Today is a calendar day, and cards no longer flicker',
      items: [
        'The “Today” period counts from midnight. Until now the shortest period was “24 hours”, which in the morning also included night work from the previous day – that’s why the numbers didn’t match what you count as today. Both periods are now side by side, and “14 days” was added.',
        'Images on project cards stay in place. Previously every redraw (dragging a card, live data arriving) created a new image and the background gradient briefly showed through underneath.',
        'The selected service in “Start agent” had a double outline, which looked like a shadow on a dark background. One remains.',
        'The status in the top right is called “Connected”.',
      ],
    },
  },
  {
    version: '0.19.1',
    date: '2026-09-21',
    title: 'Nabídka vypadá stejně na šířku i na výšku',
    items: [
      'Na monitoru na výšku měla nabídka vlastní vzhled: jiné podbarvení, jiný hover a místo mosazného pruhu tečka. Teď se chová úplně stejně jako na šířku, jen se položky rozestoupí a jsou vyšší, aby se lépe trefovaly.',
      'Dlouhý název se v nabídce zkrátí tečkami místo toho, aby roztlačil panel. Odsazení vlevo a vpravo je díky tomu stejné na každé šířce okna.',
    ],
    en: {
      title: 'The menu looks the same in landscape and portrait',
      items: [
        'On a portrait monitor the menu had its own look: different shading, a different hover and a dot instead of the brass bar. Now it behaves exactly as in landscape; the items are just spaced out and taller so they’re easier to hit.',
        'A long name in the menu is shortened with an ellipsis instead of pushing the panel wider. Thanks to that, the left and right padding is the same at every window width.',
      ],
    },
  },
  {
    version: '0.19.0',
    date: '2026-09-21',
    title: 'Vždy čerstvá data a rychlejší načtení',
    items: [
      'Dovednosti, historie vytížení plánu a extra usage se načítaly jednou za běh aplikace. Kdo přidal SKILL.md nebo odpracoval další hodinu, viděl stará čísla. Teď se čtou při každém otevření stránky – a dosavadní obsah zůstane, dokud nedorazí nový, takže nic nebliká.',
      'Soubory aplikace nesou značku verze počítanou z obsahu. Prohlížeč se serveru zeptá, jestli se něco změnilo, a na nezměněný soubor dostane odpověď v pár bajtech místo celého stažení. Jakmile vydám novou verzi, značka se změní a stáhne se hned.',
      'Živá data zůstávají bez cache: změna je v okně do 25 ms.',
    ],
    en: {
      title: 'Always fresh data and faster loading',
      items: [
        'Skills, plan usage history and extra usage were loaded once per app run. Anyone who added a SKILL.md or worked another hour saw old numbers. Now they’re read every time the page opens – and the existing content stays until the new one arrives, so nothing flickers.',
        'App files carry a version tag computed from their content. The browser asks the server whether anything has changed and, for an unchanged file, gets an answer in a few bytes instead of a full download. As soon as a new version is released, the tag changes and the file downloads straight away.',
        'Live data stays uncached: a change appears in the window within 25 ms.',
      ],
    },
  },
  {
    version: '0.18.4',
    date: '2026-09-21',
    title: 'Přehled jde znovu otevřít v prohlížeči',
    items: [
      'Od zavedení klíče okna vracela adresa 127.0.0.1:4620 v prohlížeči jen „Agenteeq běží“. V Nastavení → Profil a vzhled je teď tlačítko Zkopírovat odkaz: vloží se do Safari nebo Chromu a přehled se otevře. Odkaz platí jen na tomhle Macu a jen do restartu aplikace.',
    ],
    en: {
      title: 'The overview can be opened in a browser again',
      items: [
        'Since the window key was introduced, the address 127.0.0.1:4620 only returned “Agenteeq is running” in a browser. Settings → Profile and appearance now has a Copy link button: paste it into Safari or Chrome and the overview opens. The link works only on this Mac and only until the app restarts.',
      ],
    },
  },
  {
    version: '0.18.3',
    date: '2026-09-21',
    title: 'Jasná hláška, když se podklady neuloží',
    items: [
      'Podklady projektu hlásily „Neuloženo…“, když se čeká na doťukání, a „Neuloženo“, když se zápis nepovedl – rozdíl tří teček. Selhání je teď červené, říká „Neuložilo se! Zkopíruj si text.“ a hlášku dole doplní, proč.',
      'Pro červený toast existoval trojí název tónu. Zůstal jeden, takže se hlášky nemohou rozejít.',
    ],
    en: {
      title: 'A clear message when notes aren’t saved',
      items: [
        'Project notes showed “Not saved…” while waiting for you to finish typing and “Not saved” when saving failed – a difference of three dots. A failure is now red, says “Not saved! Copy your text.” and the message at the bottom explains why.',
        'The red toast had three different tone names. One remains, so the messages can’t drift apart.',
      ],
    },
  },
  {
    version: '0.18.2',
    date: '2026-09-21',
    title: 'Limity hlásí všude totéž a časová osa nic nezamlčí',
    items: [
      'Obnovené okno limitu hlásilo na Přehledu „0 %“, ve Statistikách „Obnoven“ a v rozbaleném seznamu „obnoveno“ – tři různá tvrzení o jednom čísle. Teď všude stojí „Obnoveno“ a vyčerpané okno „Vyčerpáno“.',
      'Časová osa „Dnešní směna“ ukazuje sedm nejdůležitějších agentů. Když jich je víc, stojí pod ní, kolik jich zbývá, s odkazem na seznam Agenti. Dřív se tiše zahodili.',
    ],
    en: {
      title: 'Limits say the same everywhere and the timeline hides nothing',
      items: [
        'A reset limit window showed “0 %” in Overview, “Renewed” in Statistics and “reset” in the expanded list – three different claims about one number. Now it says “Reset” everywhere, and a used-up window says “Used up”.',
        'The “Today’s shift” timeline shows the seven most important agents. If there are more, it says below how many are left, with a link to the Agents list. Previously they were silently dropped.',
      ],
    },
  },
  {
    version: '0.18.1',
    date: '2026-09-21',
    title: 'Bezpečnější práce s cizími repozitáři',
    items: [
      'Git, který Agenteeq spouští v tvých projektech, už nespustí příkaz ze souboru nastavení cizího repozitáře (třeba staženého z internetu). Dřív mohla naklonovaná složka při zobrazení stavu spustit vlastní skript.',
    ],
    en: {
      title: 'Safer work with third-party repositories',
      items: [
        'The Git that Agenteeq runs in your projects no longer runs a command from the settings file of a third-party repository (for example one downloaded from the internet). Previously a cloned folder could run its own script when its status was displayed.',
      ],
    },
  },
  {
    version: '0.18.0',
    date: '2026-09-21',
    title: 'Bezpečnější přístup: telefon jen čte, okno aplikace má klíč',
    items: [
      'Spárovaný telefon teď slouží ke čtení stavu. Nesmí spouštět agenty, měnit nastavení a klíče, instalovat propojení ani procházet disk Macu. Zůstává mu sledování agentů, přepisů, limitů i útraty a označování upozornění za přečtená. Tyhle akce si uděláš na Macu.',
      'Okno aplikace používá klíč, který se vytvoří při každém spuštění. Jiný program nebo jiný uživatel na tomtéž Macu se na místní adrese Agenteeq bez klíče k ničemu nedostane. Propojení s Claude Code a rozšíření pro Chrome fungují jako dřív.',
    ],
    en: {
      title: 'Safer access: the phone only reads, the app window has a key',
      items: [
        'A paired phone is now for reading status. It can’t start agents, change settings and keys, install connections or browse the Mac’s disk. It can still follow agents, transcripts, limits and spend, and mark alerts as read. Do those actions on the Mac.',
        'The app window uses a key that is created at every launch. Another program or another user on the same Mac gets nothing from the local Agenteeq address without the key. The Claude Code connection and the Chrome extension work as before.',
      ],
    },
  },
  {
    version: '0.17.3',
    date: '2026-09-21',
    title: 'Kratší seznam Dovedností a oprava okna rozšíření',
    items: [
      'Dovednosti se načítají po 36 kartách a tlačítkem Zobrazit dalších. Stránka se 147 dovednostmi byla na telefonu vysoká přes 37 000 px, teď asi 9 700 px.',
      'Okno rozšíření pro Chrome se zastaralou verzí přesáhlo 600 px, které Chrome ukáže. Seznam služeb je kratší a všechno se vejde.',
    ],
    en: {
      title: 'A shorter Skills list and an extension window fix',
      items: [
        'Skills load 36 cards at a time, with a Show more button. The page with 147 skills was over 37,000 px tall on a phone; now it’s about 9,700 px.',
        'The Chrome extension window with an outdated version exceeded the 600 px Chrome shows. The list of services is shorter and everything fits.',
      ],
    },
  },
  {
    version: '0.17.2',
    date: '2026-09-20',
    title: 'Menu jako velké dlaždice na monitoru na výšku',
    items: [
      'Když je okno vysoké a otočené na výšku, položky menu v levém panelu se změní na velké dlaždice přes celou šířku panelu. Jsou stejně vysoké, mají stejné mezery a začínají kousek pod profilem, podle návrhu z Figmy. Celá dlaždice je klikatelná a aktivní má tmavé (v tmavém režimu světlé) vyplnění.',
      'Rozměry se řídí výškou okna, takže tvar drží na 1920 i 2560 px.',
    ],
    en: {
      title: 'The menu as large tiles on a portrait monitor',
      items: [
        'When the window is tall and rotated to portrait, the menu items in the left panel turn into large tiles across the full width of the panel. They’re equally tall, equally spaced and start just below the profile, as in the Figma design. The whole tile is clickable and the active one has a dark (in dark mode, light) fill.',
        'The dimensions follow the window height, so the shape holds at 1920 and 2560 px.',
      ],
    },
  },
  {
    version: '0.17.1',
    date: '2026-09-20',
    title: 'Kontrastní tlačítka v tmavém režimu',
    items: [
      'V tmavém režimu jsou hlavní tlačítka (Spustit agenta, Uložit, Vytvořit projekt…), vybrané přepínače, zapnuté přepínače a zatržítka světlá s tmavým písmem. Kontrast je přes 16 : 1, dřív šlo o tmavou plochu na tmavém pozadí.',
    ],
    en: {
      title: 'High-contrast buttons in dark mode',
      items: [
        'In dark mode the main buttons (Start agent, Save, Create project…), selected toggles, switched-on switches and checkboxes are light with dark text. The contrast is over 16 : 1; previously it was a dark surface on a dark background.',
      ],
    },
  },
  {
    version: '0.17.0',
    date: '2026-09-20',
    title: 'Vlastní pořadí karet v detailech a opravené tlačítko Změnit',
    items: [
      'Karty v pravém panelu detailu agenta a detailu projektu si přesuneš tažením za úchyt nahoře uprostřed karty. Zvednutá karta se drží pod myší a ostatní se plynule uhýbají. Pořadí se ukládá do Agenteeq a zůstane i po zavření aplikace.',
      'V Nastavení, v části Vzhled, jde uspořádání karet vrátit tlačítkem Obnovit výchozí.',
      'Tlačítko „Změnit“ u projektu v detailu agenta mělo nulové vnitřní odsazení a text se dotýkal okraje. Opraveno.',
    ],
    en: {
      title: 'Custom card order in details and a fixed Change button',
      items: [
        'Move the cards in the right panel of the agent and project detail by dragging the handle at the top centre of a card. The lifted card stays under the mouse and the others move smoothly out of the way. The order is saved in Agenteeq and stays after you close the app.',
        'In Settings, under Appearance, you can reset the card layout with the Restore default button.',
        'The “Change” button for the project in the agent detail had zero inner padding and the text touched the edge. Fixed.',
      ],
    },
  },
  {
    version: '0.16.0',
    date: '2026-09-20',
    title: 'Řazení projektů tažením, víc barev a čitelnější odznaky',
    items: [
      'Karty projektů si seřadíš tažením: chytíš kartu, zvedne se a ostatní se plynule uhýbají. Na telefonu se táhne za úchyt v rohu karty, z klávesnice Alt a šipkami. Pořadí se ukládá; Esc tah zruší.',
      'Barev projektů je šestnáct a kalná žlutá je nahrazená čistě slunečnicovou. Starší projekty se žlutou se převedou samy.',
      'Logo klienta vyplní celý rámeček tak, jak sis ho vybral(a) ve výřezu, bez bílých pruhů. Logo nahrané dřív s okraji stačí nahrát znovu s volbou Vyplnit.',
      'Zelené odznaky (počet agentů) a vybraná volba vzhledu mají bílé písmo na tmavší zelené, takže se čtou i v malé velikosti.',
    ],
    en: {
      title: 'Sort projects by dragging, more colours and more readable badges',
      items: [
        'Sort project cards by dragging: grab a card, it lifts and the others move smoothly out of the way. On a phone you drag by the handle in the card’s corner, from the keyboard with Alt and the arrow keys. The order is saved; Esc cancels the drag.',
        'There are sixteen project colours, and the muddy yellow is replaced by a clean sunflower. Older projects with yellow convert on their own.',
        'The client logo fills the whole frame the way you chose it in the crop, without white bars. For a logo uploaded earlier with margins, just upload it again with the Fill option.',
        'Green badges (agent count) and the selected appearance option have white text on a darker green, so they’re readable even at a small size.',
      ],
    },
  },
  {
    version: '0.15.2',
    date: '2026-09-20',
    title: 'Vyvážené sloupce bez prázdných ploch',
    items: [
      'Přehled i Statistiky si srovnávají sloupce karet podle skutečné výšky obsahu. Útrata a Poslední aktivita (v Přehledu) a čtveřice žebříčků (ve Statistikách) se přesunou tam, kde je právě míň místa, takže pod kratším sloupcem nezůstává prázdná plocha.',
      'Přesun se dělá jen při znatelném rozdílu, ať karty neskáčou. Na telefonu jde všechno pod sebe ve stejném pořadí jako dřív.',
      'Karty na stránce Útrata mají mezi sebou stejné mezery.',
    ],
    en: {
      title: 'Balanced columns without empty areas',
      items: [
        'Overview and Statistics balance their card columns by the actual height of the content. Spend and Recent activity (in Overview) and the four leaderboards (in Statistics) move to wherever there’s currently less content, so no empty space is left under the shorter column.',
        'Cards only move when the difference is noticeable, so they don’t jump. On a phone everything stacks in the same order as before.',
        'Cards on the Spend page have equal gaps between them.',
      ],
    },
  },
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
    en: {
      title: 'Clearer Skills, bolder toggles and a livelier top band',
      items: [
        'Skills have a clear order: search and sorting at the top, the labelled Source and Origin filters below. The selected item is dark and bolder, so you can see what’s switched on.',
        'A single budget card stretches across the full width, on a phone too.',
        'Fixed the “All agents” button in the Overview top band, which had a white background and unreadable light text.',
        'The Overview top band has a bolder and lighter colour gradient.',
      ],
    },
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
    en: {
      title: 'More readable controls, image cropping and a custom calendar',
      items: [
        'Links like “Details”, “Data sources” or “Show all” look like buttons: they have an outline and an arrow, and fill in on hover. The expandable limits overview is a button too.',
        'The project image is saved with a crop you set yourself: drag to move the image and use the slider to zoom, see straight away what will be saved, and the app tells you the recommended size and when the image would be blurry. It’s saved in high resolution, so it’s sharp on the card.',
        'Dates are picked in a calendar in the app’s style instead of the system window.',
        'The last prompt in the agent detail can be expanded in full and shows the entire text, not just the first few words.',
        'The token average says which period it’s based on (the previous 7 days).',
      ],
    },
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
    en: {
      title: 'Subscriptions in Spend, the current exchange rate and more readable tokens',
      items: [
        'Spend now counts subscriptions too. Agenteeq recognises the Claude plan from the signed-in Claude Code and the ChatGPT plan from Codex limits. For each you see how it was detected, the list price and the amount in Czech crowns.',
        'The crown exchange rate is downloaded from the Czech National Bank, and amounts show which day it applies to. A manually entered rate stays as you set it. When the price can’t be told from the data (ChatGPT Pro has two), you pick it yourself and until then it isn’t counted.',
        'The token breakdown has its own scale for usage and for cache, so you can see the ratio of input to output and the difference between cache writes and reads.',
        'The menu in the left panel stays together even on a tall monitor, and the alert badge shows at most 10+.',
        'Fixed a dark, clipped shadow under the buttons in the agent picker when focused with the keyboard.',
      ],
    },
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
    en: {
      title: 'An overview of all limits, project images and calmer notifications',
      items: [
        'Notifications show one at a time and you can tell them apart at a glance: green with a tick means the action worked, red with an exclamation mark means it didn’t. The four identical black bars stacked on top of each other are gone.',
        'Limit windows have an expandable overview of all tools. For each you see the measured limits and how old the measurement is, and for tools whose limit local data doesn’t reveal, it says so directly – nothing is guessed.',
        'Projects have images. Upload a card image or a client logo (large photos are scaled down automatically) and you’ll find the project faster. Without an image the card gets an elegant gradient; the project colour stays as a subtle stripe.',
        'The “When agents work” map smoothly enlarges on hover and shows the day, the hour, the number of tokens, on how many days there was work at that time and which tool had the largest share.',
        '“Live data” has gone from the left panel; the connection status is now in the top right.',
      ],
    },
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
    en: {
      title: 'More honest states, clearer Settings, safer launching',
      items: [
        'The app no longer claims “installed” just because a folder was left on disk. Gemini CLI, Qwen Code, Copilot and Cursor report as found only when the tool is really on the Mac; otherwise it says only a trace of it is left.',
        'Under the “tokens today” number in the side panel you can see which tools caused it, and the label says it’s input and output without cache, not a price or a limit.',
        'Settings are a quarter shorter. Agent sources are one clear list, web services one row of chips, and tools that weren’t found are collapsed. The Claude Code connection and installation for other people only appear for those who can use them.',
        'Security per an independent audit: a conversation with a forged label can no longer run a command with someone else’s flag, “Open folder” won’t open a package as a program, Claude Code settings backups are readable only by you, and only the Mac issues the extension pairing code.',
      ],
    },
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
    en: {
      title: 'Agents on your phone from anywhere, through your own network',
      items: [
        'A new card in Settings: Access via Tailscale. With one switch Agenteeq also starts listening on the address your tailnet assigned to this Mac – and you see your agents on your phone even away from home.',
        'No public address is created. Pairing the phone with a code and the token still apply, and the home network stays a separate switch, so turning one off doesn’t close the other.',
        'The app also shows whether you have HTTPS turned on via “tailscale serve”. Without it the phone won’t save the app to the home screen; Agenteeq won’t start it for you.',
        'The Chrome extension window now has the same fonts and colours as the app, including night mode.',
        'Agenteeq has its own website with a description and downloads. The interface stays on it at the /app address.',
      ],
    },
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
    en: {
      title: 'Ready for long-running use',
      items: [
        'When the data file gets damaged, the app still starts: it restores the data from the last backup and tells you what happened. It keeps the damaged file saved alongside.',
        'When changes can’t be saved to disk (full disk, folder permissions), you see it straight away at the top of the window – nothing gets lost silently.',
        'After an unexpected crash the local service recovers on its own even after weeks of running, not just three times in total.',
        'A deleted conversation disappears from the overview straight away, projects attached via a link are visible, and an agent with a wrongly set clock no longer shows “working” forever.',
        'On a Mac without Claude Code, a connection that can’t be used isn’t offered, and smaller links on the phone are easier to tap.',
      ],
    },
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
    en: {
      title: 'A Chrome extension you know you have',
      items: [
        'The guide and the first steps in Overview explain the Chrome extension: what it does and how to install it in a minute.',
        'The extension has a new window: you see straight away whether it’s paired, when it last sent data and which services it follows.',
        'The app remembers that the extension is paired. After a restart it no longer shows “not installed”.',
        'When an older version of the extension is running in Chrome, both the app and the extension tell you how to update it.',
        'After every update, what changed shows up here. You can come back here any time via the version in the side panel.',
      ],
    },
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
    en: {
      title: 'The prompt is always on the clipboard, and pastes into Gemini on its own',
      items: [
        'After launching an app or a website, the prompt is reliably on the clipboard. Previously copying silently failed in the app window and on the phone.',
        'Czech on the clipboard stays intact – no more “n�zev” instead of “název”.',
        'Gemini and Qwen can’t take a prompt from the address. With the extension the prompt is pasted into their window on its own; you send it with Enter.',
        'Overview has fixed columns: blocks no longer jump with the window width and no empty gaps appear.',
      ],
    },
  },
  {
    version: '0.10.1',
    date: '2026-09-13',
    title: 'Poctivě o tom, co aplikace nevidí',
    items: [
      'Když ti chybí rozšíření pro Chrome, Přehled i Agenti řeknou, že konverzace z prohlížeče nevidí a jak to napravit.',
    ],
    en: {
      title: 'Honest about what the app can’t see',
      items: [
        'When you’re missing the Chrome extension, Overview and Agents say they can’t see browser conversations and how to fix it.',
      ],
    },
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
    en: {
      title: 'Spend comes alive, skills have an origin',
      items: [
        'Skills can be filtered by origin: from Anthropic, from OpenAI, from a plugin or your own.',
        'A new “Where today’s tokens went” widget shows which tool used the most today.',
        'Spend shows credits and data right at the top instead of empty blocks.',
        'The app window can be grabbed by its top edge and moved again.',
      ],
    },
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
    en: {
      title: 'Numbers verified against the sources',
      items: [
        'Tokens in the charts have been recalculated three times independently and match the Claude Code and Codex transcripts.',
        'A dark window title bar instead of the white system bar, flat cards without shadows and a readable transcript.',
        'Smooth scrolling on 120 and 240 Hz displays.',
      ],
    },
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
