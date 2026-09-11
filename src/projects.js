import fs from 'node:fs';
import path from 'node:path';
import { uid, hourKey, DAY } from './util.js';

// Projekty: skupiny konverzací napříč službami. Přiřazení je ruční (session → projekt) nebo automatické podle složky.

export const PROJECT_COLORS = ['#C2335A', '#22A38C', '#C99A3E', '#4285F4', '#8250DF', '#D97757', '#1F8A96', '#16141D'];
export const LIMITS = { name: 60, description: 280, notes: 20000, folders: 10, assign: 1000 };
export const SNAPSHOT_MAX = 3000;
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
    .filter((p) => p && typeof p.id === 'string' && typeof p.name === 'string' && p.name.trim())
    .map((p) => ({
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
    ? { ...current, folders: [...current.folders] }
    : { id: uid(), name: '', color: nextColor(items), description: '', notes: '', folders: [], archived: false, createdAt: now, updatedAt: now };

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

export function resolveProject(summary, { items, assignments }) {
  const manual = assignments[summary.id];
  if (manual !== undefined) return manual === NO_PROJECT ? { projectId: null, projectSource: 'none' } : { projectId: manual, projectSource: 'manual' };
  const cwd = typeof summary.cwd === 'string' ? summary.cwd : '';
  if (cwd) {
    let best = null;
    for (const p of items) {
      for (const f of p.folders) {
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
