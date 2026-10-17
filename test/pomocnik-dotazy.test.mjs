import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { odpovedPruvodce, guideAnswer } from '../public/js/assistant-guide.js';

// Pomocník (issue #255, „Local assistant“): 20 nejčastějších úkolů uživatele Agenteeq, česky
// i anglicky, s překlepy a bez diakritiky. Odpověď musí mít správné téma, vést odkazem na místo,
// které v aplikaci opravdu existuje, a nesmí slibovat, co aplikace neumí. Otázky mimo aplikaci
// dostanou poctivé „s tím neporadím“ a další krok – nikdy sebejistou vymyšlenou odpověď.
// Odpovídá se deterministicky, bez placeného API a bez serveru.

const ZIVY = { connection: 'live', loaded: true, sessions: new Map([['a', { id: 'a' }]]) };
const zeptej = (dotaz, language) => odpovedPruvodce(dotaz, { language, snapshot: ZIVY, agenti: [] });

// Tvrzení, která by byla nepravdivá v jakékoli odpovědi.
const NIKDY = [
  /Agenteeq (ho |to |je |za tebe )?(schválí|povolí)\b/i,
  /\bAgenteeq (will )?approves?\b|approve (it |them )?(directly |right )?(in|from) Agenteeq/i,
  /(posílá|odesílá|nahrává) (tvoje |tvé )?(konverzace|přepisy|kód) do cloudu/i,
  /\b(we|Agenteeq) (sends?|uploads?) (your )?(conversations|transcripts|code)\b/i,
  /(bez účtu|account is) (nefunguje|required)|requires an account|účet je (nutný|potřeba)/i,
  /skutečně účtované (částky|náklady) (vidíš|uvidíš) vždy|always shows? (the )?billed/i,
  /přihlásí tě (do|k) (ChatGPT|Claude|Codex)|signs? you in to (ChatGPT|Claude|Codex)/i,
];

