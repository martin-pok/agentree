// Okno rozšíření (schválený návrh „Jedna hlavní věc“, docs/DESIGN.md): nahoře skleněný reflektor
// s tím, co tě teď potřebuje, pod ním časová osa „Co se děje“ – agenti z aplikace, poslední
// konverzace napříč nástroji a chaty otevřené v kartách. Text zpráv tu nikde není: okno ukazuje
// jen stav, časy, počty a titulky (viz content.js, background.js a POST /api/extension/prehled).
const SITES = [
  ['chatgpt', 'ChatGPT', 'openai'],
  ['codex-web', 'Codex na webu', 'codex'],
  ['claude', 'Claude.ai', 'claude'],
  ['gemini', 'Gemini', 'gemini'],
  ['mscopilot', 'Microsoft Copilot', 'copilot'],
  ['perplexity', 'Perplexity', 'perplexity'],
  ['grok', 'Grok', 'grok'],
  ['qwen', 'Qwen Chat', 'qwen'],
  ['github-copilot', 'GitHub Copilot', 'githubcopilot'],
];
// Loga, která jsou černá a v tmavém režimu se obracejí do světlé.
const MONO = new Set(['openai', 'grok', 'githubcopilot', 'cursor', 'ollama', 'lmstudio', 'windsurf', 'zed', 'goose', 'opencode']);
// Logo nástroje podle názvu aplikace, jak ho hlásí Agenteeq (tatáž loga jako public/js/icons.js).
const LOGO_APLIKACE = [[/antigravity/i, 'antigravity'], [/claude/i, 'claude'], [/codex/i, 'codex'], [/chatgpt|openai/i, 'openai'],
  [/cursor/i, 'cursor'], [/gemini/i, 'gemini'], [/microsoft copilot/i, 'copilot'], [/copilot|vs ?code/i, 'githubcopilot'],
  [/perplexity/i, 'perplexity'], [/grok/i, 'grok'], [/qwen/i, 'qwen'], [/ollama/i, 'ollama'], [/lm ?studio/i, 'lmstudio'],
  [/warp/i, 'warp'], [/windsurf/i, 'windsurf'], [/kiro/i, 'kiro'], [/\bzed\b/i, 'zed'], [/goose/i, 'goose'], [/opencode/i, 'opencode']];
// Webové aplikace, jak je pojmenovává aplikace (src/connectors/web.js): jejich konverzace jsou „chaty“.
const WEBOVE_APLIKACE = new Set(['ChatGPT', 'Codex · web', 'Claude.ai', 'Gemini', 'Microsoft Copilot', 'Perplexity', 'Grok', 'Qwen Chat', 'GitHub Copilot']);
// Adresa aplikace: výchozí port 4620, jiný se nastaví v listu Sledované služby a port.
// Port mimo výchozí potřebuje volitelné oprávnění pro 127.0.0.1 (manifest, optional_host_permissions).
const VYCHOZI_PORT = 4620;
const platnyPort = (p) => Number.isInteger(p) && p >= 1024 && p <= 65535;
let APLIKACE = `http://127.0.0.1:${VYCHOZI_PORT}/`;
const WEB = 'https://agentree-fawn.vercel.app/';
// Background zapomene kartu, která přes 150 s mlčí (hlásí se nejpozději po minutě).
const OTEVRENA_MS = 150e3;

const $ = (id) => document.getElementById(id);
// Texty jsou česky a tr() je v angličtině přeloží (i18n.js); mnozne() volí tvar podle počtu.
const { tr, mnozne, jazyk, LOCALE, prelozStranku } = window.AgenteeqI18n;
// Česká sazba: jednopísmenná předložka nebo spojka (v, k, s, z, o, u, a, i) nezůstane na konci řádku.
const sazba = (text) => (jazyk() === 'cs' ? String(text).replace(/(?<=^|\s)([vkszouaiVKSZOUAI]) (?=\S)/g, '$1 ') : String(text));
// Každý dynamický text v HTML jde přes esc() – titulky konverzací jsou nedůvěryhodný vstup.
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const sluzba = (id) => SITES.find(([s]) => s === id);
const nazevSluzby = (id) => tr((sluzba(id) || [id, id])[1]);
const el = (tag, trida, text) => {
  const e = document.createElement(tag);
  if (trida) e.className = trida;
  if (text !== undefined) e.textContent = text;
  return e;
};
const omezitPohyb = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

// Zastaralé, chybějící nebo časově nesmyslné události nepředstírají živý stav.
// Čas z lokálního zdroje je v ms; čísla v sekundách a skok hodin dopředu odmítáme.
function validniCas(at, now = Date.now()) {
  return typeof at === 'number' && Number.isFinite(at) && at > 1e12 && at <= now + 60e3;
}
function ago(at) {
  if (!validniCas(at)) return '—';
  const s = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (s < 3600) return tr('před {0} min', Math.max(1, Math.round(s / 60)));
  if (s < 86400) return tr('před {0} h', Math.round(s / 3600));
  return new Date(at).toLocaleDateString(LOCALE);
}
// Jak dlouho agent odpovídá: 0:42, 3:05, 1:02:10.
function trvani(od) {
  if (!validniCas(od)) return '—';
  const s = Math.max(0, Math.floor((Date.now() - od) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
// Krátký čas v pravém sloupci osy: „teď“, „5 min“, „2 h“, „včera“, jinak datum.
function cas(at) {
  const now = Date.now();
  if (!validniCas(at, now)) return '—';
  const s = Math.max(0, Math.floor((now - at) / 1000));
  if (s < 60) return tr('teď');
  if (s < 3600) return tr('{0} min', Math.max(1, Math.round(s / 60)));
  const d = new Date(at);
  const dnes = new Date(now);
  if (d.toDateString() === dnes.toDateString()) return tr('{0} h', Math.round(s / 3600));
  const vcera = new Date(now - 86400e3);
  if (d.toDateString() === vcera.toDateString()) return tr('včera');
  return d.toLocaleDateString(LOCALE, { day: 'numeric', month: 'numeric' });
}

function logo(img, klic) {
  img.src = `logos/${klic}.svg`;
  img.alt = '';
  img.classList.toggle('logo--mono', MONO.has(klic));
}
function logoKlic(app) {
  const hit = LOGO_APLIKACE.find(([re]) => re.test(String(app || '')));
  return hit ? hit[1] : null;
}

// Ikony rozhraní (vlastní kresba v mřížce 24 px, tah 1,75).
const IKONY = {
  terminal: '<path d="m4 17 6-6-6-6M12 19h8"/>',
  web: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z"/>',
  ruka: '<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11m0-1V4.5a1.5 1.5 0 0 1 3 0V11m0-4.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-.5a6 6 0 0 1-4.6-2.2L3.4 15.6a1.6 1.6 0 0 1 2.4-2.1L8 15.5"/>',
  zamek: '<rect x="5" y="11" width="14" height="10" rx="3"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  otazka: '<path d="M21 12a8.5 8.5 0 0 1-12.4 7.6L3 21l1.4-5.1A8.5 8.5 0 1 1 21 12Z"/><path d="M9.8 9.6a2.3 2.3 0 0 1 4.4.8c0 1.5-2.2 2-2.2 3.2M12 16.6h.01"/>',
  limit: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M10 2h4"/>',
  chyba: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5M12 16.5h.01"/>',
  sipka: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  chev: '<path d="m9 18 6-6-6-6"/>',
};
const ikona = (n, trida = '') => `<svg class="ico ${trida}" viewBox="0 0 24 24" aria-hidden="true">${IKONY[n]}</svg>`;
const logoHtml = (klic, px = 22, druh = 'agent') => (klic
  ? `<img src="logos/${klic}.svg" width="${px}" height="${px}" alt=""${MONO.has(klic) ? ' class="logo--mono"' : ''} draggable="false">`
  : ikona(druh === 'chat' ? 'web' : 'terminal'));
// Malý robot: stejná hlava jako logo (public/brand/agenteeq-dock.svg).
const ROBOT = '<svg viewBox="0 0 108 108" fill="none" aria-hidden="true"><path class="ant" d="M54 25V34" stroke-width="5" stroke-linecap="round"/><circle class="ant-svetlo" cx="54" cy="22" r="4"/><rect class="hlava" x="15" y="34" width="78" height="53" rx="20"/><rect class="oko" x="36" y="52" width="8" height="16" rx="4"/><rect class="oko" x="64" y="52" width="8" height="16" rx="4"/></svg>';

async function vypnute() {
  const { disabledSites = [] } = await chrome.storage.local.get(['disabledSites']);
  return disabledSites;
}

// ── Oznámení ────────────────────────────────────────────────────────────────
let toastCasovac;
function toast(text) {
  const t = $('toast');
  t.querySelector('span').textContent = sazba(text);
  t.classList.add('ukaz');
  clearTimeout(toastCasovac);
  toastCasovac = setTimeout(() => t.classList.remove('ukaz'), 3200);
}
// Změny pro čtečku obrazovky (nová položka, vyřešené rozhodnutí) – zdvořile, bez přerušení.
function ohlas(text) {
  const a = $('announce');
  a.textContent = '';
  setTimeout(() => { a.textContent = sazba(text); }, 30);
}

// ── Listy: sledované služby a ověření stránky ───────────────────────────────
// Dialog nad oknem s pastí zaostření; Esc a „Zavřít“ vrátí zaostření tam, odkud list otevřel.
let otevrel = null;
function ukaz(pohled) {
  const list = { sluzby: $('view-sluzby'), overeni: $('view-overeni') };
  if (pohled !== 'hlavni' && document.body.dataset.pohled === 'hlavni') otevrel = document.activeElement;
  document.body.dataset.pohled = pohled;
  list.sluzby.hidden = pohled !== 'sluzby';
  list.overeni.hidden = pohled !== 'overeni';
  $('sites-open').setAttribute('aria-expanded', String(pohled === 'sluzby'));
  // Pod otevřeným listem nic jiného zaostřit nejde (dialog je modální).
  for (const x of [document.querySelector('.top'), $('scroll'), document.querySelector('.foot')]) x.toggleAttribute('inert', pohled !== 'hlavni');
  clearInterval(overeni.casovac);
  if (pohled === 'overeni') {
    obnovOvereni();
    overeni.casovac = setInterval(obnovOvereni, 2000);
  }
  if (pohled === 'hlavni') {
    vykresli();
    const zpet = otevrel?.id ? $(otevrel.id) : null;
    (zpet && !zpet.hidden ? zpet : $('sites-open')).focus({ preventScroll: true });
  } else list[pohled].querySelector('[data-close].icon-btn').focus({ preventScroll: true });
}
$('sites-open').addEventListener('click', () => ukaz('sluzby'));
$('check-open').addEventListener('click', () => ukaz('overeni'));
for (const sheet of [$('view-sluzby'), $('view-overeni')]) {
  sheet.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) ukaz('hlavni'); });
  sheet.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const prvky = [...sheet.querySelectorAll('.panel button, .panel input')].filter((x) => !x.disabled && x.offsetParent !== null);
    const i = prvky.indexOf(document.activeElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); prvky[prvky.length - 1].focus(); } else if (!e.shiftKey && i === prvky.length - 1) { e.preventDefault(); prvky[0].focus(); }
  });
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.body.dataset.pohled !== 'hlavni') { e.preventDefault(); ukaz('hlavni'); } });

