import fs from 'node:fs';
import path from 'node:path';
import { readdirSafe } from './util.js';

// Rekurzivní sledování složky (macOS FSEvents). Když složka neexistuje nebo watcher spadne, zkouší to znovu.
export function watchTree(dir, onChange, { retryMs = 5000 } = {}) {
  let watcher = null;
  let closed = false;
  let retry = null;

  const schedule = () => {
    if (closed) return;
    clearTimeout(retry);
    retry = setTimeout(arm, retryMs);
    retry.unref?.();
  };

  function arm() {
    if (closed) return;
    try {
      watcher = fs.watch(dir, { recursive: true }, (_event, name) => {
        onChange(name ? path.join(dir, name.toString()) : null);
      });
      watcher.on('error', () => {
        watcher?.close();
        watcher = null;
        schedule();
      });
      // Složka mohla vzniknout mezi skenem a sledováním — ohlásit plný průchod.
      onChange(null);
    } catch {
      watcher = null;
      schedule();
    }
  }

  arm();
  return {
    close() {
      closed = true;
      clearTimeout(retry);
      watcher?.close();
      watcher = null;
    },
    get active() {
      return Boolean(watcher);
    },
  };
}

// Fronta zpracování souborů: debounce na soubor a sériové zpracování (žádné dvojí čtení stejného offsetu).
export function createFileQueue(worker, delay = 60) {
  const timers = new Map();
  const chains = new Map();

  function run(file) {
    const prev = chains.get(file) || Promise.resolve();
    const next = prev
      .then(() => worker(file))
      .catch((err) => console.error(`Agenteeq: chyba při zpracování ${file}:`, err.message));
    chains.set(file, next);
    next.finally(() => {
      if (chains.get(file) === next) chains.delete(file);
    });
    return next;
  }

  return {
    run,
    schedule(file) {
      clearTimeout(timers.get(file));
      const t = setTimeout(() => {
        timers.delete(file);
        run(file);
      }, delay);
      t.unref?.();
      timers.set(file, t);
    },
    clear() {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    },
    idle() {
      return Promise.all([...chains.values()]);
    },
  };
}

// Soubory přesně v hloubce `depth` pod `root` (0 = přímo v root).
export async function listFiles(root, depth, filter = () => true) {
  const out = [];
  async function walk(dir, level) {
    for (const e of await readdirSafe(dir)) {
      const full = path.join(dir, e.name);
      if (e.isDirectory() && level < depth) await walk(full, level + 1);
      else if (e.isFile() && level === depth && filter(full)) out.push(full);
    }
  }
  await walk(root, 0);
  return out;
}

export function depthOf(root, file) {
  const rel = path.relative(root, file);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return -1;
  return rel.split(path.sep).length - 1;
}
