import { run } from './util.js';
import { existsSync } from 'node:fs';
import path from 'node:path';

export const SECRET_IDS = {
  'openai-admin': { env: 'OPENAI_ADMIN_KEY', label: 'OpenAI Admin API klíč', pattern: /^sk-[\w-]{20,}$/ },
  'anthropic-admin': { env: 'ANTHROPIC_ADMIN_KEY', label: 'Anthropic Admin API klíč', pattern: /^sk-ant-[\w-]{20,}$/ },
};

// API klíče ukládáme do macOS Klíčenky (služba cz.agentree.<id>). Proměnné prostředí mají přednost.
export function createSecrets({ keychain }, { runImpl = run, helper = path.join(path.dirname(process.execPath), 'agentree-keychain') } = {}) {
  const service = (id) => `cz.agentree.${id}`;
  const native = existsSync(helper);
  return {
    available: keychain,
    async get(id) {
      const def = SECRET_IDS[id];
      if (!def) return null;
      if (process.env[def.env]) return process.env[def.env];
      if (!keychain) return null;
      const r = native ? await runImpl(helper, ['get', id]) : await runImpl('/usr/bin/security', ['find-generic-password', '-a', 'agentree', '-s', service(id), '-w']);
      return r.ok ? r.stdout.trim() || null : null;
    },
    async set(id, value) {
      const def = SECRET_IDS[id];
      if (!def) throw Object.assign(new Error('Neznámý klíč.'), { status: 400 });
      if (typeof value !== 'string' || value.length > 4096 || !def.pattern.test(value.trim())) throw Object.assign(new Error(`${def.label} nemá očekávaný formát.`), { status: 400 });
      if (!keychain) throw Object.assign(new Error('Klíčenka macOS není dostupná. Použij proměnnou prostředí.'), { status: 400 });
      if (!native) throw Object.assign(new Error('Pro bezpečné uložení klíče použij desktopovou aplikaci Agentree. V CLI lze použít proměnnou prostředí.'), { status: 400 });
      const r = await runImpl(helper, ['set', id], { input: value.trim(), timeout: 30000 });
      if (!r.ok) throw Object.assign(new Error('Uložení do Klíčenky selhalo.'), { status: 500 });
    },
    async remove(id) {
      if (!SECRET_IDS[id] || !keychain) return;
      const r = native ? await runImpl(helper, ['remove', id]) : await runImpl('/usr/bin/security', ['delete-generic-password', '-a', 'agentree', '-s', service(id)]);
      if (!r.ok && r.code !== 44 && r.code !== 2) throw Object.assign(new Error('Odstranění z Klíčenky selhalo.'), { status: 500 });
    },
    source(id) {
      return process.env[SECRET_IDS[id]?.env] ? 'env' : 'keychain';
    },
  };
}
