// Kontextový průvodce Pomocníka: deterministická vrstva bez placeného API a bez halucinací.
// Odpovídá jen na otázky k Agenteeq, česky i anglicky, snese překlepy a chybějící diakritiku.
// Každá odpověď míří na skutečné místo v aplikaci – cíle se berou z rejstříku navigace
// (public/js/hledani.js), žádné smyšlené odkazy. Na otázky mimo aplikaci (počasí, psaní kódu,
// zdraví…) poctivě řekne, že s nimi neporadí, a nabídne další krok. Co se tady nerozhodne,
// jde do hledání v konverzacích na serveru (src/pomocnik.js). Regresní sada 20 nejčastějších
// dotazů: test/pomocnik-dotazy.test.mjs.
import { cileHledani, hledejCile, jedenPreklep } from './hledani.js';
import { jeOtazkaNaCekani, coNaMeCeka, nastrojVOtazce, stavNastroje } from './co-ceka.js';

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Cíl odkazu: stránka { route }, sekce stránky { route, region }, karta Nastavení { karta }
// nebo přepínač { prepinac }. Hledá se v rejstříku, takže popisek odpovídá jazyku rozhraní.
function najdiCil(spec, cile) {
  return cile.find((c) => {
    if (spec.prepinac) return c.prepinac === spec.prepinac;
    if (spec.karta) return c.karta === spec.karta && !c.prepinac;
    if (spec.region) return c.druh === 'sekce' && c.route === spec.route && c.region === spec.region;
    return c.druh === 'stranka' && c.route === spec.route;
  }) || null;
}

const TELEFON = /\b(telefon\w*|mobil\w*|iphon\w*|android\w*|phone\w*|ipad\w*)\b/;