const DOTAZY = [
  { id: 'agents', cil: { route: '#/agenti' },
    cs: ['Co právě dělají moji agenti?', 'kde vidim bezici agenty', 'Kterí agenti ted pracujou?'],
    en: ['What are my agents doing right now?', 'where can i see runing agents', 'which agnets are working'] },
  { id: 'decisions', cil: { route: '#/prehled', region: 'decisions' },
    cs: ['Agent chce povolení, jak ho schválím?', 'jak schvalim opravneni agentovi', 'Kde potvrdím rozhodnutí agenta?'],
    en: ['An agent is asking for permission, how do I approve it?', 'how to aprove permision request'],
    musi: { cs: /v nástroji, kde agent běží/, en: /in the tool where the agent runs/ } },
  { id: 'open', cil: { route: '#/agenti' },
    cs: ['Jak otevřu konverzaci a pokračuju v ní?', 'jak navazu na starou konverzaci v terminalu', 'kde otevru prepis agenta'],
    en: ['How do I open a conversation and continue it?', 'how to resume a sesion in terminal'] },
  { id: 'launch', cil: { route: '#/prehled' },
    cs: ['Jak spustím nového agenta?', 'jak zadam novy ukol agentovi', 'Chci spustit agenta na pozadí'],
    en: ['How do I start a new agent?', 'how to lanch a new task'] },
  { id: 'limits', cil: { route: '#/prehled', region: 'limits' },
    cs: ['Kolik mi zbývá z limitu?', 'kdy se obnovi tydenni limit', 'dosel mi limt v claude'],
    en: ['How much of my usage limit is left?', 'when does my weekly limit reset'],
    musi: { cs: /ChatGPT Agenteeq přečíst nemá odkud/, en: /no way to read the ChatGPT/ } },
  { id: 'costs', cil: { route: '#/utrata' },
    cs: ['Kolik jsem utratil za API?', 'kolik me stoji claude', 'kde vidim naklady'],
    en: ['How much have I spent on the API?', 'where do i see my costs'],
    musi: { cs: /Odhad není faktura/, en: /estimate isn’t an invoice/ } },
  { id: 'budget', cil: { route: '#/utrata', region: 'budgets' },
    cs: ['Jak nastavím měsíční rozpočet?', 'chci si dat rozpocet na api', 'nastavit rospocet'],
    en: ['How do I set a monthly budget?', 'set a budjet'] },
  { id: 'projects', cil: { route: '#/projekty' },
    cs: ['Jak založím projekt?', 'jak priradim konverzaci k projektu', 'Kde jsou nezařazené konverzace?'],
    en: ['How do I create a project?', 'how to group chats into projets'] },
  { id: 'skills', cil: { route: '#/dovednosti' },
    cs: ['Kde najdu dovednosti?', 'jaky mam skills', 'kde jsou slash prikazy'],
    en: ['Where can I find my skills?', 'list of slash comands'] },
  { id: 'extension', cil: { karta: 'extension' },
    cs: ['Jak spáruju rozšíření pro Chrome?', 'rozsireni v chromu nefunguje', 'jak sledovat chatgpt v prohlizeci'],
    en: ['How do I pair the Chrome extension?', 'chrome extention not working'] },
  { id: 'mobile', cil: { karta: 'phone' },
    cs: ['Jak připojím telefon přes QR kód?', 'jak otevru agenteeq na mobilu', 'sparovat iphone'],
    en: ['How do I pair my phone with the QR code?', 'open on my iphone'] },
  { id: 'update', cil: { karta: 'updates' },
    cs: ['Jak přepnu na Preview verzi?', 'jak aktualizovat aplikaci', 'mam nejnovejsi verzi?'],
    en: ['How do I switch to the Preview channel?', 'how to updat the app'],
    musi: { cs: /Stabilní.*Preview/, en: /Stable.*Preview/ } },
  { id: 'account', cil: { karta: 'account' },
    cs: ['Jak se odhlásím z účtu?', 'jak se prihlasim do agenteeq', 'co se synchronizuje do uctu'],
    en: ['How do I sign out of my account?', 'how do i log in to agenteeq'],
    musi: { cs: /nikdy text konverzací/, en: /never conversation text/ } },
  { id: 'alerts', cil: { karta: 'notifications' },
    cs: ['Proč mi nechodí oznámení?', 'nechodi mi upozorneni', 'zvuk upozorneni'],
    en: ['Why am I not getting notifications?', 'alerts dont work'] },
  { id: 'hooks', cil: { karta: 'claude' },
    cs: ['Jak propojím Claude Code?', 'jak nainstalovat hooky', 'nefungujou mi hooky'],
    en: ['How do I connect Claude Code hooks?', 'claude code hooks not working'] },
  { id: 'codex', cil: { karta: 'connectors' },
    cs: ['Proč nevidím Codex?', 'funguje to s codexem?', 'kodex se neukazuje'],
    en: ['Does it work with Codex?', 'codex sessions missing'],
    musi: { cs: /nic se nepropojuje/, en: /nothing to connect/ } },
  { id: 'privacy', cil: { karta: 'privacy' },
    cs: ['Posílá Agenteeq moje konverzace někam?', 'jsou moje data v bezpeci', 'co opousti muj pocitac'],
    en: ['Does my data leave my computer?', 'is it privat and secure'],
    musi: { cs: /nikam je neposílá/, en: /sends them nowhere/ } },
  { id: 'appearance', cil: { karta: 'appearance' },
    cs: ['Jak zapnu tmavý režim?', 'zmenit vzhled aplikace', 'svetly motiv'],
    en: ['How do I turn on dark mode?', 'change the theme'] },
  { id: 'language', cil: { karta: 'language' },
    cs: ['Jak přepnu aplikaci do angličtiny?', 'zmena jazyka', 'chci cestinu'],
    en: ['How do I change the language?', 'switch app to czech'] },
  { id: 'sources', cil: { karta: 'connectors' },
    cs: ['Proč nevidím svého agenta?', 'Cursor se mi neukazuje', 'nezobrazuje se mi gemini cli'],
    en: ['Why is my agent missing?', 'cursor not detected'] },
];

