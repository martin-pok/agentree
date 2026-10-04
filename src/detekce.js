// Automatická detekce agentů v činnosti.
//
// Kdykoli na tomhle Macu začne běžet AI nástroj z katalogu (src/connectors/processes.js#RUNTIMES),
// který Agenteeq ještě nezná, uživatel dostane oznámení: co to je, kde pracuje a co o něm Agenteeq
// uvidí. Může ho jedním klikem přidat do Mých nástrojů, nebo nechat být – a pak už se ho nikdy
// neptáme. Pamatuje si jen identifikátor z katalogu, časy a rozhodnutí; nic osobního.
//
// Nástroj, jehož konverzace Agenteeq už čte (má připojený konektor s daty), oznámení nedostane:
// uživatel ho vidí v přehledu a zpráva „našel jsem nového agenta“ by byla šum. Výjimkou je úplně
// nová instalace – tam ještě nic nevidí, takže se dozví o všem, co zrovna běží.
import { RUNTIMES } from './connectors/processes.js';
import { jeNocniTicho } from './nocni-ticho.js';
import { ui, prekladac } from './texty.js';

const KATALOG = new Map(RUNTIMES.map((r) => [r.id, r]));
// Rozhraní, které je vidět, se hlásí každých 30 s. Když se 45 s neozvalo, okno vidět není
// a zprávu je potřeba poslat i do macOS – při nejistotě raději oznámit, než aby zapadla.
const VIDET_MS = 45_000;
const ULOZIT_NAPOSLEDY_MS = 60_000;
const ROZHODNUTI = { pridat: 'pridany', ignorovat: 'ignorovany', rozumim: 'znamy', odebrat: 'ignorovany' };

// Titulek souhrnného oznámení. Každý tvar podle počtu je celý text rozhraní (src/texty.js).
export function titulekSouhrnu(n) {
  return n >= 2 && n <= 4 ? ui('{0} nové AI nástroje', n) : ui('{0} nových AI nástrojů', n);
}

export function createDetekce({ store, datastore, alerts, notifier, pripojene = () => new Set(), now = () => Date.now() }) {
  let uiVidetDo = 0;
  let spusteno = false;

  const zaznamy = () => datastore.data.nastroje || (datastore.data.nastroje = {});
  const sledovano = (k) => {
    const p = pripojene();
    return (k?.konektory || []).some((id) => p.has(id));
  };

  function radek(id) {
    const k = KATALOG.get(id);
    const z = zaznamy()[id];
    if (!k || !z) return null;
    const r = (store.runtimes || []).find((x) => x.id === id);
    return {
      id,
      name: k.name,
      provider: k.provider,
      druh: k.druh,
      popis: k.popis,
      vidim: k.vidim || '',
      // Agenteeq má pro nástroj konektor, jen zatím nenašel jeho záznamy (čerstvá instalace nástroje).
      umiCist: (k.konektory || []).length > 0,
      overeno: Boolean(k.overeno),
      sledovano: sledovano(k),
      bezi: Boolean(r?.running),
      beziOd: r?.running ? Number(r.od) || 0 : 0,
      poprve: z.poprve,
      naposledy: z.naposledy,
      stav: z.stav,
    };
  }

  function payload() {
    const ids = Object.keys(zaznamy());
    const podle = (stav) => ids.filter((id) => zaznamy()[id].stav === stav).map(radek).filter(Boolean)
      .sort((a, b) => b.poprve - a.poprve);
    // Odmítnuté zůstávají vidět v Nastavení, aby šlo rozhodnutí vzít zpět. `videne` = co tu někdy
    // běželo – podle toho Přehled pozná nástroje, které uživatel opravdu má, i když zrovna neběží.
    return { nove: podle('novy'), moje: podle('pridany'), ignorovane: podle('ignorovany'), videne: ids.filter((id) => KATALOG.has(id)) };
  }

  function oznam(nove) {
    const n = datastore.data.settings?.notifications || {};
    if (n.detekce === false) return;
    for (const r of nove) {
      alerts.raise({
        key: `novy-nastroj:${r.id}`,
        level: 'info',
        kind: 'novy-nastroj',
        title: ui('Nový AI nástroj: {0}', r.name),
        body: r.popis || '',
        nastroj: r.id,
        route: '#/nastaveni',
        bezNativniho: true,
      });
    }
    // Jedno souhrnné oznámení za dávku, a jen když okno Agenteeq není vidět. Noční ticho platí
    // i tady: zachycený agent počká v seznamu upozornění, do ranního souhrnu nepatří.
    if (n.native && now() > uiVidetDo && !jeNocniTicho(n, now())) {
      const jeden = nove.length === 1;
      const t = prekladac(datastore.data.settings?.language);
      notifier?.native({
        title: t(jeden ? ui('Nový AI nástroj: {0}', nove[0].name) : titulekSouhrnu(nove.length)),
        body: jeden ? t(nove[0].popis || '') : nove.map((r) => r.name).join(', '),
        subtitle: 'Agenteeq',
        sound: false,
      }).catch?.(() => {});
    }
  }

  function vyhodnot() {
    if (!spusteno) return;
    const t = now();
    const cerstvaInstalace = !datastore.data.settings?.welcomeCompleted;
    const nove = [];
    let zmena = false;
    for (const r of store.runtimes || []) {
      if (!r.running) continue;
      const k = KATALOG.get(r.id);
      if (!k) continue;
      const z = zaznamy()[r.id];
      if (z) {
        if (t - z.naposledy > ULOZIT_NAPOSLEDY_MS) { z.naposledy = t; zmena = true; }
        continue;
      }
      const stav = !cerstvaInstalace && sledovano(k) ? 'znamy' : 'novy';
      zaznamy()[r.id] = { poprve: t, naposledy: t, stav };
      zmena = true;
      if (stav === 'novy') nove.push(k);
    }
    if (!zmena) return;
    datastore.save();
    if (nove.length) oznam(nove);
    store.emit('detekce', payload());
  }

  function rozhodni(id, akce) {
    const k = KATALOG.get(id);
    const stav = ROZHODNUTI[akce];
    if (!k || !stav) return { error: ui('Neznámý nástroj nebo akce.'), status: 404 };
    const t = now();
    const z = zaznamy()[id] || { poprve: t, naposledy: t };
    z.stav = stav;
    if (stav === 'pridany') z.pridano = t; else delete z.pridano;
    zaznamy()[id] = z;
    datastore.save();
    const p = payload();
    store.emit('detekce', p);
    return p;
  }

  return {
    start() {
      spusteno = true;
      store.on('runtimes', vyhodnot);
      store.on('connectors', vyhodnot);
      vyhodnot();
    },
    vyhodnot,
    payload,
    rozhodni,
    pritomnost(videt) {
      uiVidetDo = videt ? now() + VIDET_MS : 0;
      return { ok: true };
    },
  };
}
