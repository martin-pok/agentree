import test from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown, splitFrontMatter } from '../public/js/markdown.js';

test('markdown: nadpisy, odstavce a zvýraznění', () => {
  const out = renderMarkdown('# Název\n\nText s **tučným** a *skloněným*.\n');
  // Nadpis souboru je na stránce podnadpis, aby zůstala jediná h1 (název stránky).
  assert.match(out, /<h2>Název<\/h2>/);
  assert.match(out, /<strong>tučným<\/strong>/);
  assert.match(out, /<em>skloněným<\/em>/);
});

test('markdown: seznamy včetně zanoření a číslování', () => {
  const out = renderMarkdown('- jedna\n- dvě\n  - vnořená\n');
  assert.match(out, /<ul><li>jedna<\/li><li>dvě<ul><li>vnořená<\/li><\/ul><\/li><\/ul>/);
  assert.match(renderMarkdown('1. první\n2. druhá\n'), /<ol><li>první<\/li><li>druhá<\/li><\/ol>/);
});

test('markdown: blok kódu si drží obsah i jazyk a nic v něm neinterpretuje', () => {
  const out = renderMarkdown('```js\nconst x = 1 < 2 && "a";\n// **není tučné**\n```\n');
  assert.match(out, /<pre data-jazyk="js"><code>/);
  assert.match(out, /const x = 1 &lt; 2 &amp;&amp; &quot;a&quot;;/);
  assert.doesNotMatch(out, /<strong>/);
});

test('markdown: kód v textu, citace, čára a tabulka', () => {
  assert.match(renderMarkdown('Spusť `npm test` hned.'), /<code>npm test<\/code>/);
  assert.match(renderMarkdown('> Poznámka na okraj.'), /<blockquote><p>Poznámka na okraj\.<\/p><\/blockquote>/);
  assert.match(renderMarkdown('---'), /<hr>/);
  const tab = renderMarkdown('| Sloupec | Hodnota |\n|---|---|\n| a | 1 |\n');
  assert.match(tab, /<th>Sloupec<\/th><th>Hodnota<\/th>/);
  assert.match(tab, /<td>a<\/td><td>1<\/td>/);
});

test('markdown: HTML ze souboru se nikdy nestane HTML stránky', () => {
  const utok = '<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">\n\n# <b>nadpis</b>\n';
  const out = renderMarkdown(utok);
  assert.doesNotMatch(out, /<script/i);
  assert.doesNotMatch(out, /<img/i);
  // „onerror" ve výstupu být smí – jako escapovaný text uvnitř odstavce. Nesmí být atributem značky.
  assert.doesNotMatch(out, /<[a-z]+[^>]*\son[a-z]+=/i);
  assert.match(out, /&lt;img src=x onerror=/);
  assert.match(out, /&lt;script&gt;/);
  assert.match(out, /<h2>&lt;b&gt;nadpis&lt;\/b&gt;<\/h2>/);
});

test('markdown: odkaz projde jen na http, https a mailto', () => {
  assert.match(renderMarkdown('[web](https://pokornydesign.cz)'), /<a href="https:\/\/pokornydesign\.cz" target="_blank" rel="noreferrer noopener">web<\/a>/);
  assert.match(renderMarkdown('[mail](mailto:info@example.com)'), /<a href="mailto:info@example\.com"/);
  for (const zly of ['[x](javascript:alert(1))', '[x](data:text/html,<b>)', '[x](file:///etc/passwd)', '[x](vbscript:msgbox)']) {
    const out = renderMarkdown(zly);
    assert.doesNotMatch(out, /<a /, `nemělo projít: ${zly}`);
  }
});

test('markdown: adresa s uvozovkou se odkazem vůbec nestane', () => {
  const out = renderMarkdown('[x](https://example.com/"onmouseover="alert(1))');
  assert.doesNotMatch(out, /<a /, 'taková adresa nesmí projít');
  assert.match(out, /^<p>\[x\]\(/, 'zůstane jako obyčejný text');
});

test('splitFrontMatter: hlavička se oddělí od těla', () => {
  const { front, body } = splitFrontMatter('---\nname: pd-intake\ndescription: Hodinový intake\n---\n# Tělo\n');
  assert.deepEqual(front, [{ key: 'name', value: 'pd-intake' }, { key: 'description', value: 'Hodinový intake' }]);
  assert.equal(body, '# Tělo\n');
});

test('splitFrontMatter: soubor bez hlavičky zůstane celý tělem', () => {
  const { front, body } = splitFrontMatter('# Rovnou nadpis\n');
  assert.deepEqual(front, []);
  assert.equal(body, '# Rovnou nadpis\n');
});

test('markdown: prázdný a nesmyslný vstup nikdy nevyhodí výjimku', () => {
  for (const vstup of ['', null, undefined, '\n\n\n', '```\nnedokončený plot', '| rozbitá |', '- ']) {
    assert.doesNotThrow(() => renderMarkdown(vstup), `spadlo na: ${JSON.stringify(vstup)}`);
  }
});
