import fs from 'node:fs/promises';
import path from 'node:path';
import { writeFileAtomic } from './util.js';

// Claude Code hooky posílají události do Agentree okamžitě (start, zadání, žádost o povolení, konec tahu).
export const HOOK_EVENTS = ['SessionStart', 'UserPromptSubmit', 'Notification', 'Stop', 'SessionEnd'];
export const HOOK_PATH = '/api/hooks/claude-code';

export const claudeSettingsPath = (sourceHome) => path.join(sourceHome, '.claude', 'settings.json');

export function hookCommand(port, token) {
  if (!/^[a-f0-9]{32,}$/.test(token)) throw new Error('Neplatný token');
  return `curl -s -m 2 -X POST -H 'Content-Type: application/json' -H 'X-Agentree-Token: ${token}' --data-binary @- http://127.0.0.1:${Number(port)}${HOOK_PATH} >/dev/null 2>&1 || true`;
}

const isOurs = (h) => typeof h?.command === 'string' && h.command.includes(HOOK_PATH);

async function readSettings(file) {
  let raw = null;
  try {
    raw = await fs.readFile(file, 'utf8');
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  if (raw === null || !raw.trim()) return { raw, json: {} };
  try {
    const json = JSON.parse(raw);
    if (!json || typeof json !== 'object' || Array.isArray(json)) throw new Error('not object');
    return { raw, json };
  } catch {
    const err = new Error('Soubor ~/.claude/settings.json není platný JSON. Oprav ho a zkus to znovu.');
    err.code = 'INVALID_SETTINGS';
    throw err;
  }
}

export async function hooksStatus(file, token) {
  let json;
  try {
    ({ json } = await readSettings(file));
  } catch (err) {
    return { installed: false, partial: false, current: false, events: [], path: file, error: err.message };
  }
  const has = (ev, pred) => (Array.isArray(json.hooks?.[ev]) ? json.hooks[ev] : []).some((g) => (g?.hooks || []).some(pred));
  const events = HOOK_EVENTS.filter((ev) => has(ev, isOurs));
  const current = Boolean(token) && HOOK_EVENTS.every((ev) => has(ev, (h) => isOurs(h) && h.command.includes(token)));
  return {
    installed: events.length === HOOK_EVENTS.length,
    partial: events.length > 0 && events.length < HOOK_EVENTS.length,
    current,
    events,
    path: file,
  };
}

function stripOurs(json) {
  if (!json.hooks || typeof json.hooks !== 'object') return;
  for (const ev of Object.keys(json.hooks)) {
    if (!Array.isArray(json.hooks[ev])) continue;
    const kept = json.hooks[ev]
      .map((g) => (g && Array.isArray(g.hooks) ? { ...g, hooks: g.hooks.filter((h) => !isOurs(h)) } : g))
      .filter((g) => !g || !Array.isArray(g.hooks) || g.hooks.length > 0);
    if (kept.length) json.hooks[ev] = kept;
    else delete json.hooks[ev];
  }
  if (!Object.keys(json.hooks).length) delete json.hooks;
}

async function writeSettings(file, json, raw, now) {
  let backup = null;
  let mode = 0o644;
  if (raw !== null) {
    backup = `${file}.agentree-backup-${now}`;
    await fs.writeFile(backup, raw);
    try { mode = (await fs.stat(file)).mode & 0o777; } catch { /* výchozí práva */ }
  }
  await writeFileAtomic(file, `${JSON.stringify(json, null, 2)}\n`, mode);
  return backup;
}

export async function installHooks(file, { port, token, now = Date.now() }) {
  const { raw, json } = await readSettings(file);
  stripOurs(json);
  if (!json.hooks || typeof json.hooks !== 'object') json.hooks = {};
  const command = hookCommand(port, token);
  for (const ev of HOOK_EVENTS) {
    if (!Array.isArray(json.hooks[ev])) json.hooks[ev] = [];
    json.hooks[ev].push({ hooks: [{ type: 'command', command, timeout: 5 }] });
  }
  const backup = await writeSettings(file, json, raw, now);
  return { backup };
}

export async function uninstallHooks(file, { now = Date.now() } = {}) {
  const { raw, json } = await readSettings(file);
  if (raw === null) return { backup: null };
  stripOurs(json);
  const backup = await writeSettings(file, json, raw, now);
  return { backup };
}