// Záměry. `slova`: [kmen, váha]; kmen sedí na začátek slova (od 6 znaků i s jedním překlepem),
// „=slovo“ jen na celé slovo, spojení „a_b“ na souvislý úsek dotazu „a b“. Vyhrává nejvyšší
// součet, při shodě dřívější záměr. `cil` je místo v aplikaci (nebo funkce dotazu).
const intents = [
  { id: 'decisions', cil: { route: '#/prehled', region: 'decisions' },
    slova: [['povol', 3], ['schval', 3], ['opravnen', 3], ['permis', 3], ['approv', 3], ['rozhodnut', 2], ['potvrd', 2], ['decision', 2], ['pozornost', 2], ['attention', 2]],
    cs: 'Kdo čeká na tvoje povolení, vidíš v Přehledu v části Vyžaduje pozornost a v Agentech pod filtrem Potřebuje tebe. Schválit ale musíš v nástroji, kde agent běží – otevři ho tlačítkem Otevřít v… nebo Pokračovat v Terminálu. Agenteeq za tebe nic neschvaluje. Codex žádosti o schválení do souborů nezapisuje, takže je Agenteeq neuvidí.',
    en: 'Agents waiting for your permission appear on the Overview under Needs attention, and in Agents under the Needs you filter. You approve in the tool where the agent runs – use Open in… or Continue in Terminal. Agenteeq never approves anything for you. Codex does not write approval requests to its files, so Agenteeq cannot see them.' },
  { id: 'system', cil: { karta: 'system' },
    slova: [['spousteni', 4], ['autostart', 4], ['po_prihlaseni', 4], ['at_login', 4], ['on_login', 4], ['login_item', 4], ['startup', 3]],
    cs: 'V Nastavení → Spouštění po přihlášení zapneš, aby Agenteeq naběhl sám, jakmile se přihlásíš k počítači. Zatím to umí jen na macOS.',
    en: 'Turn on Settings → Start at login so Agenteeq starts by itself when you log in. This is available on macOS only for now.' },
  { id: 'launch', cil: { route: '#/prehled' },
    slova: [['spust', 3], ['novy_ukol', 3], ['noveho_agenta', 3], ['zadan', 2], ['zadat', 2], ['zadam', 2], ['launch', 3], ['new_task', 3], ['new_agent', 3], ['start', 2], ['na_pozadi', 2], ['background', 2]],
    cs: 'Nový úkol zadáš v Přehledu v kartě Spustit agenta: vyber agenta, napiš zadání a stiskni Spustit. Podle nástroje poběží v jeho aplikaci, v Terminálu, nebo na pozadí (na pozadí zatím jen na macOS).',
    en: 'Start a new task on the Overview in the Start agent card: pick an agent, write the task and press Start. Depending on the tool it runs in its app, in Terminal, or in the background (background runs are macOS only for now).' },
  { id: 'open', cil: { route: '#/agenti' },
    slova: [['otevr', 2], ['otevir', 2], ['pokrac', 2], ['navaz', 2], ['resume', 3], ['continu', 2], ['=open', 2], ['prepis', 2], ['transcript', 2], ['odpovedet', 2], ['=reply', 2], ['terminal', 1], ['detail', 1]],
    cs: 'V Agentech klikni na konverzaci – otevře se detail s přepisem. Tlačítko Otevřít v… nebo Pokračovat v Terminálu tě vrátí do nástroje, kde konverzace vznikla. U některých konverzací Claude Code můžeš agentovi odpovědět i přímo v detailu.',
    en: 'In Agents, click a conversation to open its detail and transcript. Open in… or Continue in Terminal takes you back to the tool where it started. For some Claude Code conversations you can also reply to the agent right in the detail.' },
  { id: 'budget', cil: { route: '#/utrata', region: 'budgets' },
    slova: [['rozpoc', 4], ['budget', 4]],
    cs: 'Rozpočet nastavíš v Útratě → Rozpočty. Když se k němu útrata přiblíží, Agenteeq tě upozorní; to jde vypnout v Nastavení → Upozornění → Rozpočet. Hlídá jen částky, které zná – odhad není faktura.',
    en: 'Set a budget in Spend → Budgets. Agenteeq alerts you as spending gets close; you can turn that off in Settings → Alerts → Budget. It only tracks amounts it knows about – an estimate isn’t an invoice.' },
  { id: 'alerts', cil: (q) => (TELEFON.test(q) ? { prepinac: 'push-telefon' } : /\b(noc\w*|ticho|nerusit|night|quiet)\b/.test(q) ? { prepinac: 'quietHours' } : { karta: 'notifications' }),
    slova: [['upozorn', 3], ['notifik', 3], ['oznamen', 3], ['notif', 3], ['alert', 3], ['nerusit', 3], ['ticho', 3], ['quiet', 3], ['zvuk', 2], ['sound', 2], ['do_not_disturb', 3]],
    cs: 'Upozornění nastavíš v Nastavení → Upozornění: kdy tě má Agenteeq upozornit, noční ticho i upozornění na telefon. Nechodí? Zkontroluj, že jsou zapnutá v Agenteeq i v nastavení systému, a pošli si zkušební.',
    en: 'Set up alerts in Settings → Alerts: what Agenteeq alerts you about, quiet hours and alerts on your phone. Not getting them? Check they are on both in Agenteeq and in your system settings, then send a test alert.' },
  { id: 'limits', cil: { route: '#/prehled', region: 'limits' },
    slova: [['limit', 3], ['=limt', 3], ['=lmit', 3], ['kvot', 3], ['quota', 3], ['kredit', 3], ['credit', 3], ['zbyva', 2], ['=left', 1], ['reset', 1], ['tydenni', 1], ['weekly', 1], ['obnovi', 1]],
    cs: 'Limity předplatných vidíš v Přehledu, jejich historii ve Statistikách → Limity a kredity. Ukazujeme jen čísla, která nástroje samy zapisují na tomto počítači (Claude Code, Claude Desktop, Codex). Limit aplikace ChatGPT Agenteeq přečíst nemá odkud.',
    en: 'Subscription limits are on the Overview, with history in Statistics → Limits and credits. Agenteeq only shows numbers the tools write on this computer (Claude Code, Claude Desktop, Codex). It has no way to read the ChatGPT app’s limit.' },
  { id: 'costs', cil: { route: '#/utrata' },
    slova: [['utrat', 3], ['naklad', 3], ['stoj', 2], ['cena', 2], ['penez', 2], ['penize', 2], ['cost', 3], ['spend', 3], ['spent', 3], ['billing', 3], ['price', 2], ['=api', 1], ['admin', 1]],
    cs: 'V Útratě vidíš rozpočty, předplatná, ruční záznamy a dostupné údaje z API. Skutečně účtované částky za API ukáže jen Admin API klíč v Nastavení → Náklady za API (zkušební). Odhad není faktura.',
    en: 'Spend shows budgets, subscriptions, manual entries and the API data that is available. Actual billed API costs appear only with an Admin API key in Settings → API costs (trial). An estimate isn’t an invoice.' },
  { id: 'stats', cil: { route: '#/statistiky' },
    slova: [['token', 3], ['statistik', 3], ['statistic', 3], ['=stats', 3], ['graf', 2], ['chart', 2], ['vyuzit', 1], ['usage', 1], ['heatmap', 2]],
    cs: 'Ve Statistikách vidíš tokeny podle poskytovatele, aplikace, modelu a složky a kdy agenti pracují. Tokeny z přepisů jsou zaznamenaná aktivita, ne účtované náklady.',
    en: 'Statistics shows tokens by provider, app, model and folder, and when your agents work. Tokens from transcripts are recorded activity, not billed costs.' },
  { id: 'extension', cil: { karta: 'extension' },
    slova: [['rozsiren', 3], ['extens', 3], ['chrom', 3], ['prohlizec', 2], ['browser', 2], ['webov', 2], ['=web', 1]],
    cs: 'Webové AI chaty uvidíš díky rozšíření pro Chrome. Najdeš ho v Nastavení → Propojení → Rozšíření pro Chrome: nainstaluj ho a spáruje se samo; když ne, vytvoř tam jednorázový kód a vlož ho do rozšíření. Přihlášení k účtu AI služby je něco jiného. Rozšíření je v Betě.',
    en: 'Web AI chats show up through the Chrome extension. Open Settings → Connections → Chrome extension: install it and it pairs by itself; if not, create a one-time code there and paste it into the extension. Signing in to the AI service is a separate thing. The extension is in Beta.' },
  { id: 'mobile', cil: (q) => (/\btailscal\w*/.test(q) ? { karta: 'tailscale' } : /\b(mimo domov|vzdalen\w*|remote|away from home|tunel\w*|tunnel\w*)/.test(q) ? { karta: 'remote' } : { karta: 'phone' }),
    slova: [['telefon', 3], ['mobil', 3], ['iphon', 3], ['android', 3], ['phone', 3], ['=qr', 3], ['ipad', 3], ['tablet', 2], ['tailscal', 3], ['vzdalen', 2], ['remote', 2], ['mimo_domov', 2], ['away_from_home', 2], ['sparov', 1], ['=pair', 1]],
    cs: 'Chceš Agenteeq na telefonu? V Nastavení → Otevřít na telefonu zapni přístup a vytvoř kód. Namiř foťák telefonu na QR kód, nebo otevři adresu a zadej jednorázový kód. Telefon musí být ve stejné síti; mimo domov pomůže Tailscale. Přístup povoluj jen zařízením, kterým věříš.',
    en: 'Want Agenteeq on your phone? In Settings → Open on phone, turn on access and create a code. Point the phone camera at the QR code, or open the address and enter the one-time code. The phone must be on the same network; away from home, use Tailscale. Only allow devices you trust.' },
  { id: 'update', cil: { karta: 'updates' },
    slova: [['aktualiz', 3], ['update', 3], ['updat', 3], ['upgrade', 3], ['verz', 2], ['version', 2], ['preview', 3], ['stabil', 2], ['stable', 2], ['kanal', 2], ['channel', 2], ['release', 2], ['nejnovejs', 2], ['latest', 2]],
    cs: 'V Nastavení → Aktualizace zjistíš, jakou verzi máš a jestli je nová. Tamtéž vybereš kanál: Stabilní jen ověřená vydání, Preview novinky dřív, ale s rizikem chyb. Když instalace selže, napiš mi, co se zobrazuje – bez potvrzení ti neřeknu, že je hotovo.',
    en: 'Settings → Updates shows your version and whether a new one is out. Choose the channel there too: Stable for verified releases only, Preview for new features sooner, with a risk of bugs. If installing fails, tell me what you see – I won’t assume the update succeeded.' },
  { id: 'hooks', cil: { karta: 'claude' },
    slova: [['hook', 3], ['claude_code', 3], ['statusline', 3]],
    cs: 'V Nastavení → Propojení → Propojení s Claude Code zapni hooky. Claude Code pak hned oznámí, že pracuje, čeká na povolení nebo narazil na limit. Do nastavení Claude Code se zapisuje jen po tvém kliknutí a se zálohou. Konverzace spuštěné předtím ukážou přesný stav až po novém spuštění. Karta se ukáže, když je Claude Code na tomto počítači.',
    en: 'Turn on hooks in Settings → Connections → Claude Code connection. Claude Code then reports right away when it is working, waiting for permission or hitting a limit. Its settings are only changed when you click, with a backup. Conversations started earlier show their exact status after a restart. The card appears when Claude Code is on this computer.' },
  { id: 'codex', cil: { karta: 'connectors' },
    slova: [['codex', 3], ['=kodex', 3], ['kodexu', 3]],
    cs: 'Codex Agenteeq čte sám z jeho složky .codex na tomto počítači – nic se nepropojuje. Konverzace se objeví po první zprávě; uvidíš práci, kroky, limity a kredity. Žádosti o schválení Codex do souborů nezapisuje, takže je Agenteeq neuvidí. Stav zdroje zkontroluješ v Nastavení → Propojení → Zdroje agentů.',
    en: 'Agenteeq reads Codex by itself from its .codex folder on this computer – nothing to connect. A conversation appears after its first message; you see work, steps, limits and credits. Codex does not write approval requests to its files, so Agenteeq cannot see them. Check the source in Settings → Connections → Agent sources.' },
  { id: 'connect', cil: { karta: 'models' },
    slova: [['pripoj', 2], ['napoj', 2], ['propoj', 2], ['integrac', 2], ['connect', 2], ['autoriz', 2], ['model', 2], ['claude', 1], ['chatgpt', 1], ['openai', 1], ['anthropic', 1], ['api_klic', 2], ['api_key', 2]],
    cs: 'Podívej se do Nastavení → Propojení → Napojené modely. U každého nástroje uvidíš, co Agenteeq dokáže zjistit. Claude Code, webové chaty a API se propojují různě — ne všude stačí kliknout na Připojit.',
    en: 'Open Settings → Connections → Connected models. Each tool shows what Agenteeq can find out. Local tools, the browser extension and API access are different sources; not all of them support signing in.' },
  { id: 'account', cil: { karta: 'account' },
    slova: [['ucet', 3], ['uctu', 3], ['uctem', 3], ['odhlas', 3], ['prihlas', 1], ['logout', 3], ['log_out', 3], ['sign_out', 3], ['login', 1], ['log_in', 1], ['sign_in', 1], ['account', 3], ['synchron', 3], ['sync', 3], ['google', 2]],
    cs: 'Účet Agenteeq najdeš v Nastavení → Účet a vzhled. Přihlašuješ se přes Google; synchronizují se jen souhrnná čísla (tokeny, útrata, limity, počty agentů), nikdy text konverzací. Odhlásit se jde tamtéž a data na tomto počítači zůstanou. Bez účtu funguje všechno dál.',
    en: 'Your Agenteeq account is in Settings → Account and appearance. You sign in with Google; only summary numbers are synced (tokens, spend, limits, agent counts), never conversation text. Sign out there too – data on this computer stays. Everything works without an account.' },
  { id: 'privacy', cil: { karta: 'privacy' },
    slova: [['soukrom', 3], ['bezpec', 3], ['privac', 3], ['privat', 3], ['secur', 3], ['telemetr', 3], ['gdpr', 3], ['posila', 2], ['odesil', 2], ['opust', 2], ['opoust', 2], ['leave', 2], ['upload', 2], ['=data', 1], ['cloud', 1]],
    cs: 'Konverzace, kód a názvy projektů čte Agenteeq jen na tomto počítači a nikam je neposílá – žádná telemetrie ani analytika. I tenhle pomocník běží tady. Když se přihlásíš k účtu, synchronizují se jen souhrnná čísla. Podrobnosti najdeš v Nastavení → Soukromí a bezpečnost.',
    en: 'Agenteeq reads conversations, code and project names only on this computer and sends them nowhere – no telemetry or analytics. This assistant runs here too. If you sign in to an account, only summary numbers are synced. Details are in Settings → Privacy and security.' },
  { id: 'agent-look', cil: { route: '#/agenti' },
    slova: [['vzhled_agent', 6], ['vzhled_robot', 6], ['robot', 3], ['oblec', 3], ['cepic', 3], ['klobouk', 3], ['bryle', 3], ['prevlek', 3], ['kostym', 3], ['satnik', 3], ['postavick', 3], ['avatar', 3], ['agent_look', 6], ['outfit', 3], ['costume', 3], ['wardrobe', 3], ['=hat', 3]],
    cs: 'Vzhled agenta upravíš v jeho detailu: v Agentech otevři agenta a klepni na jeho robota s tužkou. Vybereš postavu, barvu, čepici, doplněk na obličej, oblečení nebo převlek. Mění se jen vzhled, ne chování agenta.',
    en: 'Change an agent’s look in its detail: open the agent in Agents and click its robot with the pencil. Pick a character, colour, hat, face accessory, outfit or costume. Only the look changes, not how the agent works.' },
  { id: 'appearance', cil: { karta: 'appearance' },
    slova: [['vzhled', 3], ['tmav', 3], ['svetl', 3], ['rezim', 2], ['motiv', 3], ['=tema', 3], ['dark', 3], ['light', 3], ['theme', 3], ['appearance', 3], ['barv', 1]],
    cs: 'Vzhled změníš v Nastavení → Účet a vzhled → Vzhled: dva páry, světlý a tmavý, nebo střídání podle systému.',
    en: 'Change it in Settings → Account and appearance → Appearance: two pairs, light and dark, or follow the system.' },
  { id: 'language', cil: { karta: 'language' },
    slova: [['jazyk', 3], ['cestin', 3], ['cesky', 2], ['anglic', 3], ['english', 3], ['czech', 3], ['language', 3]],
    cs: 'Jazyk přepneš v Nastavení → Účet a vzhled → Jazyk aplikace (čeština, nebo angličtina). Změna stránku znovu načte.',
    en: 'Switch it in Settings → Account and appearance → App language (Czech or English). Changing it reloads the page.' },
  { id: 'skills', cil: { route: '#/dovednosti' },
    slova: [['dovednost', 3], ['skill', 3], ['slash', 3], ['prikaz', 2], ['command', 2]],
    cs: 'Dovednosti (skills) a příkazy z připojených nástrojů najdeš na stránce Dovednosti. Co v ní je, záleží na nástrojích na tomto počítači.',
    en: 'Skills and commands from your connected tools are on the Skills page. What it shows depends on the tools on this computer.' },
  { id: 'projects', cil: { route: '#/projekty' },
    slova: [['projekt', 3], ['project', 3], ['nezarazen', 3], ['unassigned', 3], ['zarad', 2], ['prirad', 2], ['assign', 2], ['slozk', 2], ['folder', 2], ['seskup', 1], ['group', 1]],
    cs: 'V Projektech si dáš dohromady konverzace, které patří ke stejné práci — i když vznikly v různých nástrojích. Nový projekt založíš tlačítkem Nový projekt, návrhy ze složek, kde agenti pracují, najdeš tamtéž. Co zatím nikam nepatří, je v Nezařazených.',
    en: 'Projects group conversations that belong to the same work, even across tools. Create one with New project; suggestions from folders where your agents work are there too. Anything not yet assigned is under Unassigned.' },
  { id: 'sources', cil: { karta: 'connectors' },
    slova: [['zdroj', 3], ['konektor', 3], ['source', 3], ['connector', 3], ['cursor', 3], ['copilot', 3], ['gemini', 3], ['qwen', 3], ['nevid', 2], ['missing', 2], ['nezobraz', 2], ['neukaz', 2], ['show_up', 2], ['detek', 2], ['detect', 2], ['=chybi', 2]],
    cs: 'Odkud Agenteeq čte práci agentů, vidíš v Nastavení → Propojení → Zdroje agentů. Nový nástroj se přidá sám, jakmile ho poprvé použiješ; konverzace se objeví po první zprávě. Některé zdroje jsou v Betě a vlastní lokální službu přidáš ve Vlastních agentech.',
    en: 'Settings → Connections → Agent sources shows where Agenteeq reads agent work from. A new tool is added by itself the first time you use it; a conversation appears after its first message. Some sources are in Beta, and you can add your own local service under Custom agents.' },
  { id: 'agents', cil: { route: '#/agenti' },
    slova: [['agent', 1], ['agnet', 1], ['bezi', 1], ['bezic', 1], ['pracuj', 1], ['session', 1], ['running', 1], ['working', 1], ['aktivit', 1], ['activity', 1], ['=stav', 1], ['status', 1], ['zasek', 1], ['stuck', 1]],
    cs: 'V Agentech vidíš všechny konverzace a jejich stav – pracuje, čeká na zadání, potřebuje tebe. Některé stavy poznáváme podle poslední aktivity, nikoli přímo od služby; u každého agenta proto vidíš čas a zdroj.',
    en: 'Agents lists every conversation and its status – working, waiting for a task, needs you. Some statuses are inferred from recent activity rather than confirmed by the provider, so each agent shows its time and source.' },
];