// ── Sledované služby ────────────────────────────────────────────────────────
async function renderSites(lastStatus) {
  const off = await vypnute();
  const box = $('sites');
  box.textContent = '';
  $('sites-count').textContent = tr('{0} z {1}', SITES.length - off.length, SITES.length).replace(/ /g, ' ');
  for (const [id, name, klic] of SITES) {
    const row = el('label', 'site');
    if (off.includes(id)) row.dataset.off = '';
    const dlazdice = el('span', 'tile tile--32');
    const img = el('img');
    img.width = 18;
    img.height = 18;
    logo(img, klic);
    dlazdice.append(img);
    const nazev = el('span', 'name', tr(name));
    if (lastStatus?.ok && lastStatus.site === id) nazev.append(el('small', '', tr('naposledy {0}', ago(lastStatus.at))));
    const sw = el('span', 'switch');
    const input = el('input');
    input.type = 'checkbox';
    input.setAttribute('role', 'switch');
    input.checked = !off.includes(id);
    input.setAttribute('aria-label', tr('Sledovat {0}', tr(name)));
    input.addEventListener('change', async () => {
      const cur = await vypnute();
      const next = input.checked ? cur.filter((x) => x !== id) : [...new Set([...cur, id])];
      await chrome.storage.local.set({ disabledSites: next });
      if (input.checked) delete row.dataset.off;
      else row.dataset.off = '';
      $('sites-count').textContent = tr('{0} z {1}', SITES.length - next.length, SITES.length).replace(/ /g, ' ');
      // Vypnutá služba hned zmizí z osy i z reflektoru.
      seznam.off = next;
      vykresli();
      if (overeni.diagnostika) vykresliOvereni(overeni.diagnostika);
    });
    sw.append(input, el('i'));
    row.append(dlazdice, nazev, sw);
    box.append(row);
  }
}

// ── Ověření stránky ─────────────────────────────────────────────────────────
// Rozšíření se na stránce zeptá svého adaptéru, co našel (bez textu, jen ano/ne a počty). Ověření
// nechá uživatele potvrdit, jestli počty sedí, a uložit vzorek stránky – stavbu bez obsahu, podle
// které se adaptér opraví (test/fixtures/web/). Nic z toho se neposílá.
const overeni = { tab: null, diagnostika: null, potvrzeni: null, casovac: null };

async function aktivniKarta() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab?.id ?? null;
  } catch {
    return null;
  }
}

async function zeptejSe(tab, type) {
  if (tab === null || !chrome.tabs?.sendMessage) return null;
  try {
    return (await chrome.tabs.sendMessage(tab, { type })) || null;
  } catch {
    return null; // na stránce neběží náš skript – není to podporovaná služba
  }
}

function vykresliOvereni(d) {
  const [, , klic] = sluzba(d.site) || [d.site, d.site, ''];
  $('check-site').textContent = nazevSluzby(d.site);
  if (klic) logo($('check-logo'), klic);
  const seznamKontrol = $('checks');
  const radky = window.AgenteeqSites.radkyOvereni(d);
  // Obnovuje se každé 2 s; beze změny se nepřekresluje, aby čtečka neopakovala totéž dokola.
  const podpis = JSON.stringify(radky);
  if (seznamKontrol.dataset.podpis === podpis) return;
  seznamKontrol.dataset.podpis = podpis;
  seznamKontrol.textContent = '';
  for (const [ton, text] of radky) {
    const li = el('li');
    li.dataset.tone = ton;
    li.append(el('i'), el('span', '', text));
    seznamKontrol.append(li);
  }
}

async function obnovOvereni() {
  const d = await zeptejSe(overeni.tab, 'agenteeq:diagnostika');
  if (!d) return;
  overeni.diagnostika = d;
  vykresliOvereni(d);
  vykresliOsu();
}

function potvrd(hodnota) {
  overeni.potvrzeni = hodnota;
  $('check-yes').setAttribute('aria-pressed', String(hodnota === 'sedi'));
  $('check-no').setAttribute('aria-pressed', String(hodnota === 'nesedi'));
  const msg = $('check-msg');
  msg.dataset.tone = '';
  msg.textContent = sazba(tr(hodnota === 'sedi' ? 'Díky. Ulož vzorek – poslouží jako test, že to tak zůstane.' : 'Díky. Ulož vzorek, podle něj se rozpoznávání opraví.'));
}

$('check-yes').addEventListener('click', () => potvrd('sedi'));
$('check-no').addEventListener('click', () => potvrd('nesedi'));
$('check-save').addEventListener('click', async () => {
  const msg = $('check-msg');
  await obnovOvereni();
  const v = await zeptejSe(overeni.tab, 'agenteeq:vzorek');
  if (!v || !overeni.diagnostika) {
    msg.dataset.tone = 'err';
    msg.textContent = sazba(tr('Vzorek se nepodařilo získat. Obnov stránku a zkus to znovu.'));
    return;
  }
  const soubor = { ...v, porizeno: new Date().toISOString(), verzeRozsireni: chrome.runtime.getManifest().version, diagnostika: overeni.diagnostika, potvrzeni: overeni.potvrzeni };
  const odkaz = document.createElement('a');
  odkaz.href = URL.createObjectURL(new Blob([JSON.stringify(soubor)], { type: 'application/json' }));
  setTimeout(() => URL.revokeObjectURL(odkaz.href), 10000);
  odkaz.download = `agenteeq-vzorek-${v.site || 'stranka'}-${soubor.porizeno.slice(0, 10)}.json`;
  document.body.append(odkaz);
  odkaz.click();
  odkaz.remove();
  msg.dataset.tone = 'ok';
  msg.textContent = sazba(tr('Uloženo do Stažených souborů ({0} prvků{1}).', v.prvku, v.zkraceno ? tr(', zkráceno') : ''));
});

