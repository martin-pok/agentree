// Generátor QR kódu: režim bajtů, úroveň korekce M, verze 1–10.
// Vlastní implementace, protože aplikace nemá běhové závislosti a kód se kreslí i na telefonu.
// Vrací matici modulů; vykreslení do SVG je zvlášť, ať se dá obojí testovat samostatně.

// verze: [slov korekce na blok, [bloků, datových slov], [bloků, datových slov]?]
const BLOKY = {
  1: [10, [1, 16]], 2: [16, [1, 28]], 3: [26, [1, 44]], 4: [18, [2, 32]], 5: [24, [2, 43]],
  6: [16, [4, 27]], 7: [18, [4, 31]], 8: [22, [2, 38], [2, 39]], 9: [22, [3, 36], [2, 37]],
  10: [26, [4, 43], [1, 44]],
};
const ZAROVNANI = {
  1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
  6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
};

// Galoisovo těleso GF(256) s primitivním polynomem 0x11D.
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11D; }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}
const nasob = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

function generator(stupen) {
  let g = [1];
  for (let i = 0; i < stupen; i++) {
    const novy = new Array(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) { novy[j] ^= g[j]; novy[j + 1] ^= nasob(g[j], EXP[i]); }
    g = novy;
  }
  return g;
}

function korekce(data, pocet) {
  const g = generator(pocet);
  const zbytek = new Uint8Array(data.length + pocet);
  zbytek.set(data);
  for (let i = 0; i < data.length; i++) {
    const koef = zbytek[i];
    if (!koef) continue;
    for (let j = 0; j < g.length; j++) zbytek[i + j] ^= nasob(g[j], koef);
  }
  return Array.from(zbytek.slice(data.length));
}

function datovychSlov(verze) {
  const [, ...skupiny] = BLOKY[verze];
  return skupiny.reduce((soucet, [bloku, slov]) => soucet + bloku * slov, 0);
}

export function nejmensiVerze(delkaBajtu) {
  for (let verze = 1; verze <= 10; verze++) {
    const ccBitu = verze < 10 ? 8 : 16;
    if (delkaBajtu * 8 + 4 + ccBitu <= datovychSlov(verze) * 8) return verze;
  }
  return 0;
}

