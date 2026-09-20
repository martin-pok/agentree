import fsp from 'node:fs/promises';
import path from 'node:path';

// Předplatné se zjišťuje z toho, co nástroje samy zapisují na tomhle Macu – nic se nikam neposílá
// a neukládá se nic osobního. Z účtu Claude se čte jen typ organizace a úroveň limitů (ne e-mail, jméno
// ani token). Ceny jsou ceníková částka BEZ DPH; skutečně zaplacenou částku si uživatel může upravit.

const CHECKED = '2026-09-20';
const CLAUDE_SRC = 'claude.com/pricing';
const PUBLIC_SRC = 'veřejné přehledy cen (oficiální stránka nebyla dostupná)';

export const CLAUDE_PLANS = {
  free: { label: 'Claude Free', usd: 0 },
  pro: { label: 'Claude Pro', usd: 20, source: CLAUDE_SRC, checked: CHECKED },
  max5x: { label: 'Claude Max 5×', usd: 100, source: CLAUDE_SRC, checked: CHECKED },
  max20x: { label: 'Claude Max 20×', usd: 200, source: PUBLIC_SRC, checked: CHECKED },
  max: { label: 'Claude Max', options: [100, 200], source: CLAUDE_SRC, checked: CHECKED },
  team: { label: 'Claude Team', usd: null, note: 'Cena závisí na počtu a typu míst.' },
  enterprise: { label: 'Claude Enterprise', usd: null, note: 'Cena je individuální.' },
};

export const CHATGPT_PLANS = {
  free: { label: 'ChatGPT Free', usd: 0 },
  go: { label: 'ChatGPT Go', usd: 8, source: PUBLIC_SRC, checked: CHECKED },
  plus: { label: 'ChatGPT Plus', usd: 20, source: PUBLIC_SRC, checked: CHECKED },
  pro: { label: 'ChatGPT Pro', options: [100, 200], source: PUBLIC_SRC, checked: CHECKED, note: 'ChatGPT Pro má dvě cenové úrovně a z dat na disku se nedají rozlišit.' },
  team: { label: 'ChatGPT Business', usd: null, note: 'Cena závisí na počtu míst.' },
  business: { label: 'ChatGPT Business', usd: null, note: 'Cena závisí na počtu míst.' },
  enterprise: { label: 'ChatGPT Enterprise', usd: null, note: 'Cena je individuální.' },
};

const ymd = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Vstup je objekt `oauthAccount` ze ~/.claude.json. Vrací jen nezbytné, nic osobního.
export function claudePlanFromAccount(acc, now = Date.now()) {
  if (!acc || typeof acc !== 'object') return null;
  const org = String(acc.organizationType || '');
  const tier = String(acc.userRateLimitTier || acc.organizationRateLimitTier || '');
  let plan = null;
  if (org === 'claude_max' || /max/i.test(tier)) plan = /max_5x/i.test(tier) ? 'max5x' : /max_20x/i.test(tier) ? 'max20x' : 'max';
  else if (org === 'claude_pro') plan = 'pro';
  else if (org === 'claude_team') plan = 'team';
  else if (org === 'claude_enterprise') plan = 'enterprise';
  else if (org === 'claude_free' || org === 'free') plan = 'free';
  if (!plan) return null;
  const created = Date.parse(acc.subscriptionCreatedAt);
  return {
    service: 'claude',
    plan,
    since: Number.isFinite(created) && created <= now ? ymd(created) : null,
    evidence: `přihlášený účet Claude Code (typ účtu ${org || 'neuveden'}${tier && tier !== 'default_claude_ai' ? `, úroveň ${tier}` : ''})`,
    extraUsage: acc.hasExtraUsageEnabled === true,
  };
}

export function chatgptPlanFromLimits(limits) {
  const codex = (limits || []).filter((l) => l.provider === 'openai' && typeof l.plan === 'string' && l.plan);
  if (!codex.length) return null;
  const newest = codex.sort((a, b) => (b.at || 0) - (a.at || 0))[0];
  const plan = newest.plan.toLowerCase();
  return { service: 'chatgpt', plan, since: null, evidence: `limity Codexu (plán „${newest.plan}“)`, extraUsage: false };
}

export async function readClaudeAccount(sourceHome, { read = fsp.readFile } = {}) {
  try {
    const raw = await read(path.join(sourceHome, '.claude.json'), 'utf8');
    return JSON.parse(raw)?.oauthAccount || null;
  } catch {
    return null; // není přihlášený Claude Code nebo soubor nejde přečíst
  }
}

// Jedno předplatné pro UI. `usd` je ceníková částka, `options` znamená „nelze rozlišit, vyber“.
export function describePlan(found, ledger = [], now = Date.now()) {
  const table = found.service === 'claude' ? CLAUDE_PLANS : CHATGPT_PLANS;
  const def = table[found.plan] || { label: `${found.service === 'claude' ? 'Claude' : 'ChatGPT'} (${found.plan})`, usd: null, note: 'Cenu tohoto plánu neznám.' };
  const month = ymd(now).slice(0, 7);
  const covered = ledger.some((e) => e.service === found.service && e.kind === 'subscription' && e.recurring === 'monthly'
    && String(e.date).slice(0, 7) <= month && (!e.endDate || String(e.endDate).slice(0, 7) >= month));
  return {
    service: found.service,
    plan: found.plan,
    label: def.label,
    usd: typeof def.usd === 'number' ? def.usd : null,
    options: def.options || null,
    note: def.note || '',
    priceSource: def.source || '',
    priceChecked: def.checked || '',
    since: found.since,
    evidence: found.evidence,
    covered,
    counted: !covered && typeof def.usd === 'number' && def.usd > 0,
  };
}

// Položky pro souhrn útraty: jen tam, kde je cena jednoznačná a uživatel ji nezapsal sám.
export function subscriptionEntries(plans, now = Date.now()) {
  const first = `${ymd(now).slice(0, 7)}-01`;
  return plans
    .filter((p) => p.counted)
    .map((p) => ({ id: `auto:sub:${p.service}`, service: p.service, kind: 'subscription', amount: p.usd, currency: 'USD', date: p.since || first, recurring: 'monthly', endDate: null, note: `${p.label} podle ceníku`, auto: true }));
}
