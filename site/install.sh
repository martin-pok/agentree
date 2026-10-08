#!/bin/bash
# Agenteeq – instalace jedním příkazem pro macOS / one-command install for macOS.
#
#   curl -fsSL https://agentree-fawn.vercel.app/install.sh | bash
#
# Proč tahle cesta existuje: aplikace má zatím jen ad-hoc podpis (bez Developer ID od Applu).
# Soubor stažený prohlížečem dostane příznak com.apple.quarantine a Gatekeeper ho napoprvé
# odmítne otevřít. Soubor stažený curlem v Terminálu ten příznak nedostane – proto skript
# balíček stáhne sám a místo razítka Applu ověří otisk SHA-256, který GitHub u přílohy vydání
# zveřejňuje (stejné pravidlo jako src/updates.js: příloha bez otisku se nestahuje).
#
# Co skript dělá a co ne:
#   - mluví jen s api.github.com a github.com (a s úložištěm, kam GitHub přesměruje stažení),
#     nic neposílá, žádná telemetrie;
#   - nepoužívá sudo; když /Applications nejde zapsat, instaluje do ~/Applications;
#   - starou aplikaci nikdy nemaže: přesune ji do Koše, a když to nejde, nechá ji vedle
#     jako Agenteeq-<verze>.backup.app;
#   - lze ho spustit znovu kolikrát chceš: stejnou verzi jen ověří a otevře.
#
# Proměnné jen pro testy (test/instalace.test.mjs): AGENTEEQ_INSTALL_DIR přesměruje instalaci
# do jiné složky a zároveň vypne ukončení a otevření aplikace, AGENTEEQ_TRASH_DIR nahradí Koš.
set -euo pipefail

REPO="martin-pok/agentree"
API_URL="https://api.github.com/repos/${REPO}/releases/latest"
DOWNLOAD_PREFIX="https://github.com/${REPO}/releases/download/"
APP_NAME="Agenteeq.app"
BUNDLE_ID="cz.agenteeq.desktop"
MIN_MACOS=14
MAX_BYTES=524288000

WORK=""
STAGE=""

say() { printf '%s\n' "$@"; }

# Chyba vždy česky i anglicky: co se stalo a co dělat.
fail() {
  printf '\nChyba: %s\nError: %s\n' "$1" "$2" >&2
  exit 1
}

cleanup() {
  if [ -n "$WORK" ] && [ -d "$WORK" ]; then rm -rf "$WORK"; fi
  if [ -n "$STAGE" ] && [ -d "$STAGE" ]; then rm -rf "$STAGE"; fi
}

plist_value() {
  plutil -extract "$2" raw -o - "$1/Contents/Info.plist" 2>/dev/null || true
}

# Běží Agenteeq odkudkoli? Okno (MacOS/Agenteeq) i jeho lokální služba (Resources/node).
app_running() {
  pgrep -f '/Agenteeq\.app/Contents/(MacOS/Agenteeq|Resources/node)' >/dev/null 2>&1
}

# Ukončí běžící Agenteeq stejně jako ⌘Q. Když do 10 s neskončí, instalace se zastaví a nic se nemění.
quit_running() {
  app_running || return 0
  say "Agenteeq: ukončuji běžící aplikaci… / quitting the running app…"
  osascript -e "tell application id \"$BUNDLE_ID\" to quit" </dev/null >/dev/null 2>&1 || true
  local waited=0
  while app_running && [ "$waited" -lt 20 ]; do sleep 0.5; waited=$((waited + 1)); done
  if app_running; then
    fail "Agenteeq se nepodařilo ukončit (možná čeká na potvrzení v okně). Ukonči ho ⌘Q a spusť příkaz znovu. Nic se nezměnilo." \
         "Agenteeq didn't quit (it may be waiting for a confirmation). Quit it with ⌘Q and run the command again. Nothing was changed."
  fi
}

