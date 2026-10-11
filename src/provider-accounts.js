import crypto from 'node:crypto';
import path from 'node:path';
import { spawn } from 'node:child_process';

// Univerzální pseudonymní identita účtu bez tokenu/e-mailu; namespace patří poskytovateli,
// nikoli aplikaci (Codex, Claude Code, mobil atd.). Staré claude:/codex: klíče zůstávají
// čitelné pro migraci. Neznámý účet se nesmí přiřadit automaticky.
export const PROVIDER_ID = /^[a-z][a-z0-9-]{1,39}$/;
export const ACCOUNT_ID = /^([a-z][a-z0-9-]{1,39}):([0-9a-f]{16})$/;
const identity = (provider, value) => PROVIDER_ID.test(provider) && typeof value === 'string' && value.length >= 8
  ? `${provider}:${crypto.createHash('sha256').update(`${provider}:${value}`).digest('hex').slice(0, 16)}` : null;
export function providerIdentity(provider, stableExternalId) {
  return identity(provider, stableExternalId);
}
export function validAccountId(id) {
  return typeof id === 'string' && ACCOUNT_ID.test(id);
}
// Jedno místo pro vazbu session→licence, platné pro všechny providery.
// Verified vyžaduje důkaz identity ze stejného běhu/profilu. Uživatelské označení
// je viditelné odděleně a NESMÍ se používat pro odečet kvót.
export function sessionAccountBinding({ sessionId, accountId, provider, source, observedAt, verified = false } = {}) {
  if (typeof sessionId !== 'string' || !/^[a-z0-9-]+:[^\s]{1,200}$/i.test(sessionId)) return null;
  if (!validAccountId(accountId) || !PROVIDER_ID.test(provider) || accountId.split(':')[0] !== (provider === 'anthropic' ? 'claude' : provider === 'openai' ? 'codex' : provider)) {
    return { sessionId, accountId: null, confidence: 'unresolved', source: null, observedAt: null };
  }
  if (!verified || typeof source !== 'string' || !source.trim() || !Number.isSafeInteger(observedAt) || observedAt <= 0) {
    return { sessionId, accountId: null, confidence: 'unresolved', source: null, observedAt: null };
  }
  return { sessionId, accountId, confidence: 'verified', source: source.slice(0, 80), observedAt };
}

// Only an authenticated account associated with the exact transcript root may be used.
// A prefix such as /profiles/one must not match /profiles/one-evil.
export function verifiedProfileForTranscript(file, profiles = []) {
  if (typeof file !== 'string' || !path.isAbsolute(file)) return null;
  const normalized = path.resolve(file);
  const matches = profiles.filter((profile) => validAccountId(profile?.accountId)
    && typeof profile?.root === 'string' && path.isAbsolute(profile.root)
    && normalized.startsWith(path.resolve(profile.root) + path.sep)
    && Number.isSafeInteger(profile.observedAt) && profile.observedAt > 0);
  return matches.length === 1 ? matches[0] : null;
}

export function groupAccountsByProvider(accounts) {
  const groups = new Map();
  for (const account of accounts || []) {
    if (!validAccountId(account?.id) || !PROVIDER_ID.test(account.provider)) continue;
    // Klíč účtu musí patřit deklarovanému poskytovateli (legacy Codex = openai).
    if (account.id.split(':')[0] !== (account.provider === 'openai' ? 'codex' : account.provider === 'anthropic' ? 'claude' : account.provider)) continue;
    const group = groups.get(account.provider) || [];
    if (!group.some((item) => item.id === account.id)) group.push(account);
    groups.set(account.provider, group);
  }
  return groups;
}

export function claudeIdentity(account) {
  return identity('claude', account?.accountUuid);
}

const windowOf = (value, observedAt) => {
  if (!value || !Number.isFinite(value.usedPercent) || value.usedPercent < 0 || value.usedPercent > 100) return null;
  const reset = Number(value.resetsAt);
  return { usedPercent: value.usedPercent, windowMinutes: Number(value.windowDurationMins) || null,
    resetsAt: Number.isFinite(reset) && reset * 1000 > observedAt && reset * 1000 < observedAt + 366 * 86400_000 ? reset * 1000 : null };
};