function datovaSlova(bajty, verze) {
  const slov = datovychSlov(verze);
  const bity = [];
  const pridej = (hodnota, delka) => { for (let i = delka - 1; i >= 0; i--) bity.push((hodnota >> i) & 1); };
  pridej(0b0100, 4);
  pridej(bajty.length, verze < 10 ? 8 : 16);
  for (const b of bajty) pridej(b, 8);
  for (let i = 0; i < 4 && bity.length < slov * 8; i++) bity.push(0);
  while (bity.length % 8) bity.push(0);
  const slova = [];
  for (let i = 0; i < bity.length; i += 8) slova.push(bity.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  const vypln = [0xEC, 0x11];
  for (let i = 0; slova.length < slov; i++) slova.push(vypln[i % 2]);
  return slova;
}

// Bloky se prokládají: data po sloupcích, pak korekce po sloupcích. Bez toho by poškození
// jedné části kódu zasáhlo celý blok naráz a korekce by ho neopravila.
function prolozena(slova, verze) {
  const [ecSlov, ...skupiny] = BLOKY[verze];
  const bloky = [];
  let pozice = 0;
  for (const [bloku, slov] of skupiny) {
    for (let i = 0; i < bloku; i++) { bloky.push(slova.slice(pozice, pozice + slov)); pozice += slov; }
  }
  const ec = bloky.map((b) => korekce(Uint8Array.from(b), ecSlov));
  const vysledek = [];
  for (let i = 0; i < Math.max(...bloky.map((b) => b.length)); i++) for (const b of bloky) if (i < b.length) vysledek.push(b[i]);
  for (let i = 0; i < ecSlov; i++) for (const b of ec) vysledek.push(b[i]);
  return vysledek;
}

function bch(data, generator, bitu) {
  let d = data << bitu;
  const delka = 32 - Math.clz32(generator);
  while (32 - Math.clz32(d) >= delka) d ^= generator << (32 - Math.clz32(d) - delka);
  return (data << bitu) | d;
}

const formatInfo = (maska) => bch((0b00 << 3) | maska, 0x537, 10) ^ 0x5412;
const verzeInfo = (verze) => bch(verze, 0x1F25, 12);

const MASKY = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

function kostra(verze) {
  const n = verze * 4 + 17;
  const m = Array.from({ length: n }, () => new Array(n).fill(null));
  const pevne = Array.from({ length: n }, () => new Array(n).fill(false));
  const polozKostru = (r, c, hodnota) => { if (r >= 0 && r < n && c >= 0 && c < n) { m[r][c] = hodnota; pevne[r][c] = true; } };

  for (const [zr, zc] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
    for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) {
      const uvnitr = r >= 0 && r <= 6 && c >= 0 && c <= 6;
      const tmave = uvnitr && (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
      polozKostru(zr + r, zc + c, tmave ? 1 : 0);
    }
  }
  for (let i = 8; i < n - 8; i++) { polozKostru(6, i, i % 2 === 0 ? 1 : 0); polozKostru(i, 6, i % 2 === 0 ? 1 : 0); }
  const stredy = ZAROVNANI[verze];
  for (const r of stredy) for (const c of stredy) {
    if ((r <= 8 && c <= 8) || (r <= 8 && c >= n - 9) || (r >= n - 9 && c <= 8)) continue;
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
      polozKostru(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1 ? 1 : 0);
    }
  }
  // Místo pro formátovou informaci. Řádek 6 a sloupec 6 se vynechávají – tam vede časovací
  // pruh a přepsat ho znamená kód, který žádná čtečka nenajde.
  for (let i = 0; i <= 8; i++) { if (i !== 6) { polozKostru(i, 8, 0); polozKostru(8, i, 0); } }
  for (let i = 0; i < 8; i++) { polozKostru(n - 1 - i, 8, 0); polozKostru(8, n - 1 - i, 0); }
  polozKostru(n - 8, 8, 1); // Vždy tmavý modul.
  if (verze >= 7) {
    for (let i = 0; i < 18; i++) { polozKostru(Math.floor(i / 3), n - 11 + (i % 3), 0); polozKostru(n - 11 + (i % 3), Math.floor(i / 3), 0); }
  }
  return { n, m, pevne };
}

function polozData(stav, slova) {
  const { n, m, pevne } = stav;
  const bity = [];
  for (const s of slova) for (let i = 7; i >= 0; i--) bity.push((s >> i) & 1);
  let index = 0;
  let nahoru = true;
  for (let paru = n - 1; paru > 0; paru -= 2) {
    if (paru === 6) paru = 5; // Svislý časovací pruh se přeskakuje celý.
    for (let krok = 0; krok < n; krok++) {
      const r = nahoru ? n - 1 - krok : krok;
      for (const c of [paru, paru - 1]) {
        if (pevne[r][c]) continue;
        m[r][c] = index < bity.length ? bity[index] : 0;
        index++;
      }
    }
    nahoru = !nahoru;
  }
}

function penalizace(m, n) {
  let skore = 0;
  const rada = (cti) => {
    for (let a = 0; a < n; a++) {
      let bezi = 1;
      for (let b = 1; b < n; b++) {
        if (cti(a, b) === cti(a, b - 1)) bezi++;
        else { if (bezi >= 5) skore += 3 + (bezi - 5); bezi = 1; }
      }
      if (bezi >= 5) skore += 3 + (bezi - 5);
    }
  };
  rada((r, c) => m[r][c]);
  rada((c, r) => m[r][c]);
  for (let r = 0; r < n - 1; r++) for (let c = 0; c < n - 1; c++) {
    const v = m[r][c];
    if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) skore += 3;
  }
  const vzor = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
  const obraceny = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
  const hledej = (cti) => {
    for (let a = 0; a < n; a++) for (let b = 0; b + 11 <= n; b++) {
      let sedi = true; let sedi2 = true;
      for (let i = 0; i < 11; i++) { const v = cti(a, b + i); if (v !== vzor[i]) sedi = false; if (v !== obraceny[i]) sedi2 = false; }
      if (sedi) skore += 40;
      if (sedi2) skore += 40;
    }
  };
  hledej((r, c) => m[r][c]);
  hledej((c, r) => m[r][c]);
  let tmavych = 0;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) tmavych += m[r][c];
  skore += Math.floor(Math.abs((tmavych * 100) / (n * n) - 50) / 5) * 10;
  return skore;
}

