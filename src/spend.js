import { uid, round2 } from './util.js';

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
  other: { label: 'Ostatní', provider: 'other' },
};

export const KINDS = {
  subscription: 'Předplatné',
  extra: 'Extra usage',
  credits: 'Kredity',
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
  if (!service) errors.service = 'Vyber službu.';
  const kind = KINDS[input?.kind] ? input.kind : null;
  if (!kind) errors.kind = 'Vyber typ platby.';
  const amount = Number(String(input?.amount ?? '').replace(/\s/g, '').replace(',', '.'));
  if (!(amount > 0) || amount > 1e7) errors.amount = 'Zadej částku větší než 0.';
  const currency = CURRENCIES.includes(input?.currency) ? input.currency : null;
  if (!currency) errors.currency = 'Vyber měnu.';
  const date = typeof input?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.date) && Number.isFinite(Date.parse(input.date)) ? input.date : null;
  if (!date) errors.date = 'Zadej datum ve tvaru RRRR-MM-DD.';
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
      createdAt: now,
    },
  };
}

export function validateBudgets(input, current) {
  const errors = {};
  const next = structuredClone(current);
  if (input?.currency !== undefined) {
    if (CURRENCIES.includes(input.currency)) next.currency = input.currency;
    else errors.currency = 'Nepodporovaná měna.';
  }
  if (input?.rates !== undefined) {
    for (const c of ['USD', 'EUR']) {
      if (input.rates[c] === undefined) continue;
      const v = Number(String(input.rates[c]).replace(',', '.'));
      if (v > 0 && v < 1000) next.rates[c] = round2(v);
      else errors[`rates.${c}`] = 'Kurz musí být kladné číslo.';
    }
  }
  if (input?.total !== undefined) {
    const v = Number(String(input.total).replace(/\s/g, '').replace(',', '.'));
    if (v >= 0 && v < 1e8) next.budgets.total = round2(v);
    else errors.total = 'Rozpočet musí být 0 nebo kladné číslo.';
  }
  if (input?.services && typeof input.services === 'object') {
    for (const [svc, raw] of Object.entries(input.services)) {
      if (!SERVICES[svc]) continue;
      const v = Number(String(raw ?? '').replace(/\s/g, '').replace(',', '.'));
      if (raw === '' || raw === null || v === 0) delete next.budgets.services[svc];
      else if (v > 0 && v < 1e8) next.budgets.services[svc] = round2(v);
      else errors[`services.${svc}`] = 'Rozpočet musí být kladné číslo.';
    }
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value: next };
}

export function monthlyTotals(spend, months, autoEntries = []) {
  const rows = months.map((key) => ({ key, total: 0, services: {}, kinds: {} }));
  const index = new Map(months.map((k, i) => [k, i]));
  const add = (key, e) => {
    const i = index.get(key);
    if (i === undefined) return;
    const v = convert(e.amount, e.currency, spend);
    const row = rows[i];
    row.total += v;
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
    for (const k of Object.keys(row.services)) row.services[k] = round2(row.services[k]);
    for (const k of Object.keys(row.kinds)) row.kinds[k] = round2(row.kinds[k]);
  }
  return rows;
}

export function spendSummary(spend, now = Date.now(), autoEntries = []) {
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
  if (total > 0) budgets.push({ scope: 'total', label: 'Celkem', spent: month.total, budget: total, pct: round2((month.total / total) * 100) });
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
  };
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
      minimumFractionDigits: 0,
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
      title: hit === 100 ? `Rozpočet překročen: ${b.label}` : `Vyčerpáno ${Math.round(b.pct)} % rozpočtu: ${b.label}`,
      body: `Tento měsíc ${money(b.spent, summary.currency)} z ${money(b.budget, summary.currency)}.`,
    });
  }
  return out;
}
