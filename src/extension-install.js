import path from 'node:path';
import fs from 'node:fs/promises';

// Rozšíření pro Chrome se do prohlížeče přidává jako „rozbalené“ – Chrome si zapamatuje cestu ke
// složce a čte ji při každém startu. Kdyby tou složkou byla ta uvnitř balíčku aplikace, každá
// aktualizace Agenteeq (balíček se při ní celý nahradí) by rozšíření rozbila: Chrome by našel
// prázdné místo a sám ho vypnul.
//
// Proto si aplikace při startu udělá kopii do datové složky uživatele, kterou žádná aktualizace
// nesmaže, a Chromu ukazuje právě tu. Kopie se obnoví, jen když se liší verze – jinak se nesahá
// na nic, aby Chrome neviděl zbytečné změny.
//
// Kopíruje se celá složka rozšíření, stejně jako do balíčku pro obchod (scripts/build-extension.mjs).
// Pevný seznam souborů tu dřív vynechal písma, loga, překlady i _locales – okno se pak kreslilo
// bez nich a s lokalizovaným manifestem by ho Chrome vůbec nenačetl. Kopie je složka aplikace:
// co v rozšíření už není, z ní zmizí, aby v ní nezůstávaly staré soubory.

const VYNECHAT = (jmeno) => jmeno.startsWith('.');

async function verzeManifestu(dir) {
  try {
    return JSON.parse(await fs.readFile(path.join(dir, 'manifest.json'), 'utf8')).version || '';
  } catch {
    return '';
  }
}

async function zkopiruj(zdroj, cil) {
  await fs.mkdir(cil, { recursive: true });
  const soubory = (await fs.readdir(zdroj)).filter((jmeno) => !VYNECHAT(jmeno));
  for (const jmeno of await fs.readdir(cil)) {
    if (!soubory.includes(jmeno)) await fs.rm(path.join(cil, jmeno), { recursive: true, force: true });
  }
  for (const jmeno of soubory) {
    const c = path.join(cil, jmeno);
    await fs.rm(c, { recursive: true, force: true });
    await fs.cp(path.join(zdroj, jmeno), c, { recursive: true, filter: (z) => !VYNECHAT(path.basename(z)) });
  }
}

// Vrací cestu, kterou má uživatel vybrat v Chromu. Když se kopie nepodaří vytvořit (práva, plný
// disk), vrátí se původní složka – rozšíření pak půjde nainstalovat aspoň odtud.
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
