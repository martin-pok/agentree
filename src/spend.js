import { uid, round2 } from './util.js';
import { csv } from './csv.js';
import { ui } from './texty.js';

export const SERVICES = {
  chatgpt: { label: 'ChatGPT', provider: 'openai' },
  claude: { label: 'Claude', provider: 'anthropic' },
  copilot: { label: 'GitHub Copilot', provider: 'github' },
  mscopilot: { label: 'Microsoft Copilot', provider: 'microsoft' },
  gemini: { label: 'Gemini', provider: 'google' },
  perplexity: { label: 'Perplexity', provider: 'perplexity' },
  grok: { label: 'Grok', provider: 'xai' },
  qwen: { label: 'Qwen', provider: 'alibaba' },
  cursor: { label: 'Cursor', provider: 'cursor' },
  'openai-api': { label: 'OpenAI API', provider: 'openai' },
  'anthropic-api': { label: 'Anthropic API', provider: 'anthropic' },
  other: { label: ui('Ostatní'), provider: 'other' },
};

export const KINDS = {
  subscription: ui('Předplatné'),
  extra: ui('Extra usage'),
  credits: ui('Kredity'),
  api: 'API',
};

export const CURRENCIES = ['CZK', 'USD', 'EUR'];

// Kurzy jsou "kolik CZK za 1 jednotku". Výchozí hodnoty jsou orientační – uživatel je upravuje v nastavení.
export const DEFAULT_SPEND = {
  currency: 'CZK',
  rates: { CZK: 1, USD: 23, EUR: 25 },
  budgets: { total: 0, services: {} },
  ledger: [],
};

export function monthKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function addMonths(key, n) {
  const [y, m] = key.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

export function convert(amount, currency, spend) {
  const rates = { ...DEFAULT_SPEND.rates, ...(spend.rates || {}), CZK: 1 };
  const from = rates[currency];
  const to = rates[spend.currency || 'CZK'];
  if (!(from > 0) || !(to > 0)) return 0;
  return (Number(amount) || 0) * from / to;
}

export function validateEntry(input, now = Date.now()) {
  const errors = {};
  const service = SERVICES[input?.service] ? input.service : null;
  if (!service) errors.service = ui('Vyber službu.');
  const kind = KINDS[input?.kind] ? input.kind : null;
  if (!kind) errors.kind = ui('Vyber typ platby.');
  const amount = Number(String(input?.amount ?? '').replace(/\s/g, '').replace(',', '.'));
  if (!(amount > 0) || amount > 1e7) errors.amount = ui('Zadej částku větší než 0.');
  const currency = CURRENCIES.includes(input?.currency) ? input.currency : null;
  if (!currency) errors.currency = ui('Vyber měnu.');
  const date = typeof input?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.date) && Number.isFinite(Date.parse(input.date)) ? input.date : null;
  if (!date) errors.date = ui('Zadej datum ve tvaru RRRR-MM-DD.');
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      id: uid(),
      service,
      kind,
      amount: round2(amount),
      currency,
      date,
      recurring: input?.recurring === 'monthly' ? 'monthly' : null,
      endDate: null,
      note: typeof input?.note === 'string' ? input.note.trim().slice(0, 140) : '',
      // Volitelné jméno odlišuje více licencí stejné služby. Je záměrně uživatelské:
      // poskytovatelé identitu dalších spotřebitelských účtů přes podporované API neposílají.
      account: kind === 'subscription' && typeof input?.account === 'string' ? input.account.trim().slice(0, 80) : '',
      createdAt: now,
    },
  };
}

export function validateBudgets(input, current) {
  const errors = {};
  const next = structuredClone(current);
  if (input?.currency !== undefined) {
    if (CURRENCIES.includes(input.currency)) next.currency = input.currency;
    else errors.currency = ui('Nepodporovaná měna.');
  }
  if (input?.rates !== undefined) {
    for (const c of ['USD', 'EUR']) {
      if (input.rates[c] === undefined) continue;
      const v = Number(String(input.rates[c]).replace(',', '.'));
      if (v > 0 && v < 1000) next.rates[c] = round2(v);
      else errors[`rates.${c}`] = ui('Kurz musí být kladné číslo.');
    }
  }
  if (input?.total !== undefined) {
    const v = Number(String(input.total).replace(/\s/g, '').replace(',', '.'));
    if (v >= 0 && v < 1e8) next.budgets.total = round2(v);
    else errors.total = ui('Rozpočet musí být 0 nebo kladné číslo.');
  }
  if (input?.services && typeof input.services === 'object') {
    for (const [svc, raw] of Object.entries(input.services)) {
      if (!SERVICES[svc]) continue;
      const v = Number(String(raw ?? '').replace(/\s/g, '').replace(',', '.'));
      if (raw === '' || raw === null || v === 0) delete next.budgets.services[svc];
      else if (v > 0 && v < 1e8) next.budgets.services[svc] = round2(v);
      else errors[`services.${svc}`] = ui('Rozpočet musí být kladné číslo.');
    }
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value: next };
}

