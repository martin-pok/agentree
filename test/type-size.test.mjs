import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

const root = new URL('..', import.meta.url).pathname;
const textFiles = async (directory) => {
  const entries = await readdir(join(root, directory), { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return textFiles(path);
    return /\.(?:css|html)$/u.test(entry.name) ? [path] : [];
  }));
  return files.flat();
};

test('no shipped interface copy uses a font smaller than 12 px', async () => {
  const files = (await Promise.all(['public', 'site', 'extension'].map(textFiles))).flat();
  const undersized = [];
  const declaration = /(?:font-size\s*:\s*|font\s*:[^;{}]*?)(\d+(?:\.\d+)?)px\b/gu;

  for (const file of files) {
    const source = await readFile(join(root, file), 'utf8');
    for (const match of source.matchAll(declaration)) {
      if (Number(match[1]) < 12) undersized.push(`${file}: ${match[0]}`);
    }
  }

  assert.deepEqual(undersized, []);
});