/** Vrátí { velikost, moduly } pro zadaný text, nebo null, když se text do verze 10 nevejde. */
export function qrMatice(text) {
  const bajty = new TextEncoder().encode(String(text));
  const verze = nejmensiVerze(bajty.length);
  if (!verze) return null;
  const slova = prolozena(datovaSlova(bajty, verze), verze);
  let nejlepsi = null;
  for (let maska = 0; maska < 8; maska++) {
    const stav = kostra(verze);
    polozData(stav, slova);
    const { n, m, pevne } = stav;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (!pevne[r][c] && MASKY[maska](r, c)) m[r][c] ^= 1;
    // Formátová informace je v kódu dvakrát, aby přežila poškození rohu. Souřadnice jsou
    // [řádek][sloupec]; prohodit je znamená zrcadlový kód, který se nepřečte.
    const format = formatInfo(maska);
    const bit = (i) => (format >> i) & 1;
    for (let i = 0; i <= 5; i++) m[i][8] = bit(i);
    m[7][8] = bit(6);
    m[8][8] = bit(7);
    m[8][7] = bit(8);
    for (let i = 9; i < 15; i++) m[8][14 - i] = bit(i);
    for (let i = 0; i < 8; i++) m[8][n - 1 - i] = bit(i);
    for (let i = 8; i < 15; i++) m[n - 15 + i][8] = bit(i);
    m[n - 8][8] = 1;
    if (verze >= 7) {
      const info = verzeInfo(verze);
      for (let i = 0; i < 18; i++) {
        const bit = (info >> i) & 1;
        m[Math.floor(i / 3)][n - 11 + (i % 3)] = bit;
        m[n - 11 + (i % 3)][Math.floor(i / 3)] = bit;
      }
    }
    const skore = penalizace(m, n);
    if (!nejlepsi || skore < nejlepsi.skore) nejlepsi = { skore, velikost: n, moduly: m.map((r) => r.map(Boolean)) };
  }
  return { velikost: nejlepsi.velikost, moduly: nejlepsi.moduly };
}

/** QR jako SVG. Tichá zóna čtyř modulů je součástí normy, bez ní čtečky kód nenajdou. */
export function qrSvg(text, { popis = 'QR kód', okraj = 4 } = {}) {
  const kod = qrMatice(text);
  if (!kod) return null;
  const strana = kod.velikost + okraj * 2;
  const cesta = [];
  for (let r = 0; r < kod.velikost; r++) for (let c = 0; c < kod.velikost; c++) {
    if (kod.moduly[r][c]) cesta.push(`M${c + okraj} ${r + okraj}h1v1h-1z`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${strana} ${strana}" role="img" aria-label="${popis}" shape-rendering="crispEdges">`
    + `<rect width="${strana}" height="${strana}" fill="#FFFFFF"/>`
    + `<path d="${cesta.join('')}" fill="#16141D"/></svg>`;
}

/** Adresa, kterou QR nese: základ z aplikace plus jednorázový kód. Telefon ji otevře a spáruje se
    sám; kód si aplikace z adresy hned smaže, aby nezůstal v historii prohlížeče. */
export function parovaciAdresa(zakladni, kod) {
  const cislo = String(kod || '').replace(/\D/g, '');
  if (!zakladni || !cislo) return '';
  return `${String(zakladni).replace(/\/+$/, '')}/?p=${cislo}`;
}
