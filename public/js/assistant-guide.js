// Kontextový průvodce: deterministická a ověřitelná vrstva bez halucinací.
// Konkrétní cíle se odvozují z registru navigace; žádné smyšlené deep links.
import { cileHledani, hledejCile } from './hledani.js';

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const intents = [
  { id: 'extension', pattern: /chrom|rozsiren|extension|prohlizec|browser|webov.*chat/, target: 'karta:extension',
    cs: 'Webové chaty uvidíš díky rozšíření pro Chrome. Najdeš ho v Nastavení → Propojení → Rozšíření pro Chrome. Pokud se chat neukazuje, ověř, jestli je rozšíření spárované a stránka otevřená. Přihlášení k účtu AI služby je něco jiného.',
    en: 'Web conversations are detected by the Chrome extension, not by signing into a provider API. Open Settings → Connections → Chrome Extension. Check pairing, your open tab and connection status.' },
  { id: 'connect', pattern: /pripoj|napoj|integrac|connect|autoriz|login|claude code|codex/, target: 'karta:models',
    cs: 'Podívej se do Nastavení → Propojení → Napojené modely. U každého nástroje uvidíš, co Agenteeq dokáže zjistit. Claude Code, webové chaty a API se propojují různě — ne všude stačí kliknout na Připojit.',
    en: 'Open Settings → Connections → Connected models. Check the individual integration. Local CLI, browser extension and API access are different sources; not all support direct sign-in.' },
  { id: 'alerts', pattern: /upozorn|notifik|oznamen|notification|alert|nerusit|nocni ticho/, target: 'karta:notifications',
    cs: 'Oznámení najdeš v Nastavení → Upozornění. Nechodí? Zkontroluj, jestli jsou zapnutá v Agenteeq i v nastavení systému.',
    en: 'Configure alerts in Settings → Notifications. If they are missing, check both the in-app switches and operating-system permission.' },
  { id: 'costs', pattern: /utrat|naklad|cena|api klic|billing|cost|spend|rozpoc/, target: 'stranka:utrata',
    cs: 'V Útratě uvidíš rozpočty a dostupné údaje z API. Skutečně účtované částky ale můžeme potvrdit jen tam, kde máme data od poskytovatele. Odhad není faktura.',
    en: 'Spending contains budgets and available API data. Billed costs can only be verified with a supported provider connection. Estimates are not invoices.' },
  { id: 'mobile', pattern: /telefon|mobil|iphone|android|phone|tailscale|vzdalen/, target: 'karta:phone',
    cs: 'Chceš Agenteeq i na telefonu? Otevři Nastavení → Otevřít na telefonu. Mimo domácí síť můžeš použít Tailscale. Přístup povoluj jen zařízením, kterým věříš.',
    en: 'Open Settings → Open on phone. For access outside your local network, configure Tailscale separately and only use trusted devices.' },
  { id: 'update', pattern: /aktualiz|update|upgrade|nova verze|release/, target: 'karta:updates',
    cs: 'V Nastavení → Aktualizace zjistíš, jakou verzi máš a zda je dostupná nová. Pokud aktualizace selže, napiš mi, co se zobrazuje. Bez potvrzení ti neřeknu, že je hotovo.',
    en: 'Check your version in Settings → Updates. If installation fails, share the displayed error. I will not assume the update succeeded.' },
  { id: 'projects', pattern: /projekt|slozk|project|folder/, target: 'stranka:projekty',
    cs: 'V Projektech si dáš dohromady konverzace, které patří ke stejné práci — i když vznikly v různých nástrojích. Co zatím nikam nepatří, najdeš v Nezařazených.',
    en: 'Open Projects to organize conversations across tools. Unassigned activity appears in Unassigned.' },
  { id: 'agents', pattern: /agent|bezi|pracuj|zasek|cekaj|activity|running|stuck|session/, target: 'stranka:agenti',
    cs: 'V Agentech otevři konverzaci, která tě zajímá. Pozor: některé stavy poznáváme podle poslední aktivity, nikoli přímo od služby. Pokud něco nesedí, podívej se na čas aktualizace a zdroj dat.',
    en: 'Open Agents to inspect the conversation. Its status may be inferred from recent activity rather than confirmed by the provider. Check the timestamp and data source.' },
];
const isSearch = /\b(najdi chat|vyhledej chat|find chat|search conversations?|najdi konverzaci)\b/;
const greetings = /^(ahoj|cau|cus|hello|hi|hey|dobry den)[!. ]*$/;
const appOverview = /\b(?:jak (?:tahle |tato |ta )?(?:app|apka|aplikace|agenteeq) funguje|jak funguje (?:tahle |tato |ta )?(?:app|apka|aplikace|agenteeq)|co (?:je|dela) agenteeq|k cemu (?:je|slouzi) agenteeq|how does (?:this |the )?(?:app|application|agenteeq) work|how (?:do i use|to use) (?:this |the )?(?:app|application|agenteeq)|what does agenteeq do|what is (?:this app|agenteeq))\b/;
export function guideAnswer(question, { previousTopic = null, language = 'cs', route = '', snapshot = null } = {}) {
  const q = norm(question).trim();
  if (!q || isSearch.test(q)) return null;
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
  let found = intents.find((x) => x.pattern.test(q));
  if (!found && previousTopic && /^(?:a |tak |kde |jak |co dal|dale|dal|pokracuj|tam|to |then|and |how|where|next|yes|jo|ano)(?:\b|$)/.test(q)) found = intents.find((x) => x.id === previousTopic);
  if (!found && /^(co umis|pomoc|help|what can you do)/.test(q)) return { topic: null, cile: [], text: en ? 'I can explain the app, guide you to a setting and help investigate missing agent activity. What is your goal?' : 'Pomůžu ti zorientovat se v Agenteeq, najít správné nastavení nebo zjistit, proč něco nefunguje. Co právě řešíš?' };
  if (!found && /^(jak|proc|proč|kde|co mam|nejde|nefunguje|pomoz|porad|how|why|where|cannot|doesnt|doesn't)/.test(q)) {
    return { topic: null, cile: [], text: en
      ? 'I can help troubleshoot that. Which part of Agenteeq is involved, and what exactly do you see? I will suggest a verifiable next step.'
      : 'Mrkneme na to. Kde ses zasekl a co se ti zobrazuje? Podle toho zjistíme, co zkontrolovat jako první.' };
  }
  if (!found) return null;
  const cile = cileHledani().filter((c) => c.id === found.target);
  const selected = cile.length ? cile : hledejCile(found.id).slice(0, 1);
  let text = en ? found.en : found.cs;
  // Diagnose from the already-rendered local snapshot; do not invent provider status.
  if (snapshot && found.id === 'agents') {
    if (snapshot.connection !== 'live') {
      text += en ? ' The live connection is not confirmed; agent activity may be stale. Check whether the desktop backend is reachable.' : ' Teď nemám potvrzené spojení s aplikací. Údaje o agentech tak nemusí být aktuální. Nejdřív ověř, že desktopová aplikace běží.';
    } else if (snapshot.loaded && snapshot.sessions instanceof Map && snapshot.sessions.size === 0) {
      text += en ? ' The current dashboard snapshot contains no sessions. This does not prove the provider has no conversations.' : ' V přehledu teď nevidím žádné zaznamenané konverzace. To ale neznamená, že u poskytovatele žádné nemáš.';
    }
  }
  if (snapshot && found.id === 'update' && typeof snapshot.updates?.currentVersion === 'string' && /^[0-9]+[.][0-9]+[.][0-9]+$/.test(snapshot.updates.currentVersion)) {
    text += en ? ` Installed version reported by this app: ${snapshot.updates.currentVersion}.` : ` Podle aplikace máš nainstalovanou verzi ${snapshot.updates.currentVersion}.`;
  }
  if (found.id === 'agents' && route === 'agenti') text += en ? ' You are already on the Agents page.' : ' Už jsi na stránce Agenti.';
  return { topic: found.id, text, cile: selected };
}
