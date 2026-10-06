// Obraz disku (.dmg) pro Mac: okno s Agenteeq.app a zkratkou na Aplikace, kam se aplikace
// jen přetáhne. Pro člověka, který Agenteeq instaluje poprvé, je to známější cesta než ZIP –
// nic se nerozbaluje a jak „nainstalovat“ je vidět přímo v okně.
//
// ZIP zůstává vedle: z něj instaluje `site/install.sh` i aktualizace v aplikaci (src/updates.js)
// a oba hledají přílohu přesně podle jména. DMG je jen další příloha, nic z toho nenahrazuje.
//
// Plán je čistá funkce (seznam příkazů s argumenty, žádný shell), aby šel ověřit testem
// i na Linuxu, kde `hdiutil` není (test/dmg.test.mjs). Spouští ho scripts/build-macos.mjs.
// Obraz disku vzniká jen na macOS, takže cesty jsou vždy unixové – i když plán ověřuje test na Windows.
import { posix as path } from 'node:path';

// Stálé jméno přílohy, na kterou vede tlačítko na webu (/releases/latest/download/…).
// Kopii se stálým jménem přikládá k vydání workflow (.github/workflows/release.yml).
export const DMG_STALE = 'Agenteeq-macOS-arm64.dmg';

export const nazevDmg = (verze, arch) => `Agenteeq-${verze}-macOS-${arch}.dmg`;

/**
 * Příkazy, které z hotové (podepsané, případně notarizované) aplikace udělají obraz disku.
 *
 *  1. Do prázdné složky se zkopíruje Agenteeq.app (`ditto` zachová podpis i rozšířené atributy)
 *     a vedle ní zkratka na /Applications – to je ta „přetáhni sem“ v okně.
 *  2. `hdiutil create … -format UDZO` z ní udělá komprimovaný obraz jen pro čtení.
 *  3. S Developer ID se podepíše i obraz a s profilem notarytool se notarizuje a lístek se
 *     přišpendlí – Gatekeeper pak pustí obraz i aplikaci bez dotazu. Ad-hoc podpis obrazu
 *     nic nedokazuje (Gatekeeper ho stejně neuzná), takže se u ad-hoc buildu nepodepisuje:
 *     aplikace uvnitř má vlastní ad-hoc podpis a ten zůstane nedotčený.
 *  4. `hdiutil verify` ověří kontrolní součty hotového obrazu.
 */
export function planDmg({ app, staging, dmg, identity = '-', notaryProfile = '' }) {
  for (const [jmeno, hodnota] of Object.entries({ app, staging, dmg })) {
    if (!hodnota || !path.isAbsolute(hodnota)) throw new Error(`planDmg: ${jmeno} musí být absolutní cesta.`);
  }
  if (path.basename(app) !== 'Agenteeq.app') throw new Error('planDmg: aplikace se musí jmenovat Agenteeq.app – tak ji uvidí uživatel v okně.');
  if (!dmg.endsWith('.dmg')) throw new Error('planDmg: obraz musí mít příponu .dmg.');
  const podepsat = identity && identity !== '-';
  if (notaryProfile && !podepsat) throw new Error('Notarizace obrazu vyžaduje podpis Developer ID (AGENTEEQ_SIGN_IDENTITY).');
  const kroky = [
    ['ditto', [app, path.join(staging, 'Agenteeq.app')]],
    ['ln', ['-s', '/Applications', path.join(staging, 'Applications')]],
    ['hdiutil', ['create', '-volname', 'Agenteeq', '-srcfolder', staging, '-ov', '-format', 'UDZO', dmg]],
  ];
  if (podepsat) kroky.push(['codesign', ['--force', '--sign', identity, '--timestamp', dmg]]);
  if (notaryProfile) {
    kroky.push(
      ['xcrun', ['notarytool', 'submit', dmg, '--keychain-profile', notaryProfile, '--wait']],
      ['xcrun', ['stapler', 'staple', dmg]],
    );
  }
  kroky.push(['hdiutil', ['verify', dmg]]);
  return kroky;
}
