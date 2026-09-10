import { run } from './util.js';

export const SECRET_IDS = {
  'openai-admin': { env: 'OPENAI_ADMIN_KEY', label: 'OpenAI Admin API klíč', pattern: /^sk-[\w-]{20,}$/ },
  'anthropic-admin': { env: 'ANTHROPIC_ADMIN_KEY', label: 'Anthropic Admin API klíč', pattern: /^sk-ant-[\w-]{20,}$/ },
};

// API klíče ukládáme do macOS Klíčenky (služba cz.dirigent.<id>). Proměnné prostředí mají přednost.
export function createSecrets({ keychain }) {
  const service = (id) => `cz.dirigent.${id}`;
  return {
    available: keychain,
    async get(id) {
      const def = SECRET_IDS[id];
      if (!def) return null;
      if (process.env[def.env]) return process.env[def.env];
      if (!keychain) return null;
      const r = await run('security', ['find-generic-password', '-a', 'dirigent', '-s', service(id), '-w']);
      return r.ok ? r.stdout.trim() || null : null;
    },
    async set(id, value) {
      const def = SECRET_IDS[id];
      if (!def) throw Object.assign(new Error('Neznámý klíč.'), { status: 400 });
      if (typeof value !== 'string' || !def.pattern.test(value.trim())) throw Object.assign(new Error(`${def.label} nemá očekávaný formát.`), { status: 400 });
      if (!keychain) throw Object.assign(new Error('Klíčenka macOS není dostupná. Použij proměnnou prostředí.'), { status: 400 });
      const r = await run('security', ['add-generic-password', '-a', 'dirigent', '-s', service(id), '-w', value.trim(), '-U']);
      if (!r.ok) throw Object.assign(new Error('Uložení do Klíčenky selhalo.'), { status: 500 });
    },
    async remove(id) {
      if (!SECRET_IDS[id] || !keychain) return;
      await run('security', ['delete-generic-password', '-a', 'dirigent', '-s', service(id)]);
    },
    source(id) {
      return process.env[SECRET_IDS[id]?.env] ? 'env' : 'keychain';
    },
  };
}
