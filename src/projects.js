import fs from 'node:fs';
import path from 'node:path';
import { uid, hourKey, DAY } from './util.js';
import { isSafeRef } from './git.js';

// Projekty: skupiny konverzací napříč službami. Přiřazení je ruční (session → projekt) nebo automatické podle složky.

export const PROJECT_COLORS = ['#C2335A', '#22A38C', '#C99A3E', '#4285F4', '#8250DF', '#D97757', '#1F8A96', '#16141D'];
export const LIMITS = { name: 60, description: 280, notes: 20000, folders: 10, assign: 1000, instructions: 4000 };
export const SNAPSHOT_MAX = 3000;
// Abstraktní pozadí karet (CSS v public/styles.css, třída .cover--<preset>).
export const COVER_PRESETS = ['aurora', 'dune', 'noir', 'lagoon', 'ember', 'orchid', 'graphite', 'sage'];
export const NOTIFY_MODES = ['all', 'decisions', 'mute'];
export const TEAM_AGENTS = ['claude-code', 'codex', 'gemini-cli', 'qwen-code'];
export const MEDIA_FILE = /^(cover|logo)-\d{10,16}\.(png|jpg|webp)$/;
export const DEFAULT_PROJECT_SETTINGS = {
  repo: '',              // složka Git repozitáře, na kterém agenti pracují
  baseBranch: '',        // výchozí větev (prázdné = aktuální větev repozitáře)
  isolate: true,         // každý agent ve vlastní větvi a pracovní kopii
  agents: ['claude-code'],
  mode: 'background',
  permission: 'plan',
  sandbox: 'read-only',
  instructions: '',      // pravidla připojená ke každému zadání z projektu
  attachBrief: true,
  notify: 'all',
  tokenBudget: 0,        // měsíční rozpočet tokenů (0 = bez rozpočtu)
};

const bool = (v, d) => (typeof v === 'boolean' ? v : d);

export function normalizeSettings(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const d = DEFAULT_PROJECT_SETTINGS;
  const agents = Array.isArray(r.agents) ? [...new Set(r.agents.filter((a) => TEAM_AGENTS.includes(a)))].slice(0, 4) : d.agents;
  return {
    repo: typeof r.repo === 'string' && path.isAbsolute(r.repo) ? r.repo : '',
    baseBranch: isSafeRef(r.baseBranch) ? r.baseBranch : '',
    isolate: bool(r.isolate, d.isolate),
    agents: agents.length ? agents : d.agents,
    mode: ['terminal', 'background'].includes(r.mode) ? r.mode : d.mode,
    permission: ['plan', 'acceptEdits'].includes(r.permission) ? r.permission : d.permission,
    sandbox: ['read-only', 'workspace-write'].includes(r.sandbox) ? r.sandbox : d.sandbox,
    instructions: typeof r.instructions === 'string' ? r.instructions.slice(0, LIMITS.instructions) : '',
    attachBrief: bool(r.attachBrief, d.attachBrief),
    notify: NOTIFY_MODES.includes(r.notify) ? r.notify : d.notify,
    tokenBudget: Number.isInteger(r.tokenBudget) && r.tokenBudget >= 0 && r.tokenBudget <= 1e11 ? r.tokenBudget : 0,
  };
}

const normalizeCover = (c, i) => (c && MEDIA_FILE.test(c.file || '') && c.file.startsWith('cover-') ? { file: c.file } : { preset: COVER_PRESETS.includes(c?.preset) ? c.preset : COVER_PRESETS[i % COVER_PRESETS.length] });
const normalizeLogo = (l) => (l && MEDIA_FILE.test(l.file || '') && l.file.startsWith('logo-') ? { file: l.file } : null);

