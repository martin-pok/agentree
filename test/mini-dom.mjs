// Minimální DOM pro testy adaptérů rozšíření – bez závislostí. Umí jen to, co adaptéry
// v extension/sites.js opravdu používají: stavbu prvků, atributy, text a selektory
// (typ, *, #id, .třída, [a], [a="v"], [a*="v" i], ^=, $=, ~=, :not(…), potomek „ “, dítě „>“
// a seznam „,“). Cokoli jiného vyhodí chybu, aby test neprošel jen proto, že selektor nepochopil.
//
// Stavět jde dvojím způsobem: ručně přes `prvek()` / `text()` (syntetické stránky v testech),
// nebo ze stromu anonymizovaného vzorku (`zeVzorku()`), který uživatel uložil z živé stránky.

class Text {
  constructor(hodnota) { this.nodeType = 3; this.nodeValue = hodnota; this.parentElement = null; }
}

class Prvek {
  constructor(tag, atributy = {}) {
    this.nodeType = 1;
    this.tagName = String(tag).toUpperCase();
    this.atributy = new Map(Object.entries(atributy).map(([k, v]) => [k, v === true ? '' : String(v)]));
    this.childNodes = [];
    this.parentElement = null;
    this.ownerDocument = null;
  }
  get children() { return this.childNodes.filter((n) => n.nodeType === 1); }
  getAttribute(k) { return this.atributy.has(k) ? this.atributy.get(k) : null; }
  hasAttribute(k) { return this.atributy.has(k); }
  setAttribute(k, v) { this.atributy.set(k, String(v)); }
  get id() { return this.getAttribute('id') || ''; }
  get className() { return this.getAttribute('class') || ''; }
  get disabled() { return this.hasAttribute('disabled'); }
  get readOnly() { return this.hasAttribute('readonly'); }
  get isContentEditable() {
    for (let p = this; p; p = p.parentElement) {
      const v = p.getAttribute('contenteditable');
      if (v !== null) return v === '' || v === 'true';
    }
    return false;
  }
  get textContent() {
    return this.childNodes.map((n) => (n.nodeType === 3 ? n.nodeValue : n.textContent)).join('');
  }
  get innerText() { return this.textContent; }
  getBoundingClientRect() { return this.skryty || this.hasAttribute('hidden') ? { width: 0, height: 0 } : { width: 100, height: 20 }; }
  contains(jiny) {
    for (let p = jiny; p; p = p.parentElement) if (p === this) return true;
    return false;
  }
  potomci() {
    const out = [];
    const projdi = (el) => { for (const d of el.children) { out.push(d); projdi(d); } };
    projdi(this);
    return out;
  }
  matches(sel) { return seznam(sel).some((s) => sedi(this, s)); }
  querySelectorAll(sel) { const s = seznam(sel); return this.potomci().filter((el) => s.some((x) => sedi(el, x))); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
}

export function prvek(tag, atributy = {}, deti = []) {
  const el = new Prvek(tag, atributy);
  for (const d of [].concat(deti)) {
    const uzel = typeof d === 'string' ? new Text(d) : d;
    uzel.parentElement = el;
    el.childNodes.push(uzel);
  }
  return el;
}

export function dokument(body, { title = '' } = {}) {
  const html = prvek('html', {}, [body]);
  const doc = {
    title,
    body,
    documentElement: html,
    querySelectorAll: (sel) => { const s = seznam(sel); return [html, ...html.potomci()].filter((el) => s.some((x) => sedi(el, x))); },
    querySelector: (sel) => doc.querySelectorAll(sel)[0] || null,
  };
  for (const el of [html, ...html.potomci()]) el.ownerDocument = doc;
  return doc;
}

// Strom ze vzorku: { t, a?, x?, h?, l?, c? } → prvky. Text se ve vzorku nahradil příznakem `x`,
// tady z něj bude „•“ – adaptér tak ví, že prvek text měl, ale žádný nezná. `h` = skrytý prvek
// (skrývalo ho CSS), `l` = klíčové slovo hlášky o limitu.
export function zeVzorku(strom) {
  const stav = (uzel) => {
    const el = prvek(uzel.t, uzel.a || {}, [...(uzel.x ? ['•'] : []), ...(uzel.l ? [` ${uzel.l}`] : []), ...(uzel.c || []).map(stav)]);
    if (uzel.h) el.skryty = true;
    return el;
  };
  return dokument(stav(strom));
}

// ── Selektory ─────────────────────────────────────────────────────────────────

const cache = new Map();

// „a, b“ → [složený selektor, …]; čárky v závorkách a uvozovkách se nepočítají.
function seznam(sel) {
  if (cache.has(sel)) return cache.get(sel);
  const casti = [];
  let hloubka = 0, uvozovka = null, zacatek = 0;
  for (let i = 0; i < sel.length; i++) {
    const ch = sel[i];
    if (uvozovka) { if (ch === uvozovka) uvozovka = null; continue; }
    if (ch === '"' || ch === "'") uvozovka = ch;
    else if (ch === '(' || ch === '[') hloubka++;
    else if (ch === ')' || ch === ']') hloubka--;
    else if (ch === ',' && !hloubka) { casti.push(sel.slice(zacatek, i)); zacatek = i + 1; }
  }
  casti.push(sel.slice(zacatek));
  const out = casti.map((c) => slozeny(c.trim()));
  cache.set(sel, out);
  return out;
}

// „a b > c“ → [{ slozka, spojka }, …] zleva doprava; spojka je vztah k předchozí složce.
function slozeny(sel) {
  if (!sel) throw new Error('mini-dom: prázdný selektor');
  const out = [];
  let i = 0, spojka = null;
  while (i < sel.length) {
    if (sel[i] === ' ' || sel[i] === '>') {
      let s = ' ';
      while (i < sel.length && (sel[i] === ' ' || sel[i] === '>')) { if (sel[i] === '>') s = '>'; i++; }
      spojka = s;
      continue;
    }
    const [slozka, konec] = cast(sel, i);
    out.push({ slozka, spojka: out.length ? spojka : null });
    spojka = null;
    i = konec;
  }
  return out;
}

// Jedna složka bez mezer: typ, #id, .třída, [atribut], :not(…).
function cast(sel, i) {
  const s = { tag: null, id: null, tridy: [], atributy: [], ne: [] };
  const jmeno = /^[\w-]+/;
  if (sel[i] === '*') i++;
  else {
    const m = sel.slice(i).match(jmeno);
    if (m) { s.tag = m[0].toUpperCase(); i += m[0].length; }
  }
  while (i < sel.length && sel[i] !== ' ' && sel[i] !== '>') {
    const ch = sel[i];
    if (ch === '#' || ch === '.') {
      const m = sel.slice(i + 1).match(jmeno);
      if (!m) throw new Error(`mini-dom: nečitelný selektor „${sel}“`);
      if (ch === '#') s.id = m[0]; else s.tridy.push(m[0]);
      i += 1 + m[0].length;
    } else if (ch === '[') {
      const konec = sel.indexOf(']', i);
      const m = sel.slice(i + 1, konec).match(/^\s*([\w-]+)\s*(?:([*^$~]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\s\]]+))\s*(i)?)?\s*$/);
      if (!m) throw new Error(`mini-dom: nečitelný atribut v „${sel}“`);
      s.atributy.push({ jmeno: m[1], op: m[2] || null, hodnota: m[3] ?? m[4] ?? m[5] ?? null, bezVelikosti: Boolean(m[6]) });
      i = konec + 1;
    } else if (sel.startsWith(':not(', i)) {
      let hloubka = 1, j = i + 5;
      while (j < sel.length && hloubka) { if (sel[j] === '(') hloubka++; else if (sel[j] === ')') hloubka--; j++; }
      s.ne.push(seznam(sel.slice(i + 5, j - 1)));
      i = j;
    } else {
      throw new Error(`mini-dom: nepodporovaný selektor „${sel}“`);
    }
  }
  return [s, i];
}

