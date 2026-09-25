import { esc } from './format.js';
import { tr } from './i18n.js';

// Výřez obrázku pro kartu projektu. Uživatel vidí přesně to, co se uloží: okno má poměr stran
// výsledku, obrázek se v něm posouvá tahem a přibližuje posuvníkem nebo kolečkem. Výsledek
// se vykreslí ve dvojnásobném až trojnásobném rozlišení proti tomu, co karta zobrazí, aby na
// Retině nebyl rozmazaný. Dřív se obrázek jen zmenšil a karta ho ořízla sama (`object-fit`).

export const TARGETS = {
  cover: { w: 1400, h: 400, bytes: 4_000_000, label: tr('Obrázek karty'), hint: tr('Doporučeno 1400 × 400 px (poměr 7 : 2), PNG, JPG nebo WebP do 4 MB. Důležité drž uprostřed.') },
  logo: { w: 512, h: 512, bytes: 1_500_000, label: tr('Logo klienta'), hint: tr('Doporučeno 512 × 512 px, nejlépe PNG s průhledným pozadím, do 1,5 MB.') },
};
const TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_ZOOM = 4;

// Zmenšování po půlkách: jedno velké zmenšení canvasem dává zubaté hrany, půlení je ostré.
function scaled(bmp, sx, sy, sw, sh, dw, dh) {
  let cur = document.createElement('canvas');
  const big = sw * sh > 36e6;
  cur.width = big ? dw : Math.max(1, Math.round(sw));
  cur.height = big ? dh : Math.max(1, Math.round(sh));
  let ctx = cur.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, cur.width, cur.height);
  while (cur.width / 2 >= dw && cur.height / 2 >= dh) {
    const next = document.createElement('canvas');
    next.width = Math.floor(cur.width / 2);
    next.height = Math.floor(cur.height / 2);
    ctx = next.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(cur, 0, 0, next.width, next.height);
    cur = next;
  }
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(dw));
  out.height = Math.max(1, Math.round(dh));
  ctx = out.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(cur, 0, 0, out.width, out.height);
  return out;
}

const toBlob = (canvas, type, q) => new Promise((res) => canvas.toBlob(res, type, q));

async function encode(canvas, kind) {
  const { bytes } = TARGETS[kind];
  const tries = kind === 'logo' ? [['image/png']] : [['image/webp', 0.92], ['image/webp', 0.8], ['image/jpeg', 0.9], ['image/jpeg', 0.75]];
  for (const [type, q] of tries) {
    const blob = await toBlob(canvas, type, q);
    // Některé prohlížeče neumí WebP a tiše vrátí PNG; ten se pro fotku nehodí, zkusí se JPEG.
    if (blob && blob.type === type && blob.size <= bytes) return blob;
  }
  const png = await toBlob(canvas, 'image/png');
  if (png && png.size <= bytes) return png;
  throw new Error(tr('Obrázek je i po úpravě příliš velký. Zkus jednodušší.'));
}

export const dataUrl = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });

