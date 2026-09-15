# Agenteeq na Windows

Tenhle dokument říká, co na Windows **doloženě** funguje, co ne, a co by stálo plnohodnotná
aplikace. Nic tu není odhad. Kde důkaz chybí, je to napsané slovem „neověřeno“.

Zdroj důkazů: `.github/workflows/test.yml` – testy a `npm run smoke:server` běží na
`ubuntu-latest`, `macos-latest` i `windows-latest` při každém pushi.

## Krátká odpověď

**Jádro Agenteeq na Windows běží.** Není to macOS aplikace, kterou by šlo na Windows jen
přenést – je to server v čistém Node bez jediné závislosti, a ten je přenositelný ze své
podstaty. Co na Windows chybí, není jádro, ale **plášť**: okno aplikace, ikona v hlavním
panelu, systémová oznámení a ty funkce, které sahají na macOS (Klíčenka, otevírání `.app`,
LaunchAgent).

Jinými slovy: **od „běží na Windows“ jsme dál, než by se čekalo. Od „aplikace pro Windows,
za kterou někdo zaplatí“ nás dělí plášť a ověření na skutečném stroji.**

## Co je doložené

| | macOS | Windows |
|---|---|---|
| Testy (`npm test`) | ✅ zelené | ✅ zelené |
| Aplikace nastartuje a obslouží rozhraní (`npm run smoke:server`) | ✅ | ✅ |
| Rozhraní, stav, konektory přes HTTP | ✅ | ✅ |
| Zákaz cesty ven z `public/`, ochrana proti CSRF | ✅ | ✅ |

Smoke nesahá do vnitřku aplikace – mluví s ní jen přes HTTP, stejně jako prohlížeč. To, že
projde na `windows-latest`, znamená, že se aplikace na Windows opravdu spustí a rozhraní
opravdu vydá.

## Co funguje, co ne a proč

### Funguje bez jediné změny

Konektory, které čtou z domovské složky, mají na Windows tutéž cestu – `~/.claude` je
`C:\Users\<jméno>\.claude`. Cesty se skládají přes `path.join`, takže se poskládají samy.

| Konektor | Zdroj |
|---|---|
| Claude Code | `~/.claude/projects` |
| Codex | `~/.codex/sessions` |
| Copilot CLI | `~/.copilot/session-state` |
| Gemini CLI, Qwen Code | `~/.gemini/tmp`, `~/.qwen/tmp` |
| Webové aplikace | rozšíření pro Chrome → HTTP, na systému nezávislé |
| Náklady z Admin API | HTTPS, na systému nezávislé |

Dál funguje celý zbytek jádra: model stavu, úložiště, statistiky, útrata, projekty, git
worktrees, přístup z telefonu i Tailscale.

**Neověřeno:** že Claude Code a Codex na Windows opravdu ukládají do `%USERPROFILE%\.claude`
a `%USERPROFILE%\.codex`. Cesta se poskládá správně, ale jestli tam ty nástroje skutečně
zapisují, se z Macu ani z CI zjistit nedá. Chce to jeden skutečný stroj.

### Funguje, ale cesta nebyla ověřená na skutečném stroji

Cursor, Copilot ve VS Code a Claude Desktop drží data v systémové složce aplikací. Ta se
liší jen základem, zbytek struktury je všude stejný – proto je v `src/platform.js` jediná
funkce `appSupportDir()`:

| | macOS | Windows |
|---|---|---|
| základ | `~/Library/Application Support` | `%APPDATA%` (`~\AppData\Roaming`) |

Kód je napojený, ale **Windows varianta není ověřená na skutečném stroji** – v
`docs/CONNECTORS.md` proto patří mezi 🧪 Beta, dokud ji někdo nepotvrdí.

### Nefunguje, protože ten mechanismus Windows nemá

| Co | Proč | Co by to chtělo |
|---|---|---|
| Nativní oznámení | `osascript` je macOS | Toast přes WinRT – potřebuje balíčkovanou aplikaci s AppUserModelID |
| Klíčenka pro API klíče | `/usr/bin/security` je macOS | DPAPI nebo Credential Manager přes malý nativní pomocník. **Obejde se proměnnou prostředí, ta funguje všude** |
| Otevření session v aplikaci | `open -a` a cesty `/Applications/*.app` | Hledání v registru a `%LOCALAPPDATA%\Programs`; „přepni do okna aplikace“ nemá na Windows přímou obdobu |
| Pokračování v Terminálu | AppleScript nad Terminal.app | Windows Terminal (`wt.exe`), ale příkaz by se musel skládat pro `cmd.exe`, ne pro shell |
| Automatický start po přihlášení | LaunchAgent | Složka Po spuštění nebo Plánovač úloh |
| Hooky Claude Code | zapsaný příkaz je shellový (`\|\| true`, `>/dev/null`) | Varianta pro `cmd.exe` nebo PowerShell |
| Spouštění agentů na pozadí | `execFile` bez shellu neumí na Windows spustit `.cmd` | npm na Windows vyrábí pro `claude`/`codex` právě `.cmd` – chce to vlastní cestu |

