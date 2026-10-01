import fsp from 'node:fs/promises';
import path from 'node:path';
import { ui } from './texty.js';

// Předplatné se zjišťuje z toho, co nástroje samy zapisují na tomto Macu. Z účtu Claude
// se čte jen typ organizace a úroveň limitů (ne e-mail, jméno ani token). Názvy plánů jsou
// pouze překlad přesných kódů poskytovatele. Cena se nikdy neodvozuje z veřejného ceníku:
// skutečná platba může mít jinou měnu, DPH, roční období nebo pocházet z App Storu.
export const CLAUDE_PLAN_LABELS = {
  free: 'Claude Free',
  pro: 'Claude Pro',
  max5x: 'Claude Max 5×',
  max20x: 'Claude Max 20×',
  max: 'Claude Max',
  team: 'Claude Team',
  enterprise: 'Claude Enterprise',
};

export const CHATGPT_PLAN_LABELS = {
  free: 'ChatGPT Free',
  go: 'ChatGPT Go',
  plus: 'ChatGPT Plus',
  pro: 'ChatGPT Pro',
  team: 'ChatGPT Business',
  business: 'ChatGPT Business',
  enterprise: 'ChatGPT Enterprise',
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
    evidence: tier && tier !== 'default_claude_ai'
      ? ui('přihlášený účet Claude Code (typ účtu {0}, úroveň {1})', org || ui('neuveden'), tier)
      : ui('přihlášený účet Claude Code (typ účtu {0})', org || ui('neuveden')),
    extraUsage: acc.hasExtraUsageEnabled === true,
  };
}

export function chatgptPlanFromLimits(limits) {
  const codex = (limits || []).filter((l) => l.provider === 'openai' && typeof l.plan === 'string' && l.plan);
  if (!codex.length) return null;
  const newest = codex.sort((a, b) => (b.at || 0) - (a.at || 0))[0];
  const plan = newest.plan.toLowerCase();
  return {
    service: 'chatgpt',
    plan,
    since: null,
    observedAt: Number.isFinite(Number(newest.at)) ? Number(newest.at) : null,
    evidence: ui('limity Codexu (plán „{0}“)', newest.plan),
    extraUsage: false,
  };
}

export async function readClaudeAccount(sourceHome, { read = fsp.readFile } = {}) {
  try {
    const raw = await read(path.join(sourceHome, '.claude.json'), 'utf8');
    return JSON.parse(raw)?.oauthAccount || null;
  } catch {
    return null; // není přihlášený Claude Code nebo soubor nejde přečíst
  }
}

function aktivniPlatba(ledger, service, month) {
  return (ledger || [])
    .filter((e) => e.service === service && e.kind === 'subscription' && e.recurring === 'monthly'
      && String(e.date).slice(0, 7) <= month && (!e.endDate || String(e.endDate).slice(0, 7) >= month))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0] || null;
}

// Jedno předplatné pro UI. Identita plánu je fakt od poskytovatele; částka je jen přesný
// uživatelský záznam. Tyto dvě úrovně se nesmějí sloučit do domnělé „zjištěné ceny“.
export function describePlan(found, ledger = [], now = Date.now()) {
  const table = found.service === 'claude' ? CLAUDE_PLAN_LABELS : CHATGPT_PLAN_LABELS;
  const label = table[found.plan] || `${found.service === 'claude' ? 'Claude' : 'ChatGPT'} (${found.plan})`;
  const month = ymd(now).slice(0, 7);
  const payment = aktivniPlatba(ledger, found.service, month);
  return {
    service: found.service,
    plan: found.plan,
    label,
    free: found.plan === 'free',
    since: found.since,
    observedAt: found.observedAt || null,
    evidence: found.evidence,
    payment: payment ? {
      id: payment.id,
      amount: payment.amount,
      currency: payment.currency,
      date: payment.date,
      recurring: payment.recurring,
    } : null,
  };
}
