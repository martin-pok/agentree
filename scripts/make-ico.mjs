// Ikona pro Windows z jednoho zdrojového PNG: `node scripts/make-ico.mjs`
//
// Výsledek se jednou vygeneruje a uloží do repozitáře jako desktop/windows/Agenteeq.ico –
// stejně jako Agenteeq.icns pro macOS. Důvod je stejný: ikona je schválený vizuální podklad,
// ne mezivýsledek sestavení. Když se má změnit, změní se vědomě a je to vidět v diffu.
//
// Proč vlastní převod: projekt nemá žádné závislosti a nebude je mít ani kvůli obrázku.
// Node umí zlib, a víc než zlib na PNG ani ICO potřeba není.
//
// Podporuje přesně to, co má zdroj: 8bitové RGBA bez prokládání. Cokoli jiného skončí
// chybou, ne tichým odhadem.
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const CRC_TABULKA = Array.from({ length: 256 }, (_, i) => {
  let c = i;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (const b of buf) c = CRC_TABULKA[(c ^ b) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

const PODPIS = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

// ── Čtení PNG ────────────────────────────────────────────────────────────────

function dekodujPng(buf) {
  if (!buf.subarray(0, 8).equals(PODPIS)) throw new Error('Tohle není PNG.');
  let i = 8;
  let sirka = 0, vyska = 0;
  const data = [];
  while (i < buf.length) {
    const delka = buf.readUInt32BE(i);
    const typ = buf.toString('ascii', i + 4, i + 8);
    const telo = buf.subarray(i + 8, i + 8 + delka);
    if (typ === 'IHDR') {
      sirka = telo.readUInt32BE(0);
      vyska = telo.readUInt32BE(4);
      const hloubka = telo[8], barvy = telo[9], prokladani = telo[12];
      if (hloubka !== 8 || barvy !== 6) throw new Error(`Čekalo se 8bitové RGBA, přišlo hloubka=${hloubka} typ=${barvy}.`);
      if (prokladani !== 0) throw new Error('Prokládané PNG se tu nečte.');
    } else if (typ === 'IDAT') {
      data.push(telo);
    } else if (typ === 'IEND') {
      break;
    }
    i += 12 + delka;
  }
  const syrove = zlib.inflateSync(Buffer.concat(data));
  return { sirka, vyska, pixely: odfiltruj(syrove, sirka, vyska) };
}

// PNG ukládá každý řádek s předřazeným bajtem filtru; tohle ho vrátí zpět na čistá data.
function odfiltruj(syrove, sirka, vyska) {
  const bpp = 4;
  const radek = sirka * bpp;
  const out = Buffer.alloc(radek * vyska);
  let zdroj = 0;
  for (let y = 0; y < vyska; y++) {
    const filtr = syrove[zdroj++];
    const cil = y * radek;
    const nad = cil - radek;
    for (let x = 0; x < radek; x++) {
      const hodnota = syrove[zdroj + x];
      const a = x >= bpp ? out[cil + x - bpp] : 0;         // vlevo
      const b = y > 0 ? out[nad + x] : 0;                   // nahoře
      const c = x >= bpp && y > 0 ? out[nad + x - bpp] : 0; // vlevo nahoře
      let vysledek;
      switch (filtr) {
        case 0: vysledek = hodnota; break;
        case 1: vysledek = hodnota + a; break;
        case 2: vysledek = hodnota + b; break;
        case 3: vysledek = hodnota + ((a + b) >> 1); break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          vysledek = hodnota + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default: throw new Error(`Neznámý filtr řádku: ${filtr}`);
      }
      out[cil + x] = vysledek & 0xFF;
    }
    zdroj += radek;
  }
  return out;
}

// ── Zmenšení ─────────────────────────────────────────────────────────────────

// Průměr přes zdrojovou oblast (box filtr). Pro zmenšování je to správná volba:
// bilineární vzorkování by při velkém zmenšení vzorky přeskakovalo a ikona by se rozsypala.
// Průhlednost se míchá předná­sobeně, jinak by okraje dostaly tmavý lem.
function zmensi(zdroj, sirkaZ, vyskaZ, velikost) {
  const out = Buffer.alloc(velikost * velikost * 4);
  const mer = sirkaZ / velikost;
  for (let y = 0; y < velikost; y++) {
    const y0 = Math.floor(y * mer), y1 = Math.min(vyskaZ, Math.ceil((y + 1) * mer));
    for (let x = 0; x < velikost; x++) {
      const x0 = Math.floor(x * mer), x1 = Math.min(sirkaZ, Math.ceil((x + 1) * mer));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const i = (sy * sirkaZ + sx) * 4;
          const alfa = zdroj[i + 3] / 255;
          r += zdroj[i] * alfa; g += zdroj[i + 1] * alfa; b += zdroj[i + 2] * alfa;
          a += zdroj[i + 3];
          n++;
        }
      }
      const cil = (y * velikost + x) * 4;
      const prumerA = a / n;
      const delitel = prumerA > 0 ? (prumerA / 255) * n : 1;
      out[cil] = Math.round(r / delitel);
      out[cil + 1] = Math.round(g / delitel);
      out[cil + 2] = Math.round(b / delitel);
      out[cil + 3] = Math.round(prumerA);
    }
  }
  return out;
}

// ── Zápis PNG ────────────────────────────────────────────────────────────────

function chunk(typ, telo) {
  const hlavicka = Buffer.alloc(8);
  hlavicka.writeUInt32BE(telo.length, 0);
  hlavicka.write(typ, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([hlavicka.subarray(4), telo])), 0);
  return Buffer.concat([hlavicka, telo, crc]);
}