// Pracovní větve agentů spuštěných z projektu (worktree).
export function normalizeWork(list) {
  return (Array.isArray(list) ? list : [])
    .filter((w) => w && typeof w.id === 'string' && isSafeRef(w.branch) && isSafeRef(w.base) && typeof w.path === 'string' && path.isAbsolute(w.path))
    .map((w) => ({
      id: w.id,
      agent: TEAM_AGENTS.includes(w.agent) ? w.agent : 'claude-code',
      label: typeof w.label === 'string' ? w.label.slice(0, 40) : '',
      branch: w.branch,
      base: w.base,
      path: w.path,
      runId: typeof w.runId === 'string' ? w.runId : null,
      sessionId: typeof w.sessionId === 'string' ? w.sessionId.slice(0, 200) : null,
      prompt: typeof w.prompt === 'string' ? w.prompt.slice(0, 240) : '',
      status: ['active', 'accepted', 'discarded'].includes(w.status) ? w.status : 'active',
      createdAt: Number(w.createdAt) || Date.now(),
      closedAt: Number(w.closedAt) || null,
    }))
    .slice(-60);
}
// Prázdný řetězec v přiřazení = konverzace je záměrně mimo projekty (přebije automatické pravidlo složky).
export const NO_PROJECT = '';

const STATUS_CS = { needs_input: 'Potřebuje rozhodnutí', limited: 'Vyčerpaný limit', working: 'Pracuje', waiting: 'Čeká na zadání', idle: 'Nečinná', archived: 'Archiv' };
const str = (v, n = 500) => (typeof v === 'string' ? v.slice(0, n) : '');

// Snímek konverzace v projektu: zůstane v projektu i po vypadnutí z okna sledování (výchozí 30 dní).
export function snapshotOf(s) {
  return {
    id: str(s.id, 200),
    projectId: typeof s.projectId === 'string' ? s.projectId : null,
    title: str(s.title, 120),
    app: str(s.app, 80),
    provider: str(s.provider, 40),
    connector: str(s.connector, 40),
    source: str(s.source, 20),
    model: str(s.model, 80),
    cwd: str(s.cwd),
    url: str(s.url),
    resume: str(s.resume, 600),
    startedAt: Number(s.startedAt) || 0,
    lastAt: Number(s.lastAt) || 0,
    turns: Number(s.turns) || 0,
    tokens: { input: Number(s.tokens?.input) || 0, output: Number(s.tokens?.output) || 0, cacheWrite: Number(s.tokens?.cacheWrite) || 0 },
  };
}

export function normalizeProjects(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const now = Date.now();
  const items = (Array.isArray(r.items) ? r.items : [])
    .filter((p) => p && typeof p.id === 'string' && /^[\w-]{1,64}$/.test(p.id) && typeof p.name === 'string' && p.name.trim())
    .map((p, i) => ({
      cover: normalizeCover(p.cover, i),
      logo: normalizeLogo(p.logo),
      settings: normalizeSettings(p.settings),
      work: normalizeWork(p.work),
      id: p.id,
      name: p.name.replace(/\s+/g, ' ').trim().slice(0, LIMITS.name),
      color: PROJECT_COLORS.includes(p.color) ? p.color : PROJECT_COLORS[0],
      description: typeof p.description === 'string' ? p.description.slice(0, LIMITS.description) : '',
      notes: typeof p.notes === 'string' ? p.notes.slice(0, LIMITS.notes) : '',
      folders: Array.isArray(p.folders) ? p.folders.filter((f) => typeof f === 'string' && path.isAbsolute(f)).slice(0, LIMITS.folders) : [],
      archived: p.archived === true,
      createdAt: Number(p.createdAt) || now,
      updatedAt: Number(p.updatedAt) || now,
    }));
  const ids = new Set(items.map((p) => p.id));
  const assignments = {};
  const src = r.assignments && typeof r.assignments === 'object' ? r.assignments : {};
  for (const [sid, pid] of Object.entries(src)) {
    if (typeof pid === 'string' && (pid === NO_PROJECT || ids.has(pid))) assignments[sid] = pid;
  }
  const snaps = r.snapshots && typeof r.snapshots === 'object' ? Object.entries(r.snapshots) : [];
  const snapshots = {};
  snaps
    .filter(([sid, s]) => s && typeof s === 'object' && ids.has(s.projectId) && assignments[sid] !== NO_PROJECT && typeof s.title === 'string')
    .sort((a, b) => (Number(b[1].lastAt) || 0) - (Number(a[1].lastAt) || 0))
    .slice(0, SNAPSHOT_MAX)
    .forEach(([sid, s]) => { snapshots[sid] = snapshotOf({ ...s, id: sid }); });
  return { items, assignments, snapshots };
}