// ── Otevřené konverzace v kartách ───────────────────────────────────────────
// Background si pamatuje, které konverzace se v poslední chvíli hlásily (storage.session): službu,
// kartu, jestli agent odpovídá, kdy začal a kdy skončil. Titulek si okno přečte z karty samo
// (host_permissions na weby služeb, žádné další oprávnění) a nikam ho neposílá.
const seznam = { konverzace: [], off: [], casovac: null, lastStatus: null, zastarala: false, ocekavana: '', pripojeno: false };

// Filtr osy: Vše · Agenti · Chaty. Jen místní volba, nic se kvůli ní neukládá ani neposílá.
const FILTRY_KONVERZACI = new Set(['vse', 'agenti', 'chaty']);
let filtrKonverzaci = 'vse';
function odpovidaFiltru(polozka) {
  if (filtrKonverzaci === 'vse') return true;
  return filtrKonverzaci === 'agenti' ? polozka.druh === 'agent' : polozka.druh === 'chat';
}
function nastavFiltrKonverzaci(next) {
  if (!FILTRY_KONVERZACI.has(next) || next === filtrKonverzaci) return;
  filtrKonverzaci = next;
  for (const button of $('filtry-konverzaci').querySelectorAll('[data-filtr]')) {
    button.setAttribute('aria-pressed', String(button.dataset.filtr === next));
  }
  delete $('konverzace').dataset.podpis;
  vykresliOsu({ kaskada: true });
}
$('filtry-konverzaci').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-filtr]');
  if (button) nastavFiltrKonverzaci(button.dataset.filtr);
});

async function nactiKonverzace() {
  try {
    const { otevrene = {} } = (await chrome.storage.session?.get(['otevrene'])) || {};
    const ted = Date.now();
    const zive = Object.entries(otevrene).filter(([, k]) => ted - k.at <= OTEVRENA_MS).map(([klic, k]) => ({ ...k, klic }));
    await Promise.all(zive.map(async (k) => { k.titulek = await titulekKarty(k); }));
    return zive;
  } catch {
    return [];
  }
}
// Titulek karty bez názvu služby („Plán marketingu – ChatGPT“ → „Plán marketingu“). Obecný titulek
// (jen název služby, nový chat) se neukáže – řádek pak nese jen název služby.
async function titulekKarty(k) {
  if (typeof k.tab !== 'number' || !chrome.tabs?.get) return '';
  try {
    return cistyTitulek((await chrome.tabs.get(k.tab))?.title);
  } catch {
    return '';
  }
}
const OBECNE = /^(ChatGPT|Claude|Gemini|Google Gemini|Microsoft Copilot|Copilot|Perplexity|Grok|Qwen Chat|Qwen|GitHub Copilot|GitHub|Codex|New chat|Nový chat|Home|Domů)$/i;
function cistyTitulek(title) {
  const t = String(title || '').replace(/\s+/g, ' ').trim()
    .replace(/\s*[-–—|·]\s*(ChatGPT|Claude|Google Gemini|Gemini|Microsoft Copilot|Copilot|Perplexity|Grok|Qwen Chat|Qwen|GitHub Copilot|GitHub|Codex)\s*$/i, '');
  return !t || OBECNE.test(t) || /^https?:/i.test(t) ? '' : t.slice(0, 120);
}

// Stav řádku jednou větou. Aktuální karta bere čerstvou diagnostiku ze stránky.
function stavRadku(k, d, off) {
  if (d && off.includes(d.site)) return ['', tr('sledování této služby je vypnuté')];
  const generuje = d ? d.generuje : k?.generating;
  const limit = d ? d.limit : k?.limit;
  if (generuje) return ['work', k?.od ? tr('odpovídá · {0}', trvani(k.od)) : tr('odpovídá'), k?.od];
  if (limit) return ['warn', tr('narazil na limit')];
  if (d && !d.zpravy?.user && !d.zpravy?.assistant) return ['', tr('zatím bez zpráv')];
  if (k?.konec) return ['', tr('odpověď je hotová')];
  return ['wait', tr('čeká na zadání')];
}

// Každou sekundu se přepíše jen čas odpovědi – osa zůstane, jak je, a zaostření neuteče.
function tikni() {
  for (const x of document.querySelectorAll('[data-od]')) x.textContent = tr('odpovídá · {0}', trvani(Number(x.dataset.od)));
}
// Časy v pravém sloupci a v reflektoru se přepisují po půl minutě.
function tikniCasy() {
  for (const x of document.querySelectorAll('[data-at]')) x.textContent = x.dataset.format === 'pred' ? ago(Number(x.dataset.at)) : cas(Number(x.dataset.at));
}
setInterval(tikniCasy, 30e3);

async function prepni(k) {
  try {
    await chrome.tabs.update(k.tab, { active: true });
    if (k.okno !== null && k.okno !== undefined) await chrome.windows?.update(k.okno, { focused: true });
    window.close();
  } catch {
    // Karta se mezitím zavřela – osa se překreslí bez ní.
    const { otevrene = {} } = (await chrome.storage.session?.get(['otevrene'])) || {};
    for (const [klic, x] of Object.entries(otevrene)) if (x.tab === k.tab) delete otevrene[klic];
    await chrome.storage.session?.set({ otevrene });
    obnovSeznam();
  }
}

async function obnovSeznam() {
  seznam.konverzace = await nactiKonverzace();
  seznam.off = await vypnute();
  vykresli();
  return seznam.konverzace;
}

// ── Agenti na tomto počítači ────────────────────────────────────────────────
// Souhrn posílá aplikace (POST /api/extension/prehled) přes background s tokenem spárování.
// Klik na agenta ho otevře přímo v Agenteeq (focus-agent) – schválit z okna nic nejde.
let prehled = null;
let rezim = 'nacitam';
let odvolano = false;
const STAV_AGENTA = {
  needs_input: () => tr('potřebuje tě'), failed: () => tr('selhalo'), limited: () => tr('narazil na limit'), working: () => tr('pracuje'),
  waiting: () => tr('čeká na zadání'), idle: () => tr('nečinný'), observed: () => tr('detekovaný proces'),
};
const TON_AGENTA = { needs_input: 'need', failed: 'need', limited: 'wait', working: 'work', waiting: 'wait' };
const ZIVE = new Set(['needs_input', 'failed', 'limited', 'working']);

// Stav agentů z aplikace jednou větou. Skládá se tady z počtů, ať mluví jazykem okna (věta ze serveru
// je česky); věty jsou stejné jako v boxu Stav agentů v aplikaci (public/js/stav-vety.js).
function vetaZdravi(z) {
  const tvar = (n, jeden, par, mnoho) => mnozne(n, jeden, par, mnoho).replace('{0}', n);
  const selhalo = z.selhalo || 0;
  const limit = z.limit || 0;
  if (z.stav === 'problem') {
    if (!limit) return tvar(selhalo, 'Selhal {0} agent', 'Selhali {0} agenti', 'Selhalo {0} agentů');
    if (!selhalo) return tvar(limit, 'Na limit narazil {0} agent', 'Na limit narazili {0} agenti', 'Na limit narazilo {0} agentů');
    return tvar(selhalo + limit, 'Problém má {0} agent', 'Problém mají {0} agenti', 'Problém má {0} agentů');
  }
  if (z.stav === 'pozor') return tvar(z.cekaNaTebe || 0, 'Potřebuje tě {0} agent', 'Potřebují tě {0} agenti', 'Potřebuje tě {0} agentů');
  if (z.stav === 'nevim') return tr('Nepodařilo se zjistit, co na počítači běží');
  return z.pracuje ? tr('Vše běží v pořádku') : tr('V pořádku, nikdo nepracuje');
}