// `auto` je část součtu z automatických položek Admin API. Obrazovka Útrata ji ukazuje zvlášť,
// aby šel součet měsíce složit z viditelných řádků: ručně zapsané + automaticky z Admin API.
export function monthlyTotals(spend, months, autoEntries = []) {
  const rows = months.map((key) => ({ key, total: 0, auto: 0, services: {}, kinds: {} }));
  const index = new Map(months.map((k, i) => [k, i]));
  const add = (key, e) => {
    const i = index.get(key);
    if (i === undefined) return;
    const v = convert(e.amount, e.currency, spend);
    const row = rows[i];
    row.total += v;
    if (e.auto) row.auto += v;
    row.services[e.service] = (row.services[e.service] || 0) + v;
    row.kinds[e.kind] = (row.kinds[e.kind] || 0) + v;
  };
  for (const e of [...(spend.ledger || []), ...autoEntries]) {
    if (typeof e?.date !== 'string') continue;
    const start = e.date.slice(0, 7);
    if (e.recurring === 'monthly') {
      const end = e.endDate ? e.endDate.slice(0, 7) : null;
      for (const key of months) if (key >= start && (!end || key <= end)) add(key, e);
    } else {
      add(start, e);
    }
  }
  for (const row of rows) {
    row.total = round2(row.total);
    row.auto = round2(row.auto);
    for (const k of Object.keys(row.services)) row.services[k] = round2(row.services[k]);
    for (const k of Object.keys(row.kinds)) row.kinds[k] = round2(row.kinds[k]);
  }
  return rows;
}

// Automatické položky Admin API sečtené po měsících a službách pro tabulku Výdaje. Denní položek
// je za půl roku stovky, proto se ukazují jako jeden řádek za službu a měsíc – stejné seskupení,
// jakým vstupují do měsíčního součtu, takže řádky jdou s ním porovnat. Dny jsou dny dodavatele (UTC).
//
// `modelEntries` (cloud-billing#modelEntries) doplní ke každému řádku `models`: rozpad útraty a tokenů
// organizace po modelech za stejný měsíc a službu. Tokeny jsou samostatná metrika z Admin API (ne
// tokeny z přepisů na tomto počítači) a nikdy se nesčítají s částkou. `tokens: null` = nezjištěno.
export function autoMonthly(autoEntries, months, spend, modelEntries = []) {
  const map = new Map();
  for (const e of autoEntries) {
    if (typeof e?.date !== 'string') continue;
    const month = e.date.slice(0, 7);
    if (!months.includes(month)) continue;
    const key = `${month}|${e.service}|${e.currency}`;
    const r = map.get(key) || map.set(key, { month, service: e.service, kind: e.kind, currency: e.currency, amount: 0, converted: 0, days: 0, from: e.date, to: e.date }).get(key);
    r.amount += Number(e.amount) || 0;
    r.converted += convert(e.amount, e.currency, spend);
    r.days += 1;
    if (e.date < r.from) r.from = e.date;
    if (e.date > r.to) r.to = e.date;
  }
  const models = new Map();
  for (const m of modelEntries) {
    if (typeof m?.date !== 'string') continue;
    const key = `${m.date.slice(0, 7)}|${m.service}|${m.currency}`;
    if (!map.has(key)) continue;
    const group = models.get(key) || models.set(key, new Map()).get(key);
    const name = typeof m.model === 'string' && m.model ? m.model : null;
    const r = group.get(name) || group.set(name, { model: name, amount: 0, converted: 0, tokens: { input: 0, output: 0, cached: 0 } }).get(name);
    r.amount += Number(m.amount) || 0;
    r.converted += convert(m.amount, m.currency, spend);
    if (!m.tokens || !r.tokens) r.tokens = null;
    else for (const k of ['input', 'output', 'cached']) r.tokens[k] += Number(m.tokens[k]) || 0;
  }
  const objem = (x) => (x.tokens ? x.tokens.input + x.tokens.output : 0);
  return [...map.entries()]
    .map(([key, r]) => ({
      ...r,
      amount: round2(r.amount),
      converted: round2(r.converted),
      // Nejdražší model první, položka bez modelu vždy na konci.
      models: [...(models.get(key)?.values() || [])]
        .map((x) => ({ ...x, amount: round2(x.amount), converted: round2(x.converted) }))
        .sort((a, b) => (a.model === null) - (b.model === null) || b.amount - a.amount || objem(b) - objem(a) || String(a.model).localeCompare(String(b.model))),
    }))
    .sort((a, b) => b.month.localeCompare(a.month) || a.service.localeCompare(b.service));
}