// Kmen proti slovům dotazu: [shoda, index slova]. Shoda 1 = začátek slova (nebo celé slovo či
// spojení), 0.8 = s jedním překlepem. Každé slovo dotazu se v jednom záměru počítá jen jednou,
// takže „otevřu“ nesečte „otevř“ i překlep „otevír“.
function shodaKmene(kmen, slova, veta, pouzita, preklep) {
  if (kmen.includes('_')) return !preklep && ` ${veta} `.includes(` ${kmen.replaceAll('_', ' ')}`) ? [1, -1] : [0, -1];
  const presne = kmen.startsWith('=');
  const k = presne ? kmen.slice(1) : kmen;
  const n = k.length;
  for (let i = 0; i < slova.length; i++) {
    if (pouzita.has(i)) continue;
    const w = slova[i];
    if (!preklep && (presne ? w === k : w.startsWith(k))) return [1, i];
    if (preklep && !presne && n >= 6 && w.length >= n - 1 && [n - 1, n, n + 1].some((d) => jedenPreklep(w.slice(0, d), k))) return [0.8, i];
  }
  return [0, -1];
}

function skoreZameru(intent, slova, veta) {
  const pouzita = new Set();
  const trefene = new Set();
  let s = 0;
  for (const preklep of [false, true]) {
    for (const [kmen, vaha] of intent.slova) {
      if (trefene.has(kmen)) continue;
      const [shoda, i] = shodaKmene(kmen, slova, veta, pouzita, preklep);
      if (!shoda) continue;
      s += vaha * shoda;
      trefene.add(kmen);
      if (i >= 0) pouzita.add(i);
    }
  }
  return s;
}