// Souhrn pod nadpisem osy: věta o stavu a kolik agentů pracuje. Nezjištěný výpis procesů se nikdy
// netváří jako „nic neběží“ a neopakuje se dvakrát; nedoručené hlášení má přednost.
function souhrnStavu(z, { selhaloHlaseni = false } = {}) {
  const casti = [];
  if (selhaloHlaseni) casti.push(tr('Poslední hlášení se do Agenteeq nedostalo. Rozšíření to zkusí znovu samo.'));
  if (!z) return { ton: 'warn', text: [...casti, tr('Agenti na počítači: nezjištěno')].join(' · ') };
  casti.push(vetaZdravi(z));
  if (z.pracuje && z.stav !== 'ok') casti.push(`${z.pracuje} ${mnozne(z.pracuje, 'pracuje', 'pracují', 'pracuje')}`);
  if (z.procesyNevim && z.stav !== 'nevim') casti.push(tr('Nepodařilo se zjistit, co na počítači běží'));
  return { ton: selhaloHlaseni || z.procesyNevim ? 'warn' : '', text: casti.join(' · ') };
}

async function nactiPrehled() {
  const r = await chrome.runtime.sendMessage({ type: 'agenteeq:prehled' }).catch(() => null);
  return r && r.zdravi ? { rozhodnuti: [], pracuji: [], nedavne: [], ...r } : null;
}

// Otevře agenta v aplikaci. Chyba se ukáže u tlačítka (reflektor) nebo jako oznámení (osa).
async function otevriVAgenteeq(id, tlacitko, chybaEl) {
  if (tlacitko.disabled) return;
  tlacitko.disabled = true;
  tlacitko.setAttribute('aria-busy', 'true');
  if (chybaEl) chybaEl.hidden = true;
  let result = null;
  try { result = await chrome.runtime.sendMessage({ type: 'agenteeq:focus-agent', id }); } catch { /* aplikace neběží */ }
  if (!result?.ok) {
    const text = result?.unpaired
      ? tr('Rozšíření není spárované. Otevři Agenteeq a obnov připojení.')
      : result?.unsupported
        ? tr('Tato akce vyžaduje nativní aplikaci Agenteeq pro Mac.')
        : tr('Agenta se nepodařilo otevřít. Ověř, že Agenteeq běží, a obnov seznam.');
    if (chybaEl) { chybaEl.hidden = false; chybaEl.textContent = sazba(text); } else toast(text);
  }
  tlacitko.disabled = false;
  tlacitko.removeAttribute('aria-busy');
}

// ── Reflektor: jedna hlavní věc ─────────────────────────────────────────────
// Pořadí: potřebuje tě → selhání a limit → nejčerstvější pracující agent → odpovídající chat v jiné
// kartě → nezjištěno → klid. Víc rozhodnutí = stránkování se skutečným počtem; nová položka jen
// označí šipku, okno nikdy samo nepřeskočí jinam.
const reflektor = { klic: null, idx: 0, id: null, znama: null, nove: new Set() };
const VZHLED_ROZHODNUTI = {
  needs_input: { ton: 'rose', nadpis: () => tr('Potřebuje tě') },
  failed: { ton: 'rose', nadpis: () => tr('Selhalo') },
  limited: { ton: 'brass', nadpis: () => tr('Narazil na limit') },
};
const ikonaDuvodu = (r, st) => (st === 'limited' ? 'limit' : st === 'failed' ? 'chyba' : /^(Ptá se|Asks)|\?\s*$/.test(r || '') ? 'otazka' : /povolen|permission/i.test(r || '') ? 'zamek' : 'ruka');

function chatVReflektoru() {
  return seznam.konverzace.find((k) => k.generating && typeof k.tab === 'number' && k.tab !== overeni.tab && !seznam.off.includes(k.site)) || null;
}

function modelReflektoru() {
  if (rezim === 'nacitam') return { klic: 'nacitam', druh: 'nacitam', ton: 'mist' };
  if (rezim === 'offline') return { klic: 'intro', druh: 'intro', ton: 'mist' };
  if (rezim === 'nesparovano') return { klic: 'pair', druh: 'pair', ton: 'brass' };
  if (rezim === 'neovereno') return { klic: 'neovereno', druh: 'nevim', ton: 'mist', neovereno: true };
  const roz = prehled?.rozhodnuti || [];
  if (roz.length) {
    // Zobrazená položka drží své místo i ve chvíli, kdy nová přibude před ni.
    const podleId = roz.findIndex((x) => x.id === reflektor.id);
    reflektor.idx = podleId >= 0 ? podleId : Math.min(reflektor.idx, roz.length - 1);
    const it = roz[reflektor.idx];
    reflektor.id = it.id;
    return { klic: `r:${it.id}`, druh: 'rozhodnuti', it, ton: (VZHLED_ROZHODNUTI[it.status] || VZHLED_ROZHODNUTI.needs_input).ton };
  }
  const prac = prehled?.pracuji || [];
  if (prac.length) return { klic: `w:${prac[0].id}`, druh: 'prace', it: prac[0], ton: 'sage' };
  const chat = chatVReflektoru();
  if (chat) return { klic: `c:${chat.klic}`, druh: 'chat', k: chat, ton: 'sage' };
  if (!prehled) return { klic: 'bez-prehledu', druh: 'nevim', ton: 'mist', bezPrehledu: true };
  if (prehled.zdravi.stav === 'nevim') return { klic: 'nevim', druh: 'nevim', ton: 'mist' };
  return { klic: 'klid', druh: 'klid', ton: 'mist' };
}

function slideHtml(M) {
  const tlacitko = (text, cil) => `<button type="button" class="btn btn--primary btn--block cta" data-s="cta" ${cil}><span>${esc(sazba(text))}</span>${ikona('sipka', 'sipka')}</button>`;
  if (M.druh === 'rozhodnuti' || M.druh === 'prace') {
    const it = M.it;
    const vzhled = M.druh === 'prace' ? { nadpis: () => tr('Pracuje') } : VZHLED_ROZHODNUTI[it.status] || VZHLED_ROZHODNUTI.needs_input;
    const duvod = it.reason || (M.druh === 'prace' ? tr('Pracuje') : '');
    const nazev = it.title || it.app || tr('Agent');
    return `<div class="spot-row" data-s><span class="chip eyebrow"><span class="dot"></span><span>${esc(vzhled.nadpis())}</span></span></div>
      <div class="who"><span class="tile tile--48" data-s="tile">${logoHtml(logoKlic(it.app), 26)}${M.druh === 'prace' ? '<span class="badge badge--work"></span>' : ''}</span>
        <div data-s><h2 class="spot-title">${esc(sazba(nazev))}</h2><p class="spot-meta"><span>${esc(it.app || '')}${it.app ? ' · ' : ''}<span data-at="${Number(it.at) || 0}" data-format="pred">${esc(ago(it.at))}</span></span></p></div></div>
      ${duvod ? `<p class="say" data-s>${ikona(M.druh === 'prace' ? 'terminal' : ikonaDuvodu(duvod, it.status))}<span class="say-text">${esc(sazba(duvod))}</span></p>` : ''}
      ${tlacitko(tr('Otevřít v Agenteeq'), `data-agent="${esc(it.id)}" aria-label="${esc(tr('Otevřít agenta {0} v aplikaci Agenteeq', nazev))}"`)}
      <p class="spot-err" role="status" hidden></p>`;
  }
  if (M.druh === 'chat') {
    const k = M.k;
    const [, , klic] = sluzba(k.site) || [];
    const nazev = k.titulek || nazevSluzby(k.site);
    return `<div class="spot-row" data-s><span class="chip eyebrow"><span class="dot"></span><span>${esc(tr('Odpovídá'))}</span></span></div>
      <div class="who"><span class="tile tile--48" data-s="tile">${logoHtml(klic, 26, 'chat')}<span class="badge badge--work"></span></span>
        <div data-s><h2 class="spot-title">${esc(sazba(nazev))}</h2><p class="spot-meta"><span>${esc(nazevSluzby(k.site))} · ${esc(sazba(tr('v jiné kartě')))}</span></p></div></div>
      <p class="say" data-s>${ikona('web')}<span class="say-text" data-od="${Number(k.od) || ''}">${esc(k.od ? tr('odpovídá · {0}', trvani(k.od)) : tr('odpovídá'))}</span></p>
      ${tlacitko(tr('Přepnout na kartu'), `data-karta="${esc(k.klic)}"`)}`;
  }
  if (M.druh === 'nevim' || M.druh === 'klid') {
    const nevim = M.druh === 'nevim';
    const posledni = [...(prehled?.nedavne || []).map((x) => ({ title: x.title || x.app, at: x.at })), ...seznam.konverzace.filter((k) => !seznam.off.includes(k.site)).map((k) => ({ title: k.titulek || nazevSluzby(k.site), at: k.konec || k.at }))]
      .filter((x) => validniCas(x.at)).sort((a, b) => b.at - a.at)[0];
    const fakt = nevim
      ? `<span class="chip chip--glass"><span class="dot"></span><span>${esc(tr('Agenti na počítači: nezjištěno'))}</span></span>`
      : posledni ? `<span class="chip chip--glass"><span class="dot"></span><span>${esc(tr('Naposledy: {0}', posledni.title))} · <span data-at="${posledni.at}">${esc(cas(posledni.at))}</span></span></span>` : '';
    const nadpis = nevim ? (M.neovereno ? tr('Nepodařilo se ověřit spojení s Agenteeq') : M.bezPrehledu ? tr('Přehled agentů se nepodařilo načíst') : tr('Nepodařilo se zjistit, co na počítači běží')) : tr('Všechno je v klidu');
    const text = nevim
      ? (M.neovereno ? tr('Aplikace běží, ale rozšíření od ní nedostalo odpověď. Zkusím to znovu za pár sekund.') : M.bezPrehledu ? tr('Zkus obnovit. Chaty v prohlížeči sleduje rozšíření dál.') : tr('Agenteeq teď nevidí výpis procesů. Níž je jen to, co víme jistě.'))
      : tr('Nikdo teď nepracuje a nic na tebe nečeká. Ozvu se, jakmile se to změní.');
    return `<div class="calm">
      <span class="calm-bot" data-s="tile"${nevim ? ' data-nevim' : ''}>${ROBOT}</span>
      <div data-s><h2>${esc(sazba(nadpis))}</h2><p>${esc(sazba(text))}</p></div>
      ${fakt ? `<div class="calm-fakt" data-s>${fakt}</div>` : ''}
    </div>`;
  }
  return `<p class="spot-meta">${esc(tr('Hledám Agenteeq na tomto počítači.'))}</p>`;
}

