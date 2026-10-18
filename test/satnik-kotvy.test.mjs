// Šatník sedí na každé postavě: čepice na temeni (ne v půlce hlavy), brýle na linii očí a v obličeji,
// oblečení na trupu, kukly a přilby podle tvaru hlavy. Měří se obálka (bounding box) vykreslených
// vrstev v souřadnicích robota – včetně transformací z fit() – pro všech devět postav a každou položku.
// Vznik: majitel viděl Mikulášskou čepici „v půlce hlavy“ u širokých robotů (Bolt).
import test from 'node:test';
import assert from 'node:assert/strict';
import { ROBOT_TYPES, geometry } from '../public/js/robot-svg.js';
import { WARDROBE, robotInWardrobe } from '../public/js/robot-wardrobe.js';

const NUM = /-?(?:\d+\.\d*|\.\d+|\d+)(?:e-?\d+)?/g;
const attr = (s, name) => {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(s);
  return m ? m[1] : null;
};
const num = (s, name, def = 0) => (attr(s, name) == null ? def : Number(attr(s, name)));

// Transformace skupin: jen translate a scale (víc šatník nepoužívá), skládají se zleva.
function parseTransform(t) {
  let m = [1, 1, 0, 0]; // sx, sy, tx, ty: x' = sx*x + tx
  for (const [, fn, args] of (t || '').matchAll(/(translate|scale)\(([^)]*)\)/g)) {
    const v = (args.match(NUM) || []).map(Number);
    const local = fn === 'translate' ? [1, 1, v[0], v[1] ?? 0] : [v[0], v[1] ?? v[0], 0, 0];
    m = [m[0] * local[0], m[1] * local[1], m[0] * local[2] + m[2], m[1] * local[3] + m[3]];
  }
  return m;
}

