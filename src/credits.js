// Dokoupení kreditů se nikde nehlásí – pozná se jen z nárůstu zůstatku, který aplikace sama zapisuje
// do svých session. Jenže Codex jich má běžně několik naráz a starší session hlásí zastaralý zůstatek,
// takže řada čísel skáče nahoru a dolů, i když se nic nekoupilo. Skutečný nákup se od zastaralého
// snímku pozná tím, že se udrží: následující odečty zůstanou nad původní úrovní.

const DRZI_MS = 30 * 60000; // jak dlouho se sleduje, jestli vzestup vydrží
const SLOUCIT_MS = 15 * 60000; // dva vzestupy hned za sebou = jeden nákup ve dvou krocích
const PRAH = 0.001; // menší rozdíly jsou zaokrouhlovací šum

const median = (cisla) => {
  if (!cisla.length) return null;
  const s = [...cisla].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

// Když odečty nesou konverzaci (`zdroj`), hledá se vzestup jen uvnitř každé z nich zvlášť. Napříč
// konverzacemi se srovnávat nedá: 1. 8. jedna konverzace přehrála starší historii (195,83 → 87,36)
// a o devět sekund později jiná nahlásila 195,83 – porovnáno napříč to vypadalo jako nákup +108.
// Tentýž nákup, který vidí víc konverzací naráz (12. 7. tři během 15 s), je pořád jeden.
export function detectTopUps(readings, opts = {}) {
  const platne = (readings || []).filter((p) => p && Number.isFinite(Number(p.at)) && Number.isFinite(Number(p.balance)));
  if (!platne.length || !platne.every((p) => p.zdroj)) return detectTopUpsRada(platne, opts);
  const podle = new Map();
  for (const p of platne) (podle.get(p.zdroj) || podle.set(p.zdroj, []).get(p.zdroj)).push(p);
  const vse = [...podle.values()].flatMap((rada) => detectTopUpsRada(rada, opts).map((x) => ({ ...x, zdroj: rada[0].zdroj })));
  vse.sort((a, b) => a.at - b.at);
  const sloucitMs = opts.sloucitMs ?? SLOUCIT_MS;
  const out = [];
  for (const x of vse) {
    const posledni = out[out.length - 1];
    if (posledni && x.at - posledni.at <= sloucitMs) posledni.amount = Math.max(posledni.amount, x.amount);
    else out.push({ at: x.at, amount: x.amount });
  }
  return out;
}

// Jedna řada odečtů (jedna konverzace, nebo starší historie bez rozlišení konverzace).
function detectTopUpsRada(readings, { drziMs = DRZI_MS, sloucitMs = SLOUCIT_MS } = {}) {
  const body = (readings || [])
    .filter((p) => p && Number.isFinite(Number(p.at)) && Number.isFinite(Number(p.balance)))
    .map((p) => ({ at: Number(p.at), balance: Number(p.balance) }))
    .sort((a, b) => a.at - b.at);

  const out = [];
  for (let i = 1; i < body.length; i++) {
    const pred = body[i - 1].balance;
    const po = body[i].balance;
    if (po <= pred + PRAH) continue;

    // Udrží se vzestup? Bereme medián odečtů v následujícím okně – jednotlivý zastaralý snímek
    // tak výsledek nepřeváží, ale návrat na původní úroveň ano.
    const nasledujici = [];
    for (let j = i + 1; j < body.length && body[j].at - body[i].at <= drziMs; j++) nasledujici.push(body[j].balance);
    const stred = median(nasledujici);
    if (stred !== null && stred <= pred + PRAH) continue;

    const posledni = out[out.length - 1];
    if (posledni && body[i].at - posledni.at <= sloucitMs) {
      posledni.at = body[i].at;
      posledni.to = po;
    } else {
      out.push({ at: body[i].at, from: pred, to: po });
    }
  }
  return out.map((x) => ({ at: x.at, amount: Math.round((x.to - x.from) * 1e6) / 1e6 })).filter((x) => x.amount > 0);
}