function vykresliReflektor(smer = 0) {
  const spot = $('spot');
  const stage = $('spot-stage');
  const M = modelReflektoru();
  spot.dataset.tone = M.ton;
  vykresliStrankovani(M);
  $('spot-intro').hidden = M.druh !== 'intro';
  $('pairing').hidden = M.druh !== 'pair';
  stage.hidden = ['intro', 'pair'].includes(M.druh);
  if (M.druh === 'pair') {
    $('pair-title').textContent = tr(odvolano ? 'Spáruj rozšíření znovu' : 'Spáruj rozšíření kódem');
    $('pair-sub').hidden = !odvolano;
    $('pair-sub').textContent = odvolano ? sazba(tr('Předchozí spárování už neplatí.')) : '';
  }
  if (M.klic === reflektor.klic) {
    // Tatáž položka: jen se tiše dorovná činnost pracujícího agenta (bez nového nástupu).
    if (M.druh === 'prace') {
      const say = stage.querySelector('.slide:not(.pryc) .say-text');
      const novy = sazba(M.it.reason || tr('Pracuje'));
      if (say && say.textContent !== novy) say.textContent = novy;
    }
    return;
  }
  const prvni = reflektor.klic === null || reflektor.klic === 'nacitam';
  reflektor.klic = M.klic;
  const animuj = !omezitPohyb();
  if (M.druh === 'intro' || M.druh === 'pair') {
    if (animuj) nastup(M.druh === 'intro' ? $('spot-intro') : $('pairing'), 0, true);
    return;
  }
  const stara = stage.querySelector('.slide:not(.pryc)');
  const h0 = stage.offsetHeight;
  const nova = el('div', 'slide');
  nova.innerHTML = slideHtml(M);
  if (M.druh === 'rozhodnuti') {
    nova.setAttribute('role', 'group');
    nova.setAttribute('aria-roledescription', tr('položka'));
    nova.setAttribute('aria-label', tr('{0} z {1}', reflektor.idx + 1, prehled.rozhodnuti.length));
  }
  if (stara) {
    stara.classList.add('pryc');
    stara.setAttribute('aria-hidden', 'true');
    if (animuj && !prvni) {
      stara.style.cssText = 'position:absolute;inset:0 0 auto 0';
      const dx = smer ? -smer * 24 : 0;
      stara.animate([{ opacity: 1 }, { opacity: 0, transform: `translate(${dx}px, ${smer ? 0 : -6}px)` }], { duration: 170, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' })
        .finished.then(() => stara.remove(), () => stara.remove());
    } else stara.remove();
  }
  stage.append(nova);
  if (!animuj) return;
  const h1 = stage.offsetHeight;
  if (stara && !prvni && Math.abs(h1 - h0) > 1) {
    stage.style.overflow = 'clip';
    stage.animate([{ height: `${h0}px` }, { height: `${h1}px` }], { duration: 320, easing: 'cubic-bezier(.2,.8,.2,1)' }).finished.then(() => { stage.style.overflow = ''; }, () => {});
  }
  nastup(nova, smer, prvni);
}
// Nástup po částech: štítek → dlaždice → text → bublina; tlačítko jen prolne (zůstává na místě).
function nastup(koren, smer, prvni) {
  [...koren.querySelectorAll('[data-s]')].forEach((x, i) => {
    const role = x.dataset.s;
    const od = role === 'cta' ? { opacity: 0 }
      : role === 'tile' ? { opacity: 0, transform: smer ? `translateX(${smer * 12}px) scale(.9)` : 'scale(.92)' }
        : { opacity: 0, transform: smer ? `translateX(${smer * 28}px)` : 'translateY(10px)' };
    x.animate([od, { opacity: 1, transform: 'none' }], { duration: prvni ? 520 : 380, delay: (prvni ? 80 : 50) + i * 38, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' });
  });
}

function vykresliStrankovani(M) {
  const n = M.druh === 'rozhodnuti' ? prehled.rozhodnuti.length : 0;
  const pager = $('pager');
  const spot = $('spot');
  pager.hidden = n < 2;
  spot.style.setProperty('--pager-w', n < 2 ? '0px' : '128px');
  // Šipky ←/→ fungují, když je reflektor zaostřený; bez stránkování to není zastávka tabulátoru.
  if (n < 2) {
    spot.removeAttribute('tabindex');
    spot.removeAttribute('aria-roledescription');
    spot.removeAttribute('aria-label');
    return;
  }
  spot.tabIndex = 0;
  spot.setAttribute('aria-roledescription', tr('karusel'));
  spot.setAttribute('aria-label', tr('Potřebuje tě: {0} z {1}. Šipkami vlevo a vpravo přepneš.', reflektor.idx + 1, n));
  $('pager-count').textContent = `${reflektor.idx + 1} / ${n}`;
  $('spot-prev').disabled = reflektor.idx <= 0;
  $('spot-next').disabled = reflektor.idx >= n - 1;
  const pozice = prehled.rozhodnuti.map((x, i) => (reflektor.nove.has(x.id) ? i : -1)).filter((i) => i >= 0);
  $('spot-prev').classList.toggle('ma-nove', pozice.some((i) => i < reflektor.idx));
  $('spot-next').classList.toggle('ma-nove', pozice.some((i) => i > reflektor.idx));
}

function listuj(o) {
  const roz = prehled?.rozhodnuti || [];
  const cil = reflektor.idx + o;
  if (rezim !== 'sparovano' || cil < 0 || cil >= roz.length) return;
  reflektor.idx = cil;
  reflektor.id = roz[cil].id;
  reflektor.nove.delete(reflektor.id);
  vykresliReflektor(o);
  const it = roz[cil];
  ohlas(`${(VZHLED_ROZHODNUTI[it.status] || VZHLED_ROZHODNUTI.needs_input).nadpis()}: ${it.title || it.app}. ${tr('{0} z {1}', cil + 1, roz.length)}`);
}
$('spot-prev').addEventListener('click', () => listuj(-1));
$('spot-next').addEventListener('click', () => listuj(1));
$('spot').addEventListener('keydown', (e) => {
  if (e.target.closest('input, form')) return;
  if (e.key === 'ArrowRight') { e.preventDefault(); listuj(1); }
  if (e.key === 'ArrowLeft') { e.preventDefault(); listuj(-1); }
});
// Tah prstem nebo myší přes reflektor listuje stejně jako šipky.
let tah = null;
$('spot').addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || e.target.closest('button, a, input, label') || (prehled?.rozhodnuti?.length || 0) < 2) return;
  tah = { x: e.clientX, id: e.pointerId };
});
$('spot').addEventListener('pointerup', (e) => {
  if (!tah || e.pointerId !== tah.id) return;
  const dx = e.clientX - tah.x;
  tah = null;
  if (Math.abs(dx) > 48) listuj(dx < 0 ? 1 : -1);
});
$('spot').addEventListener('pointercancel', () => { tah = null; });
$('spot').addEventListener('click', (e) => {
  const agent = e.target.closest('[data-agent]');
  if (agent) { otevriVAgenteeq(agent.dataset.agent, agent, agent.parentElement.querySelector('.spot-err')); return; }
  const karta = e.target.closest('[data-karta]');
  const k = karta && seznam.konverzace.find((x) => x.klic === karta.dataset.karta);
  if (k) prepni(k);
});

// Nová rozhodnutí od posledního překreslení: tečka na šipce, poskočení počtu a hlášení čtečce.
function sledujNovaRozhodnuti() {
  const roz = prehled?.rozhodnuti || [];
  const ids = new Set(roz.map((x) => x.id));
  if (reflektor.znama) {
    const nova = roz.filter((x) => !reflektor.znama.has(x.id));
    for (const x of nova) if (x.id !== reflektor.id) reflektor.nove.add(x.id);
    if (nova.length) {
      ohlas(tr('Nově tě potřebuje: {0}', nova.map((x) => x.title || x.app).join(', ')));
      const pocet = $('pager-count');
      if (!omezitPohyb()) { pocet.classList.remove('bump'); void pocet.offsetWidth; pocet.classList.add('bump'); }
    }
  }
  for (const id of [...reflektor.nove]) if (!ids.has(id)) reflektor.nove.delete(id);
  reflektor.znama = ids;
}

// ── Časová osa „Co se děje“ ─────────────────────────────────────────────────
function polozkaAgenta(a, status) {
  const druh = WEBOVE_APLIKACE.has(a.app) ? 'chat' : 'agent';
  return {
    klic: `a:${a.id}`, druh, title: a.title || a.app || tr('Agent'), src: a.app || '', logo: logoKlic(a.app),
    act: status === 'working' ? a.reason || STAV_AGENTA.working() : STAV_AGENTA[status]?.() || '', ton: TON_AGENTA[status] || '',
    at: a.at, zive: ZIVE.has(status), cil: { typ: 'agent', id: a.id }, popis: tr('Otevřít agenta {0} v aplikaci Agenteeq', a.title || a.app || tr('Agent')),
  };
}
const TON_CHATU = { work: 'work', warn: 'wait', wait: 'wait' };
function polozkaChatu(k, d = null) {
  const [ton, text, od] = stavRadku(k, d, seznam.off);
  const site = d ? d.site : k.site;
  const [, , klic] = sluzba(site) || [];
  const zive = Boolean(d ? d.generuje || d.limit : k.generating || k.limit);
  return {
    klic: d ? 'tato' : `c:${k.klic}`, druh: 'chat', title: k?.titulek || nazevSluzby(site), src: k?.titulek ? nazevSluzby(site) : '', logo: klic,
    act: text, od, ton: TON_CHATU[ton] || '', at: (d ? k?.at : k.konec || k.at) || null, zive, tato: Boolean(d),
    cil: !d && typeof k.tab === 'number' ? { typ: 'karta', k } : null, popis: tr('Přepnout na kartu {0}, {1}', k?.titulek || nazevSluzby(site), text),
  };
}

function polozkyOsy() {
  const out = [];
  const M = reflektor.klic || '';
  const off = seznam.off;
  const d = seznam.pripojeno ? overeni.diagnostika : null;
  const tato = d ? seznam.konverzace.find((k) => overeni.tab !== null && k.tab === overeni.tab) || null : null;
  const otevreneId = new Set(seznam.konverzace.map((k) => `web:${k.klic}`));
  if (prehled && seznam.pripojeno) {
    for (const a of prehled.pracuji) if (M !== `w:${a.id}`) out.push(polozkaAgenta(a, 'working'));
    // Konverzace z aplikace, která je zároveň otevřená v kartě, se ukáže jen jednou – jako karta.
    for (const a of prehled.nedavne) if (!otevreneId.has(a.id)) out.push(polozkaAgenta(a, a.status));
  }
  if (d) out.push(polozkaChatu(tato || { at: Date.now() }, d));
  for (const k of seznam.konverzace) {
    if (off.includes(k.site) || (d && k === tato) || M === `c:${k.klic}`) continue;
    out.push(polozkaChatu(k));
  }
  return out;
}

const SKUPINY = [['ted', () => tr('Teď')], ['dnes', () => tr('Dnes')], ['drive', () => tr('Dříve')]];
const NALEHAVOST = { need: 0, wait: 1, work: 2, '': 3 };
function skupina(p) {
  if (p.zive || p.tato) return 'ted';
  return validniCas(p.at) && new Date(p.at).toDateString() === new Date().toDateString() ? 'dnes' : 'drive';
}

function radekHtml(p) {
  const badge = { work: 'badge--work', wait: 'badge--wait', need: 'badge--need' }[p.ton] || '';
  const zdroj = p.src && p.src !== p.title ? `<span class="src">${esc(p.src)}</span><span aria-hidden="true">·</span>` : '';
  const obsah = `<span class="tile">${logoHtml(p.logo, 22, p.druh)}${badge ? `<span class="badge ${badge}"></span>` : ''}</span>
    <span class="row-main"><span class="row-title">${esc(sazba(p.title))}</span>
      <span class="row-meta">${ikona(p.druh === 'agent' ? 'terminal' : 'web', 'druh')}${zdroj}<span class="act${p.ton ? ` t-${p.ton}` : ''}"${p.od ? ` data-od="${Number(p.od)}"` : ''}>${esc(sazba(p.act))}</span></span></span>
    <span class="row-side">${p.tato ? `<span class="tag">${esc(tr('tato karta'))}</span>` : `<span class="row-time" data-at="${Number(p.at) || 0}">${esc(cas(p.at))}</span>`}</span>`;
  if (!p.cil) return `<li data-klic="${esc(p.klic)}"><div class="radek${p.tato ? ' radek--tato' : ''}">${obsah}</div></li>`;
  return `<li data-klic="${esc(p.klic)}"><button type="button" class="radek" aria-label="${esc(p.popis)}">${obsah}${ikona('chev', 'chev')}</button></li>`;
}

let poslednePolozky = new Map();
function vykresliOsu({ kaskada = false } = {}) {
  const box = $('konverzace');
  const vse = polozkyOsy();
  const polozky = vse.filter(odpovidaFiltru);
  poslednePolozky = new Map(polozky.map((p) => [p.klic, p]));
  // Beze změny dat se nepřekresluje (jen časy), jinak by čtečka i zaostření začínaly znovu.
  const podpis = JSON.stringify([filtrKonverzaci, polozky.map((p) => [p.klic, p.title, p.src, p.od ? '' : p.act, p.ton, skupina(p), Boolean(p.cil)])]);
  const prazdne = $('prazdne-konverzace');
  prazdne.hidden = polozky.length > 0 || rezim === 'nacitam';
  if (!prazdne.hidden) {
    prazdne.textContent = sazba(tr(filtrKonverzaci === 'agenti' ? 'Žádný agent tu teď není.'
      : filtrKonverzaci === 'chaty' ? 'Žádný chat v prohlížeči.'
        : /^[rwc]:/.test(reflektor.klic || '') ? 'Nic dalšího se teď neděje.'
          : seznam.pripojeno ? 'Otevři chat s AI a objeví se tady i v Agenteeq.' : 'Otevři chat s AI a objeví se tady.'));
  }
  clearInterval(seznam.casovac);
  if (document.querySelector('[data-od]') || polozky.some((p) => p.od)) seznam.casovac = setInterval(tikni, 1000);
  if (box.dataset.podpis === podpis) { tikni(); return; }
  const prvni = !box.dataset.podpis;
  box.dataset.podpis = podpis;
  const pred = new Map([...box.querySelectorAll('[data-klic]')].map((x) => [x.dataset.klic, x.getBoundingClientRect()]));
  const zaostreny = document.activeElement?.closest?.('#konverzace [data-klic]')?.dataset.klic;
  let html = '';
  // Bez aplikace jde jen o chaty v kartách: jeden plochý seznam bez skupin.
  for (const [g, nazev] of seznam.pripojeno ? SKUPINY : [['ted', SKUPINY[0][1]]]) {
    const xs = polozky.filter((p) => !seznam.pripojeno || skupina(p) === g)
      .sort((a, b) => (g === 'ted' ? (Number(b.zive) - Number(a.zive)) || (NALEHAVOST[a.ton] ?? 3) - (NALEHAVOST[b.ton] ?? 3) : 0) || (Number(b.at) || 0) - (Number(a.at) || 0));
    if (!xs.length) continue;
    html += `<section class="group${seznam.pripojeno ? '' : ' group--plocha'}" data-klic="g-${g}" aria-labelledby="gh-${g}"><h3 class="group-h" id="gh-${g}">${esc(nazev())} <span class="count">${xs.length}</span></h3><ul class="rows">${xs.map(radekHtml).join('')}</ul></section>`;
  }
  box.innerHTML = html;
  if (zaostreny) box.querySelector(`[data-klic="${CSS.escape(zaostreny)}"] button`)?.focus({ preventScroll: true });
  aktualizujPosun();
  if (omezitPohyb()) return;
  let i = 0;
  for (const x of box.querySelectorAll('[data-klic]')) {
    const bylo = pred.get(x.dataset.klic);
    if (kaskada || prvni || !bylo) {
      x.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 420, delay: (kaskada || prvni ? 120 : 60) + Math.min(i++, 10) * 40, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' });
      // Nová položka (ne první vykreslení ani změna filtru) se krátce podsvítí.
      if (!kaskada && !prvni && !bylo && x.matches('li')) x.firstElementChild.classList.add('nove');
      continue;
    }
    if (x.matches('section')) continue;
    // FLIP: zůstávající řádek dojede z původního místa na nové.
    const dy = bylo.top - x.getBoundingClientRect().top;
    if (Math.abs(dy) > 1) x.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 360, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }
}

$('konverzace').addEventListener('click', (e) => {
  const tlacitko = e.target.closest('button.radek');
  const p = tlacitko && poslednePolozky.get(tlacitko.closest('[data-klic]').dataset.klic);
  if (!p?.cil) return;
  if (p.cil.typ === 'karta') prepni(p.cil.k);
  else otevriVAgenteeq(p.cil.id, tlacitko, null);
});
// Seznam se ovládá šipkami nahoru a dolů, Home a End; Enter a mezerník řádek otevřou.
$('konverzace').addEventListener('keydown', (e) => {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
  const radky = [...$('konverzace').querySelectorAll('button.radek')];
  const i = radky.indexOf(document.activeElement);
  if (i < 0) return;
  e.preventDefault();
  const j = e.key === 'Home' ? 0 : e.key === 'End' ? radky.length - 1 : Math.max(0, Math.min(radky.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)));
  radky[j].focus();
});

