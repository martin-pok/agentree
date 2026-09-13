// Verzi aplikace hlásí macOS z Info.plist (Finder, dialog „O aplikaci“, Informace o souboru).
// Držet ji v souboru ručně znamená, že jednou zapomeneš a uživatel vidí starou — přesně to se
// stalo mezi 0.6.0 a 0.8.0. Proto se do balíčku razítkuje při každém buildu z package.json.
export function stampVersion(plist, version) {
  const v = String(version);
  if (!/^\d+(\.\d+){1,2}$/.test(v)) throw new Error(`Verze ${v} nemá tvar 1.2.3 — Info.plist ji nepřijme.`);
  let out = plist.replace(
    /(<key>CFBundleShortVersionString<\/key>\s*<string>)[^<]*(<\/string>)/,
    (_, a, b) => `${a}${v}${b}`,
  );
  // CFBundleVersion je číslo buildu. Držíme ho stejné jako verzi — jeden zdroj pravdy stačí.
  out = out.replace(/(<key>CFBundleVersion<\/key>\s*<string>)[^<]*(<\/string>)/, (_, a, b) => `${a}${v}${b}`);
  if (!out.includes(`<string>${v}</string>`)) throw new Error('V Info.plist chybí klíč s verzí — razítkování selhalo.');
  return out;
}
