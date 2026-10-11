// Kontextový průvodce: deterministická a ověřitelná vrstva bez halucinací.
// Konkrétní cíle se odvozují z registru navigace; žádné smyšlené deep links.
import { cileHledani, hledejCile } from './hledani.js';

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const intents = [
  { id: 'extension', pattern: /chrom|rozsiren|extension|prohlizec|browser|webov.*chat/, target: 'karta:extension',
    cs: 'Webové konverzace propojíš přes rozšíření pro Chrome. Otevři Nastavení → Propojení → Rozšíření pro Chrome. Pokud aplikace konverzace nevidí, zkontroluj spárování, otevřenou kartu a stav komunikace. To není autorizace účtu AI služby.',
    en: 'Web conversations are detected by the Chrome extension, not by signing into a provider API. Open Settings → Connections → Chrome Extension. Check pairing, your open tab and connection status.' },
  { id: 'connect', pattern: /pripoj|napoj|integrac|connect|autoriz|login|claude code|codex|nevidim agent/, target: 'karta:models',
    cs: 'Začni v Nastavení → Propojení → Napojené modely. Zkontroluj stav konkrétního nástroje. Lokální CLI, rozšíření a API jsou různé zdroje; ne každý nabízí přímé přihlášení.',
    en: 'Open Settings → Connections → Connected models. Check the individual integration. Local CLI, browser extension and API access are different sources; not all support direct sign-in.' },
  { id: 'alerts', pattern: /upozorn|notifik|oznamen|notification|alert|nerusit|nocni ticho/, target: 'karta:notifications',
    cs: 'Oznámení nastavíš v Nastavení → Upozornění. Pokud nepřicházejí, ověř jejich přepínače a oprávnění operačního systému.',
    en: 'Configure alerts in Settings → Notifications. If they are missing, check both the in-app switches and operating-system permission.' },
  { id: 'costs', pattern: /utrat|naklad|cena|api klic|billing|cost|spend|rozpoc/, target: 'stranka:utrata',
    cs: 'V Útratě najdeš rozpočty i údaje z API. Účtované náklady lze potvrdit jen při dostupném připojení příslušného poskytovatele. Odhady nepovažuj za skutečné faktury.',
    en: 'Spending contains budgets and available API data. Billed costs can only be verified with a supported provider connection. Estimates are not invoices.' },
  { id: 'mobile', pattern: /telefon|mobil|iphone|android|phone|tailscale|vzdalen/, target: 'karta:phone',
    cs: 'Otevři Nastavení → Otevřít na telefonu. Pro přístup mimo místní síť zkontroluj zvlášť Tailscale. Vzdálený přístup zapínej pouze na důvěryhodných zařízeních.',
    en: 'Open Settings → Open on phone. For access outside your local network, configure Tailscale separately and only use trusted devices.' },
  { id: 'update', pattern: /aktualiz|update|upgrade|nova verze|release/, target: 'karta:updates',
    cs: 'Verzi a stav aktualizací ověříš v Nastavení → Aktualizace. Pokud instalace selže, napiš mi zobrazenou chybu; nebudu tvrdit, že aktualizace proběhla.',
    en: 'Check your version in Settings → Updates. If installation fails, share the displayed error. I will not assume the update succeeded.' },
  { id: 'projects', pattern: /projekt|slozk|project|folder/, target: 'stranka:projekty',
    cs: 'Otevři Projekty. Konverzace z různých nástrojů lze seskupit podle práce; nezařazené záznamy najdeš v Nezařazených.',
    en: 'Open Projects to organize conversations across tools. Unassigned activity appears in Unassigned.' },
  { id: 'agents', pattern: /agent|bezi|pracuj|zasek|cekaj|activity|running|stuck|session/, target: 'stranka:agenti',
    cs: 'Otevři Agenty a najdi konkrétní konverzaci. Stav může být odvozený z poslední zaznamenané aktivity, ne z přímého potvrzení služby. Při problému zkontroluj čas poslední aktualizace a zdroj.',
    en: 'Open Agents to inspect the conversation. Its status may be inferred from recent activity rather than confirmed by the provider. Check the timestamp and data source.' },
];
const isSearch = /\b(najdi chat|vyhledej chat|find chat|search conversations?|najdi konverzaci)\b/;
const greetings = /^(ahoj|cau|cus|hello|hi|hey|dobry den)[!. ]*$/;
export function guideAnswer(question, { previousTopic = null, language = 'cs', route = '' } = {}) {
  const q = norm(question).trim();
  if (!q || isSearch.test(q)) return null;
  const en = language === 'en';
  if (greetings.test(q)) return { topic: null, cile: [], text: en ? 'Hi! What are you trying to do in Agenteeq? I can help with agents, connections, projects, notifications or costs.' : 'Ahoj! Co chceš v Agenteeq vyřešit? Poradím s agenty, propojením, projekty, upozorněními i náklady.' };
  let found = intents.find((x) => x.pattern.test(q));
  if (!found && previousTopic && /^(a |tak |kde |jak |co dal|dale|dal|pokracuj|tam|to |then|and |how|where|next|yes|jo|ano)/.test(q)) found = intents.find((x) => x.id === previousTopic);
  if (!found && /^(co umis|pomoc|help|what can you do)/.test(q)) return { topic: null, cile: [], text: en ? 'I can explain the app, guide you to a setting and help investigate missing agent activity. What is your goal?' : 'Umím vysvětlit používání aplikace, navést tě na konkrétní nastavení a pomoci hledat příčinu chybějící aktivity. Co je tvůj cíl?' };
  if (!found && /^(jak|proc|proč|kde|co mam|nejde|nefunguje|pomoz|porad|how|why|where|cannot|doesnt|doesn't)/.test(q)) {
    return { topic: null, cile: [], text: en
      ? 'I can help troubleshoot that. Which part of Agenteeq is involved, and what exactly do you see? I will suggest a verifiable next step.'
      : 'Pomůžu ti najít příčinu. Které části Agenteeq se to týká a co přesně vidíš? Podle toho navrhnu ověřitelný další krok.' };
  }
  if (!found) return null;
  const cile = cileHledani().filter((c) => c.id === found.target);
  const selected = cile.length ? cile : hledejCile(found.id).slice(0, 1);
  let text = en ? found.en : found.cs;
  if (found.id === 'agents' && route === 'agenti') text += en ? ' You are already on the Agents page.' : ' Už jsi na stránce Agenti.';
  return { topic: found.id, text, cile: selected };
}