// Linky pod hlavičkou a nad patou a rozplynutí obsahu pod patou podle polohy posunu.
function aktualizujPosun() {
  const s = $('scroll');
  document.body.dataset.odrolovano = String(s.scrollTop > 2);
  document.body.dataset.dalsi = String(s.scrollTop + s.clientHeight < s.scrollHeight - 2);
}
$('scroll').addEventListener('scroll', aktualizujPosun, { passive: true });

// ── Celkový stav ────────────────────────────────────────────────────────────
function nastavPill(tone, text) {
  $('pill').dataset.tone = tone;
  $('pill-text').textContent = tr(text);
}

function vykresli() {
  document.body.dataset.stav = rezim;
  if (rezim === 'sparovano') sledujNovaRozhodnuti();
  vykresliReflektor();
  const pripojeno = rezim === 'sparovano';
  $('feed-h').textContent = sazba(tr(pripojeno ? 'Co se děje' : 'Chaty v prohlížeči'));
  $('filtry-konverzaci').hidden = !pripojeno;
  if (!pripojeno && filtrKonverzaci !== 'vse') {
    filtrKonverzaci = 'vse';
    for (const b of $('filtry-konverzaci').querySelectorAll('[data-filtr]')) b.setAttribute('aria-pressed', String(b.dataset.filtr === 'vse'));
  }
  const souhrn = $('souhrn');
  const selhaloHlaseni = Boolean(seznam.lastStatus && seznam.lastStatus.ok === false);
  let s = null;
  if (rezim === 'offline') s = { ton: '', text: tr('Agenti na počítači: nezjištěno') };
  else if (rezim === 'nesparovano') s = { ton: '', text: tr('Rozšíření je sleduje samo, i bez spárování.') };
  else if (pripojeno) {
    // Klid a nezjištěný stav už reflektor říká celou větou – souhrn by ji jen opakoval.
    const vReflektoru = ['klid', 'nevim'].includes(modelReflektoru().druh);
    s = vReflektoru && !selhaloHlaseni && !(prehled?.zdravi?.procesyNevim && prehled.zdravi.stav !== 'nevim') ? null : souhrnStavu(prehled?.zdravi || null, { selhaloHlaseni });
  }
  souhrn.hidden = !s;
  if (s) { souhrn.textContent = sazba(s.text); souhrn.dataset.tone = s.ton; }
  // Pata: jedna hlavní výzva v místě. Bez aplikace je jí „Stáhnout“ v reflektoru, tady „Zkusit znovu“.
  $('app-link').hidden = rezim === 'offline';
  $('retry').hidden = rezim !== 'offline';
  $('app-link').href = APLIKACE;
  $('check-open').hidden = !(pripojeno && overeni.diagnostika);
  const out = $('outdated');
  out.hidden = !(pripojeno && seznam.zastarala);
  if (!out.hidden) out.textContent = sazba(tr('Je k dispozici verze {0}. Chrome ji nainstaluje sám; hned ji získáš na stránce chrome://extensions tlačítkem Aktualizovat.', seznam.ocekavana));
  vykresliOsu();
}

