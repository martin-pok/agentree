import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const yml = await fs.readFile(new URL('../.github/workflows/chrome-web-store.yml', import.meta.url), 'utf8');

test('Chrome Web Store: po zveřejnění vydání nahraje ověřený ZIP do existující položky', () => {
  assert.match(yml, /release:\n    types: \[published\]/);
  assert.match(yml, /ITEM_ID: hocghhpigfilngdajmafkdcljdedanch/);
  assert.match(yml, /sha256sum --check -/, 'ZIP se před nahráním ověří proti SHA256SUMS.txt z vydání');
  assert.match(yml, /\.version == \$v/, 'verze v manifestu musí odpovídat tagu');
  assert.match(yml, /\.draft vydani\.json\)" = "false"/, 'neveřejný Draft se do obchodu nenahraje');
  assert.match(yml, /chromewebstore\/v1\.1\/items\/\$ITEM_ID\/publish/);
});

test('Chrome Web Store: tajné hodnoty jen v kroku nahrání, token maskovaný, bez nich jen varování', () => {
  const kroky = yml.split(/^ {6}- /m).slice(1);
  const sTajemstvim = kroky.filter((k) => /secrets\./.test(k));
  assert.equal(sTajemstvim.length, 1);
  assert.match(sTajemstvim[0], /^name: Nahrát do Chrome Web Store/);
  assert.match(yml, /::add-mask::\$TOKEN/);
  assert.match(yml, /::warning::Chybí CWS_CLIENT_ID/);
  assert.doesNotMatch(yml, /^permissions:[\s\S]*?write/m);
});
