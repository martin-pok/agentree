// Napojení modelů tlačítkem (docs/ACCOUNTS.md, „Napojení modelů“).
//
// Přihlašování zůstává vždycky u dodavatele. Agenteeq spustí jeho vlastní přihlášení (Claude Code
// i Codex otevřou svou stránku v prohlížeči) nebo otevře jeho web, a pak se jen ptá, jestli je
// hotovo: „claude auth status“, „codex login status“, první data z rozšíření. Hesla ani tokeny
// dodavatelů Agenteeq nevidí, nečte a neukládá.
import { shellQuote } from './util.js';

const INTERVAL_MS = 2000;
const LIMIT_MS = 10 * 60 * 1000;

// Ověřeno proti skutečným nástrojům (24. 9. 2026): `claude auth --help` v Claude Code a zdroj
// `codex-rs/cli/src/login.rs` v Codexu. Neznámý výstup = null („nepodařilo se zjistit“), ne „ne“.
export const AGENTI = {
  'claude-code': {
    label: 'Claude Code',
    provider: 'anthropic',
    logo: 'claude',
    bin: 'claude',
    prihlaseni: ['auth', 'login'],
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

export function prikazPrihlaseni(bin, args) {
  return [shellQuote(bin), ...args].join(' ');
}

// `bins()` vrací mapu nalezených programů, nebo null, když se zatím nehledalo – pak „nevím“
// (nainstalovano: null), nikdy „není“. `posledni(id)` = kdy agent na tomhle Macu naposledy
// pracoval (0 = za sledované období nic); podle toho člověk pozná, proč jsou tokeny nulové.
export function createNapojeni({ bins, run, terminal, open, emit = () => {}, plan = async () => '', extension = () => ({ state: 'missing' }), posledni = () => 0, oknoDni = null, now = Date.now, intervalMs = INTERVAL_MS, limitMs = LIMIT_MS }) {
  const ceka = new Map(); // id → { od, casovac? }

  async function zjisti(id) {
    const a = AGENTI[id];
    const nalezene = bins();
    if (!nalezene) return { nainstalovano: null, napojeno: null };
    const bin = nalezene[a.bin];
    if (!bin) return { nainstalovano: false, napojeno: null };
    const r = await run(bin, a.stav, { timeout: 10000 });
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
    ceka.delete(id);
  }

  function hotovo(id, label, extra = {}) {
    ukonci(id);
    emit({ id, label, udalost: 'napojeno', ...extra });
  }

  // Hlídá, dokud se nástroj nepřihlásí. Selhání dotazu není „nepřihlášeno“ – jen se zkusí znovu.
  function hlidej(id) {
    const a = AGENTI[id];
    const krok = async () => {
      const c = ceka.get(id);
      if (!c) return;
      if (now() - c.od > limitMs) {
        ukonci(id);
        emit({ id, label: a.label, udalost: 'vyprselo' });
        return;
      }
      const z = await zjisti(id).catch(() => ({ napojeno: null }));
      if (!ceka.has(id)) return;
      if (z.napojeno === true) return hotovo(id, a.label, { plan: await plan(id).catch(() => '') });
      c.casovac = setTimeout(krok, intervalMs);
      c.casovac.unref?.();
    };
    ceka.get(id).casovac = setTimeout(krok, intervalMs);
    ceka.get(id).casovac.unref?.();
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
      const prikaz = prikazPrihlaseni(bin, a.prihlaseni);
      const r = await terminal(prikaz);
      if (!r.ok) return { status: 422, error: `${r.error || 'Terminál se nepodařilo otevřít.'} Spusť přihlášení ručně: ${prikaz}`, prikaz };
      ukonci(id);
      ceka.set(id, { od: now() });
      hlidej(id);
      return { ok: true, ceka: true, prikaz, dry: Boolean(r.dry) };
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

  function zrusit(id) {
    ukonci(id);
    return { ok: true };
  }

  function stop() {
    for (const id of [...ceka.keys()]) ukonci(id);
  }

  return { prehled, napojit, webOzvalo, zrusit, stop, ceka: (id) => ceka.has(id) };
}
