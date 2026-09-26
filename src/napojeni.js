// Napojení modelů tlačítkem (docs/ACCOUNTS.md, „Napojení modelů“).
//
// Přihlašování zůstává vždycky u dodavatele. Agenteeq spustí na pozadí jeho vlastní přihlášení
// (Claude Code i Codex samy otevřou svou stránku v prohlížeči, src/prihlaseni.js) nebo otevře jeho
// web, a pak se jen ptá, jestli je hotovo: „claude auth status“, „codex login status“, první data
// z rozšíření. Terminál se nikdy neotvírá. Hesla ani tokeny dodavatelů Agenteeq nevidí, nečte
// a neukládá.
import { prostrediPro } from './prihlaseni.js';

const INTERVAL_MS = 2000;
const LIMIT_MS = 10 * 60 * 1000;

// Ověřeno proti skutečným nástrojům (24. 9. 2026): `claude auth --help` v Claude Code a zdroj
// `codex-rs/cli/src/login.rs` v Codexu. Neznámý výstup = null („nepodařilo se zjistit“), ne „ne“.
// `claude auth login --claudeai` (Claude Code 2.1.283, 26. 9. 2026) rovnou otevře přihlášení
// předplatného v prohlížeči a na nic se neptá; starší verze bez přepínače dostanou `zaloha`.
export const AGENTI = {
  'claude-code': {
    label: 'Claude Code',
    provider: 'anthropic',
    logo: 'claude',
    bin: 'claude',
    prihlaseni: ['auth', 'login', '--claudeai'],
    zaloha: ['auth', 'login'],
    stav: ['auth', 'status', '--json'],
    precti: (r) => {
      try {
        const j = JSON.parse(r.stdout);
        return typeof j?.loggedIn === 'boolean' ? j.loggedIn : null;
      } catch {
        return null;
      }
    },
  },
  codex: {
    label: 'Codex',
    provider: 'openai',
    logo: 'codex',
    bin: 'codex',
    prihlaseni: ['login'],
    stav: ['login', 'status'],
    precti: (r) => {
      const text = `${r.stdout || ''}\n${r.stderr || ''}`;
      if (/Logged in using/i.test(text)) return true;
      if (/Not logged in/i.test(text)) return false;
      return null;
    },
  },
};

// Webové chaty se napojují přes rozšíření pro Chrome: stačí se na webu přihlásit jako vždycky
// a otevřít chat. Napojeno je ve chvíli, kdy rozšíření z té služby pošle první stav.
export const WEBY = {
  chatgpt: { label: 'ChatGPT', provider: 'openai', logo: 'openai', url: 'https://chatgpt.com/' },
  claude: { label: 'Claude.ai', provider: 'anthropic', logo: 'claude', url: 'https://claude.ai/new' },
  gemini: { label: 'Gemini', provider: 'google', logo: 'gemini', url: 'https://gemini.google.com/app' },
  perplexity: { label: 'Perplexity', provider: 'perplexity', logo: 'perplexity', url: 'https://www.perplexity.ai/' },
};

// Kód z prohlížeče (ruční cesta Claude Code) je jeden řádek tisknutelných znaků. Nic jiného se
// procesu na vstup nepošle.
const KOD = /^[\x21-\x7e]{8,512}$/;

