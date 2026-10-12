import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const read = (p) => fs.readFile(new URL('../' + p, import.meta.url), 'utf8');
test('installation preview shows full-body Scout instead of repeated robot logo', async () => {
 const asset=await read('site/robot-scout.svg');
 for(const key of ['robot-torso','robot-limbs','robot-head','robot-eyes','robot-aerial']) assert.ok(asset.includes(key),key);
 for(const path of ['site/instalace/index.html','site/en/install/index.html']) {
  const html=await read(path);
  assert.ok(html.includes('class="extension-received"><img class="extension-received-robot" src="/robot-scout.svg"'), path);
 }
});