function zakladniStav() {
  seznam.pripojeno = false;
  seznam.zastarala = false;
  delete $('konverzace').dataset.podpis; // Po obnovení spojení se osa vykreslí znovu i se stejnými daty.
  $('app-link').href = APLIKACE;
  $('app-link-text').textContent = tr('Otevřít Agenteeq');
}

// Offline stav je skutečná dostupnost lokální služby, ne přítomnost starého snapshotu.
// Kontrolujeme jej také při otevřeném okně: jinak by náhlý restart aplikace nechal
// „Připojeno“ a čísla agentů označená jako právě živá.
async function fungujeSluzba() {
  try {
    const res = await fetch(`${APLIKACE}api/health`, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return false;
    return (await res.json())?.ok === true;
  } catch {
    return false;
  }
}
function ukazVypadek() {
  zakladniStav();
  prehled = null;
  seznam.konverzace = [];
  overeni.diagnostika = null;
  rezim = 'offline';
  nastavPill('err', 'Neběží');
  vykresli();
  // Chaty v kartách rozšíření vidí i bez aplikace – načtou se znovu z paměti prohlížeče.
  obnovSeznam();
}

function ukazNeovereno() {
  zakladniStav();
  prehled = null;
  seznam.konverzace = [];
  overeni.diagnostika = null;
  // Aplikace odpovídá, jen ověření selhalo: žádná nabídka ke stažení ani spárování. Okno to
  // za pár sekund zkusí znovu samo (kontrola spojení níž) a chaty v kartách ukazuje dál.
  rezim = 'neovereno';
  nastavPill('warn', 'Neověřeno');
  vykresli();
  obnovSeznam();
}

// Porovnání verzí podle čísel (0.46.12 > 0.46.9), ne jako textu. Nečitelná verze = nevíme = false.
function novejsiVerze(a, b) {
  const casti = (v) => (typeof v === 'string' && /^\d+\.\d+\.\d+$/.test(v) ? v.split('.').map(Number) : null);
  const x = casti(a), y = casti(b);
  if (!x || !y) return false;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
}

// Viditelnost se přepíná až ve chvíli, kdy je nový stav známý – jinak by okno při každém
// načtení na okamžik prázdně bliklo.
async function render() {
  const { lastStatus, port } = await chrome.storage.local.get(['lastStatus', 'port']);
  const aktualniPort = platnyPort(port) ? port : VYCHOZI_PORT;
  APLIKACE = `http://127.0.0.1:${aktualniPort}/`;
  if (document.activeElement !== $('port')) $('port').value = String(aktualniPort);
  seznam.lastStatus = lastStatus;
  await renderSites(lastStatus);

  if (!await fungujeSluzba()) {
    ukazVypadek();
    return;
  }

  // Naše rozšíření se spáruje samo (background při „hello“). Kód je jen záloha pro jiné případy.
  const r = await chrome.runtime.sendMessage({ type: 'agenteeq:hello' }).catch(() => null);
  if (!r || r.chyba || (r.paired && !r.online)) {
    // Aplikace odpovídá na /api/health, ale ověření rozšíření selhalo nebo se background
    // neozval. Není to „neběží“ ani „nespárováno“ – jen se to nepodařilo zjistit.
    ukazNeovereno();
    return;
  }
  if (!r?.paired) {
    const [konverzace, off] = await Promise.all([nactiKonverzace(), vypnute()]);
    zakladniStav();
    prehled = null;
    overeni.diagnostika = null;
    [seznam.konverzace, seznam.off] = [konverzace, off];
    odvolano = Boolean(r?.revoked);
    rezim = 'nesparovano';
    nastavPill('warn', 'Nespárováno');
    vykresli();
    return;
  }

  const version = chrome.runtime.getManifest().version;
  const expected = r.status?.expectedVersion;
  // „Je k dispozici verze X“ jen pro skutečně novější X. Rozšíření z obchodu bývá novější než
  // stabilní aplikace – pak by se nabízel „update“ na starší verzi.
  const outdated = novejsiVerze(expected, version);

  overeni.tab = await aktivniKarta();
  overeni.diagnostika = await zeptejSe(overeni.tab, 'agenteeq:diagnostika');
  const [konverzace, off, novyPrehled] = await Promise.all([nactiKonverzace(), vypnute(), nactiPrehled()]);
  zakladniStav();
  [seznam.konverzace, seznam.off, prehled] = [konverzace, off, novyPrehled];
  seznam.zastarala = outdated;
  seznam.ocekavana = expected || '';
  seznam.pripojeno = true;
  rezim = 'sparovano';
  // Známé chyby (nedoručené hlášení, nová verze, nezjištěné procesy) ztlumí „Připojeno“ do okru.
  const varovani = outdated || Boolean(lastStatus && !lastStatus.ok) || Boolean(prehled?.zdravi?.procesyNevim) || !prehled;
  nastavPill(varovani ? 'warn' : 'ok', 'Připojeno');
  vykresli();
}

// Konverzace se mění, i když je okno otevřené: agent dopíše, karta se zavře.
chrome.storage.onChanged?.addListener(async (zmeny, oblast) => {
  if (oblast !== 'session' || !zmeny.otevrene || rezim === 'nacitam') return;
  await obnovSeznam();
});

// Otevřené okno musí poznat i skutečný výpadek aplikace a samo se zotavit.
// Pouhé načítání prehled() nestačilo: při restartu hostitele vracelo null,
// ale hlavička stále ukazovala „Připojeno“ a stará čísla.
let probihaKontrolaSpojeni = false;
setInterval(async () => {
  if (document.hidden || probihaKontrolaSpojeni) return;
  probihaKontrolaSpojeni = true;
  try {
    if (!seznam.pripojeno) {
      await render(); // Recover automatically when the app comes back online.
      return;
    }
    if (!await fungujeSluzba()) {
      ukazVypadek(); // Clear stale agent counts before telling user we are offline.
      return;
    }
    const aktualniPrehled = await nactiPrehled();
    if (!aktualniPrehled) {
      // A protected endpoint may fail independently of /api/health.
      // Re-check pairing instead of claiming a live connection.
      await render();
      return;
    }
    prehled = aktualniPrehled;
    vykresli();
  } finally {
    probihaKontrolaSpojeni = false;
  }
}, 5000);

$('retry').addEventListener('click', async () => {
  const button = $('retry');
  if (!omezitPohyb()) button.querySelector('svg').animate([{ transform: 'rotate(0)' }, { transform: 'rotate(360deg)' }], { duration: 700, easing: 'cubic-bezier(.2,.8,.2,1)' });
  await render();
  if (rezim === 'offline') toast(tr('Agenteeq na tomto počítači neběží'));
});

// Agenteeq běží na jiném portu (PORT): rozšíření si ho uloží. Jiný než výchozí port
// potřebuje oprávnění pro 127.0.0.1 na libovolném portu – Chrome se zeptá jednou, v tomhle kliknutí.
$('port-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const zprava = $('port-msg');
  const novy = Number($('port').value.trim());
  zprava.removeAttribute('data-tone');
  if (!platnyPort(novy)) { zprava.dataset.tone = 'err'; $('port').setAttribute('aria-invalid', 'true'); zprava.textContent = tr('Port je číslo od 1024 do 65535.'); return; }
  $('port').removeAttribute('aria-invalid');
  if (novy !== VYCHOZI_PORT) {
    let povoleno = false;
    try { povoleno = await chrome.permissions.request({ origins: ['http://127.0.0.1/*'] }); } catch { povoleno = false; }
    if (!povoleno) { zprava.dataset.tone = 'err'; zprava.textContent = tr('Bez povolení se rozšíření k jinému portu nepřipojí.'); return; }
  }
  await chrome.storage.local.set({ port: novy });
  await chrome.storage.local.remove(['token', 'parovani']);
  zprava.dataset.tone = 'ok';
  zprava.textContent = tr('Uloženo. Hledám Agenteeq na portu {0}…', novy);
  render();
});
$('refresh-popup').addEventListener('click', async () => {
  const button = $('refresh-popup');
  if (button.disabled) return;
  button.disabled = true;
  button.classList.remove('toci');
  void button.offsetWidth;
  if (!omezitPohyb()) button.classList.add('toci');
  try {
    // Vynutit nové hlášení i pro nezměněnou konverzaci. Odpověď čeká až na uložení
    // a odeslání přes background worker; následné render() čte tentýž aktuální stav.
    const matches = chrome.runtime.getManifest().content_scripts?.flatMap((script) => script.matches || []) || [];
    const tabs = matches.length ? await chrome.tabs.query({ url: matches }).catch(() => []) : [];
    await Promise.allSettled(tabs.map((tab) => chrome.tabs.sendMessage(tab.id, { type: 'agenteeq:refresh' })));
    await render();
  } catch {
    // Selhání jedné stránky ani dočasně nedostupná aplikace nesmí rozbít okno rozšíření.
    await render().catch(() => {});
  } finally {
    button.disabled = false;
  }
});