export const projectsPayload = (data) => ({ items: data.items, assignments: data.assignments, snapshots: data.snapshots, colors: PROJECT_COLORS, limits: LIMITS });

function nextColor(items) {
  const used = new Set(items.filter((p) => !p.archived).map((p) => p.color));
  return PROJECT_COLORS.find((c) => !used.has(c)) || PROJECT_COLORS[items.length % PROJECT_COLORS.length];
}

export function validateProject(input, items, { id = null, now = Date.now() } = {}) {
  const errors = {};
  const body = input && typeof input === 'object' ? input : {};
  const current = id ? items.find((p) => p.id === id) : null;
  if (id && !current) return { ok: false, status: 404, errors: {}, error: 'Projekt neexistuje.' };
  const next = current
    ? { ...current, folders: [...current.folders], settings: { ...current.settings } }
    : {
      id: uid(), name: '', color: nextColor(items), description: '', notes: '', folders: [], archived: false, createdAt: now, updatedAt: now,
      cover: { preset: COVER_PRESETS[items.length % COVER_PRESETS.length] }, logo: null, settings: { ...DEFAULT_PROJECT_SETTINGS }, work: [],
    };
  if (body.cover !== undefined) {
    if (body.cover && COVER_PRESETS.includes(body.cover.preset)) next.cover = { preset: body.cover.preset };
    else errors.cover = 'Vyber pozadí z nabídky.';
  }
  if (body.settings !== undefined) {
    const r = validateSettings(body.settings, next.settings);
    Object.assign(errors, r.errors);
    next.settings = r.value;
  }

  if (!current || body.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.replace(/\s+/g, ' ').trim() : '';
    if (!name) errors.name = 'Zadej název projektu.';
    else if (name.length > LIMITS.name) errors.name = `Název může mít nejvýš ${LIMITS.name} znaků.`;
    else if (items.some((p) => p.id !== next.id && p.name.toLowerCase() === name.toLowerCase())) errors.name = 'Projekt s tímto názvem už máš.';
    else next.name = name;
  }
  if (body.color !== undefined) {
    if (PROJECT_COLORS.includes(body.color)) next.color = body.color;
    else errors.color = 'Vyber barvu z nabídky.';
  }
  if (body.description !== undefined) {
    if (typeof body.description !== 'string' || body.description.length > LIMITS.description) errors.description = `Popis může mít nejvýš ${LIMITS.description} znaků.`;
    else next.description = body.description.trim();
  }
  if (body.notes !== undefined) {
    if (typeof body.notes !== 'string' || body.notes.length > LIMITS.notes) errors.notes = 'Poznámky jsou příliš dlouhé.';
    else next.notes = body.notes;
  }
  if (body.folders !== undefined) {
    if (!Array.isArray(body.folders)) errors.folders = 'Neplatný seznam složek.';
    else {
      const folders = [];
      for (const raw of body.folders) {
        const f = typeof raw === 'string' ? raw.trim() : '';
        if (!f) continue;
        if (!path.isAbsolute(f) || /[\n\r\0]/.test(f)) { errors.folders = `Cesta musí začínat lomítkem: ${f}`; break; }
        let st = null;
        try { st = fs.statSync(f); } catch { /* neexistuje */ }
        if (!st?.isDirectory()) { errors.folders = `Složka neexistuje: ${f}`; break; }
        const resolved = path.resolve(f);
        if (!folders.includes(resolved)) folders.push(resolved);
      }
      if (!errors.folders && folders.length > LIMITS.folders) errors.folders = `Projekt může mít nejvýš ${LIMITS.folders} složek.`;
      if (!errors.folders) next.folders = folders;
    }
  }
  if (body.archived !== undefined) {
    if (typeof body.archived !== 'boolean') errors.archived = 'Neplatná hodnota.';
    else next.archived = body.archived;
  }
  if (Object.keys(errors).length) return { ok: false, status: 422, errors, error: 'Zkontroluj zvýrazněná pole.' };
  next.updatedAt = now;
  return { ok: true, value: next };
}

