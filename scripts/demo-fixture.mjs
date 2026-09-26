// Jedna ukázková scéna pro prohlídku produktu i pro snímky na web.
// Smyšlená data v dočasných složkách; nikdy nečte skutečné přepisy ani nastavení.
import { startTestServer, api } from '../test/helpers.mjs';
import { addTokens, pushEntry, touch } from '../src/model.js';
import { readFileSync } from 'node:fs';

const VERZE = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

// Neutrální identita: prohlídku pouští i lidé, kteří ji ukazují klientům, a snímky jdou na web.
const UKAZKOVY_HOST = { name: 'MacBook Pro', user: 'ukazka', fullName: 'Ukázkový profil' };

// `oznacit` přidá ke každému jménu „UKÁZKA ·“ a místo popisu činnosti napíše, že jde o ukázku.
// Tak ji vidí živá prohlídka na webu i aplikace spuštěná přes `npm run showcase`, kde ji někdo
// může omylem vzít za svá data. Detaily pro web (scripts/shots-site.mjs) jsou výřezy s popiskem
// „smyšlená data“ přímo pod sebou, a tam by opakované UKÁZKA v každém řádku přehlušilo rozhraní.
const EN_TEXTY = {
  "Ukázkový profil": "Sample profile",
  "Smyšlená ukázka pro prohlídku produktu": "Sample data for the product tour",
  "navigace klientského portálu": "client portal navigation",
  "Upravuje hlavičku a mobilní menu": "Updating the header and mobile menu",
  "migrace API": "API migration",
  "Připravuje novou konfiguraci": "Preparing a new configuration",
  "Povolit zápis nové konfigurace?": "Allow writing the new configuration?",
  "testy formuláře": "form tests",
  "Spouští testy validace": "Running validation tests",
  "Toto jsou smyšlená data pro prohlídku. Připrav návrh a vysvětli další postup.": "This is sample data for the product tour. Prepare a proposal and explain the next steps.",
  "Ukázková odpověď: rozdělím práci na strukturu, přístupnost a testování. Žádný skutečný agent se z této prohlídky nespouští.": "Sample response: I will divide the work into structure, accessibility and testing. This tour does not start any real agent.",
  "Smyšlený projekt pro prohlídku Agenteeq.": "Sample project for the Agenteeq tour.",
  "Klientský portál a nový web studia.": "Client portal and a new studio website.",
  "E-shop Lumen": "Lumen shop",
  "Smyšlený projekt: nový košík a platby.": "Sample project: a new cart and payments.",
  "Nový košík a platby.": "A new cart and payments.",
  "košík e-shopu": "shop cart",
  "platby a faktury": "payments and invoices",
  "Interní nástroje": "Internal tools",
  "Smyšlený projekt: přehledy pro tým.": "Sample project: dashboards for the team.",
  "Přehledy pro tým.": "Dashboards for the team.",
  "interní dashboard": "internal dashboard",
  "Toto jsou smyšlená data pro prohlídku. Pokračuj tam, kde jsme skončili.": "This is sample data for the product tour. Continue where we left off.",
  "Ukázková odpověď: hotovo, změny jsou připravené ke kontrole.": "Sample response: done, the changes are ready for review.",
  "Hotovo, změny čekají na kontrolu": "Done, changes are ready for review",
  "limit 5 h": "5-hour limit",
  "kredity API": "API credits"
};