export function spendSummary(spend, now = Date.now(), autoEntries = [], modelEntries = []) {
  const current = monthKey(now);
  const months = Array.from({ length: 6 }, (_, i) => addMonths(current, i - 5));
  const rows = monthlyTotals(spend, months, autoEntries);
  const month = rows[rows.length - 1];

  const d = new Date(now);
  const day = d.getDate();
  const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  let recurring = 0;
  for (const e of [...(spend.ledger || []), ...autoEntries]) {
    if (e.recurring !== 'monthly' || typeof e.date !== 'string') continue;
    if (e.date.slice(0, 7) <= current && (!e.endDate || e.endDate.slice(0, 7) >= current)) recurring += convert(e.amount, e.currency, spend);
  }
  const oneOff = Math.max(0, month.total - recurring);
  const forecast = recurring + (oneOff / Math.max(1, day)) * daysInMonth;

  const budgets = [];
  const total = Number(spend.budgets?.total) || 0;
  if (total > 0) budgets.push({ scope: 'total', label: ui('Celkem'), spent: month.total, budget: total, pct: round2((month.total / total) * 100) });
  for (const [svc, b] of Object.entries(spend.budgets?.services || {})) {
    if (!(b > 0) || !SERVICES[svc]) continue;
    const spent = month.services[svc] || 0;
    budgets.push({ scope: svc, label: SERVICES[svc].label, spent, budget: b, pct: round2((spent / b) * 100) });
  }

  return {
    currency: spend.currency || 'CZK',
    monthKey: current,
    month,
    months: rows,
    recurring: round2(recurring),
    forecast: round2(forecast),
    budgets,
    automatic: autoMonthly(autoEntries, months, spend, modelEntries),
  };
}

// Export útraty pro účetnictví nebo vlastní tabulku: jeden řádek za platbu v každém měsíci.
// Měsíční předplatné má řádek v každém měsíci, kdy běželo, takže součet sloupce „Částka v …“
// za měsíc odpovídá měsíčnímu součtu na obrazovce Útrata (stejná pravidla jako monthlyTotals).
// Převod jde přes kurzy nastavené v aplikaci – kurz je v řádku, aby šel převod zkontrolovat.
export const EXPORT_MESICU = { vychozi: 12, max: 36 };

const EXPORT_TEXT = {
  cs: {
    headers: ['Měsíc', 'Datum platby', 'Služba', 'Typ', 'Účet / licence', 'Opakování', 'Poznámka', 'Částka', 'Měna', 'Kurz na', 'Částka v', 'Zdroj'],
    manual: 'Ručně', monthly: 'měsíčně', monthlyUntil: 'měsíčně do', once: 'jednorázově',
    kinds: { subscription: 'Předplatné', extra: 'Extra usage', credits: 'Kredity', api: 'API' },
  },
  en: {
    headers: ['Month', 'Payment date', 'Service', 'Type', 'Account / licence', 'Recurrence', 'Note', 'Amount', 'Currency', 'Rate to', 'Amount in', 'Source'],
    manual: 'Manual', monthly: 'monthly', monthlyUntil: 'monthly until', once: 'one-off',
    kinds: { subscription: 'Subscription', extra: 'Extra usage', credits: 'Credits', api: 'API' },
  },
};

const zdrojZaznamu = (e, t) => (String(e.id || '').startsWith('auto:') ? 'Admin API' : t.manual);