export function validateSettings(input, current = DEFAULT_PROJECT_SETTINGS) {
  const b = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const v = { ...current };
  const errors = {};
  if (b.repo !== undefined) {
    const repo = typeof b.repo === 'string' ? b.repo.trim() : null;
    if (repo === '') v.repo = '';
    else if (!repo || !path.isAbsolute(repo) || /[\n\r\0]/.test(repo)) errors['settings.repo'] = 'Cesta k repozitáři musí začínat lomítkem.';
    else {
      let st = null;
      try { st = fs.statSync(repo); } catch { /* neexistuje */ }
      if (!st?.isDirectory()) errors['settings.repo'] = 'Složka repozitáře neexistuje.';
      else v.repo = path.resolve(repo);
    }
  }
  if (b.baseBranch !== undefined) {
    if (b.baseBranch === '') v.baseBranch = '';
    else if (isSafeRef(b.baseBranch)) v.baseBranch = b.baseBranch;
    else errors['settings.baseBranch'] = 'Neplatný název větve.';
  }
  for (const k of ['isolate', 'attachBrief']) {
    if (b[k] === undefined) continue;
    if (typeof b[k] === 'boolean') v[k] = b[k];
    else errors[`settings.${k}`] = 'Neplatná hodnota.';
  }
  if (b.agents !== undefined) {
    const list = Array.isArray(b.agents) ? [...new Set(b.agents)] : null;
    if (!list || !list.length || list.length > 4 || list.some((a) => !TEAM_AGENTS.includes(a))) errors['settings.agents'] = 'Vyber 1 až 4 agenty.';
    else v.agents = list;
  }
  const oneOf = (k, allowed, msg) => {
    if (b[k] === undefined) return;
    if (allowed.includes(b[k])) v[k] = b[k];
    else errors[`settings.${k}`] = msg;
  };
  oneOf('mode', ['terminal', 'background'], 'Neplatný režim spuštění.');
  oneOf('permission', ['plan', 'acceptEdits'], 'Neplatné oprávnění.');
  oneOf('sandbox', ['read-only', 'workspace-write'], 'Neplatný sandbox.');
  oneOf('notify', NOTIFY_MODES, 'Neplatné nastavení upozornění.');
  if (b.instructions !== undefined) {
    if (typeof b.instructions !== 'string' || b.instructions.length > LIMITS.instructions) errors['settings.instructions'] = `Pravidla mohou mít nejvýš ${LIMITS.instructions} znaků.`;
    else v.instructions = b.instructions;
  }
  if (b.tokenBudget !== undefined) {
    const n = Number(b.tokenBudget);
    if (!Number.isInteger(n) || n < 0 || n > 1e11) errors['settings.tokenBudget'] = 'Rozpočet musí být celé nezáporné číslo.';
    else v.tokenBudget = n;
  }
  return { value: v, errors };
}

