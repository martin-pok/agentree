// Aplikace ChatGPT pro Mac – běžné chaty (Codex z téže aplikace čte src/connectors/codex.js).
//
// Chaty si aplikace ukládá zašifrované (docs/CONNECTORS.md), proto se čte její okno přes
// Zpřístupnění macOS (src/platform.js#oknaChatGPT): název okna a probíhající odpověď. Konverzace
// vznikne, až ji Agenteeq uvidí odpovídat – pouhé otevřené okno není práce. Když odpověď skončí,
// je „hotovo“; když se okno nedá přečíst (chybí povolení, chyba), stav nečerstvne s vlastním
// důvodem a nikdy se z toho nestane „nic neběží“. Text konverzace se nečte. 🧪 Beta.
import crypto from 'node:crypto';
import { touch } from '../model.js';
import { oknaChatGPT } from '../platform.js';
import { ui } from '../texty.js';

const INTERVAL_MS = 3000;
// Odpověď drží „pracuje“ jen chvíli po posledním pozorování; výpadek čtení ji nenechá viset.
const CERSTVOST_MS = 15e3;
const OBECNY = /^(chatgpt|)$/i;

export const klicChatu = (nazev) => (nazev ? crypto.createHash('sha256').update(nazev).digest('hex').slice(0, 16) : 'aktivni');

// Které chaty právě odpovídají: řádek se spinnerem v postranním panelu nese svůj název; bez
// názvu (nebo jen tlačítko Stop) je to chat v okně. Vrací Map klíč → název.
export function odpovidajiciChaty(okna) {
  const chaty = new Map();
  for (const o of okna || []) {
    const pojmenovane = o.bezi.filter(Boolean);
    for (const nazev of pojmenovane) chaty.set(klicChatu(nazev), nazev);
    if (!pojmenovane.length && (o.bezi.length || o.stop)) {
      const nazev = OBECNY.test(o.nazev) ? '' : o.nazev;
      chaty.set(klicChatu(nazev), nazev);
    }
  }
  return chaty;
}

// `povoleno()` = uživatel čtení zapnul tlačítkem Napojit. Do té doby se okno nečte, takže macOS
// nevyskočí s dotazem na povolení sám od sebe hned po spuštění Agenteeq.
export function createChatGptAppConnector({ config, store, cti = oknaChatGPT, intervalMs = INTERVAL_MS, povoleno = () => true }) {
  const zapnuto = Boolean(config.chatgptApp);
  let casovac = null, bezi = null, posledni = { stav: zapnuto ? 'nezname' : 'vypnuto' }, lastEventAt = 0, ctenoAt = 0;
  const zname = new Set();

  function zpracuj(r, now = Date.now()) {
    posledni = r;
    ctenoAt = now;
    if (r.stav !== 'ok' && r.stav !== 'nebezi') {
      // Okno nejde přečíst: probíhající odpověď sama zestárne (CERSTVOST_MS) s poctivým důvodem.
      for (const id of zname) {
        const s = store.get(id);
        if (s?.running) s.staleReason = r.stav === 'povoleni'
          ? ui('Agenteeq nemá povolené Zpřístupnění, stav aplikace ChatGPT nevidí')
          : ui('Stav aplikace ChatGPT se nepodařilo přečíst');
      }
      return;
    }
    const odpovidaji = r.stav === 'ok' ? odpovidajiciChaty(r.okna) : new Map();
    for (const [klic, nazev] of odpovidaji) {
      const s = store.ensure({ connector: 'chatgpt-app', localId: klic, provider: 'openai', app: ui('ChatGPT · aplikace'), source: 'chatgpt-app' });
      s.title = nazev || ui('Chat v aplikaci ChatGPT');
      if (!s.startedAt) s.startedAt = now;
      s.running = true;
      s.runningAt = now;
      s.staleMs = CERSTVOST_MS;
      s.staleReason = '';
      s.activity = ui('Odpovídá v aplikaci ChatGPT');
      touch(s, now);
      zname.add(s.id);
      store.commit(s, now);
      lastEventAt = now;
    }
    // Chat, který přestal odpovídat (nebo se aplikace zavřela), dokončil jednu odpověď.
    for (const id of zname) {
      const s = store.get(id);
      if (!s || !s.running || odpovidaji.has(s.localId)) continue;
      s.running = false;
      s.turns += 1;
      touch(s, now);
      store.commit(s, now);
      lastEventAt = now;
    }
  }

  async function precti() {
    if (!zapnuto || bezi) return bezi;
    if (!povoleno()) { posledni = { stav: 'nezapnuto' }; return null; }
    bezi = cti().then((r) => zpracuj(r)).catch(() => zpracuj({ stav: 'chyba' })).finally(() => { bezi = null; });
    return bezi;
  }

  return {
    id: 'chatgpt-app', name: ui('ChatGPT · aplikace'), provider: 'openai', kind: 'local', verified: false,
    source: ui('Okno aplikace ChatGPT přes Zpřístupnění macOS'),
    description: ui('Běžné chaty z aplikace ChatGPT pro Mac: název chatu a to, jestli právě odpovídá. Text konverzace se nečte.'),
    async start() {
      if (!zapnuto) return;
      if (!povoleno()) posledni = { stav: 'nezapnuto' };
      await precti();
      casovac = setInterval(precti, intervalMs);
      casovac.unref?.();
    },
    scan: () => precti(),
    stop() { clearInterval(casovac); },
    idle: async () => { await bezi; },
    // Stav pro Napojení: 'ok' | 'nebezi' | 'povoleni' | 'chyba' | 'nezname' | 'nezapnuto' | 'vypnuto' | 'nepodporovano'.
    stavOkna: () => posledni.stav,
    status: () => {
      const s = posledni.stav;
      const detail = s === 'ok' ? ui('Čtu okno aplikace ChatGPT.')
        : s === 'nebezi' ? ui('Aplikace ChatGPT neběží.')
          : s === 'povoleni' ? ui('Povol Agenteeq v Nastavení systému → Soukromí a zabezpečení → Zpřístupnění.')
            : s === 'chyba' ? ui('Okno aplikace ChatGPT se nepodařilo přečíst. Zkusí se to znovu.')
              : s === 'nepodporovano' ? ui('Jen na macOS.')
                : s === 'nezapnuto' ? ui('Zapni v Nastavení → Propojení tlačítkem Napojit u ChatGPT · aplikace.') : ui('Zatím nečteno.');
      const state = s === 'ok' ? 'connected' : s === 'nebezi' ? 'idle' : s === 'povoleni' || s === 'chyba' ? 'error' : 'missing';
      return { state, detail, count: zname.size, watching: Boolean(casovac), lastEventAt, ctenoAt };
    },
  };
}