// Vrátí Promise s { blob, url } nebo null (zrušeno). `host` je prvek, do kterého se editor vykreslí.
export async function openCropper(host, kind, file) {
  const t = TARGETS[kind];
  if (!TYPES.includes(file.type)) throw new Error(tr('Nahraj obrázek ve formátu PNG, JPG nebo WebP.'));
  let bmp;
  try { bmp = await createImageBitmap(file); } catch { throw new Error(tr('Tenhle obrázek se nepodařilo přečíst. Zkus jiný soubor.')); }
  // CSP povoluje jen data: a 'self', takže náhled nejde přes blob: adresu.
  const src = await dataUrl(file);
  const iw = bmp.width;
  const ih = bmp.height;
  return new Promise((resolve) => {
    host.hidden = false;
    host.innerHTML = `<div class="crop">
      <div class="crop-stage crop-stage--${kind}" style="aspect-ratio:${t.w} / ${t.h}" tabindex="0" role="application" aria-label="${tr('Výřez obrázku. Šipkami posouváš, plus a mínus přibližuješ.')}">
        <img src="${esc(src)}" alt="" draggable="false">
        <span class="crop-grid" aria-hidden="true"></span>
      </div>
      <div class="crop-tools">
        <label class="crop-zoom"><span>${tr('Přiblížení')}</span><input type="range" min="100" max="${MAX_ZOOM * 100}" value="100" step="1" data-zoom></label>
        ${kind === 'logo' ? `<div class="seg seg--sm" role="group" aria-label="${tr('Způsob vložení')}"><button type="button" data-fit="cover" aria-pressed="true">${tr('Vyplnit')}</button><button type="button" data-fit="contain" aria-pressed="false">${tr('Celé logo')}</button></div>` : ''}
        <button type="button" class="btn btn--sm" data-reset>${tr('Vycentrovat')}</button>
      </div>
      <p class="crop-meta" aria-live="polite" data-meta></p>
      <div class="crop-actions"><button type="button" class="btn btn--sm" data-cancel>${tr('Zrušit')}</button><button type="button" class="btn btn--primary btn--sm" data-ok>${tr('Použít výřez')}</button></div>
    </div>`;
    const stage = host.querySelector('.crop-stage');
    const img = stage.querySelector('img');
    const zoom = host.querySelector('[data-zoom]');
    const meta = host.querySelector('[data-meta]');
    let mode = 'cover';
    let z = 1;
    let ox = 0;
    let oy = 0;
    let sw = stage.clientWidth || 300;
    let sh = stage.clientHeight || 300;
    const base = () => (mode === 'cover' ? Math.max(sw / iw, sh / ih) : Math.min(sw / iw, sh / ih));
    const clamp = () => {
      const s = base() * z;
      const w = iw * s;
      const h = ih * s;
      ox = Math.min(Math.max(ox, Math.min(0, sw - w)), Math.max(0, sw - w));
      oy = Math.min(Math.max(oy, Math.min(0, sh - h)), Math.max(0, sh - h));
    };
    const center = () => { const s = base() * z; ox = (sw - iw * s) / 2; oy = (sh - ih * s) / 2; };
    const paint = () => {
      sw = stage.clientWidth || sw;
      sh = stage.clientHeight || sh;
      clamp();
      const s = base() * z;
      img.style.cssText = `width:${Math.round(iw * s)}px;height:${Math.round(ih * s)}px;transform:translate(${Math.round(ox)}px,${Math.round(oy)}px)`;
      const regionW = Math.round(Math.min(sw, iw * s) / s);
      const regionH = Math.round(Math.min(sh, ih * s) / s);
      // Kolikrát se zdrojový pixel zvětší ve výsledku; nad 1,4× je obraz viditelně měkký.
      const low = s * (t.w / sw) > 1.4;
      meta.classList.toggle('is-warn', low);
      meta.textContent = `${tr('Zdroj {0} × {1} px, výřez {2} × {3} px, uloží se {4} × {5} px.', iw, ih, regionW, regionH, t.w, t.h)}${low ? tr(' Pozor: takhle malý výřez bude na kartě rozmazaný. Vyber větší obrázek nebo méně přiblížení.') : ''}`;
    };
    center();
    paint();
    const ro = new ResizeObserver(() => paint());
    ro.observe(stage);

    let drag = null;
    stage.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, ox, oy }; stage.setPointerCapture(e.pointerId); stage.classList.add('is-drag'); });
    stage.addEventListener('pointermove', (e) => { if (!drag) return; ox = drag.ox + e.clientX - drag.x; oy = drag.oy + e.clientY - drag.y; paint(); });
    const end = () => { drag = null; stage.classList.remove('is-drag'); };
    stage.addEventListener('pointerup', end);
    stage.addEventListener('pointercancel', end);
    const setZoom = (nz, fx = sw / 2, fy = sh / 2) => {
      nz = Math.min(MAX_ZOOM, Math.max(1, nz));
      // Přibližuje se k bodu pod kurzorem, ne k rohu.
      const s0 = base() * z;
      const s1 = base() * nz;
      ox = fx - ((fx - ox) / s0) * s1;
      oy = fy - ((fy - oy) / s0) * s1;
      z = nz;
      zoom.value = String(Math.round(z * 100));
      paint();
    };
    zoom.addEventListener('input', () => setZoom(Number(zoom.value) / 100));
    stage.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = stage.getBoundingClientRect();
      setZoom(z * (e.deltaY < 0 ? 1.08 : 1 / 1.08), e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    stage.addEventListener('keydown', (e) => {
      const d = { ArrowLeft: [-12, 0], ArrowRight: [12, 0], ArrowUp: [0, -12], ArrowDown: [0, 12] }[e.key];
      if (d) { e.preventDefault(); ox += d[0]; oy += d[1]; paint(); }
      else if (e.key === '+' || e.key === '=') { e.preventDefault(); setZoom(z * 1.1); }
      else if (e.key === '-') { e.preventDefault(); setZoom(z / 1.1); }
    });
    host.querySelector('[data-reset]').addEventListener('click', () => { z = 1; zoom.value = '100'; center(); paint(); });
    for (const b of host.querySelectorAll('[data-fit]')) {
      b.addEventListener('click', () => {
        mode = b.dataset.fit;
        for (const o of host.querySelectorAll('[data-fit]')) o.setAttribute('aria-pressed', String(o === b));
        z = 1;
        zoom.value = '100';
        center();
        paint();
      });
    }
    const done = (result) => {
      ro.disconnect();
      bmp.close?.();
      host.innerHTML = '';
      host.hidden = true;
      resolve(result);
    };
    host.querySelector('[data-cancel]').addEventListener('click', () => done(null));
    host.querySelector('[data-ok]').addEventListener('click', async (e) => {
      const ok = e.currentTarget;
      ok.disabled = true;
      try {
        const s = base() * z;
        const k = t.w / sw;
        // Viditelná část obrázku v okně; okraje mimo obrázek (u loga „celé“) zůstanou průhledné.
        const ix = Math.max(0, ox);
        const iy = Math.max(0, oy);
        const ix2 = Math.min(sw, ox + iw * s);
        const iy2 = Math.min(sh, oy + ih * s);
        const out = document.createElement('canvas');
        out.width = t.w;
        out.height = t.h;
        const part = scaled(bmp, (ix - ox) / s, (iy - oy) / s, (ix2 - ix) / s, (iy2 - iy) / s, (ix2 - ix) * k, (iy2 - iy) * k);
        out.getContext('2d').drawImage(part, Math.round(ix * k), Math.round(iy * k));
        const blob = await encode(out, kind);
        const url = await dataUrl(blob);
        done({ blob, url });
      } catch (err) {
        ok.disabled = false;
        meta.classList.add('is-warn');
        meta.textContent = err.message;
      }
    });
    stage.focus({ preventScroll: true });
  });
}
