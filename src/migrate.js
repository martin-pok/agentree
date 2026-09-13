import fs from 'node:fs/promises';
import path from 'node:path';

// Přejmenování projektu (0.4.0 Dirigent → Agentree, 0.8.0 Agentree → Agenteeq): data ze staré
// složky se při prvním spuštění jednou zkopírují. Originál zůstává beze změny; existující nová
// data se nikdy nepřepíší. `legacyDirs` je seznam od nejnovějšího názvu k nejstaršímu.
export async function migrateLegacyData({ dataDir, legacyDir, legacyDirs }) {
  const kandidati = (legacyDirs && legacyDirs.length ? legacyDirs : [legacyDir]).filter(Boolean);
  if (!kandidati.length) return { migrated: false, reason: 'disabled' };
  if (kandidati.length > 1) {
    for (const dir of kandidati) {
      const r = await migrateLegacyData({ dataDir, legacyDir: dir });
      if (r.migrated || r.reason === 'exists') return r;
    }
    return { migrated: false, reason: 'no-legacy' };
  }
  legacyDir = kandidati[0];
  const target = path.join(dataDir, 'data.json');
  const source = path.join(legacyDir, 'data.json');
  try {
    await fs.access(target);
    return { migrated: false, reason: 'exists' };
  } catch { /* nová data zatím neexistují */ }
  try {
    await fs.access(source);
  } catch {
    return { migrated: false, reason: 'no-legacy' };
  }
  await fs.mkdir(dataDir, { recursive: true, mode: 0o700 });
  try {
    await fs.copyFile(source, target, fs.constants.COPYFILE_EXCL);
  } catch (err) {
    if (err.code === 'EEXIST') return { migrated: false, reason: 'exists' };
    throw err;
  }
  await fs.chmod(target, 0o600);
  return { migrated: true, from: source, to: target };
}
