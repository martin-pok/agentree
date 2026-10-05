import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

const identity = (provider, value) => typeof value === 'string' && value.length >= 8
  ? `${provider}:${crypto.createHash('sha256').update(`${provider}:${value}`).digest('hex').slice(0, 16)}` : null;

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
  return input.filter((x) => x && /^(claude|codex):[0-9a-f]{16}$/.test(x.id)
    && ['anthropic', 'openai'].includes(x.provider) && Number.isFinite(Number(x.seenAt)))
    .slice(-24).map((x) => ({ id: x.id, provider: x.provider, service: x.provider === 'anthropic' ? 'claude' : 'chatgpt',
      plan: typeof x.plan === 'string' && /^[a-z0-9_]{1,64}$/.test(x.plan) ? x.plan : null, seenAt: Number(x.seenAt) }));
}

export function observeAccount(history, account) {
  if (!account?.id) return history;
  return normalizeObservedAccounts([...history.filter((x) => x.id !== account.id),
    { id: account.id, provider: account.provider, service: account.service, plan: account.plan, seenAt: account.observedAt }]);
}