function zakodujPng(pixely, velikost) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(velikost, 0);
  ihdr.writeUInt32BE(velikost, 4);
  ihdr[8] = 8;   // 8 bitů na kanál
  ihdr[9] = 6;   // RGBA
  const radek = velikost * 4;
  const sFiltrem = Buffer.alloc((radek + 1) * velikost);
  for (let y = 0; y < velikost; y++) {
    sFiltrem[y * (radek + 1)] = 0;  // filtr None – ikony jsou malé, komprese stačí
    pixely.copy(sFiltrem, y * (radek + 1) + 1, y * radek, (y + 1) * radek);
  }
  return Buffer.concat([
    PODPIS,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(sFiltrem, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Sestavení ICO ────────────────────────────────────────────────────────────

// Windows od Visty čte uvnitř ICO přímo PNG, takže se nemusí skládat BMP s maskou.
// Velikosti pokrývají hlavní panel, Průzkumníka i velké dlaždice.
const VELIKOSTI = [16, 20, 24, 32, 40, 48, 64, 128, 256];

function sestavIco(obrazky) {
  const hlavicka = Buffer.alloc(6);
  hlavicka.writeUInt16LE(0, 0);               // rezervováno
  hlavicka.writeUInt16LE(1, 2);               // 1 = ikona
  hlavicka.writeUInt16LE(obrazky.length, 4);
  let offset = 6 + obrazky.length * 16;
  const polozky = [];
  for (const { velikost, png } of obrazky) {
    const p = Buffer.alloc(16);
    p[0] = velikost >= 256 ? 0 : velikost;    // 0 znamená 256
    p[1] = velikost >= 256 ? 0 : velikost;
    p[2] = 0;                                  // počet barev (0 = plná paleta)
    p[3] = 0;                                  // rezervováno
    p.writeUInt16LE(1, 4);                     // roviny
    p.writeUInt16LE(32, 6);                    // bitů na pixel
    p.writeUInt32LE(png.length, 8);
    p.writeUInt32LE(offset, 12);
    offset += png.length;
    polozky.push(p);
  }
  return Buffer.concat([hlavicka, ...polozky, ...obrazky.map((o) => o.png)]);
}

const zdrojovy = path.join(root, 'desktop', 'Agenteeq-icon.png');
const cil = path.join(root, 'desktop', 'windows', 'Agenteeq.ico');

const { sirka, vyska, pixely } = dekodujPng(await fs.readFile(zdrojovy));
if (sirka !== vyska) throw new Error(`Zdrojová ikona musí být čtvercová, je ${sirka}×${vyska}.`);
console.log(`Zdroj: ${path.relative(root, zdrojovy)} (${sirka}×${vyska})`);

const obrazky = VELIKOSTI.map((velikost) => {
  const zmenseno = velikost === sirka ? pixely : zmensi(pixely, sirka, vyska, velikost);
  return { velikost, png: zakodujPng(zmenseno, velikost) };
});

await fs.mkdir(path.dirname(cil), { recursive: true });
await fs.writeFile(cil, sestavIco(obrazky));
console.log(`Hotovo: ${path.relative(root, cil)} — ${VELIKOSTI.join(', ')} px, ${(await fs.stat(cil)).size} B`);