// Body cesty: koncové i řídicí body (obálka je tedy spíš větší – to testům nevadí).
function pathPoints(d) {
  const pts = [];
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  for (const [, cmd, args] of d.matchAll(/([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)/g)) {
    const v = (args.match(NUM) || []).map(Number);
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    if (C === 'Z') { x = sx; y = sy; continue; }
    if (C === 'H') { for (const a of v) { x = rel ? x + a : a; pts.push([x, y]); } continue; }
    if (C === 'V') { for (const a of v) { y = rel ? y + a : a; pts.push([x, y]); } continue; }
    if (C === 'A') {
      for (let i = 0; i + 7 <= v.length; i += 7) {
        x = rel ? x + v[i + 5] : v[i + 5];
        y = rel ? y + v[i + 6] : v[i + 6];
        pts.push([x, y]);
      }
      continue;
    }
    const per = { M: 2, L: 2, T: 2, C: 6, S: 4, Q: 4 }[C];
    for (let i = 0; i + per <= v.length; i += per) {
      const bx = x;
      const by = y;
      for (let k = 0; k < per; k += 2) pts.push([rel ? bx + v[i + k] : v[i + k], rel ? by + v[i + k + 1] : v[i + k + 1]]);
      x = rel ? bx + v[i + per - 2] : v[i + per - 2];
      y = rel ? by + v[i + per - 1] : v[i + per - 1];
      if (C === 'M' && i === 0) { sx = x; sy = y; }
    }
  }
  return pts;
}

function elementPoints(tag, a) {
  if (tag === 'rect') {
    const x = num(a, 'x');
    const y = num(a, 'y');
    return [[x, y], [x + num(a, 'width'), y + num(a, 'height')]];
  }
  if (tag === 'circle' || tag === 'ellipse') {
    let rx = tag === 'circle' ? num(a, 'r') : num(a, 'rx');
    let ry = tag === 'circle' ? rx : num(a, 'ry');
    if (/rotate/.test(attr(a, 'transform') || '')) rx = ry = Math.max(rx, ry);
    const cx = num(a, 'cx');
    const cy = num(a, 'cy');
    return [[cx - rx, cy - ry], [cx + rx, cy + ry]];
  }
  if (tag === 'path') return pathPoints(attr(a, 'd') || '');
  return [];
}

// Obálka každé vrstvy šatníku (robot-wear--hat, --face, --mid, …) v souřadnicích robota.
function vrstvy(svg) {
  const out = {};
  const stack = [];
  for (const [, close, tag, a, self] of svg.matchAll(/<(\/?)(\w+)([^>]*?)(\/?)>/g)) {
    if (close) { if (tag === 'g') stack.pop(); continue; }
    if (tag === 'g') {
      const wear = /robot-wear--(\w+)/.exec(attr(a, 'class') || '')?.[1];
      const parent = stack.at(-1);
      const m = parseTransform(attr(a, 'transform'));
      const pm = parent?.m || [1, 1, 0, 0];
      const cm = [pm[0] * m[0], pm[1] * m[1], pm[0] * m[2] + pm[2], pm[1] * m[3] + pm[3]];
      if (!self) stack.push({ wear: wear || parent?.wear, m: cm });
      continue;
    }
    const top = stack.at(-1);
    if (!top?.wear) continue;
    const box = (out[top.wear] ||= { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity });
    for (const [px, py] of elementPoints(tag, a)) {
      const X = top.m[0] * px + top.m[2];
      const Y = top.m[1] * py + top.m[3];
      box.x1 = Math.min(box.x1, X); box.x2 = Math.max(box.x2, X);
      box.y1 = Math.min(box.y1, Y); box.y2 = Math.max(box.y2, Y);
    }
  }
  return out;
}
const sjednot = (...b) => b.filter(Boolean).reduce((a, c) => ({ x1: Math.min(a.x1, c.x1), y1: Math.min(a.y1, c.y1), x2: Math.max(a.x2, c.x2), y2: Math.max(a.y2, c.y2) }));
const r1 = (b) => JSON.stringify(Object.fromEntries(Object.entries(b).map(([k, v]) => [k, Math.round(v * 10) / 10])));

test('šatník: každá položka se vykreslí na každé postavě', () => {
  for (const type of ROBOT_TYPES) {
    for (const slot of Object.keys(WARDROBE)) {
      for (const id of Object.keys(WARDROBE[slot])) {
        const svg = robotInWardrobe(type, { [slot]: id });
        const v = vrstvy(svg);
        assert.ok(Object.keys(v).length > 0, `${type} ${slot}:${id} nemá žádnou vrstvu`);
        for (const [name, b] of Object.entries(v)) assert.ok(Number.isFinite(b.x1 + b.x2 + b.y1 + b.y2), `${type} ${slot}:${id} ${name} má neplatné souřadnice`);
        assert.doesNotMatch(svg, /NaN|undefined|Infinity/, `${type} ${slot}:${id}`);
      }
    }
  }
});

test('šatník: čepice leží na temeni, je uprostřed a nezasahuje do obličeje', () => {
  for (const type of ROBOT_TYPES) {
    const g = geometry(type);
    for (const id of Object.keys(WARDROBE.hat)) {
      const b = vrstvy(robotInWardrobe(type, { hat: id })).hat;
      const kde = `${type} hat:${id} ${r1(b)}`;
      if (id === 'headphones') {
        // Sluchátka jsou jediná „čepice“ přes uši: mušle u očí, oblouk přes temeno.
        assert.ok(b.y1 < g.head.top && b.y2 > g.eyeY, kde);
        assert.ok(b.x1 < g.head.x && b.x2 > g.head.x + g.head.w, kde);
        continue;
      }
      assert.ok(b.y2 <= g.face.top + 0.3, `${kde}: lem zasahuje do obličeje (začíná na ${g.face.top})`);
      assert.ok(b.y2 >= g.head.top + 3 * g.s, `${kde}: čepice visí nad hlavou místo na ní (temeno ${g.head.top})`);
      assert.ok(b.y1 < g.head.top, `${kde}: čepice nepřesahuje temeno`);
      assert.ok(Math.abs((b.x1 + b.x2) / 2 - 54) <= 6 * g.s, `${kde}: není uprostřed`);
      assert.ok(b.x2 - b.x1 <= g.head.w + 26 * g.s, `${kde}: je širší, než unese hlava`);
    }
  }
});

test('šatník: brýle sedí na linii očí a doplňky na obličej zůstanou v obličeji', () => {
  const naOcich = ['glasses', 'sunglasses', 'visor', 'glasses3d', 'hearts', 'stars', 'goggles'];
  for (const type of ROBOT_TYPES) {
    const g = geometry(type);
    const dole = g.face.top + g.face.h;
    for (const id of Object.keys(WARDROBE.face)) {
      const b = vrstvy(robotInWardrobe(type, { face: id })).face;
      const kde = `${type} face:${id} ${r1(b)} oči ${Math.round(g.eyeY * 10) / 10}`;
      assert.ok(b.x1 >= g.head.x - 6 * g.s && b.x2 <= g.head.x + g.head.w + 6 * g.s, `${kde}: přesahuje hlavu`);
      assert.ok(b.y1 >= g.face.top - 3 * g.s, `${kde}: leze nad obličej`);
      if (id !== 'monocle') assert.ok(b.y2 <= dole + 1, `${kde}: leze pod obličej (${dole})`);
      if (naOcich.includes(id)) {
        assert.ok(Math.abs((b.y1 + b.y2) / 2 - g.eyeY) <= 6 * g.es, `${kde}: brýle nejsou na linii očí`);
        assert.ok(Math.abs((b.x1 + b.x2) / 2 - 54) <= 1, `${kde}: brýle nejsou uprostřed`);
        // Skla musí krýt oči: oči jsou od středu ±12,5·s.
        assert.ok(b.x1 < 54 - 12.5 * g.s - 3 && b.x2 > 54 + 12.5 * g.s + 3, `${kde}: brýle nekryjí oči`);
      }
    }
  }
});

test('šatník: oblečení a převleky sedí na trupu', () => {
  for (const type of ROBOT_TYPES) {
    const g = geometry(type);
    const t = g.torso;
    for (const slot of ['outfit', 'costume']) {
      for (const id of Object.keys(WARDROBE[slot])) {
        const v = vrstvy(robotInWardrobe(type, { [slot]: id }));
        const b = sjednot(v.mid, v.body);
        const kde = `${type} ${slot}:${id} ${r1(b)} trup ${r1({ top: t.top, h: t.h })}`;
        assert.ok(Math.abs((b.x1 + b.x2) / 2 - 54) <= 4, `${kde}: není uprostřed trupu`);
        assert.ok(b.y1 >= t.top - 6, `${kde}: leze na hlavu`);
        const vse = sjednot(v.mid, v.body, v.back);
        assert.ok(vse.y1 <= t.top + t.h / 2 && vse.y2 >= t.top + t.h / 2, `${kde}: nekryje trup`);
      }
    }
  }
});

test('šatník: kukla, přilba a kapuce kopírují tvar hlavy každé postavy', () => {
  for (const type of ROBOT_TYPES) {
    const g = geometry(type);
    const h = g.head;
    for (const id of ['ninja', 'knight', 'frog']) {
      const b = vrstvy(robotInWardrobe(type, { costume: id })).hood;
      const kde = `${type} costume:${id} ${r1(b)}`;
      assert.ok(b.x1 <= h.x && b.x1 >= h.x - 3, `${kde}: levý okraj neodpovídá hlavě`);
      assert.ok(b.y2 >= h.top + h.h && b.y2 <= h.top + h.h + 3, `${kde}: spodní okraj neodpovídá hlavě`);
    }
    // Zaoblení kukly je zaoblení hlavy + přesah: kulatý Orbit dostane kulatou kuklu, Pixel hranatou.
    assert.match(robotInWardrobe(type, { costume: 'ninja' }), new RegExp(`A${Math.round((h.r + 1.5) * 100) / 100} ${Math.round((h.r + 1.5) * 100) / 100} `), type);
    // Bublina kosmonauta obepíná celou hlavu.
    const bublina = vrstvy(robotInWardrobe(type, { costume: 'astronaut' })).hat;
    assert.ok(bublina.x1 < h.x && bublina.x2 > h.x + h.w && bublina.y1 < h.top && bublina.y2 > h.top + h.h, `${type} astronaut ${r1(bublina)}`);
  }
});

test('šatník: každá skupina má dost položek, aby se mřížka zaplnila', () => {
  // Mřížka má 4 sloupce na počítači a 3 na telefonu; s volbou „bez“ to vychází na celé řady.
  assert.equal(Object.keys(WARDROBE.hat).length + 1, 16);
  for (const slot of ['face', 'outfit', 'costume']) assert.equal(Object.keys(WARDROBE[slot]).length + 1, 12, slot);
});
