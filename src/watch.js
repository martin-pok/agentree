import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readdirSafe, statSafe } from './util.js';

// Rekurzivní sledování složky (macOS FSEvents). Když složka neexistuje nebo watcher spadne, zkouší to znovu.
//
// `hlidatVznik`: když složka neexistuje, ale její přímý rodič ano, hlídá ho nerekurzivní „strážce“
// a sledování začne hned, jak složka vznikne – ne až při dalším opakování. Kořen přepisů to potřebuje:
// Claude Code zakládá projects/ až s první zprávou a nový agent se má ukázat do 2 s (AGENTS.md).
// Strážce hlídá jen přímého rodiče (nikdy nic širšího, nikdy domov z `bezStrazce`) a reaguje jen na
// položku se jménem sledované složky – soubory, které nástroj píše vedle, žádnou práci nevyvolají.
// Opakování zůstává jako pojistka, kdyby strážce událost minul.
export function watchTree(dir, onChange, { retryMs = 5000, hlidatVznik = false, bezStrazce = [] } = {}) {
  let watcher = null;
  let closed = false;
  let retry = null;
  let strazce = null;
  let strazeno = '';
  let rodicChybi = false;
  let pokusy = 0;
  const jmeno = path.basename(dir).toLowerCase();
  const rodic = path.dirname(dir);
  const zakazano = new Set([os.homedir(), ...bezStrazce].filter(Boolean).map((d) => path.resolve(d)));

  const schedule = () => {
    if (closed) return;
    clearTimeout(retry);
    retry = setTimeout(arm, retryMs);
    retry.unref?.();
  };

  function konecStraze() {
    strazce?.close();
    strazce = null;
    strazeno = '';
  }

  // Vrátí true, když rodiče hlídá strážce (už dřív, nebo nově).
  function hlidej() {
    if (!hlidatVznik || rodic === dir || zakazano.has(path.resolve(rodic))) return false;
    if (strazce) return true;
    rodicChybi = false;
    try {
      strazce = fs.watch(rodic, (_event, name) => {
        // Bez jména (systém ho nedal) se zkusí vždy; jinak jen na položku se jménem složky.
        if (name && name.toString().toLowerCase() !== jmeno) return;
        arm();
      });
      strazce.on('error', () => {
        konecStraze();
        schedule();
      });
      strazce.unref?.();
      strazeno = rodic;
      return true;
    } catch (err) {
      strazce = null;
      rodicChybi = err?.code === 'ENOENT';
      return false;
    }
  }

  function arm(znovu = true) {
    if (closed || watcher) return;
    // Dokud chybí i rodič, složka existovat nemůže: v kole se zkusí jen strážce nad rodičem, ne obojí.
    // V klidu tak zůstává jeden pokus za kolo jako dřív.
    if (rodicChybi && !hlidej()) {
      schedule();
      return;
    }
    pokusy++;
    try {
      watcher = fs.watch(dir, { recursive: true }, (_event, name) => {
        onChange(name ? path.join(dir, name.toString()) : null);
      });
      watcher.on('error', () => {
        watcher?.close();
        watcher = null;
        schedule();
      });
      konecStraze();
      clearTimeout(retry);
      // Složka mohla vzniknout mezi skenem a sledováním – ohlásit plný průchod.
      onChange(null);
    } catch {
      watcher = null;
      // Složka mohla vzniknout mezi neúspěšným pokusem a začátkem hlídání – jednou hned znovu.
      if (hlidej() && znovu && fs.existsSync(dir)) return arm(false);
      schedule();
    }
  }

  arm();
  return {
    close() {
      closed = true;
      clearTimeout(retry);
      konecStraze();
      watcher?.close();
      watcher = null;
    },
    get active() {
      return Boolean(watcher);
    },
    /** Složka, kterou právě hlídá strážce ('' = žádná). */
    get strazi() {
      return strazeno;
    },
    /** Kolik pokusů o sledování proběhlo (měření práce v klidu). */
    get pokusy() {
      return pokusy;
    },
  };
}

// Sleduje jediny soubor pres jeho rodicovskou slozku. Dodavatele casto ukladaji konfiguraci
// atomickou vymenou souboru, takze watch primo nad souborem by po prvni zmene prestal fungovat.
// Callback se spusti jen pro presne jmeno; ostatni zmeny v domovske slozce ignorujeme.
export function watchExactFile(file, onChange, { retryMs = 5000, watch = fs.watch } = {}) {
  const dir = path.dirname(file);
  const name = path.basename(file);
  let watcher = null;
  let retry = null;
  let closed = false;

  const arm = () => {
    if (closed || watcher) return;
    try {
      watcher = watch(dir, (_event, changed) => {
        if (changed && changed.toString() !== name) return;
        onChange(file);
      });
      watcher.on?.('error', () => {
        watcher?.close?.();
        watcher = null;
        if (!closed) {
          retry = setTimeout(arm, retryMs);
          retry.unref?.();
        }
      });
      watcher.unref?.();
    } catch {
      retry = setTimeout(arm, retryMs);
      retry.unref?.();
    }
  };
  arm();
  return {
    close() {
      closed = true;
      clearTimeout(retry);
      watcher?.close?.();
      watcher = null;
    },
    get active() { return Boolean(watcher); },
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

// Soubory přesně v hloubce `depth` pod `root` (0 = přímo v root). Symbolické odkazy se následují
// (projekt připojený odkazem jinam by jinak zůstal neviditelný); smyčka odkazů se pozná podle
// skutečné cesty a projde se jen jednou.
export async function listFiles(root, depth, filter = () => true) {
  const out = [];
  const seen = new Set();
  async function walk(dir, level) {
    const real = await fs.promises.realpath(dir).catch(() => dir);
    if (seen.has(real)) return;
    seen.add(real);
    for (const e of await readdirSafe(dir)) {
      const full = path.join(dir, e.name);
      let isDir = e.isDirectory();
      let isFile = e.isFile();
      if (e.isSymbolicLink()) {
        const st = await statSafe(full);
        isDir = Boolean(st?.isDirectory());
        isFile = Boolean(st?.isFile());
      }
      if (isDir && level < depth) await walk(full, level + 1);
      else if (isFile && level === depth && filter(full)) out.push(full);
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
