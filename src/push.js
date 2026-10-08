// Upozornění na telefon (Web Push). Spárovaný telefon si v Nastavení zapne odběr; Mac mu pak
// stejná upozornění, jaká jdou do systému, pošle přes push službu jeho prohlížeče (src/webpush.js).
// Obsah je šifrovaný pro telefon, push služba ho nepřečte. Odběr patří ke spárovanému zařízení:
// odpárováním zanikne. Selhání doručení se zapíše k odběru a ukáže v Nastavení – nehlásí se jako
// doručené. Agenteeq nemá vlastní server: bez zapnutého Macu nepřijde nic.
import { uid } from './util.js';
import { povolenyEndpoint, vytvorVapid, posli } from './webpush.js';
import { PUSH_ODBERY_MAX } from './datastore.js';
import { ui } from './texty.js';

export function createPush({ datastore, zarizeni = () => null, odeslat = posli, now = () => Date.now() }) {
  const data = () => datastore.data.push;

  function vapid() {
    if (!data().vapid) {
      data().vapid = vytvorVapid();
      datastore.save();
    }
    return data().vapid;
  }

  // Odběry, jejichž telefon je pořád spárovaný. `zarizeni()` vrací množinu id spárovaných zařízení
  // (nebo null, když vzdálený přístup neběží – pak se nic nemaže, jen se počká).
  function platne() {
    const ids = zarizeni();
    if (!ids) return data().odbery;
    const pred = data().odbery.length;
    data().odbery = data().odbery.filter((o) => !o.zarizeni || ids.has(o.zarizeni));
    if (data().odbery.length !== pred) datastore.save();
    return data().odbery;
  }

  const verejne = (o) => ({ id: o.id, nazev: o.nazev, zarizeni: o.zarizeni, vytvoreno: o.vytvoreno, naposledyOk: o.naposledyOk, chyba: o.chyba });

  return {
    /** Veřejný klíč a odběry bez adres a klíčů; s `zarizeni` jen odběry toho telefonu. */
    stav: ({ zarizeni: idZarizeni = null } = {}) => ({
      publicKey: vapid().publicKey,
      odbery: platne().filter((o) => !idZarizeni || o.zarizeni === idZarizeni).map(verejne),
    }),

    /** Uloží odběr z PushSubscription.toJSON() telefonu. Stejný endpoint se jen aktualizuje. */
    prihlas({ subscription, nazev = '', zarizeni: idZarizeni = '' }) {
      if (!idZarizeni) return { status: 403, error: ui('Upozornění na telefon si zapíná spárovaný telefon.') };
      const endpoint = typeof subscription?.endpoint === 'string' ? subscription.endpoint : '';
      const keys = subscription?.keys || {};
      if (!povolenyEndpoint(endpoint) || endpoint.length > 1000) return { status: 422, error: ui('Tahle push služba není podporovaná.') };
      if (!/^[\w-]{80,100}$/.test(String(keys.p256dh || '')) || !/^[\w-]{16,32}$/.test(String(keys.auth || ''))) return { status: 422, error: ui('Neplatný odběr upozornění.') };
      const odbery = platne();
      const stary = odbery.find((o) => o.endpoint === endpoint);
      const zaznam = {
        id: stary?.id || uid(),
        endpoint,
        keys: { p256dh: keys.p256dh, auth: keys.auth },
        nazev: String(nazev || '').slice(0, 60),
        zarizeni: String(idZarizeni).slice(0, 64),
        vytvoreno: stary?.vytvoreno || now(),
        naposledyOk: stary?.naposledyOk || 0,
        chyba: '',
      };
      data().odbery = [...odbery.filter((o) => o.endpoint !== endpoint), zaznam].slice(-PUSH_ODBERY_MAX);
      datastore.save();
      return { ok: true, odber: verejne(zaznam) };
    },

    /** Zruší odběr podle id (Mac) nebo endpointu; s `zarizeni` jen odběr toho telefonu. */
    odhlas({ id, endpoint, zarizeni: idZarizeni = null }) {
      const pred = data().odbery.length;
      const trefa = (o) => ((id && o.id === id) || (endpoint && o.endpoint === endpoint)) && (!idZarizeni || o.zarizeni === idZarizeni);
      data().odbery = data().odbery.filter((o) => !trefa(o));
      if (data().odbery.length === pred) return { status: 404, error: ui('Takový odběr upozornění není.') };
      datastore.save();
      return { ok: true };
    },

    /**
     * Pošle zprávu všem odběrům (nebo jen odběrům jednoho telefonu). Vrací počet doručených a chyb; odběr, který
     * push služba nezná (404/410), zapomene.
     */
    async posliVsem(zprava, { zarizeni: idZarizeni = null } = {}) {
      const cile = platne().filter((o) => !idZarizeni || o.zarizeni === idZarizeni);
      if (!cile.length) return { odeslano: 0, chyby: 0 };
      const v = vapid();
      const vysledky = await Promise.all(cile.map((o) => odeslat(o, zprava, v).then((r) => ({ o, r }))));
      let odeslano = 0;
      let chyby = 0;
      const zrusit = new Set();
      for (const { o, r } of vysledky) {
        if (r.ok) { odeslano++; o.naposledyOk = now(); o.chyba = ''; continue; }
        chyby++;
        if (r.zrusit) zrusit.add(o.id);
        else o.chyba = r.status ? `HTTP ${r.status}` : String(r.chyba || 'network');
      }
      if (zrusit.size) data().odbery = data().odbery.filter((o) => !zrusit.has(o.id));
      datastore.save();
      return { odeslano, chyby };
    },
  };
}