function datumVMesici(datum, mesic) {
  if (datum.slice(0, 7) === mesic) return datum.slice(0, 10);
  const [y, m] = mesic.split('-').map(Number);
  const den = Math.min(Number(datum.slice(8, 10)) || 1, new Date(y, m, 0).getDate());
  return `${mesic}-${String(den).padStart(2, '0')}`;
}

export function spendCsv(spend, now = Date.now(), autoEntries = [], mesicu = EXPORT_MESICU.vychozi, language = 'cs') {
  const t = EXPORT_TEXT[language === 'en' ? 'en' : 'cs'];
  const mena = spend.currency || 'CZK';
  const current = monthKey(now);
  const months = Array.from({ length: mesicu }, (_, i) => addMonths(current, i - (mesicu - 1)));
  const polozky = [];
  for (const e of [...(spend.ledger || []), ...autoEntries]) {
    if (typeof e?.date !== 'string') continue;
    const start = e.date.slice(0, 7);
    const konec = e.endDate ? e.endDate.slice(0, 7) : null;
    const kdy = e.recurring === 'monthly' ? months.filter((k) => k >= start && (!konec || k <= konec)) : months.includes(start) ? [start] : [];
    for (const k of kdy) polozky.push({ mesic: k, datum: datumVMesici(e.date, k), e });
  }
  polozky.sort((a, b) => a.datum.localeCompare(b.datum) || String(a.e.service).localeCompare(String(b.e.service)));
  const radky = [[...t.headers.slice(0, 9), `${t.headers[9]} ${mena}`, `${t.headers[10]} ${mena}`, t.headers[11]]];
  for (const { mesic, datum, e } of polozky) {
    const opakovani = e.recurring === 'monthly' ? (e.endDate ? `${t.monthlyUntil} ${e.endDate.slice(0, 10)}` : t.monthly) : t.once;
    radky.push([
      mesic,
      datum,
      SERVICES[e.service]?.label || String(e.service || ''),
      t.kinds[e.kind] || String(e.kind || ''),
      e.account || '',
      opakovani,
      e.note || '',
      round2(Number(e.amount) || 0),
      e.currency,
      Math.round(convert(1, e.currency, spend) * 1e4) / 1e4,
      round2(convert(e.amount, e.currency, spend)),
      zdrojZaznamu(e, t),
    ]);
  }
  return csv(radky);
}

// Peníze v upozornění musí vypadat stejně jako na obrazovce Útrata. Dřív tu stál kód měny
// („1 319 CZK“), zatímco rozhraní psalo „1 319 Kč“ – jedna a tatáž částka dvěma způsoby.
// Pravidla jsou schválně shodná s `fmtMoney` v public/js/format.js; test hlídá, že se
// obě strany nerozejdou.
const money = (v, currency) => {
  try {
    return new Intl.NumberFormat('cs-CZ', {
      style: 'currency',
      currency,
      maximumFractionDigits: currency === 'CZK' ? 0 : 2,
      // Celé částky bez haléřů („20 $“), necelé vždy na dvě místa („2,10 $“, ne „2,1 $“).
      minimumFractionDigits: currency === 'CZK' || Number.isInteger(Math.round((v || 0) * 100) / 100) ? 0 : 2,
    }).format(v || 0);
  } catch {
    return `${Math.round(v).toLocaleString('cs-CZ')} ${currency}`;
  }
};

export const castkaProUpozorneni = money;

// Upozornění na rozpočet: vždy jen nejvyšší překročený práh, nižší prahy se označí jako vyřízené.
export function budgetAlertCandidates(summary) {
  const out = [];
  for (const b of summary.budgets) {
    const hit = [100, 80].find((t) => b.pct >= t);
    if (!hit) continue;
    const keyFor = (t) => `budget:${summary.monthKey}:${b.scope}:${t}`;
    out.push({
      key: keyFor(hit),
      alsoKeys: hit === 100 ? [keyFor(80)] : [],
      level: hit === 100 ? 'critical' : 'warning',
      kind: 'budget',
      title: hit === 100 ? ui('Rozpočet překročen: {0}', b.label) : ui('Vyčerpáno {0} % rozpočtu: {1}', Math.round(b.pct), b.label),
      body: ui('Tento měsíc {0} z {1}.', money(b.spent, summary.currency), money(b.budget, summary.currency)),
    });
  }
  return out;
}