Žádná z těchhle věcí nepadá. Server je odmítne čistou hláškou a běží dál.

### Detekce běžících aplikací

`ps` a `lsof` na Windows nejsou. `src/platform.js` má proto obojí i pro Windows přes
PowerShell (`Win32_Process`, `Get-NetTCPConnection`) a skládá to do stejného tvaru, takže
oba konektory čte jeden parser.

**Neověřeno:** že katalog aplikací sedí i na Windows. Dnes hledá `Claude.app`, `Cursor.app`,
`Code.app` – na Windows se jmenují `.exe` a jinak. Přepsat katalog je hodina práce, ale
ověřit ho jde jen na stroji, kde ty aplikace opravdu běží.

Do té doby konektory raději hlásí **„nevíme“** než „nic neběží“. Rozdíl je zásadní: druhé
je lež, která vypadá jako údaj.

## Co by stála aplikace pro Windows

Plášť aplikace na macOS je `desktop/Agenteeq.swift` – okno s WebKitem, ikona, odznak a
oznámení. Dělá tři věci: spustí `desktop/server.mjs` přibaleným Node, čte z něj jednořádkový
protokol `AGENTEEQ_DESKTOP {json}` a zobrazí okno.

**Ten protokol je přesně ten šev, na kterém se dá stavět jinde.** `desktop/server.mjs` je
obyčejný Node a nic macOSového v sobě nemá.

Zbývá tedy hostitel pro Windows. Dvě cesty:

| | A) Přibalený Node + Edge v režimu `--app` | B) Vlastní okno nad WebView2 |
|---|---|---|
| Vzhled | okno prohlížeče bez ovládacích prvků | skutečné okno aplikace, vlastní ikona, vlastní místo v hlavním panelu |
| Oznámení | jen v prohlížeči | systémové toasty |
| Sestavení | žádné – stačí Node | potřebuje na CI nástroje pro Windows |
| Kdy je hotovo | dny | týdny |
| Dojem | „spustili mi prohlížeč“ | prémiový |

**Doporučuju B.** A je rychlejší, ale prodává se dojem, a okno prohlížeče bez ovládacích
prvků poznají lidé na první pohled. Zároveň by A byla práce, která se pak celá zahodí.

Jedna věc k tomu patří a bude se rozhodovat: spousta vývojářů na Windows pouští AI nástroje
uvnitř **WSL2**. Tam `~/.claude` neleží v profilu Windows, ale pod `\\wsl$\<distribuce>\home\…`.
Agenteeq to dnes neumí. Je to práce navíc – a zároveň možná ta nejzajímavější, protože
konkurence to skoro jistě neřeší.

## Jak to rozdělit ke stažení

Dvě různé otázky, dvě různé odpovědi.

**macOS: Intel vs. Apple silicon – nerozdělovat.** Univerzální balíček (Universal 2) obsahuje
obojí a systém si vezme, co potřebuje. Uživatel nic nevybírá, protože nemá jak se splést.
Jediná cena je velikost souboru, a ta za to stojí.

**Windows: podle verze systému – taky nerozdělovat.** Jeden build x64 pokrývá Windows 10
i 11 a na ARM verzi Windows běží v emulaci. Nabídnout víc souborů znamená, že si někdo
vybere špatný, a první zkušenost s produktem je chybová hláška.

**Na webu tedy dvě tlačítka, ne šest:** „Stáhnout pro Mac“ a „Stáhnout pro Windows“. Který
build je ten správný, je starost naše, ne uživatelova.

## Co ještě chybí, než půjde Windows komunikovat na webu

Podle pravidla v `CLAUDE.md` („Nevymýšlej data. Neověřené = Beta.“) se tlačítko
**„Stáhnout pro Windows“ na web nedává, dokud tohle neproběhne:**

1. Spustit Agenteeq na skutečném Windows a projít rozhraní očima.
2. Ověřit, kam na Windows ukládají Claude Code, Codex, Cursor, VS Code a Claude Desktop,
   a zapsat to do `docs/CONNECTORS.md`.
3. Přepsat katalog běžících aplikací na windowsové názvy.
4. Rozhodnout plášť (A/B výš) a postavit ho.
5. Podepsat build. Bez podpisu ukáže SmartScreen varování a část lidí instalaci vzdá.

Kroky 1–3 jde udělat hned, jakmile bude po ruce Windows. Krok 5 je otázka certifikátu, ne
kódu.
