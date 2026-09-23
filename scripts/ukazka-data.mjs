// Data pro živou prohlídku na webu (/app?ukazka). Vznikají při každém sestavení webu ze stejné
// ukázkové scény jako snímky (scripts/demo-fixture.mjs), takže vždy sedí na aktuální tvar dat –
// ručně uložený snímek by po první změně rozhraní tiše přestal fungovat.
//
// Ukládají se jen odpovědi, které obrazovky prohlídky opravdu čtou (ověřeno zápisem dotazů
// prohlížeče). Cesty stroje, na kterém se web sestavuje, se nahradí cestami ukázkového profilu:
// na veřejné stránce nemají co dělat.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pripravUkazku } from './demo-fixture.mjs';

export const UKAZKA_CESTY = ['/api/state', '/api/usage/claude?days=90'];
const KOREN = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]+$/, '');

// Nahrazuje se v JSON textu, takže i cesta musí být ve tvaru, jak ji zapíše JSON (na Windows
// zpětná lomítka zdvojená).
const vJson = (s) => JSON.stringify(s).slice(1, -1);

export function ocistiCesty(text, nahrady) {
  let out = text;
  // Nejdelší napřed: datová složka může ležet uvnitř jiné nahrazované cesty.
  for (const [z, na] of [...nahrady].sort((a, b) => b[0].length - a[0].length)) {
    if (z) out = out.split(vJson(z)).join(vJson(na));
  }
  return out;
}

export async function ukazkoveOdpovedi() {
  const demo = await pripravUkazku();
  try {
    // Prohlídka má vzhled podle systému návštěvníka – stejně jako stránka kolem ní.
    const vzhled = await fetch(`${demo.url}/api/settings`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Agenteeq': '1' }, body: JSON.stringify({ appearance: 'system' }) });
    if (!vzhled.ok) throw new Error(`Ukázková data: nastavení vzhledu vrátilo ${vzhled.status}`);
    const odpovedi = {};
    for (const cesta of UKAZKA_CESTY) {
      const res = await fetch(`${demo.url}${cesta}`);
      if (!res.ok) throw new Error(`Ukázková data: ${cesta} vrátilo ${res.status}`);
      odpovedi[cesta] = await res.json();
    }
    // Na macOS vede dočasná složka přes odkaz (/var → /private/var), takže se nahrazuje i skutečná cesta.
    const nahrady = [];
    for (const [z, na] of [
      [demo.dataHome, '/Users/ukazka/.agenteeq'],
      [demo.sourceHome, '/Users/ukazka'],
      [KOREN, '/Applications/Agenteeq.app/Contents/Resources/app'],
    ]) {
      nahrady.push([z, na]);
      const skutecna = await fs.realpath(z).catch(() => z);
      if (skutecna !== z) nahrady.push([skutecna, na]);
    }
    const text = ocistiCesty(JSON.stringify({ vytvoreno: Date.now(), odpovedi }), nahrady);
    // Pojistka: co nahrazení unikne, nesmí na veřejný web. Jména dočasných složek jsou náhodná,
    // takže je najde i v jiném zápisu cesty (krátká jména na Windows, jiný odkaz na složku).
    for (const stopa of [path.basename(demo.dataHome), path.basename(demo.sourceHome), vJson(KOREN)]) {
      if (text.includes(stopa)) throw new Error(`Ukázková data obsahují cestu ze stroje, kde se web sestavuje (${stopa}) – doplň nahrazení ve scripts/ukazka-data.mjs.`);
    }
    return JSON.parse(text);
  } finally {
    await demo.close();
    await Promise.all([demo.dataHome, demo.sourceHome].map((d) => fs.rm(d, { recursive: true, force: true }).catch(() => {})));
  }
}