// Jediný zdroj, který dodává identitu účtu a limity v jednom odečtu. Žádný token se nečte,
// neukládá ani nepředává do UI. Neúplný výsledek znamená neznámý účet, ne nulu.
export function normalizeCodexAccount(limitsResult, observedAt = Date.now()) {
  const id = identity('codex', limitsResult?.accountId);
  if (!id) return null;
  const buckets = Object.entries(limitsResult.rateLimitsByLimitId || {}).slice(0, 12)
    .map(([key, item]) => ({ key, label: typeof item?.limitName === 'string' ? item.limitName.slice(0, 80) : key,
      primary: windowOf(item?.primary, observedAt), secondary: windowOf(item?.secondary, observedAt) }))
    .filter((item) => item.primary || item.secondary);
  const balance = limitsResult.rateLimits?.credits?.balance;
  const credits = typeof balance === 'string' && /^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/.test(balance) ? Number(balance) : null;
  const planType = limitsResult.rateLimits?.planType;
  return { id, provider: 'openai', service: 'chatgpt', plan: typeof planType === 'string' && /^[a-z0-9_]{1,64}$/.test(planType) ? planType : null,
    observedAt, limits: buckets, credits: Number.isFinite(credits) ? credits : null };
}

export function readCodexAccount(bin, { home, timeoutMs = 8000, spawnFn = spawn } = {}) {
  if (!bin) return Promise.resolve(null);
  return new Promise((resolve) => {
    let child;
    try {
      child = spawnFn(bin, ['app-server', '--stdio'], { stdio: ['pipe', 'pipe', 'ignore'],
        env: home ? { ...process.env, CODEX_HOME: home } : process.env });
    } catch { resolve(null); return; }
    let done = false;
    let buffer = '';
    const finish = (value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      child.kill();
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    child.on('error', () => finish(null));
    child.on('exit', () => finish(null));
    child.stdin.on('error', () => finish(null));
    child.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      if (buffer.length > 1_000_000) return finish(null);
      let index;
      while ((index = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 1);
        let message;
        try { message = JSON.parse(line); } catch { continue; }
        if (message.id === 1 && message.result) {
          child.stdin.write(`${JSON.stringify({ method: 'initialized' })}\n`);
          child.stdin.write(`${JSON.stringify({ id: 3, method: 'account/rateLimits/read', params: {} })}\n`);
        }
        if (message.id === 3) return finish(normalizeCodexAccount(message.result));
      }
    });
    child.stdin.write(`${JSON.stringify({ id: 1, method: 'initialize', params: { clientInfo: { name: 'agenteeq', title: 'Agenteeq', version: '0.1.0' } } })}\n`);
  });
}

export function normalizeObservedAccounts(input) {
  if (!Array.isArray(input)) return [];
  return input.filter((x) => x && validAccountId(x.id) && PROVIDER_ID.test(x.provider)
    && x.id.split(':')[0] === (x.provider === 'anthropic' ? 'claude' : x.provider === 'openai' ? 'codex' : x.provider)
    && Number.isSafeInteger(Number(x.seenAt)) && Number(x.seenAt) > 0)
    .slice(-96).map((x) => ({ id: x.id, provider: x.provider,
      service: x.provider === 'anthropic' ? 'claude' : x.provider === 'openai' ? 'chatgpt' : x.provider,
      plan: typeof x.plan === 'string' && /^[a-z0-9_]{1,64}$/.test(x.plan) ? x.plan : null, seenAt: Number(x.seenAt) }));
}

export function observeAccount(history, account) {
  if (!account?.id) return history;
  return normalizeObservedAccounts([...history.filter((x) => x.id !== account.id),
    { id: account.id, provider: account.provider, service: account.service, plan: account.plan, seenAt: account.observedAt }]);
}
