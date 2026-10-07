// Dlouhá období Statistik (90 dní, 12 měsíců) z uložených denních souhrnů (src/historie.js,
// GET /api/historie). Krátká období počítá stats.js dál z živých konverzací po hodinách.
// Čistě datový modul bez DOM – testuje ho test/historie.test.mjs.
import { MONTHS, MONTHS_SHORT } from './format.js';
import { PROVIDERS, pkey } from './icons.js';
import { CHART_ORDER, CHART_OTHER, chartKey, chartColor } from './data.js';
import { podleJazyka } from './i18n.js';

export const DLOUHA_OBDOBI = new Set(['quarter', 'year']);

const klicDne = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const pulnoc = (ts) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d; };
const posunDny = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const kratkeDatum = (d) => podleJazyka(`${d.getDate()}. ${d.getMonth() + 1}.`, `${d.getDate()}/${d.getMonth() + 1}`);

/**
 * Přihrádky dlouhého období. 90 dní = 13 týdnů po 7 dnech končících dneškem (91 dní), 12 měsíců =
 * 12 kalendářních měsíců včetně toho letošního. Každá přihrádka nese seznam svých dní (klíče YYYY-MM-DD).
 */
export function dlouhePrihradky(period, now) {
  const dnes = pulnoc(now);
  if (period === 'quarter') {
    const prvni = posunDny(dnes, -90);
    return Array.from({ length: 13 }, (_, i) => {
      const od = posunDny(prvni, i * 7);
      const dny = Array.from({ length: 7 }, (__, k) => klicDne(posunDny(od, k)));
      const doDne = posunDny(od, 6);
      return { dny, label: kratkeDatum(od), tip: `${kratkeDatum(od)} – ${kratkeDatum(doDne)}` };
    });
  }
  return Array.from({ length: 12 }, (_, i) => {
    const zacatek = new Date(dnes.getFullYear(), dnes.getMonth() - 11 + i, 1);
    const dny = [];
    for (let d = zacatek; d.getMonth() === zacatek.getMonth() && d <= dnes; d = posunDny(d, 1)) dny.push(klicDne(d));
    return { dny, label: MONTHS_SHORT[zacatek.getMonth()], tip: `${MONTHS[zacatek.getMonth()]} ${zacatek.getFullYear()}` };
  });
}

const secti = (cil, zdroj) => { for (const [k, v] of Object.entries(zdroj || {})) cil[k] = (cil[k] || 0) + v; };
const radky = (soucty, barvy, pocty = null) => Object.entries(soucty)
  .filter(([, v]) => v > 0)
  .map(([key, value]) => ({ key, value, provider: pkey(barvy[key]), count: pocty?.[key] || 0 }))
  .sort((a, b) => b.value - a.value);

/**
 * Vše, co Statistiky ukazují, za dlouhé období. `historie` je { od, dny } ze serveru. `chybiOd` je
 * první den období, za který historie ještě nesahá (null = období je pokryté celé).
 */
export function dlouheObdobi(historie, period, now = Date.now(), hidden = new Set()) {
  const prihradky = dlouhePrihradky(period, now);
  const dny = historie?.dny || {};
  const data = new Map();
  const aplikace = {};
  const modely = {};
  const slozky = {};
  const slozkyKonverzace = {};
  const barvy = { aplikace: {}, modely: {}, slozky: {} };
  let tokeny = 0;
  let konverzace = 0;
  let zadani = 0;
  let hodiny = 0;
  prihradky.forEach((p, i) => {
    for (const d of p.dny) {
      const z = dny[d];
      if (!z) continue;
      tokeny += z.tokeny || 0;
      konverzace += z.konverzace || 0;
      zadani += z.zadani || 0;
      hodiny += z.hodiny || 0;
      for (const [provider, hodnota] of Object.entries(z.poskytovatele || {})) {
        const key = chartKey(pkey(provider));
        if (!data.has(key)) data.set(key, new Array(prihradky.length).fill(0));
        data.get(key)[i] += hodnota;
      }
      secti(aplikace, z.aplikace);
      secti(modely, z.modely);
      secti(slozky, z.slozky);
      secti(slozkyKonverzace, z.slozkyKonverzace);
      for (const druh of ['aplikace', 'modely', 'slozky']) for (const [k, p2] of Object.entries(z.barvy?.[druh] || {})) barvy[druh][k] ||= p2;
    }
  });
  const keys = [...CHART_ORDER, 'other'].filter((k) => data.has(k));
  const prvniDen = prihradky[0].dny[0];
  return {
    labels: prihradky.map((p) => p.label),
    tips: prihradky.map((p) => p.tip),
    series: keys.map((k) => ({ key: k, label: k === 'other' ? CHART_OTHER.label : PROVIDERS[k].label, color: chartColor(k), values: data.get(k), hidden: hidden.has(k) })),
    tokeny,
    konverzace,
    zadani,
    hodiny,
    pocetAplikaci: Object.keys(aplikace).length,
    aplikace: radky(aplikace, barvy.aplikace),
    modely: radky(modely, barvy.modely),
    slozky: radky(slozky, barvy.slozky, slozkyKonverzace),
    // Historie se ukládá teprve od `od`. Den před ním Agenteeq neviděl – nejde o nulu, ale o mezeru.
    chybiDo: historie?.od && historie.od > prvniDen ? historie.od : null,
    nactena: Boolean(historie),
  };
}
