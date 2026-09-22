import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { qrMatice, qrSvg, nejmensiVerze, parovaciAdresa } from '../public/js/qr.js';

// Výstup generátoru byl ověřen dekodérem Applu (Vision) na verzích 1 až 10 včetně české
// diakritiky. Tyhle testy hlídají, aby se ta ověřená podoba tiše nezměnila – čtečka v telefonu
// nevrátí „skoro správně“, buď kód přečte, nebo ne.

test('QR: velikost odpovídá verzi a text se vejde do nejmenší možné', () => {
  assert.equal(qrMatice('a').velikost, 21, 'verze 1 má 21 modulů');
  assert.equal(nejmensiVerze(17), 2, 'nad 16 bajtů už verze 1 nestačí');
  assert.equal(nejmensiVerze(212), 10);
  assert.equal(nejmensiVerze(600), 0, 'co se nevejde do verze 10, generátor přizná');
  assert.equal(qrMatice('x'.repeat(600)), null);
  assert.equal(qrSvg('x'.repeat(600)), null);
});

test('QR: pevné vzory jsou na svých místech', () => {
  const { velikost: n, moduly: m } = qrMatice('http://192.168.1.23:4620/?p=482913');
  for (const [zr, zc] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
    assert.equal(m[zr][zc], true, 'roh značky pro hledání');
    assert.equal(m[zr + 3][zc + 3], true, 'střed značky');
    assert.equal(m[zr + 1][zc + 1], false, 'světlý prstenec');
    assert.equal(m[zr + 5][zc + 5], false);
  }
  // Časovací pruh se střídá. Právě tady dřív chyba byla: rezervace místa pro formátovou
  // informaci ho přepsala a kód se nedal přečíst, i když vypadal správně.
  for (let i = 8; i < n - 8; i++) {
    assert.equal(m[6][i], i % 2 === 0, `vodorovný časovací pruh na ${i}`);
    assert.equal(m[i][6], i % 2 === 0, `svislý časovací pruh na ${i}`);
  }
  assert.equal(m[n - 8][8], true, 'vždy tmavý modul');
});

test('QR: kolem kódu je tichá zóna, bez níž ho čtečka nenajde', () => {
  const svg = qrSvg('HELLO WORLD');
  const strana = Number(svg.match(/viewBox="0 0 (\d+)/)[1]);
  assert.equal(strana, 21 + 8, 'čtyři moduly volné na každé straně');
  assert.match(svg, /role="img"/);
  assert.match(svg, /aria-label="QR kód"/);
});

test('QR: podoba ověřeného kódu se nezmění nepozorovaně', () => {
  const k = qrMatice('http://192.168.1.23:4620/?p=482913');
  const otisk = crypto.createHash('sha1').update(k.moduly.map((r) => r.map((v) => (v ? 1 : 0)).join('')).join('')).digest('hex');
  assert.equal(k.velikost, 29);
  assert.equal(otisk, 'f4dbb70dd2f4b62c4de02634ddaa7cf590f78f18',
    'matice se změnila — než otisk přepíšeš, ověř kód skutečnou čtečkou');
});

// Adresa v QR je jediné místo, kde se jednorázový kód potkává s adresou Macu. Když se tady
// něco posune, telefon skončí na párovací obrazovce a uživatel zase opisuje číslo.
test('QR: adresa pro spárování nese kód a snese lomítko navíc', () => {
  assert.equal(parovaciAdresa('http://192.168.1.23:4620', '482913'), 'http://192.168.1.23:4620/?p=482913');
  assert.equal(parovaciAdresa('http://192.168.1.23:4620/', '482913'), 'http://192.168.1.23:4620/?p=482913');
  assert.equal(parovaciAdresa('http://192.168.1.23:4620///', '482 913'), 'http://192.168.1.23:4620/?p=482913');
  assert.equal(parovaciAdresa('', '482913'), '', 'bez adresy se QR nekreslí');
  assert.equal(parovaciAdresa('http://192.168.1.23:4620', ''), '', 'bez kódu taky ne');
  // Kód z adresy musí projít i zpátky do čitelného QR.
  const adresa = parovaciAdresa('http://192.168.100.150:61580', '977911');
  assert.ok(qrMatice(adresa), 'adresa se vejde do QR');
});