function sediAtribut(el, { jmeno, op, hodnota, bezVelikosti }) {
  const v = el.getAttribute(jmeno);
  if (v === null) return false;
  if (!op) return true;
  const a = bezVelikosti ? v.toLowerCase() : v;
  const b = bezVelikosti ? hodnota.toLowerCase() : hodnota;
  if (op === '=') return a === b;
  if (op === '*=') return b !== '' && a.includes(b);
  if (op === '^=') return b !== '' && a.startsWith(b);
  if (op === '$=') return b !== '' && a.endsWith(b);
  if (op === '~=') return a.split(/\s+/).includes(b);
  return false;
}

function sediSlozka(el, s) {
  if (s.tag && el.tagName !== s.tag) return false;
  if (s.id && el.id !== s.id) return false;
  const tridy = el.className.split(/\s+/);
  if (s.tridy.some((t) => !tridy.includes(t))) return false;
  if (s.atributy.some((a) => !sediAtribut(el, a))) return false;
  if (s.ne.some((seznamNe) => seznamNe.some((x) => sedi(el, x)))) return false;
  return true;
}

// Porovnání zprava doleva, jako v prohlížeči.
function sedi(el, slozky, i = slozky.length - 1) {
  if (!sediSlozka(el, slozky[i].slozka)) return false;
  if (i === 0) return true;
  const { spojka } = slozky[i];
  if (spojka === '>') return Boolean(el.parentElement) && sedi(el.parentElement, slozky, i - 1);
  for (let p = el.parentElement; p; p = p.parentElement) if (sedi(p, slozky, i - 1)) return true;
  return false;
}