# Starší kopie Agenteeq jinde na disku (Stažené soubory, druhá složka Aplikace). Dock nebo
# Spotlight pak můžou otevírat tu starou. Jen se vypíšou – mazat je smí jen uživatel.
report_other_copies() {
  local keep="$1" copy v found=""
  command -v mdfind >/dev/null 2>&1 || return 0
  while IFS= read -r copy; do
    [ -n "$copy" ] && [ "$copy" != "$keep" ] || continue
    case "$copy" in "$HOME/.Trash/"*|*"/.agenteeq-install."*|/Volumes/*) continue ;; esac
    v="$(plist_value "$copy" CFBundleShortVersionString)"
    found="${found}  ${copy} (${v:-?})"$'\n'
  done < <(mdfind "kMDItemCFBundleIdentifier == '$BUNDLE_ID'" 2>/dev/null || true)
  [ -n "$found" ] || return 0
  say "" "Pozor: na Macu jsou i další kopie Agenteeq. Dock nebo Spotlight může otevírat starou – přesuň je do Koše:" \
      "Note: there are other copies of Agenteeq on this Mac. The Dock or Spotlight may open an old one – move them to the Trash:"
  printf '%s' "$found"
}

# Výběr přílohy a kontrola tvaru odpovědi GitHubu. JSON čte JavaScript zabudovaný v macOS
# (osascript), takže skript nepotřebuje jq ani Python.
parse_release() {
  osascript -l JavaScript -e '
ObjC.import("Foundation");
function run(argv) {
  var text = $.NSString.stringWithContentsOfFileEncodingError(argv[0], $.NSUTF8StringEncoding, null);
  if (!text || text.isNil()) return "error\tjson";
  var r;
  try { r = JSON.parse(text.js); } catch (e) { return "error\tjson"; }
  if (!r || typeof r !== "object" || r.draft || r.prerelease) return "error\trelease";
  var tag = String(r.tag_name || "");
  var version = tag.replace(/^v/, "");
  if (!/^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(version)) return "error\trelease";
  var name = "Agenteeq-" + version + "-macOS-" + argv[1] + ".zip";
  var assets = Array.isArray(r.assets) ? r.assets : [];
  var asset = null;
  for (var i = 0; i < assets.length; i++) if (assets[i] && assets[i].name === name) asset = assets[i];
  if (!asset) return "error\tasset\t" + name;
  var url = String(asset.browser_download_url || "");
  if (url !== argv[2] + tag + "/" + name) return "error\turl\t" + name;
  var size = Number(asset.size);
  if (!(size >= 1 && size <= Number(argv[3]) && Math.floor(size) === size)) return "error\tsize\t" + name;
  var m = /^sha256:([0-9a-f]{64})$/.exec(typeof asset.digest === "string" ? asset.digest : "");
  if (!m) return "error\tdigest\t" + name;
  return ["ok", version, name, String(size), m[1], url].join("\t");
}' "$1" "$2" "$DOWNLOAD_PREFIX" "$MAX_BYTES" </dev/null
}

# Starou verzi do Koše. Když Koš nejde použít, zůstane vedle s viditelným jménem – nikdy se nemaže.
to_trash() {
  local src="$1" label="$2" target
  if [ -n "${AGENTEEQ_TRASH_DIR:-}" ]; then
    mv "$src" "$AGENTEEQ_TRASH_DIR/$label $(date +%Y-%m-%d\ %H.%M.%S).app" 2>/dev/null && return 0
    return 1
  fi
  [ -n "${AGENTEEQ_INSTALL_DIR:-}" ] && return 1
  if [ -x /usr/bin/trash ] && /usr/bin/trash "$src" >/dev/null 2>&1; then return 0; fi
  target="$HOME/.Trash/$label $(date +%Y-%m-%d\ %H.%M.%S).app"
  mv "$src" "$target" 2>/dev/null && return 0
  return 1
}

main() {
  if [ "$(uname -s)" != "Darwin" ]; then
    fail "Agenteeq se tímto příkazem instaluje jen na Mac. Na Windows stáhni balíček z https://github.com/${REPO}/releases/latest." \
         "This command installs Agenteeq on a Mac only. On Windows, download the package from https://github.com/${REPO}/releases/latest."
  fi

  local macos major
  macos="$(sw_vers -productVersion 2>/dev/null || echo 0)"
  major="${macos%%.*}"
  case "$major" in ''|*[!0-9]*) major=0 ;; esac
  if [ "$major" -lt "$MIN_MACOS" ]; then
    fail "Agenteeq potřebuje macOS ${MIN_MACOS} nebo novější (tento Mac má ${macos})." \
         "Agenteeq needs macOS ${MIN_MACOS} or later (this Mac runs ${macos})."
  fi

  # Terminál spuštěný přes Rosettu hlásí x86_64 i na čipu Apple – správný balíček je pak arm64.
  local machine arch
  machine="$(uname -m)"
  if [ "$machine" = "x86_64" ] && [ "$(sysctl -in sysctl.proc_translated 2>/dev/null || echo 0)" = "1" ]; then machine="arm64"; fi
  case "$machine" in
    arm64) arch="arm64" ;;
    x86_64) fail "Agenteeq běží jen na Macích s čipem Apple (M1 a novější). Tenhle Mac má procesor Intel." \
                 "Agenteeq runs only on Macs with Apple silicon (M1 or later). This Mac has an Intel processor." ;;
    *) fail "Neznámý procesor „${machine}“. Stáhni balíček ručně z https://github.com/${REPO}/releases/latest." \
            "Unknown processor \"${machine}\". Download the package manually from https://github.com/${REPO}/releases/latest." ;;
  esac

  # Kam instalovat. Existující Agenteeq se aktualizuje tam, kde je; nový jde do /Applications,
  # a když tam nejde zapisovat bez správce, do ~/Applications. Sudo se nepoužívá.
  local dest test_mode=""
  if [ -n "${AGENTEEQ_INSTALL_DIR:-}" ]; then
    test_mode=1
    dest="$AGENTEEQ_INSTALL_DIR"
  elif [ -e "/Applications/$APP_NAME" ]; then
    dest="/Applications"
  elif [ -e "$HOME/Applications/$APP_NAME" ]; then
    dest="$HOME/Applications"
  elif [ -w "/Applications" ]; then
    dest="/Applications"
  else
    dest="$HOME/Applications"
  fi
  mkdir -p "$dest" 2>/dev/null || true
  if [ ! -d "$dest" ] || [ ! -w "$dest" ]; then
    fail "Do složky ${dest} nejde zapisovat bez oprávnění správce. Přesuň tamní Agenteeq do Koše a spusť příkaz znovu – nainstaluje se do ~/Applications." \
         "${dest} isn't writable without admin rights. Move the Agenteeq there to the Trash and run the command again – it will install to ~/Applications."
  fi

  WORK="$(mktemp -d "${TMPDIR:-/tmp}/agenteeq-install.XXXXXX")"
  trap cleanup EXIT

  say "Agenteeq: hledám poslední vydání… / looking up the latest release…"
  if ! curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' \
      --connect-timeout 15 --max-time 60 --retry 2 \
      -H 'Accept: application/vnd.github+json' -H 'X-GitHub-Api-Version: 2022-11-28' \
      -o "$WORK/release.json" "$API_URL"; then
    fail "Poslední vydání se z GitHubu nepodařilo načíst (síť, nebo limit dotazů GitHubu). Zkus to za pár minut znovu." \
         "Couldn't load the latest release from GitHub (network, or GitHub's rate limit). Try again in a few minutes."
  fi

  local parsed status version name size sha url
  parsed="$(parse_release "$WORK/release.json" "$arch" || true)"
  IFS=$'\t' read -r status version name size sha url <<<"$parsed" || true
  if [ "$status" != "ok" ]; then
    case "$version" in
      asset) fail "Poslední vydání nemá balíček pro tento Mac (${name}). Nic se nezměnilo." \
                  "The latest release has no package for this Mac (${name}). Nothing was changed." ;;
      digest) fail "GitHub u balíčku ${name} neuvádí otisk SHA-256, takže ho nejde ověřit. Instalace se zastavila, nic se nezměnilo." \
                   "GitHub lists no SHA-256 digest for ${name}, so it can't be verified. Installation stopped; nothing was changed." ;;
      *) fail "Odpověď GitHubu o vydání má nečekaný tvar (${version:-prázdná}). Nic se nezměnilo." \
              "GitHub's release response looks unexpected (${version:-empty}). Nothing was changed." ;;
    esac
  fi
  case "$url" in "$DOWNLOAD_PREFIX"*) ;; *) fail "Adresa balíčku nevede na GitHub. Nic se nezměnilo." "The package URL doesn't point to GitHub. Nothing was changed." ;; esac

  # Stejná verze, která sedí s podpisem, se jen otevře – opakované spuštění nic nerozbije.
  local current="$dest/$APP_NAME"
  if [ -d "$current" ] && [ "$(plist_value "$current" CFBundleShortVersionString)" = "$version" ] \
      && codesign --verify --deep --strict "$current" >/dev/null 2>&1; then
    say "Agenteeq ${version} už v ${dest} je – nejnovější verze, nic se nestahuje." \
        "Agenteeq ${version} is already in ${dest} – the latest version, nothing to download."
    if [ -z "$test_mode" ]; then
      # Po výměně aplikace ve Finderu běží na pozadí dál stará verze a `open` by probudil právě ji.
      # Proto se běžící Agenteeq nejdřív ukončí a otevře se znovu ten z disku.
      quit_running
      open "$current" </dev/null || true
      report_other_copies "$current"
    fi
    return 0
  fi

  say "Agenteeq: stahuji ${name}… / downloading ${name}…"
  local zip="$WORK/$name"
  if ! curl --fail --location --proto '=https' --proto-redir '=https' \
      --connect-timeout 15 --max-time 900 --retry 2 --progress-bar \
      -o "$zip" "$url"; then
    fail "Stažení se nepovedlo. Zkontroluj připojení a spusť příkaz znovu. Nic se nezměnilo." \
         "The download failed. Check your connection and run the command again. Nothing was changed."
  fi

  local actual_size actual_sha
  actual_size="$(wc -c <"$zip" | tr -d ' ')"
  if [ "$actual_size" != "$size" ]; then
    fail "Stažený balíček má ${actual_size} B místo ${size} B podle GitHubu. Instalace se zastavila, nic se nezměnilo." \
         "The downloaded package is ${actual_size} B instead of ${size} B per GitHub. Installation stopped; nothing was changed."
  fi
  actual_sha="$(shasum -a 256 "$zip" | awk '{print $1}')"
  if [ "$actual_sha" != "$sha" ]; then
    fail "Otisk SHA-256 staženého balíčku nesedí s otiskem na GitHubu. Instalace se zastavila, nic se nezměnilo." \
         "The SHA-256 digest of the download doesn't match GitHub's. Installation stopped; nothing was changed."
  fi
  say "Agenteeq: otisk SHA-256 sedí s GitHubem. / SHA-256 digest matches GitHub."

  mkdir "$WORK/app"
  if ! ditto -x -k "$zip" "$WORK/app"; then
    fail "Balíček nejde rozbalit. Nic se nezměnilo." "The package can't be unpacked. Nothing was changed."
  fi
  local fresh="$WORK/app/$APP_NAME"
  if [ ! -d "$fresh/Contents" ] || [ "$(plist_value "$fresh" CFBundleIdentifier)" != "$BUNDLE_ID" ]; then
    fail "V balíčku chybí aplikace Agenteeq. Nic se nezměnilo." "The package doesn't contain the Agenteeq app. Nothing was changed."
  fi
  if [ "$(plist_value "$fresh" CFBundleShortVersionString)" != "$version" ]; then
    fail "Aplikace v balíčku má jinou verzi než vydání ${version}. Nic se nezměnilo." \
         "The app in the package has a different version than release ${version}. Nothing was changed."
  fi
  if ! codesign --verify --deep --strict "$fresh" >/dev/null 2>&1; then
    fail "Podpis aplikace v balíčku neprošel kontrolou (codesign). Nic se nezměnilo." \
         "The app's signature failed verification (codesign). Nothing was changed."
  fi

  # Kopie vedle cíle (stejný disk), aby výměna byla jen přejmenování.
  STAGE="$(mktemp -d "$dest/.agenteeq-install.XXXXXX")"
  if ! ditto "$fresh" "$STAGE/$APP_NAME"; then
    fail "Aplikaci se nepodařilo zkopírovat do ${dest} (místo na disku?). Nic se nezměnilo." \
         "Couldn't copy the app to ${dest} (disk space?). Nothing was changed."
  fi
  xattr -dr com.apple.quarantine "$STAGE/$APP_NAME" 2>/dev/null || true

  # Běžící Agenteeq se ukončí stejně jako ⌘Q. Když do 10 s neskončí, nic se nemění.
  [ -n "$test_mode" ] || quit_running

  local previous="" old_version=""
  if [ -e "$current" ]; then
    old_version="$(plist_value "$current" CFBundleShortVersionString)"
    previous="$dest/Agenteeq-${old_version:-previous}.backup.app"
    [ ! -e "$previous" ] || previous="$dest/Agenteeq-${old_version:-previous}.backup-$(date +%Y%m%d%H%M%S).app"
    if ! mv "$current" "$previous"; then
      fail "Starou verzi v ${dest} nejde odsunout. Nic se nezměnilo." "The old version in ${dest} can't be moved aside. Nothing was changed."
    fi
  fi
  if ! mv "$STAGE/$APP_NAME" "$current"; then
    [ -z "$previous" ] || mv "$previous" "$current" || true
    fail "Novou verzi se nepodařilo přesunout do ${dest}. Původní aplikace zůstala na místě." \
         "Couldn't move the new version into ${dest}. The original app was left in place."
  fi
  xattr -dr com.apple.quarantine "$current" 2>/dev/null || true

  if [ -n "$previous" ]; then
    if to_trash "$previous" "Agenteeq ${old_version:-previous}"; then
      say "Agenteeq: předchozí verze ${old_version} je v Koši. / previous version ${old_version} moved to the Trash."
    else
      say "Agenteeq: předchozí verze zůstala v ${previous} – smaž ji, až nebude potřeba." \
          "Agenteeq: the previous version was kept at ${previous} – delete it when you no longer need it."
    fi
  fi

  say "" "Hotovo: Agenteeq ${version} je nainstalovaný v ${dest}." "Done: Agenteeq ${version} is installed in ${dest}."
  if [ -z "$test_mode" ]; then
    open "$current" </dev/null || true
    say "Aplikace se otevírá. Další verze nabídne sama v Nastavení." "The app is opening. It offers new versions itself in Settings."
    report_other_copies "$current"
  fi
}

main "$@"