function najdiZamer(veta) {
  // „Agenteeq“ je jméno aplikace, ne slovo „agent“.
  const slova = veta.split(' ').filter((w) => w && w !== 'agenteeq' && w !== 'agenteequ');
  let nejlepsi = null;
  let max = 0;
  for (const intent of intents) {
    const s = skoreZameru(intent, slova, veta);
    if (s > max) { max = s; nejlepsi = intent; }
  }
  return max >= 1 ? nejlepsi : null;
}

// Hledání konkrétní dřívější konverzace řeší server (src/pomocnik.js), ne průvodce.
const HLEDANI_SLOVESO = /\b(najdi|najit|najdes|vyhledej|vyhledat|hledej|hledam|dohledej|find|search|look for)\b/;
const KONVERZACE = /\b(chat(?!gpt)\w*|konverzac\w*|rozhovor\w*|vlakn\w*|thread\w*|conversation\w*|discussion\w*)\b/;
const isSearch = (q) => (HLEDANI_SLOVESO.test(q) && KONVERZACE.test(q))
  || /\b(chat(?!gpt)\w*|konverzac\w*|rozhovor\w*|vlakn\w*|thread\w*|conversation\w*)\b.*\b(o|about|ve kterem|ve ktere|kde jsme|where we|in which)\b/.test(q)
  || /\b(jsme|jsem)\b.*\b(resil\w*|delal\w*|probiral\w*|ladil\w*|psal\w*|mluvil\w*|bavil\w*)\b/.test(q)
  || /\b(we|did we|have we) (discussed|talked|worked|debugged|wrote)\b/.test(q);

