import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const read = (p) => fs.readFile(new URL('../' + p, import.meta.url), 'utf8');

// Rozšíření na webu ukazuje skutečné okno (scripts/web-rozsireni-snimek.mjs), ne kreslenou atrapu.
test('extension section shows the real rendered popup, sized, lazy and described', async () => {
  const rozmery = JSON.parse(await read('site/rozsireni/rozmery.json'));
  const skript = await read('scripts/web-rozsireni-snimek.mjs');
  assert.match(skript, /otevriOkno\(browser, url, 'rušno'/, 'snímek vzniká ze skutečného popup.html');
  for (const [path, vzhled, en] of [['site/instalace/index.html', 'tmave', ''], ['site/en/install/index.html', 'tmave', '-en'],
    ['site/index.html', 'svetle', ''], ['site/en/index.html', 'svetle', '-en']]) {
    const html = await read(path);
    assert.doesNotMatch(html, /chat\.example|extension-display/, path + ': placeholder mockup is gone');
    // Žádná vymyšlená lišta prohlížeče (kolečka okna, adresní řádek, kostra stránky): jen skutečné okno.
    assert.doesNotMatch(html, /ext-okno-(lista|tecky|adresa|nav|stranka|ikona)/, path + ': no invented browser chrome');
    const img = html.match(/<img class="ext-okno-snimek"[^>]*>/)?.[0];
    assert.ok(img, path);
    const soubor = `okno-${vzhled}${en}.webp`;
    assert.ok(img.includes(`src="/rozsireni/${soubor}"`), path);
    assert.deepEqual([Number(img.match(/width="(\d+)"/)[1]), Number(img.match(/height="(\d+)"/)[1])], rozmery[soubor], path);
    assert.match(img, /loading="lazy"/); assert.match(img, /decoding="async"/); assert.match(img, /alt="[^"]{60,}"/);
    assert.match(html, /<figcaption>[^<]+<\/figcaption>/, path + ': marked as example data');
    const stat = await fs.stat(new URL(`../site/rozsireni/${soubor}`, import.meta.url));
    assert.ok(stat.size <= 90_000, `${soubor} exceeds transfer-size budget: ${stat.size}`);
  }
  for (const path of ['site/instalace/index.html', 'site/en/install/index.html']) {
    assert.ok((await read(path)).includes('<span class="ext-okno-robot" data-install-robot'), path);
  }
  const asset = await read('public/js/robot-svg.js');
  for (const key of ['robot-torso', 'robot-limbs', 'robot-head', 'robot-eyes', 'robot-aerial']) assert.ok(asset.includes(key), key);
});

// Windows a Mac mají v úvodu Instalace stejnou péči: tři kroky s podtitulkem, robot u prostředního.
test('install hero gives Windows the same three captioned steps and robot as Mac', async () => {
  for (const path of ['site/instalace/index.html', 'site/en/install/index.html']) {
    const html = await read(path);
    for (const os of ['mac', 'windows']) {
      const scena = html.match(new RegExp(`<div class="install-hero-scene" data-os-only="${os}"[\\s\\S]*?\\n</div>`))?.[0] ?? '';
      assert.equal((scena.match(/<small>[^<]+<\/small>/g) || []).length, 3, `${path} ${os}: subtitles`);
      assert.equal((scena.match(/<svg /g) || []).length, 3, `${path} ${os}: drawn icons`);
      assert.equal((scena.match(/install-hero-robot/g) || []).length, 1, `${path} ${os}: robot`);
    }
  }
});