// Skutečná místa v aplikaci: cesty z routeru, karty a přepínače Nastavení, sekce stránek.
const zdroj = (soubor) => fs.readFile(new URL(`../public/js/${soubor}`, import.meta.url), 'utf8');
const appJs = await zdroj('app.js');
const nastaveni = await zdroj('views/settings.js');
const POHLED = { prehled: 'overview', agenti: 'agents', statistiky: 'stats', utrata: 'spend', projekty: 'projects', dovednosti: 'skills', nastaveni: 'settings', upozorneni: 'alerts' };
const routy = [...appJs.matchAll(/\[\/\^(.+?)\$\/, \w+\]/g)].map((m) => new RegExp(`^${m[1]}$`));
const kartyNastaveni = new Set([...nastaveni.matchAll(/\['set-[a-z]+', [^\]]+?\[([^\]]+)\]\]/g)].flatMap((m) => [...m[1].matchAll(/'([a-z-]+)'/g)].map((x) => x[1])));

async function overOdkaz(c, kontext) {
  assert.ok(c && typeof c.route === 'string', `${kontext}: chybí odkaz`);
  assert.ok(c.label, `${kontext}: odkaz bez popisku`);
  const cesta = c.route.replace(/^#/, '').split('?')[0];
  assert.ok(routy.some((re) => re.test(cesta)), `${kontext}: cesta ${c.route} v routeru není`);
  if (c.karta) assert.ok(kartyNastaveni.has(c.karta), `${kontext}: karta ${c.karta} v Nastavení není`);
  if (c.prepinac) assert.ok(nastaveni.includes(`key: '${c.prepinac}'`), `${kontext}: přepínač ${c.prepinac} v Nastavení není`);
  if (c.region) {
    const pohled = POHLED[cesta.slice(1)];
    assert.ok(pohled, `${kontext}: sekce na stránce bez pohledu ${c.route}`);
    assert.ok((await zdroj(`views/${pohled}.js`)).includes(`data-region="${c.region}"`), `${kontext}: sekce ${c.region} na ${c.route} není`);
  }
}

test('pomocník: sada má 20 záměrů, každý česky i anglicky a s překlepem nebo bez diakritiky', () => {
  assert.equal(DOTAZY.length, 20);
  assert.equal(new Set(DOTAZY.map((d) => d.id)).size, 20);
  for (const d of DOTAZY) {
    assert.ok(d.cs.length >= 2 && d.en.length >= 2, d.id);
    assert.ok(d.cs.some((q) => q === q.normalize('NFD').replace(/[̀-ͯ]/g, '')), `${d.id}: chybí dotaz bez diakritiky`);
  }
});

for (const d of DOTAZY) {
  test(`pomocník: ${d.id} – správné téma, funkční odkaz, pravdivý text (CZ i EN)`, async () => {
    for (const [jazyk, dotazy] of [['cs-CZ', d.cs], ['en-GB', d.en]]) {
      const en = jazyk.startsWith('en');
      for (const dotaz of dotazy) {
        const r = zeptej(dotaz, jazyk);
        assert.ok(r, `„${dotaz}“: žádná odpověď (šlo by do hledání v konverzacích)`);
        assert.equal(r.topic, d.id, `„${dotaz}“ → ${r.topic}`);
        assert.ok(r.cile?.length, `„${dotaz}“: odpověď bez odkazu do aplikace`);
        const [c] = r.cile;
        for (const [k, v] of Object.entries(d.cil)) assert.equal(c[k], v, `„${dotaz}“: odkaz ${k}=${c[k]}, čekal jsem ${v}`);
        await overOdkaz(c, `„${dotaz}“`);
        if (en) assert.doesNotMatch(r.text, /[ěščřžýáíéůúňťď]/i, `„${dotaz}“: anglická odpověď obsahuje češtinu`);
        else assert.doesNotMatch(r.text, /\b(Settings|the|you)\b/, `„${dotaz}“: česká odpověď obsahuje angličtinu`);
        if (d.musi) assert.match(r.text, en ? d.musi.en : d.musi.cs, `„${dotaz}“: chybí poctivé omezení`);
        for (const re of NIKDY) assert.doesNotMatch(r.text, re, `„${dotaz}“: nepravdivé tvrzení`);
        assert.ok(r.text.length <= 420, `„${dotaz}“: odpověď je moc dlouhá (${r.text.length})`);
      }
    }
  });
}

test('pomocník: upozornění na telefon a noční ticho vedou rovnou na přepínač', async () => {
  const tel = zeptej('Jak zapnu upozornění na telefon?', 'cs-CZ');
  assert.equal(tel.topic, 'alerts');
  assert.equal(tel.cile[0].prepinac, 'push-telefon');
  const noc = zeptej('jak vypnu notifikace v noci', 'cs-CZ');
  assert.equal(noc.cile[0].prepinac, 'quietHours');
  await overOdkaz(tel.cile[0], 'telefon');
  await overOdkaz(noc.cile[0], 'noc');
  assert.equal(zeptej('Jak se dostanu k Agenteeq přes Tailscale?', 'cs-CZ').cile[0].karta, 'tailscale');
});

test('pomocník: nastavení mimo hlavní záměry najde v rejstříku (spouštění po přihlášení)', async () => {
  const r = zeptej('Jak zapnu spouštění po přihlášení?', 'cs-CZ');
  assert.equal(r.topic, 'system');
  assert.equal(r.cile[0].karta, 'system');
  await overOdkaz(r.cile[0], 'system');
});

const MIMO = [
  ['Jaké bude zítra počasí?', 'cs-CZ'], ['jaky bude zitra pocasi', 'cs-CZ'], ["What's the weather tomorrow?", 'en-GB'],
  ['Bolí mě hlava, co si mám vzít?', 'cs-CZ'], ['I have a headache, what medicine should I take?', 'en-GB'],
  ['Kdo je prezident USA?', 'cs-CZ'], ['Tell me a joke', 'en-GB'], ['Do jakých akcií mám investovat?', 'cs-CZ'],
  ['recept na svíčkovou', 'cs-CZ'], ['kolik je 12*7', 'cs-CZ'], ['Přelož mi tuhle větu do němčiny', 'cs-CZ'],
];

test('pomocník: otázky mimo Agenteeq – poctivě „s tím neporadím“ a další krok, žádná vymyšlená odpověď', () => {
  for (const [dotaz, jazyk] of MIMO) {
    const r = zeptej(dotaz, jazyk);
    assert.ok(r, `„${dotaz}“: bez odpovědi by šel do hledání v konverzacích a tvářil se, že hledá`);
    assert.equal(r.topic, 'mimo', `„${dotaz}“ → ${r.topic}`);
    assert.match(r.text, jazyk === 'en-GB' ? /only help with Agenteeq/ : /pomáhám jen s Agenteeq/, dotaz);
    assert.match(r.text, jazyk === 'en-GB' ? /Try “/ : /Zkus třeba „/, `„${dotaz}“: chybí další krok`);
    assert.doesNotMatch(r.text, /°|\d+ ?%|ibuprofen|paralen|ibalgin|\b84\b|```/i, `„${dotaz}“: vypadá jako věcná odpověď`);
  }
  for (const [dotaz, jazyk] of [['Bolí mě hlava, co si mám vzít?', 'cs-CZ'], ['I have a headache, what medicine should I take?', 'en-GB']]) {
    assert.match(zeptej(dotaz, jazyk).text, /lékař|doctor/, 'zdraví → odkaz na lékaře');
  }
});

test('pomocník: „napiš mi kód“ odmítne a pošle zadání agentovi přes Spustit agenta', async () => {
  for (const [dotaz, jazyk] of [['Napiš mi funkci v Pythonu na řazení', 'cs-CZ'], ['napis mi skript na zalohu', 'cs-CZ'], ['Write me a Python script', 'en-GB']]) {
    const r = zeptej(dotaz, jazyk);
    assert.equal(r.topic, 'mimo', dotaz);
    assert.match(r.text, jazyk === 'en-GB' ? /don’t write code.*Start agent/ : /Kód ani texty nepíšu.*Spustit agenta/, dotaz);
    assert.doesNotMatch(r.text, /def |function\s*\(|```/);
    assert.equal(r.cile[0].route, '#/prehled');
    await overOdkaz(r.cile[0], dotaz);
  }
  // Jednorázový kód pro spárování není psaní kódu.
  assert.equal(zeptej('Vygeneruj mi jednorázový kód pro rozšíření', 'cs-CZ').topic, 'extension');
  assert.equal(zeptej('How do I translate the app to English?', 'en-GB').topic, 'language');
});

test('pomocník: neznámá otázka = „nevím“ bez vymýšlení; hledání konverzací zůstává serveru', () => {
  for (const [dotaz, jazyk] of [['Proč je obloha modrá?', 'cs-CZ'], ['Jak upéct chleba bez droždí?', 'cs-CZ'], ['asdf qwer?', 'cs-CZ'], ['What is the meaning of life?', 'en-GB']]) {
    const r = zeptej(dotaz, jazyk);
    assert.ok(r && ['mimo', 'nevim'].includes(r.topic), `„${dotaz}“ → ${r?.topic}`);
    assert.match(r.text, /odpověď nemám|neporadím|don’t have an answer|can’t help/, dotaz);
    assert.match(r.text, /Zkus|Try/, `„${dotaz}“: chybí další krok`);
    assert.deepEqual(r.cile, [], `„${dotaz}“: náhodný odkaz místo poctivého „nevím“`);
  }
  // Tyhle patří hledání v konverzacích na serveru (src/pomocnik.js) – průvodce je nesmí zachytit.
  for (const dotaz of ['Najdi chat, kde jsme před cca 3 měsíci řešili fakturaci', 'fakturace', 'v Codexu minulý týden jsme ladili ledger', 'Find the chat about stripe webhooks', 'kde je ta konverzace o rozpočtu klienta']) {
    assert.equal(guideAnswer(dotaz, { language: 'cs-CZ' }), null, dotaz);
  }
});

test('pomocník: „co na mě čeká?“ odpoví ze živého stavu, „jak schválím“ průvodce', () => {
  const agenti = [{ id: 'claude-code:1', status: 'needs_input', title: 'Refaktor', app: 'Claude Code', lastAt: 1 }];
  const live = odpovedPruvodce('Co na mě čeká?', { language: 'cs-CZ', snapshot: ZIVY, agenti: () => agenti });
  assert.equal(live.topic, 'cekani');
  assert.equal(live.vysledky[0].sessionId, 'claude-code:1');
  const nenacteno = odpovedPruvodce('Kdo čeká na moje rozhodnutí?', { language: 'cs-CZ', snapshot: { connection: 'connecting', loaded: false }, agenti: [] });
  assert.match(nenacteno.text, /nepodařilo zjistit/, 'nenačtený stav ≠ „nic nečeká“');
  assert.equal(odpovedPruvodce('Kdo na mě čeká a jak to schválím?', { language: 'cs-CZ', snapshot: ZIVY, agenti }).topic, 'decisions');
  assert.equal(odpovedPruvodce('claude code neukazuje, že čeká na povolení – hooky', { language: 'cs-CZ', snapshot: ZIVY, agenti }).topic, 'hooks');
});