$('code').addEventListener('input', () => $('code').removeAttribute('aria-invalid'));
$('pair-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const code = $('code').value.trim();
  const msg = $('pair-msg');
  if (!/^[A-Za-z0-9_-]{16}$/.test(code)) {
    $('code').setAttribute('aria-invalid', 'true');
    msg.dataset.tone = 'err';
    msg.textContent = sazba(tr('Kód má 16 znaků – zkopíruj ho z Agenteeq celý.'));
    if (!omezitPohyb()) $('code').animate([{ transform: 'none' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'none' }], { duration: 260, easing: 'ease-out' });
    $('code').focus();
    return;
  }
  $('code').removeAttribute('aria-invalid');
  $('pair').disabled = true;
  const result = await chrome.runtime.sendMessage({ type: 'agenteeq:pair', code }).catch(() => null);
  $('pair').disabled = false;
  if (!result?.ok) {
    msg.dataset.tone = 'err';
    // Chybu hlásí aplikace česky; v angličtině okno řekne totéž obecně.
    msg.textContent = sazba(jazyk() === 'cs' && result?.error ? result.error : tr('Spárování se nepovedlo. Vytvoř v Agenteeq nový kód.'));
    return;
  }
  $('code').value = '';
  msg.dataset.tone = 'ok';
  msg.textContent = sazba(tr('Spárováno.'));
  render();
});

prelozStranku();
render();