export async function pripravUkazku(env = {}, { oznacit = true, jazyk = 'cs' } = {}) {
  const text = (s) => jazyk === 'en' ? (EN_TEXTY[s] || s) : s;
  const u = (jmeno) => (oznacit ? `${jazyk === 'en' ? 'SAMPLE' : 'UKÁZKA'} · ${text(jmeno)}` : text(jmeno));
  const cinnost = (coDela) => (oznacit ? text('Smyšlená ukázka pro prohlídku produktu') : text(coDela));
  const popis = (ukazka, cisty) => (text(oznacit ? ukazka : cisty));
  const demo = await startTestServer(env, { hostIdentity: { ...UKAZKOVY_HOST, fullName: text(UKAZKOVY_HOST.fullName) } });
  const client = api(demo.url);
  await client.send('PUT', '/api/settings', { welcomeCompleted: true, onboardingDismissed: true, lastSeenVersion: VERZE, language: jazyk });
  const now = Date.now();
  const sessions = [
    { connector: 'claude-code', localId: 'showcase-navigation', provider: 'anthropic', app: 'Claude Code', title: u('navigace klientského portálu'), running: true, cinnost: 'Upravuje hlavičku a mobilní menu' },
    { connector: 'codex', localId: 'showcase-api', provider: 'openai', app: 'Codex', title: u('migrace API'), cinnost: 'Připravuje novou konfiguraci', pending: { at: now, kind: 'permission', text: text('Povolit zápis nové konfigurace?') } },
    { connector: 'cursor', localId: 'showcase-form', provider: 'cursor', app: 'Cursor', title: u('testy formuláře'), running: true, cinnost: 'Spouští testy validace' },
  ];
  const ids = [];
  for (const [i, { cinnost: coDela, ...fixture }] of sessions.entries()) {
    const s = demo.app.store.ensure(fixture);
    Object.assign(s, fixture, { startedAt: now - (i + 1) * 900000, lastAt: now, runningAt: now, activity: cinnost(coDela), hookAt: now, turns: 3 + i });
    for (let hour = 0; hour < 5; hour++) { const at = now - hour * 3600000; touch(s, at); addTokens(s, at, { input: 17000 * (5 - hour), output: 3200 * (i + 1) }); }
    pushEntry(s, { at: now - 90000, role: 'user', text: text('Toto jsou smyšlená data pro prohlídku. Připrav návrh a vysvětli další postup.') });
    pushEntry(s, { at: now - 60000, role: 'assistant', text: text('Ukázková odpověď: rozdělím práci na strukturu, přístupnost a testování. Žádný skutečný agent se z této prohlídky nespouští.') });
    demo.app.store.commit(s);
    ids.push(s.id);
  }
  const project = await client.send('POST', '/api/projects', { name: u('Studio Atlas'), description: popis('Smyšlený projekt pro prohlídku Agenteeq.', 'Klientský portál a nový web studia.') });
  if (project.status === 201) {
    const projectId = project.body.project?.id || project.body.id;
    if (projectId) await client.send('POST', '/api/projects/assign', { sessionIds: ids, projectId });
  }
  // Starší práce ve dvou dalších smyšlených projektech: prohlídka Projektů pak ukazuje víc než jednu
  // kartu a sloupečky aktivity mají rozložení za poslední dny, ne jen jeden dnešní.
  const DEN = 86400000;
  const starsi = [
    { projekt: u('E-shop Lumen'), popis: popis('Smyšlený projekt: nový košík a platby.', 'Nový košík a platby.'), konverzace: [
      { connector: 'claude-code', localId: 'showcase-eshop-cart', provider: 'anthropic', app: 'Claude Code', title: u('košík e-shopu'), pred: 2 * 3600000, dny: [0, 1, 2, 4, 5, 7, 9, 12] },
      { connector: 'codex', localId: 'showcase-eshop-pay', provider: 'openai', app: 'Codex', title: u('platby a faktury'), pred: DEN, dny: [1, 3, 6, 8, 11] },
    ] },
    { projekt: u('Interní nástroje'), popis: popis('Smyšlený projekt: přehledy pro tým.', 'Přehledy pro tým.'), konverzace: [
      { connector: 'cursor', localId: 'showcase-intranet', provider: 'cursor', app: 'Cursor', title: u('interní dashboard'), pred: 3 * DEN, dny: [3, 4, 6, 10, 13, 16, 20] },
    ] },
  ];
  for (const { projekt, popis, konverzace } of starsi) {
    const pids = [];
    for (const [i, k] of konverzace.entries()) {
      const s = demo.app.store.ensure(k);
      for (const [j, den] of k.dny.entries()) addTokens(s, now - k.pred - den * DEN, { input: 9000 + ((j * 7919) % 23) * 1500, output: 1800 + i * 600 });
      pushEntry(s, { at: now - k.pred - 60000, role: 'user', text: text('Toto jsou smyšlená data pro prohlídku. Pokračuj tam, kde jsme skončili.') });
      pushEntry(s, { at: now - k.pred, role: 'assistant', text: text('Ukázková odpověď: hotovo, změny jsou připravené ke kontrole.') });
      Object.assign(s, { connector: k.connector, provider: k.provider, app: k.app, title: k.title, startedAt: now - k.pred - (k.dny.at(-1) + 1) * DEN, activity: cinnost('Hotovo, změny čekají na kontrolu'), turns: 4 + i });
      touch(s, now - k.pred);
      demo.app.store.commit(s);
      pids.push(s.id);
    }
    const p = await client.send('POST', '/api/projects', { name: projekt, description: popis });
    const pid = p.body.project?.id || p.body.id;
    if (p.status === 201 && pid) await client.send('POST', '/api/projects/assign', { sessionIds: pids, projectId: pid });
  }
  demo.app.store.setLimit({ id: 'showcase-five', label: u('limit 5 h'), app: 'Claude Code', provider: 'anthropic', usedPercent: 62, at: now, resetsAt: now + 7200000 });
  await pridejUtratu(client, new Date(now), u);
  return demo;
}

// Smyšlená útrata: rozpočet a výdaje tak, aby měsíc byl zhruba ze 70 % vyčerpaný a graf za půl
// roku měl co ukázat. Jde přes API jako skutečný uživatel, takže čísla spočítá server stejně.
async function pridejUtratu(client, dnes, u) {
  const datum = (mesicuZpet, den) => {
    const d = new Date(dnes.getFullYear(), dnes.getMonth() - mesicuZpet, 1);
    // Den v aktuálním měsíci nesmí být v budoucnu (sestavení na začátku měsíce).
    d.setDate(mesicuZpet === 0 ? Math.min(den, dnes.getDate()) : den);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  await client.send('PUT', '/api/spend/budgets', { total: 6000 });
  const vydaje = [
    { service: 'claude', kind: 'subscription', amount: 100, currency: 'USD', date: datum(4, 1), recurring: 'monthly', note: u('Claude Max') },
    { service: 'chatgpt', kind: 'subscription', amount: 20, currency: 'USD', date: datum(5, 3), recurring: 'monthly', note: u('ChatGPT Plus') },
    { service: 'cursor', kind: 'subscription', amount: 20, currency: 'USD', date: datum(2, 8), recurring: 'monthly', note: u('Cursor Pro') },
    { service: 'openai-api', kind: 'credits', amount: 25, currency: 'USD', date: datum(0, 6), note: u('kredity API') },
    { service: 'anthropic-api', kind: 'api', amount: 18, currency: 'USD', date: datum(0, 12), note: u('API') },
    { service: 'openai-api', kind: 'credits', amount: 25, currency: 'USD', date: datum(2, 14), note: u('kredity API') },
    { service: 'anthropic-api', kind: 'api', amount: 12, currency: 'USD', date: datum(1, 20), note: u('API') },
  ];
  for (const v of vydaje) await client.send('POST', '/api/spend/ledger', v);
}
