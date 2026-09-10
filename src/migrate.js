import fs from 'node:fs/promises';
import path from 'node:path';

// Přejmenování projektu (0.4.0): data ze staré složky se při prvním spuštění jednou zkopírují.
// Originál zůstává beze změny; existující nová data se nikdy nepřepíší.
export async function migrateLegacyData({ dataDir, legacyDir }) {
  if (!legacyDir) return { migrated: false, reason: 'disabled' };
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
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.copyFile(source, target, fs.constants.COPYFILE_EXCL);
  } catch (err) {
    if (err.code === 'EEXIST') return { migrated: false, reason: 'exists' };
    throw err;
  }
  await fs.chmod(target, 0o600);
  return { migrated: true, from: source, to: target };
}
