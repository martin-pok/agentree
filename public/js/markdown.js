import { esc } from './format.js';

// Malý převodník Markdownu pro čtení souborů SKILL.md přímo v aplikaci. Záměrně neumí všechno —
// umí to, co se v těch souborech skutečně vyskytuje: nadpisy, seznamy, kód, citace, tabulky,
// odkazy a zvýraznění.
//
// Bezpečnost: text se nejdřív celý proescapuje a teprve nad escapovaným řetězcem se hledají
// značky. Do výstupu se tedy nikdy nedostane HTML ze souboru — ani z odkazu, u kterého navíc
// propouštíme jen http, https a mailto.

const ODRAZKA = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
const NADPIS = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const CARA = /^\s{0,3}(-{3,}|\*{3,}|_{3,})\s*$/;
const PLOT = /^\s{0,3}(`{3,}|~{3,})\s*([A-Za-z0-9_+-]*)\s*$/;
// Text je v té chvíli už escapovaný, takže značka citace má podobu &gt;, ne >.
const CITACE = /^\s{0,3}&gt;\s?(.*)$/;
const RADEK_TABULKY = /^\s*\|(.+)\|\s*$/;
const ODDELOVAC_TABULKY = /^\s*\|?[\s:|-]*-[\s:|-]*$/;
// Značka pro odložený kód. Zapsaná přes fromCharCode, aby v souboru nebyl řídicí bajt,
// který rozbíjí grep i diff.
const ZNACKA = String.fromCharCode(0);

// Hlavička YAML na začátku souboru. Vracíme ji zvlášť, ať se dá ukázat jako metadata
// a neplete se do textu.
export function splitFrontMatter(src) {
  const text = String(src ?? '').replace(/\r\n?/g, '\n');
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (!m) return { front: [], body: text };
  const front = m[1].split('\n')
    .map((line) => /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line))
    .filter(Boolean)
    .map((kv) => ({ key: kv[1], value: kv[2].trim().replace(/^["']|["']$/g, '') }));
  return { front, body: text.slice(m[0].length) };
}

// Adresa odkazu. Cokoli jiného než http(s) a mailto se zahodí a zůstane jen text —
// `javascript:` ani `data:` se do stránky nedostanou.
function bezpecnyOdkaz(url) {
  const u = String(url || '').trim();
  if (!/^(https?:\/\/|mailto:)/i.test(u)) return '';
  // Text sem přichází už proescapovaný, takže uvozovka má podobu &quot;. V atributu by se sice
  // neuplatnila, ale skutečná adresa ji neobsahuje — a co nedává smysl, radši nepustíme dál.
  if (/[\s<>"']/.test(u) || /&(quot|apos|#3[49]|lt|gt);/i.test(u)) return '';
  return u;
}

function inline(hotovyText) {
  // Kód v textu se vyjme stranou, aby se v něm nehledaly hvězdičky ani odkazy.
  const kod = [];
  let s = hotovyText.replace(/(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/g, (_, __, obsah) => {
    kod.push(obsah.trim());
    return `${ZNACKA}${kod.length - 1}${ZNACKA}`;
  });
  s = s.replace(/!?\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^)]*&quot;)?\)/g, (cely, popis, url) => {
    const cil = bezpecnyOdkaz(url);
    return cil ? `<a href="${cil}" target="_blank" rel="noreferrer noopener">${popis || cil}</a>` : cely;
  });
  s = s.replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, '<strong>$2</strong>');
  s = s.replace(/(^|[^*\w])\*(?=\S)([^*]*?\S)\*(?!\*)/g, '$1<em>$2</em>');
  s = s.replace(/(^|[^_\w])_(?=\S)([^_]*?\S)_(?!_)/g, '$1<em>$2</em>');
  s = s.replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<del>$1</del>');
  return s.replace(new RegExp(`${ZNACKA}(\\d+)${ZNACKA}`, 'g'), (_, i) => `<code>${kod[Number(i)]}</code>`);
}

function bunky(radek) {
  return radek.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());
}

// Seznam včetně zanoření. Odsazení nad úroveň první odrážky patří pod předchozí položku.
function seznam(radky) {
  const prvni = ODRAZKA.exec(radky[0]);
  const cislovany = /\d/.test(prvni[2]);
  const zakladniOdsazeni = prvni[1].length;
  const polozky = [];
  for (const radek of radky) {
    const m = ODRAZKA.exec(radek);
    if (m && m[1].length <= zakladniOdsazeni) polozky.push({ text: [m[3]], deti: [] });
    else if (!polozky.length) continue;
    else if (m) polozky[polozky.length - 1].deti.push(radek.slice(Math.min(m[1].length, zakladniOdsazeni + 2)));
    else polozky[polozky.length - 1].text.push(radek.trim());
  }
  const tag = cislovany ? 'ol' : 'ul';
  return `<${tag}>${polozky.map((p) => {
    const vnoreny = p.deti.length ? seznam(p.deti) : '';
    return `<li>${inline(p.text.join(' '))}${vnoreny}</li>`;
  }).join('')}</${tag}>`;
}

export function renderMarkdown(src) {
  const text = esc(String(src ?? '').replace(/\r\n?/g, '\n'));
  const radky = text.split('\n');
  const out = [];
  let i = 0;

  const jeOdrazka = (r) => ODRAZKA.test(r) && !CARA.test(r);
  const jeBlok = (r) => jeOdrazka(r) || NADPIS.test(r) || PLOT.test(r) || CARA.test(r) || CITACE.test(r);

  while (i < radky.length) {
    const radek = radky[i];
    if (!radek.trim()) { i++; continue; }

    const plot = PLOT.exec(radek);
    if (plot) {
      const konec = plot[1][0];
      const jazyk = plot[2];
      const telo = [];
      i++;
      const uzaviraci = new RegExp(`^\\s{0,3}\\${konec}{3,}\\s*$`);
      while (i < radky.length && !uzaviraci.test(radky[i])) telo.push(radky[i++]);
      i++;
      out.push(`<pre${jazyk ? ` data-jazyk="${jazyk}"` : ''}><code>${telo.join('\n')}</code></pre>`);
      continue;
    }

    const nadpis = NADPIS.exec(radek);
    if (nadpis) {
      // Nadpis souboru je na stránce podnadpis: h1 v souboru = h2 v dokumentu.
      const uroven = Math.min(6, nadpis[1].length + 1);
      out.push(`<h${uroven}>${inline(nadpis[2])}</h${uroven}>`);
      i++;
      continue;
    }

    if (CARA.test(radek)) { out.push('<hr>'); i++; continue; }

    if (CITACE.test(radek)) {
      const telo = [];
      while (i < radky.length && CITACE.test(radky[i])) telo.push(CITACE.exec(radky[i++])[1]);
      out.push(`<blockquote>${telo.filter(Boolean).map((r) => `<p>${inline(r)}</p>`).join('')}</blockquote>`);
      continue;
    }

    // Tabulka: řádek se svislítky a hned pod ním oddělovač.
    if (RADEK_TABULKY.test(radek) && i + 1 < radky.length && ODDELOVAC_TABULKY.test(radky[i + 1])) {
      const hlavicka = bunky(radek);
      i += 2;
      const telo = [];
      while (i < radky.length && RADEK_TABULKY.test(radky[i])) telo.push(bunky(radky[i++]));
      out.push(`<div class="md-table"><table><thead><tr>${hlavicka.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead>`
        + `<tbody>${telo.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }

    if (jeOdrazka(radek)) {
      const start = i;
      i++;
      while (i < radky.length && radky[i].trim() && (jeOdrazka(radky[i]) || /^\s{2,}/.test(radky[i]))) i++;
      out.push(seznam(radky.slice(start, i)));
      continue;
    }

    // Odstavec: běžné řádky až po prázdný řádek nebo začátek jiného bloku.
    const telo = [];
    while (i < radky.length && radky[i].trim() && !jeBlok(radky[i])) telo.push(radky[i++]);
    if (telo.length) out.push(`<p>${inline(telo.join('\n')).replace(/\n/g, '<br>')}</p>`);
    else i++;
  }
  return out.join('\n');
}