export function resolveProject(summary, { items, assignments }, { worktreeRoot = '' } = {}) {
  const manual = assignments[summary.id];
  if (manual !== undefined) return manual === NO_PROJECT ? { projectId: null, projectSource: 'none' } : { projectId: manual, projectSource: 'manual' };
  const cwd = typeof summary.cwd === 'string' ? summary.cwd : '';
  if (cwd) {
    // Pracovní kopie agentů spuštěných z projektu leží v <worktreeRoot>/<id projektu>/…
    if (worktreeRoot && cwd.startsWith(worktreeRoot + path.sep)) {
      const pid = cwd.slice(worktreeRoot.length + 1).split(path.sep)[0];
      if (items.some((p) => p.id === pid)) return { projectId: pid, projectSource: 'folder' };
    }
    let best = null;
    for (const p of items) {
      const folders = p.settings?.repo ? [...p.folders, p.settings.repo] : p.folders;
      for (const f of folders) {
        const inside = cwd === f || cwd.startsWith(f.endsWith(path.sep) ? f : f + path.sep);
        if (inside && (!best || f.length > best.len)) best = { id: p.id, len: f.length };
      }
    }
    if (best) return { projectId: best.id, projectSource: 'folder' };
  }
  return { projectId: null, projectSource: null };
}

// projectId: id projektu = ručně do projektu, NO_PROJECT = záměrně mimo projekty, null = zpět na automatické pravidlo složky.
export function assignSessions(data, sessionIds, projectId, summaryOf = () => null) {
  if (!Array.isArray(sessionIds) || !sessionIds.length || sessionIds.length > LIMITS.assign || sessionIds.some((s) => typeof s !== 'string' || !s || s.length > 200)) {
    return { ok: false, error: 'Neplatný výběr konverzací.' };
  }
  if (projectId !== null && projectId !== NO_PROJECT && !data.items.some((p) => p.id === projectId)) return { ok: false, error: 'Projekt neexistuje.' };
  const unique = [...new Set(sessionIds)];
  for (const sid of unique) {
    if (projectId === null) delete data.assignments[sid];
    else data.assignments[sid] = projectId;
    const snap = data.snapshots[sid];
    const live = summaryOf(sid);
    const base = live || snap;
    const effective = base ? resolveProject({ ...base, id: sid }, data).projectId : null;
    if (base && effective) data.snapshots[sid] = snapshotOf({ ...base, id: sid, projectId: effective });
    else delete data.snapshots[sid];
  }
  return { ok: true, count: unique.length };
}

export function deleteProject(data, id) {
  const i = data.items.findIndex((p) => p.id === id);
  if (i === -1) return false;
  data.items.splice(i, 1);
  for (const [sid, pid] of Object.entries(data.assignments)) if (pid === id) delete data.assignments[sid];
  for (const [sid, snap] of Object.entries(data.snapshots)) {
    const next = resolveProject(snap, data).projectId;
    if (next) snap.projectId = next;
    else delete data.snapshots[sid];
  }
  return true;
}

// CSV pro Excel/Numbers: středník, UTF-8 BOM, ochrana proti vzorcům (=, +, -, @).
function cell(v) {
  if (typeof v === 'number') return String(v);
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const localStamp = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export function projectCsv(sessions, now = Date.now()) {
  const since = hourKey(now - 30 * DAY);
  const rows = [['Konverzace', 'Aplikace', 'Model', 'Stav', 'Zahájeno', 'Poslední aktivita', 'Počet zadání', 'Tokeny', 'Hodiny s aktivitou (30 dní)', 'Složka', 'Odkaz']];
  for (const s of sessions) {
    const tokens = (s.tokens?.input || 0) + (s.tokens?.output || 0) + (s.tokens?.cacheWrite || 0);
    const hours = Object.entries(s.hourly || {}).filter(([k, v]) => k >= since && v > 0).length;
    rows.push([s.title, s.app, s.model || '', s.status ? STATUS_CS[s.status] || s.status : 'Mimo okno sledování', localStamp(s.startedAt), localStamp(s.lastAt), s.turns || 0, tokens, hours, s.cwd || '', s.url || '']);
  }
  return `﻿${rows.map((r) => r.map(cell).join(';')).join('\r\n')}\r\n`;
}