// `bins()` vrací mapu nalezených programů, nebo null, když se zatím nehledalo – pak „nevím“
// (nainstalovano: null), nikdy „není“. `posledni(id)` = kdy agent na tomhle Macu naposledy
// pracoval (0 = za sledované období nic); podle toho člověk pozná, proč jsou tokeny nulové.
// `prihlas(bin, args, { naKonec })` spustí přihlášení na pozadí (src/prihlaseni.js).
export function createNapojeni({ bins, run, prihlas, open, emit = () => {}, plan = async () => '', extension = () => ({ state: 'missing' }), posledni = () => 0, oknoDni = null, now = Date.now, intervalMs = INTERVAL_MS, limitMs = LIMIT_MS, odkazMs = 3000 }) {
  const ceka = new Map(); // id → { od, casovac?, proces? }

  async function zjisti(id) {
    const a = AGENTI[id];
    const nalezene = bins();
    if (!nalezene) return { nainstalovano: null, napojeno: null };
    const bin = nalezene[a.bin];
    if (!bin) return { nainstalovano: false, napojeno: null };
    const r = await run(bin, a.stav, { timeout: 10000, env: prostrediPro(bin) });
    return { nainstalovano: true, napojeno: a.precti(r) };
  }

  async function prehled() {
    const agenti = await Promise.all(Object.entries(AGENTI).map(async ([id, a]) => {
      const z = await zjisti(id).catch(() => ({ nainstalovano: true, napojeno: null }));
      return { id, druh: 'agent', label: a.label, provider: a.provider, logo: a.logo, ...z, plan: z.napojeno ? await plan(id).catch(() => '') : '', ceka: ceka.has(id), posledni: posledni(id) || 0, oknoDni };
    }));
    const rozsireni = extension();
    const weby = Object.entries(WEBY).map(([id, w]) => ({
      id: `web:${id}`, druh: 'web', label: w.label, provider: w.provider, logo: w.logo,
      nainstalovano: rozsireni.state !== 'missing', napojeno: rozsireni.sites?.[id] ? true : rozsireni.state === 'missing' ? false : null,
      ceka: ceka.has(`web:${id}`),
    }));
    return [...agenti, ...weby];
  }

  function ukonci(id) {
    const c = ceka.get(id);
    if (c?.casovac) clearTimeout(c.casovac);
    c?.proces?.zastav();
    ceka.delete(id);
  }

  function hotovo(id, label, extra = {}) {
    ukonci(id);
    emit({ id, label, udalost: 'napojeno', ...extra });
  }

  // Hlídá, dokud se nástroj nepřihlásí. Selhání dotazu není „nepřihlášeno“ – jen se zkusí znovu.
  function hlidej(id, za = intervalMs) {
    const a = AGENTI[id];
    const c0 = ceka.get(id);
    if (!c0) return;
    if (c0.casovac) clearTimeout(c0.casovac);
    const krok = async () => {
      const c = ceka.get(id);
      if (!c) return;
      c.casovac = null;
      if (now() - c.od > limitMs) {
        ukonci(id);
        emit({ id, label: a.label, udalost: 'vyprselo' });
        return;
      }
      const z = await zjisti(id).catch(() => ({ napojeno: null }));
      if (ceka.get(id) !== c) return;
      if (z.napojeno === true) return hotovo(id, a.label, { plan: await plan(id).catch(() => '') });
      // Přihlášení skončilo, a přihlášen není: proces to vzdal (zavřená stránka, chyba). Čekat
      // dál by znamenalo tvrdit „čekám“, i když už není na co.
      if (c.skoncil) {
        ukonci(id);
        emit({ id, label: a.label, udalost: 'selhalo', chyba: c.chyba || `Přihlášení ${a.label} skončilo bez napojení. Zkus to prosím znovu.` });
        return;
      }
      if (!c.casovac) {
        c.casovac = setTimeout(krok, intervalMs);
        c.casovac.unref?.();
      }
    };
    c0.casovac = setTimeout(krok, za);
    c0.casovac.unref?.();
  }

  // Spustí přihlášení na pozadí. Když starší Claude Code nezná přepínač `--claudeai`, skončí hned
  // s „unknown option“ – pak se to jednou zkusí bez něj, se stejným záznamem čekání.
  async function spust(id, bin, args, zaznam = { od: now() }) {
    const a = AGENTI[id];
    const naKonec = (kod, vystup) => {
      if (ceka.get(id) !== zaznam) return;
      zaznam.proces = null;
      if (kod !== 0 && a.zaloha && args !== a.zaloha && /unknown option/i.test(vystup)) {
        spust(id, bin, a.zaloha, zaznam).then((r) => {
          if (!r.ok && ceka.get(id) === zaznam) {
            ukonci(id);
            emit({ id, label: a.label, udalost: 'selhalo', chyba: r.error });
          }
        });
        return;
      }
      zaznam.skoncil = true;
      if (kod !== 0) zaznam.chyba = `Přihlášení ${a.label} skončilo s chybou. Zkus to prosím znovu.`;
      // Konec procesu je nejlepší chvíle se zeptat – obvykle právě dokončil přihlášení.
      hlidej(id, 0);
    };
    const r = await prihlas(bin, args, { naKonec });
    if (!r.ok) return r;
    // Mezitím mohlo přijít nové „Napojit“ nebo „Zrušit“ – platí poslední slovo člověka.
    if (ceka.get(id) !== zaznam) {
      if (zaznam.proces === undefined) {
        ukonci(id);
        ceka.set(id, zaznam);
        hlidej(id);
      } else {
        r.zastav();
        return { ok: false, error: `Přihlášení ${a.label} bylo zrušeno.` };
      }
    }
    zaznam.proces = r;
    return r;
  }

  async function napojit(id) {
    if (AGENTI[id]) {
      const a = AGENTI[id];
      const nalezene = bins();
      if (!nalezene) return { status: 422, error: `Nepodařilo se zjistit, jestli je ${a.label} na tomhle Macu nainstalovaný.` };
      const bin = nalezene[a.bin];
      if (!bin) return { status: 422, error: `${a.label} se na tomhle Macu nepodařilo najít.` };
      const z = await zjisti(id).catch(() => ({ napojeno: null }));
      if (z.napojeno === true) {
        const p = await plan(id).catch(() => '');
        emit({ id, label: a.label, udalost: 'napojeno', plan: p, uz: true });
        return { ok: true, uz: true, plan: p };
      }
      ukonci(id);
      const r = await spust(id, bin, a.prihlaseni);
      if (!r.ok) return { status: 422, error: r.error || `Přihlášení ${a.label} se nepodařilo spustit.` };
      return { ok: true, ceka: true, dry: Boolean(r.dry) };
    }
    const web = id.startsWith('web:') ? WEBY[id.slice(4)] : null;
    if (!web) return { status: 404, error: 'Tohle napojit neumíme.' };
    if (extension().state === 'missing') return { status: 409, error: 'Webové chaty se napojují přes rozšíření pro Chrome. Nejdřív ho přidej a spáruj.', rozsireni: true };
    const r = await open(web.url);
    if (!r.ok) return { status: 422, error: r.error || 'Prohlížeč se nepodařilo otevřít.' };
    ukonci(id);
    ceka.set(id, { od: now() });
    const c = ceka.get(id);
    c.casovac = setTimeout(() => {
      if (!ceka.has(id)) return;
      ukonci(id);
      emit({ id, label: web.label, udalost: 'vyprselo' });
    }, limitMs);
    c.casovac.unref?.();
    return { ok: true, ceka: true, dry: Boolean(r.dry) };
  }

  // Rozšíření poslalo stav z webové služby. Když na ni člověk právě čeká, je napojeno.
  function webOzvalo(site) {
    const id = `web:${site}`;
    if (ceka.has(id)) hotovo(id, WEBY[site]?.label || site);
  }

  // „Prohlížeč se neotevřel?“ – otevře záložní odkaz, který přihlášení vypsalo. Odkaz se objeví
  // až chvíli po startu, proto se na něj krátce počká.
  async function odkaz(id) {
    const a = AGENTI[id];
    if (!a) return { status: 404, error: 'Tohle napojit neumíme.' };
    const konec = now() + odkazMs;
    let url = null;
    while (ceka.get(id)?.proces && !(url = ceka.get(id).proces.odkaz?.()) && now() < konec) {
      await new Promise((res) => setTimeout(res, 100));
    }
    const proces = ceka.get(id)?.proces;
    if (!proces) return { status: 409, error: `Přihlášení ${a.label} už neběží. Zkus Napojit znovu.` };
    if (!url) return { status: 409, error: 'Přihlašovací stránka ještě není připravená. Zkus to za pár vteřin.' };
    const r = await open(url);
    if (!r.ok) return { status: 422, error: r.error || 'Prohlížeč se nepodařilo otevřít.' };
    // Claude Code se pak ptá na kód ze stránky; Codex ne (vrací se na localhost sám).
    return { ok: true, kod: Boolean(a.zaloha) || Boolean(proces.chceKod?.()) };
  }

  function kod(id, hodnota) {
    const a = AGENTI[id];
    if (!a) return { status: 404, error: 'Tohle napojit neumíme.' };
    const text = typeof hodnota === 'string' ? hodnota.trim() : '';
    if (!KOD.test(text)) return { status: 422, error: 'Tohle nevypadá jako kód z přihlašovací stránky. Zkopíruj ho celý.' };
    const proces = ceka.get(id)?.proces;
    if (!proces?.posliKod(text)) return { status: 409, error: `Přihlášení ${a.label} už neběží. Zkus Napojit znovu.` };
    hlidej(id, 500);
    return { ok: true };
  }

  function zrusit(id) {
    ukonci(id);
    return { ok: true };
  }

  function stop() {
    for (const id of [...ceka.keys()]) ukonci(id);
  }

  return { prehled, napojit, odkaz, kod, webOzvalo, zrusit, stop, ceka: (id) => ceka.has(id) };
}