// Otázky mimo Agenteeq. Neodpovídáme na ně – ani „pro jistotu“.
const MIMO = [
  ['kod', /^(?!.*\b(sparov\w*|parovac\w*|jednorazov\w*|qr|pin|pair\w*|one time)\b).*\b(napis|napiste|napsat|naprogramuj|vygeneruj|write|generate|code me)\b.*\b(kod\w*|funkc\w*|skript\w*|script\w*|program\w*|code|function\w*|class\w*|sql|regex\w*|email\w*|e-mail\w*|mail\w*|clanek|clanky|basen\w*|esej\w*|essay\w*|poem\w*|story|pribeh\w*|dopis\w*|letter\w*)\b/],
  ['zdravi', /\b(boli|bolest\w*|leky|lek|lekar\w*|doktor\w*|nemoc\w*|horeck\w*|nachlazen\w*|headache|medicine\w*|medication\w*|doctor\w*|symptom\w*|diagnos\w*|fever|pills?)\b/],
  ['obecne', /\b(pocasi|predpoved\w*|weather|forecast\w*|teplot\w*|prsi|snezi|rain\w*)\b|\b(recept\w*|uvar\w*|upec\w*|upect|recipe\w*|cook\w*|bake|baking)\b|^(?!.*\b(aplikac\w*|app|agenteeq|rozhrani|interface)\b).*\b(preloz\w*|translate)\b|\b(vtip\w*|joke\w*|zazpivej|sing)\b|\b(akcie|akcii|investov\w*|invest\w*|bitcoin\w*|krypto\w*|crypto\w*|stocks?|hypotek\w*|mortgage\w*|dane|dani|tax|taxes|pravnik\w*|lawyer\w*|legal advice)\b|\b(kdo je prezident|kdo vyhral|hlavni mesto|capital of|who won|who is the president|president of|prezident\w*|zpravy|news|fotbal\w*|football|hokej\w*|kolik je hodin|what time is it)\b|\d+\s*[+*/x-]\s*\d+/],
];

