import path from 'node:path';
import fs from 'node:fs/promises';

// Rozšíření pro Chrome se do prohlížeče přidává jako „rozbalené“ — Chrome si zapamatuje cestu ke
// složce a čte ji při každém startu. Kdyby tou složkou byla ta uvnitř balíčku aplikace, každá
// aktualizace Agenteeq (balíček se při ní celý nahradí) by rozšíření rozbila: Chrome by našel
// prázdné místo a sám ho vypnul.
//
// Proto si aplikace při startu udělá kopii do datové složky uživatele, kterou žádná aktualizace
// nesmaže, a Chromu ukazuje právě tu. Kopie se obnoví, jen když se liší verze — jinak se nesahá
// na nic, aby Chrome neviděl zbytečné změny.

const KOPIROVAT = ['manifest.json', 'background.js', 'content.js', 'sites.js', 'popup.html', 'popup.js', 'icons'];

async function verzeManifestu(dir) {
  try {
    return JSON.parse(await fs.readFile(path.join(dir, 'manifest.json'), 'utf8')).version || '';
  } catch {
    return '';
  }
}

async function zkopiruj(zdroj, cil) {
  await fs.mkdir(cil, { recursive: true });
  for (const jmeno of KOPIROVAT) {
    const z = path.join(zdroj, jmeno);
    const c = path.join(cil, jmeno);
    try {
      await fs.rm(c, { recursive: true, force: true });
      await fs.cp(z, c, { recursive: true });
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }
}

// Vrací cestu, kterou má uživatel vybrat v Chromu. Když se kopie nepodaří vytvořit (práva, plný
// disk), vrátí se původní složka — rozšíření pak půjde nainstalovat aspoň odtud.
export async function syncExtension({ zdroj, dataDir }) {
  const cil = path.join(dataDir, 'extension');
  try {
    const [vZdroj, vCil] = await Promise.all([verzeManifestu(zdroj), verzeManifestu(cil)]);
    if (!vZdroj) return { path: zdroj, copied: false, reason: 'Zdrojová složka rozšíření chybí.' };
    if (vZdroj === vCil) return { path: cil, copied: false, version: vCil };
    await zkopiruj(zdroj, cil);
    return { path: cil, copied: true, version: vZdroj, previous: vCil || null };
  } catch (err) {
    return { path: zdroj, copied: false, reason: `Kopii rozšíření se nepodařilo vytvořit: ${err.message}` };
  }
}
