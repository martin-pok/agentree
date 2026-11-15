// Prohlídka aplikace (vlastník 14. 11. 2026): pár kroků nad skutečným rozhraním místo AI pomocníka,
// spustitelná znovu z Nastavení → Nápověda a z Pomocníka. Sama jen novému uživateli po úvodním okně.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const zdroj = (p) => fs.readFile(new URL(`../${p}`, import.meta.url), 'utf8');

test('prohlídka: kroky míří na skutečná místa, poprvé sama, znovu z Nastavení i Pomocníka', async () => {
  const kod = await zdroj('public/js/prohlidka.js');
  for (const cil of ["'.launch'", `'[aria-labelledby="dec-h"]'`, "'.home-live'", `'.nav a[data-nav="agenti"]'`, "'#refresh-app'", "'.pm-fab'"]) assert.ok(kod.includes(cil), cil);
  assert.match(kod, /const najdi = \(krok\) => krok\.cil\.map\(\(s\) => document\.querySelector\(s\)\)\.find\(viditelny\)/, 'neviditelný cíl se přeskočí');
  assert.match(kod, /localStorage\.setItem\(UKAZANO, '1'\)/, 'sama jen poprvé');
  assert.match(kod, /addEventListener\('agenteeq-pruvodce-hotov', \(\) => \{\n    if \(navigator\.webdriver\) return;/, 'sama jen novému uživateli po úvodním okně, ne v testech');
  assert.match(kod, /e\.key === 'Escape'/);
  assert.match(kod, /role="dialog" aria-modal="true"/);
  const app = await zdroj('public/js/app.js');
  assert.match(app, /initProhlidka\(\);/);
  assert.match(await zdroj('public/js/views/settings.js'), /data-prohlidka>\$\{ICON\.spark\}\$\{tr\('Prohlídka aplikace'\)\}/);
  assert.match(await zdroj('public/js/robot-guide.js'), /class="pm-navrh pm-navrh--prohlidka" data-prohlidka/);
  const css = await zdroj('public/refinement.css');
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{ \.prohl, \.prohl-svetlo, \.prohl-karta, \.prohl-karta\.je-ukazana, \.prohl-tecky i \{ transition: none; \}/);
});

// Vlastník 15. 11. 2026: prohlídka se trhala a zvýraznění „bouncovalo“. Příčiny, které se nesmí vrátit.
test('prohlídka: plynulý pohyb bez honění, karta se nemění před očima a nezakryje cíl', async () => {
  const kod = await zdroj('public/js/prohlidka.js');
  const css = await zdroj('public/refinement.css');
  const pravidlo = (sel) => css.match(new RegExp(`\\${sel} \\{[^}]*\\}`))?.[0] || '';
  // Světlo ani karta nejedou CSS přechodem po left/top (přechod restartovaný každou událostí posunu
  // zaostával a překmitl); poloha jde přes transform, počítaná v jednom snímku.
  assert.ok(pravidlo('.prohl-svetlo') && pravidlo('.prohl-karta'), 'pravidla prohlídky v CSS');
  assert.doesNotMatch(pravidlo('.prohl-svetlo'), /transition/);
  assert.doesNotMatch(pravidlo('.prohl-karta'), /transition:[^;]*(left|top)/);
  assert.match(kod, /svetlo\.style\.transform = `translate3d\(/);
  assert.match(kod, /karta\.style\.transform = `translate3d\(/);
  // Posun stránky jede v týchž snímcích jako světlo (ne plynulý posun prohlížeče s vlastním tempem).
  assert.match(kod, /posun\.box\.scrollTo\(\{ top: lerp\(odPosun, posun\.nove, e\), behavior: 'instant' \}\)/);
  assert.doesNotMatch(kod, /scrollIntoView/);
  // Čas snímku těsně před startem nesmí dát záporný průběh (cuknutí opačným směrem).
  assert.match(kod, /Math\.min\(1, Math\.max\(0, \(ted - start\) \/ delka\)\)/);
  // Karta se přepisuje jen skrytá a rozměr příštího kroku se měří na kopii.
  assert.match(kod, /const zmerKartu = \(\) =>/);
  assert.match(pravidlo('.prohl-karta'), /opacity: 0;/);
  // Rozvržení hledá místo, kde se karta a světlo nepřekrývají; vysoký cíl se zkrátí na čisté hraně.
  assert.match(kod, /const rozvrhni = \(r, kw, kh, hrany/);
  // Živé překreslení Přehledu: světlo jde s cílem.
  assert.match(kod, /new MutationObserver\(srovnej\)/);
  assert.match(kod, /new ResizeObserver\(srovnej\)/);
});