const OTAZKA = /^(jak|proc|kde|kdy|kdo|co|cim|kolik|jaky|jaka|jake|jakou|muzes|muzu|umis|umi|je|jsou|lze|da se|how|why|where|when|who|what|which|can|could|is|are|do|does|should|will)\b/;
const PROBLEM = /\b(nefung\w*|nejde|chyba|chybu|problem\w*|broken|not working|doesnt work|doesn t work|does not work|error)\b/;

// Slova otázky, která v názvech nastavení nejsou („jak“, „zapnu“…) – hledá se jen podle zbytku.
const VYPLN = new Set('jak kde kam co mam muzu lze se da na v ve o u k s z do pro za po si mi je jsou zapnu zapnout zapnuti vypnu vypnout vypnuti nastavim nastavit nastaveni zmenim zmenit prepnu prepnout skryju skryt zobrazim zobrazit najdu najit funkci funkce moznost moznosti tu tam to ten ta how where do i can enable disable turn on off set change find the a an to is in of my'.split(' '));
const obsahovaSlova = (dotaz) => norm(dotaz).replace(/[?!.,„“"]/g, ' ').split(/\s+/).filter((w) => w && !VYPLN.has(w));

/**
 * „Jak zapnu …“: hledání v rejstříku stránek a nastavení bez výplňových slov. `presne` = všechna
 * slova musí sedět na jeden cíl; jinak se zkusí slova jednotlivě a vezmou se nejlepší shody.
 */
export function poradSNastavenim(dotaz, { presne = false } = {}) {
  const slova = obsahovaSlova(dotaz);
  if (!slova.length) return [];
  let cile = hledejCile(slova.join(' '));
  if (!cile.length && !presne) {
    const mapa = new Map();
    for (const w of slova) for (const c of hledejCile(w)) mapa.set(c.id, { ...c, skore: (mapa.get(c.id)?.skore || 0) + c.skore });
    cile = [...mapa.values()].sort((a, b) => b.skore - a.skore);
  }
  return cile.slice(0, 4);
}

const greetings = /^(ahoj|cau|cus|hello|hi|hey|dobry den)[!. ]*$/;
const appOverview = /\b(?:jak (?:tahle |tato |ta )?(?:app|apka|aplikace|agenteeq) funguje|jak funguje (?:tahle |tato |ta )?(?:app|apka|aplikace|agenteeq)|co (?:je|dela) agenteeq|k cemu (?:je|slouzi) agenteeq|how does (?:this |the )?(?:app|application|agenteeq) work|how (?:do i use|to use) (?:this |the )?(?:app|application|agenteeq)|what does agenteeq do|what is (?:this app|agenteeq))\b/;

function mimoAplikaci(druh, en, cile) {
  const zaklad = en
    ? 'I can’t help with that – I only help with Agenteeq: where to find things in the app, settings, and searching your conversations on this computer. Try “Where do I set a budget?” or “Find the chat about invoices”.'
    : 'S tímhle ti neporadím – pomáhám jen s Agenteeq: kde co v aplikaci najdeš a nastavíš a hledání ve tvých konverzacích na tomto počítači. Zkus třeba „Kde nastavím rozpočet?“ nebo „Najdi chat o fakturaci“.';
  if (druh === 'kod') {
    const prehled = najdiCil({ route: '#/prehled' }, cile);
    return { topic: 'mimo', cile: prehled ? [prehled] : [], text: en
      ? 'I don’t write code or texts – I only help with Agenteeq. Give the task to an agent instead: write it in the Start agent card on the Overview.'
      : 'Kód ani texty nepíšu – pomáhám jen s Agenteeq. Zadání dej agentovi: napiš ho v Přehledu do karty Spustit agenta.' };
  }
  if (druh === 'zdravi') return { topic: 'mimo', cile: [], text: `${zaklad} ${en ? 'For health concerns, please talk to a doctor.' : 'Se zdravotními potížemi se obrať na lékaře.'}` };
  return { topic: 'mimo', cile: [], text: zaklad };
}

export function guideAnswer(question, { previousTopic = null, language = 'cs', route = '', snapshot = null } = {}) {
  const q = norm(question).replace(/[?!.,:;()„“"'’]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!q || isSearch(q)) return null;
  const en = String(language).toLowerCase().startsWith('en');
  if (greetings.test(q)) return { topic: null, cile: [], text: en ? 'Hi! What are you trying to do in Agenteeq? I can help with agents, connections, projects, notifications or costs.' : 'Ahoj! S čím ti můžu pomoct? Můžeme projít propojení nástrojů, práci agentů, projekty i náklady.' };
  if (appOverview.test(q)) {
    let text = en
      ? 'Agenteeq brings activity from connected AI tools together on this computer. The Overview shows which agents are working or waiting for you; open a conversation to see available context and continue in its source tool. Projects group related work across tools. Recorded tokens are activity, not billed costs; billed amounts appear only when a supported provider supplies them.'
      : 'Agenteeq na tomto počítači spojuje aktivitu připojených AI nástrojů. V Přehledu vidíš, kdo pracuje a kdo čeká na tvoje rozhodnutí; v detailu konverzace najdeš dostupný kontext a můžeš pokračovat ve zdrojovém nástroji. Projekty seskupují související práci napříč nástroji. Zaznamenané tokeny nejsou účtované náklady; ty se ukazují jen s podporovanými daty poskytovatele.';
    if (route === 'prehled') text += en ? ' You are on the Overview now; enter a new task in the field below.' : ' Právě jsi v Přehledu; nový úkol zadáš v poli dole.';
    if (snapshot && snapshot.connection !== 'live') text += en ? ' The current live connection is not confirmed, so agent activity may be stale.' : ' Živé spojení teď není potvrzené, takže údaje o agentech nemusí být aktuální.';
    return { topic: 'overview', cile: [], text };
  }
  const cileVse = cileHledani();
  const mimo = MIMO.find(([, re]) => re.test(q));
  if (mimo) return mimoAplikaci(mimo[0], en, cileVse);

  let found = najdiZamer(q);
  if (!found && previousTopic && /^(?:a |tak |kde |jak |co dal|dale|dal|pokracuj|tam|to |then|and |how|where|next|yes|jo|ano)(?:\b|$)/.test(q)) found = intents.find((x) => x.id === previousTopic);
  if (!found && /^(co umis|pomoc|help|what can you do)/.test(q)) return { topic: null, cile: [], text: en ? 'I can explain the app, guide you to a setting and help investigate missing agent activity. What is your goal?' : 'Pomůžu ti zorientovat se v Agenteeq, najít správné nastavení nebo zjistit, proč něco nefunguje. Co právě řešíš?' };
  if (!found) {
    // Otázka bez známého záměru: nejdřív rejstřík stránek a nastavení (všechna slova musí sedět),
    // pak poctivé „nevím“ – nikdy sebejistá smyšlená odpověď.
    const otazka = OTAZKA.test(q) || /\?\s*$/.test(String(question));
    if (!otazka && !PROBLEM.test(q)) return null;
    const cile = poradSNastavenim(q, { presne: true });
    if (cile.length) return { topic: 'nastaveni', cile: cile.slice(0, 3), text: en ? 'Here’s where to find it:' : 'Tady to najdeš:' };
    if (PROBLEM.test(q)) {
      return { topic: null, cile: [], text: en
        ? 'Let’s look into it. Which part of Agenteeq isn’t working, and what exactly do you see? For example the extension, phone access, alerts or the Claude Code connection.'
        : 'Mrkneme na to. Která část Agenteeq nefunguje a co se ti zobrazuje? Třeba rozšíření, telefon, upozornění nebo propojení s Claude Code.' };
    }
    return { topic: 'nevim', cile: [], text: en
      ? 'I don’t have an answer to that, and I won’t make one up. I help with Agenteeq – where to find and set things – and I can find an older conversation on this computer. Try rephrasing, e.g. “Where do I turn on alerts?” or “Find the chat about invoices”.'
      : 'Na tohle odpověď nemám a vymýšlet si ji nebudu. Pomůžu s Agenteeq – kde co najdeš a nastavíš – a najdu tvou starší konverzaci na tomto počítači. Zkus to napsat jinak, třeba „Kde zapnu upozornění?“ nebo „Najdi chat o fakturaci“.' };
  }
  const spec = typeof found.cil === 'function' ? found.cil(q) : found.cil;
  const cil = najdiCil(spec, cileVse);
  const selected = cil ? [cil] : hledejCile(found.id, cileVse).slice(0, 1);
  let text = en ? found.en : found.cs;
  // Diagnose from the already-rendered local snapshot; do not invent provider status.
  if (snapshot && (found.id === 'agents' || found.id === 'sources')) {
    if (snapshot.connection !== 'live') {
      text += en ? ' The live connection is not confirmed; agent activity may be stale. Check whether the desktop backend is reachable.' : ' Teď nemám potvrzené spojení s aplikací. Údaje o agentech tak nemusí být aktuální. Nejdřív ověř, že desktopová aplikace běží.';
    } else if (snapshot.loaded && snapshot.sessions instanceof Map && snapshot.sessions.size === 0) {
      text += en ? ' The current dashboard snapshot contains no sessions. This does not prove the provider has no conversations.' : ' V přehledu teď nevidím žádné zaznamenané konverzace. To ale neznamená, že u poskytovatele žádné nemáš.';
    }
  }
  if (snapshot && found.id === 'update' && typeof snapshot.updates?.currentVersion === 'string' && /^[0-9]+[.][0-9]+[.][0-9]+$/.test(snapshot.updates.currentVersion)) {
    text += en ? ` Installed version reported by this app: ${snapshot.updates.currentVersion}.` : ` Podle aplikace máš nainstalovanou verzi ${snapshot.updates.currentVersion}.`;
  }
  if ((found.id === 'agents' || found.id === 'open') && route === 'agenti') text += en ? ' You are already on the Agents page.' : ' Už jsi na stránce Agenti.';
  return { topic: found.id, text, cile: selected };
}

/**
 * Jediný vstup Pomocníka pro odpovědi bez serveru (public/js/robot-guide.js). „Co na mě čeká?“
 * odpoví ze živého stavu agentů (co-ceka.js); „jak schválím…“ a otázky na nastavení průvodce.
 * Vrací null, když má rozhodnout hledání v konverzacích na serveru. `agenti` = pole nebo funkce.
 */
/** Znalostní báze pro AI pomocníka (src/pomocnik-ai.js): odpovědi průvodce v jazyce rozhraní. */
export function znalostiPruvodce(language = 'cs') {
  const en = language === 'en';
  return intents.map((i) => (en ? i.en : i.cs)).filter((t) => typeof t === 'string');
}

/** Hledá se konkrétní dřívější konverzace? To řeší server (src/pomocnik.js), ne AI. */
export const jeHledaniChatu = (dotaz) => isSearch(norm(dotaz).replace(/[?!.,:;()„“"'’]/g, ' ').replace(/\s+/g, ' ').trim());

export function odpovedPruvodce(dotaz, { agenti = [], snapshot = null, ...ctx } = {}) {
  const rada = guideAnswer(dotaz, { ...ctx, snapshot });
  const q = norm(dotaz);
  if (jeOtazkaNaCekani(dotaz) && !/\b(jak|how)\b/.test(q) && (!rada || rada.topic == null || ['agents', 'decisions', 'nevim'].includes(rada.topic))) {
    const seznam = typeof agenti === 'function' ? agenti() : agenti;
    return { topic: 'cekani', ...coNaMeCeka({ agenti: seznam, nacteno: Boolean(snapshot?.loaded), spojeni: snapshot?.connection }) };
  }
  // „Proč Codex nepracuje?“ – stav konkrétního nástroje ze živého seznamu, odkazy z průvodce.
  const nastroj = nastrojVOtazce(dotaz, typeof agenti === 'function' ? agenti() : agenti);
  if (nastroj) {
    const stav = stavNastroje({ ...nastroj, nacteno: Boolean(snapshot?.loaded), spojeni: snapshot?.connection });
    return { topic: 'stav-nastroje', ...stav, cile: stav.cile?.length ? stav.cile : (rada?.cile || []) };
  }
  return rada;
}
